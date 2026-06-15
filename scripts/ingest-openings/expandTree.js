// ── Engine line-tree expansion (pure-ish) ─────────────────────────────────────
// Given a seed tabiya (the fixed defining moves of an opening family) and a
// Stockfish engine handle, grow a tree of sensible continuations using MultiPV:
// at each branch node take the top-K engine moves whose eval is within a window
// of the best move, recurse to a target depth, and collect distinct root-to-leaf
// lines as full PGNs. Every line is validated with chess.js as it is built, so
// only legal, replayable lines come out. Dedup is by full UCI signature.

import { Chess } from "chess.js";

/** SAN signature for naming: the moves PAST the tabiya, joined, capped. */
export const sanSignature = (sanMoves, max = 8) => sanMoves.slice(0, max).join(" ");

/** Evenly sample `n` items across an array (keeps spread; preserves order). */
const sampleEvenly = (arr, n) => {
  if (arr.length <= n) return arr;
  const out = [];
  const step = arr.length / n;
  for (let i = 0; i < n; i++) out.push(arr[Math.floor(i * step)]);
  return out;
};

/** Replay a UCI move list from start; returns { game, sans } or null if illegal. */
const replayUci = (uciMoves) => {
  const game = new Chess();
  const sans = [];
  for (const uci of uciMoves) {
    const mv = game.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length === 5 ? uci[4] : undefined,
    });
    if (!mv) return null;
    sans.push(mv.san);
  }
  return { game, sans };
};

/**
 * Expand a family tree.
 *
 * @param {object}   engine    createEngine() handle
 * @param {object}   seed      { uci: string[] }  fixed tabiya moves (UCI) from start
 * @param {object}   opts
 * @param {number}   opts.branchDepth   engine search depth at each branch node
 * @param {number}   opts.maxPlies      total plies (from start) a line may reach
 * @param {number[]} opts.kByLevel      MultiPV K per expansion level (index = level past tabiya)
 * @param {number}   opts.cpWindow      keep sibling moves within this cp of best
 * @param {number}   opts.maxLines      hard cap on collected lines (bounds runtime)
 * @param {function} [opts.log]         progress logger
 * @returns {Promise<{uci:string[], sans:string[]}[]>} distinct lines (full from start)
 */
export const expandFamily = async (engine, seed, opts) => {
  const {
    branchDepth = 12,
    maxPlies = 16,
    kByLevel = [4, 4, 3, 3, 2, 2],
    cpWindow = 90,
    maxLines = 150,
    minExtend = 4, // a trainable line must extend ≥ this many plies past the tabiya
    snapEvery = 2, // snapshot a trainable line every N plies past the tabiya
    log = () => {},
  } = opts;

  const seedReplay = replayUci(seed.uci);
  if (!seedReplay) throw new Error("seed tabiya is illegal: " + seed.uci.join(" "));
  const seedPlies = seed.uci.length;

  const lines = new Map(); // uciKey -> { uci, sans }
  const expandedNodes = new Set(); // positions already branched (transposition guard)

  const addLine = (uci) => {
    const key = uci.join(" ");
    if (lines.has(key)) return;
    const r = replayUci(uci);
    if (!r) return; // guard: never store an illegal line
    lines.set(key, { uci, sans: r.sans });
  };

  // Comparable score from side-to-move POV: a mate is far better/worse than any cp
  // eval; mate-in-N beats mate-in-(N+1). Used only for sibling pruning.
  const evalOf = (p) => {
    if (p.mate != null) return p.mate > 0 ? 1_000_000 - p.mate : -1_000_000 - p.mate;
    return p.cp ?? -1_000_000;
  };

  // Breadth-first expansion: process the whole frontier at each level so EVERY
  // early branch is represented before deep lines saturate the cap. We snapshot a
  // trainable line periodically so the set spans short and long variations of many
  // distinct early choices, not 200 near-clones of one deep variation.
  let frontier = [[...seed.uci]];
  log(`  seed ${seedReplay.sans.join(" ")} (${seedPlies} plies) → expanding…`);

  for (let level = 0; level < kByLevel.length + 8 && frontier.length; level++) {
    const next = [];
    const K = kByLevel[Math.min(level, kByLevel.length - 1)] ?? 2;
    for (const uciSoFar of frontier) {
      if (lines.size >= maxLines && next.length === 0) break;
      const extend = uciSoFar.length - seedPlies;
      // Snapshot a trainable line at sensible depths.
      if (extend >= minExtend && (extend % snapEvery === 0 || uciSoFar.length >= maxPlies)) {
        addLine(uciSoFar);
      }
      if (uciSoFar.length >= maxPlies) continue;

      const r = replayUci(uciSoFar);
      if (!r || r.game.isGameOver()) {
        if (extend >= minExtend) addLine(uciSoFar);
        continue;
      }
      const fen = r.game.fen();
      const epd = fen.split(" ").slice(0, 4).join(" ");
      if (expandedNodes.has(epd)) continue; // transposition: already branched here
      expandedNodes.add(epd);

      const { pvs } = await engine.analyze(fen, branchDepth, Math.max(1, K));
      if (!pvs.length) {
        if (extend >= minExtend) addLine(uciSoFar);
        continue;
      }
      const bestEval = Math.max(...pvs.map(evalOf));
      let branched = 0;
      for (const pv of pvs) {
        if (branched >= K) break;
        const drop = bestEval - evalOf(pv);
        if (pv.idx !== 1 && drop > cpWindow) continue; // prune clearly inferior siblings
        const firstMove = pv.moves[0];
        if (!firstMove) continue;
        const child = [...uciSoFar, firstMove];
        if (!replayUci(child)) continue; // legality guard
        branched += 1;
        next.push(child);
      }
      if (branched === 0 && extend >= minExtend) addLine(uciSoFar);
    }
    // Cap the frontier so runtime stays bounded; keep a spread by sampling evenly.
    const FRONTIER_CAP = Math.max(40, Math.ceil(maxLines / 2));
    frontier = next.length > FRONTIER_CAP ? sampleEvenly(next, FRONTIER_CAP) : next;
    if (lines.size >= maxLines) break;
  }

  // Drop lines that didn't actually extend past the tabiya (keep only real variations).
  const out = [...lines.values()]
    .filter((l) => l.uci.length > seedPlies)
    .slice(0, maxLines);
  log(`  collected ${out.length} distinct lines`);
  return out;
};
