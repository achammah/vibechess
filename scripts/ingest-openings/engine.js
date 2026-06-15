// ── Stockfish UCI driver (Node child process) ─────────────────────────────────
// Drives the project's bundled Stockfish 18 WASM build (public/stockfish-18-lite-
// single.js) as a long-lived child process speaking UCI over stdin/stdout. The
// browser app loads the same file in a Web Worker; here we run it under Node.
//
// The bundle is a CommonJS IIFE that, under Node, detects `process` and reads its
// .wasm sibling via fs. Node refuses to execute a `.js` file as CommonJS inside an
// ESM package ("type":"module"), so we stage a copy with a `.cjs` extension next
// to the `.wasm` in a temp dir and spawn THAT. Verified: `position startpos / go
// depth 12` yields a `bestmove`, and `setoption MultiPV` yields N `multipv` PVs.

import { spawn } from "node:child_process";
import { accessSync, copyFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/** Stage the bundled WASM engine into a temp dir as `.cjs` + `.wasm`. */
const stageEngine = () => {
  const root = resolve(process.cwd());
  const candidates = [
    join(root, "public", "stockfish-18-lite-single.js"),
    join(root, "node_modules", "stockfish", "src", "stockfish-18-lite-single.js"),
  ];
  let srcJs = null;
  for (const c of candidates) {
    try {
      accessSync(c);
      accessSync(c.replace(/\.js$/, ".wasm"));
      srcJs = c;
      break;
    } catch {
      /* try next */
    }
  }
  if (!srcJs)
    throw new Error(
      "Stockfish bundle not found (looked in public/ and node_modules/stockfish).",
    );

  const dir = mkdtempSync(join(tmpdir(), "sf-engine-"));
  const cjs = join(dir, "stockfish.cjs");
  const wasm = join(dir, "stockfish.wasm");
  // The bundle derives the .wasm name from its own basename: stockfish.cjs → stockfish.wasm.
  copyFileSync(srcJs, cjs);
  copyFileSync(srcJs.replace(/\.js$/, ".wasm"), wasm);
  return { dir, cjs };
};

/**
 * Spawn the engine and complete the UCI handshake.
 * @returns {Promise<object>} engine handle with analyze()/quit()
 */
export const createEngine = async ({ hashMb = 128, threads = 1 } = {}) => {
  const { dir, cjs } = stageEngine();
  const proc = spawn("node", [cjs], { stdio: ["pipe", "pipe", "ignore"], cwd: dir });

  let buf = "";
  const listeners = new Set();
  proc.stdout.on("data", (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (process.env.SF_DEBUG && !line.startsWith("info")) console.error("SF<", line);
      if (line) for (const l of [...listeners]) l(line);
    }
  });

  const send = (s) => {
    if (process.env.SF_DEBUG) console.error("SF>", s);
    proc.stdin.write(s + "\n");
  };
  const onLine = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  };
  const waitFor = (pred, timeoutMs = 60_000) =>
    new Promise((res, rej) => {
      const t = setTimeout(() => {
        off();
        rej(new Error("engine timeout"));
      }, timeoutMs);
      const off = onLine((line) => {
        const r = pred(line);
        if (r !== undefined && r !== false) {
          clearTimeout(t);
          off();
          res(r);
        }
      });
    });

  send("uci");
  await waitFor((l) => l === "uciok");
  send(`setoption name Hash value ${hashMb}`);
  send(`setoption name Threads value ${threads}`);
  send("setoption name UCI_LimitStrength value false");
  send("isready");
  await waitFor((l) => l === "readyok");

  /**
   * Analyze a FEN to fixed depth with MultiPV.
   * @returns {Promise<{best:string|null, pvs:{idx:number,moves:string[],cp:number|null,mate:number|null}[]}>}
   */
  const analyze = async (fen, depth, multiPV) => {
    send(`setoption name MultiPV value ${multiPV}`);
    send("ucinewgame");
    send(fen === "startpos" ? "position startpos" : `position fen ${fen}`);
    const pvs = {};
    const off = onLine((l) => {
      if (l.startsWith("info") && l.includes(" pv ")) {
        const mpv = l.match(/multipv (\d+)/);
        const pvm = l.match(/ pv (.+)$/);
        if (!mpv || !pvm) return;
        const cp = l.match(/score cp (-?\d+)/);
        const mate = l.match(/score mate (-?\d+)/);
        pvs[mpv[1]] = {
          idx: parseInt(mpv[1], 10),
          moves: pvm[1].split(/\s+/),
          cp: cp ? parseInt(cp[1], 10) : null,
          mate: mate ? parseInt(mate[1], 10) : null,
        };
      }
    });
    send(`go depth ${depth}`);
    const best = await waitFor(
      (l) => (l.startsWith("bestmove") ? l.split(/\s+/)[1] : false),
      120_000,
    );
    off();
    return {
      best: best && best !== "(none)" ? best : null,
      pvs: Object.values(pvs).sort((a, b) => a.idx - b.idx),
    };
  };

  const quit = () => {
    try {
      send("quit");
    } catch {
      /* already gone */
    }
    proc.kill();
  };

  return { analyze, quit, _dir: dir };
};
