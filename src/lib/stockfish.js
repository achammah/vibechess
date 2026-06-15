/**
 * Stockfish 18 UCI wrapper.
 * Loads the lite single-threaded WASM build from the app base path.
 *
 * Opponent strength → exact ELO mapping (getMove):
 * - ELO >= 1320 → UCI_LimitStrength true + UCI_Elo <elo> (native engine cap).
 * - ELO <  1320 → UCI_LimitStrength false + Skill Level (0-20) for weak play,
 *                 since Stockfish only honours UCI_Elo down to ~1320.
 * Movetime scales gently with strength so weak levels still feel responsive.
 *
 * Analysis (full strength, depth-based, multi-PV) is UNCHANGED.
 */

import { withBaseUrl } from "./base-url.js";

const INIT_TIMEOUT_MS = 90_000;

// Stockfish UCI_Elo is only meaningful in roughly this range.
const ELO_MIN = 1320;
const ELO_MAX = 3190;

/**
 * Map an exact ELO to the UCI options + movetime used for an opponent move.
 * @param {number} elo target playing strength
 * @returns {{ limitStrength: boolean, uciElo: number|null, skill: number|null, movetime: number }} engine config
 */
const eloToConfig = (elo) => {
  const e = Number.isFinite(elo) ? Math.round(elo) : 1200;

  if (e >= ELO_MIN) {
    const uciElo = Math.min(ELO_MAX, e);
    // 1320 → ~400ms, 3190 → ~2000ms.
    const movetime = Math.round(
      400 + ((uciElo - ELO_MIN) / (ELO_MAX - ELO_MIN)) * 1600,
    );
    return { limitStrength: true, uciElo, skill: null, movetime };
  }

  // Below the engine's ELO floor: fall back to Skill Level for weak play.
  // Map 600..1320 → Skill 0..7, with a short movetime.
  const clamped = Math.max(600, e);
  const skill = Math.max(
    0,
    Math.min(20, Math.round(((clamped - 600) / (ELO_MIN - 600)) * 7)),
  );
  const movetime = 150 + skill * 30;
  return { limitStrength: false, uciElo: null, skill, movetime };
};

export class StockfishEngine {
  constructor() {
    this._worker = null;
    this._ready = false;
    this._initPromise = null;
    this._initTimeoutId = null;
    this._pending = null;
    // FIFO serialization: the engine has a single search slot, so concurrent
    // callers (e.g. the board's eval read AND the coach's PV read) MUST NOT
    // interleave stop/position/go commands — doing so desyncs the UCI stream and
    // a `bestmove` gets matched to the wrong waiter, hanging the last caller.
    // Every getMove/analyze runs through this chain so only one search is ever
    // in flight; the next starts only after the previous emits its bestmove.
    this._chain = Promise.resolve();
    // Per-operation watchdog so a dropped bestmove can never hang the chain.
    this._opTimeoutMs = 30_000;
  }

  // Queue an engine operation. `body` returns a Promise that resolves when the
  // engine replies (bestmove). Calls are run strictly in submission order.
  _enqueue(body) {
    const run = this._chain.then(() => body());
    // Keep the chain alive even if this op rejects (abort/timeout/destroy).
    this._chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  _clearInitTimeout() {
    if (this._initTimeoutId) {
      clearTimeout(this._initTimeoutId);
      this._initTimeoutId = null;
    }
  }

  _resetInitState() {
    this._clearInitTimeout();
    if (this._worker) {
      this._worker.terminate();
      this._worker = null;
    }
    this._ready = false;
    this._initPromise = null;
  }

  // ── Lazy init ─────────────────────────────────────────────────────────────
  init() {
    if (this._initPromise) return this._initPromise;

    this._initPromise = new Promise((resolve, reject) => {
      try {
        const workerUrl = withBaseUrl("stockfish-18-lite-single.js");
        this._worker = new Worker(workerUrl);

        this._worker.onmessage = (e) => {
          const line = typeof e === "string" ? e : e.data;
          if (!line || typeof line !== "string") return;

          // Init handshake (handled before _ready is true)
          if (!this._ready) {
            if (line === "uciok") {
              this._worker.postMessage("isready");
              return;
            }
            if (line === "readyok") {
              this._ready = true;
              this._clearInitTimeout();
              resolve(this);
              return;
            }
          }

          this._dispatch(line);
        };

        this._worker.onerror = (error) => {
          console.error("Stockfish worker error:", error);
          this._resetInitState();
          reject(error);
        };

        this._worker.postMessage("uci");

        this._initTimeoutId = setTimeout(() => {
          if (!this._ready) {
            this._resetInitState();
            reject(new Error("Stockfish init timed out"));
          }
        }, INIT_TIMEOUT_MS);
      } catch (error) {
        this._resetInitState();
        reject(error);
      }
    });

    return this._initPromise;
  }

  // ── Internal message dispatcher ───────────────────────────────────────────
  _dispatch(line) {
    if (!this._pending) return;
    const p = this._pending;

    if (p.type === "move") {
      if (line.startsWith("bestmove")) {
        this._pending = null;
        const uci = line.split(" ")[1];
        p.resolve(uci && uci !== "(none)" ? uci : null);
      }
    } else if (p.type === "analyze") {
      // Accumulate info lines (we want the last/deepest entry per multipv index)
      if (line.startsWith("info") && line.includes(" pv ")) {
        const pvIndexM = line.match(/multipv (\d+)/);
        const pvIndex = pvIndexM ? pvIndexM[1] : "1";
        const depthM = line.match(/depth (\d+)/);
        const cpM = line.match(/score cp (-?\d+)/);
        const mateM = line.match(/score mate (-?\d+)/);
        const pvM = line.match(/ pv (.+)$/);

        if (depthM && (cpM || mateM) && pvM) {
          p.infoLines[pvIndex] = {
            pvIdx: parseInt(pvIndex),
            depth: parseInt(depthM[1]),
            scoreCp: cpM ? parseInt(cpM[1]) : null,
            isMate: !!mateM,
            mateIn: mateM ? parseInt(mateM[1]) : null,
            pv: pvM[1].trim().split(" ").slice(0, 10),
          };
        }
      }

      if (line.startsWith("bestmove")) {
        this._pending = null;
        const bestUci = line.split(" ")[1];
        const lines = Object.values(p.infoLines).sort(
          (a, b) => a.pvIdx - b.pvIdx,
        );
        p.resolve({
          lines,
          bestMove: bestUci && bestUci !== "(none)" ? bestUci : null,
          scoreCp: lines[0]?.scoreCp ?? null,
          isMate: lines[0]?.isMate ?? false,
          mateIn: lines[0]?.mateIn ?? null,
          pv: lines[0]?.pv ?? [],
        });
      }
    }
  }

  // ── Get best move (game mode) ─────────────────────────────────────────────
  /**
   * Request an opponent move at an exact target ELO. Uses the engine's native
   * UCI_LimitStrength/UCI_Elo for >=1320 and a Skill Level fallback below that.
   * @param {string} fen fen string representing the position
   * @param {number} elo target playing strength (clamped internally)
   * @returns {Promise<string|null>} UCI move like "e2e4"
   */
  async getMove(fen, elo = 1200) {
    await this.init();
    const { limitStrength, uciElo, skill, movetime } = eloToConfig(elo);

    return this._enqueue(
      () =>
        new Promise((resolve, reject) => {
          const settle = this._withWatchdog(resolve, reject);
          this._pending = { type: "move", resolve: settle.resolve, reject: settle.reject };
          this._worker.postMessage("setoption name MultiPV value 1");
          if (limitStrength) {
            this._worker.postMessage("setoption name UCI_LimitStrength value true");
            this._worker.postMessage(`setoption name UCI_Elo value ${uciElo}`);
            // Restore full skill so UCI_Elo is the sole strength limiter.
            this._worker.postMessage("setoption name Skill Level value 20");
          } else {
            this._worker.postMessage("setoption name UCI_LimitStrength value false");
            this._worker.postMessage(`setoption name Skill Level value ${skill}`);
          }
          this._worker.postMessage(`position fen ${fen}`);
          this._worker.postMessage(`go movetime ${movetime}`);
        }),
    );
  }

  // ── Analyze position (coach mode) ────────────────────────────────────────
  /**
   * @param {string} fen fen string representing the position
   * @param {number} [depth] search depth
   * @param {number} [multiPV]   number of top lines to return
   * @returns {Promise<{ lines, bestMove, scoreCp, isMate, mateIn, pv }>} analysis result with multiple lines and best move
   */
  async analyze(fen, depth = 18, multiPV = 3) {
    await this.init();

    return this._enqueue(
      () =>
        new Promise((resolve, reject) => {
          const settle = this._withWatchdog(resolve, reject);
          this._pending = {
            type: "analyze",
            resolve: settle.resolve,
            reject: settle.reject,
            infoLines: {},
          };
          this._worker.postMessage(`setoption name MultiPV value ${multiPV}`);
          // Full strength for analysis — clear any ELO cap left by getMove().
          this._worker.postMessage("setoption name UCI_LimitStrength value false");
          this._worker.postMessage("setoption name Skill Level value 20");
          this._worker.postMessage(`position fen ${fen}`);
          this._worker.postMessage(`go depth ${depth}`);
        }),
    );
  }

  // Wrap a pending op's resolve/reject with a one-shot guard + watchdog timer.
  // If the engine never emits bestmove (dropped message, odd FEN), the op
  // rejects after _opTimeoutMs and clears _pending so the chain advances —
  // a stuck search can never block every later caller.
  _withWatchdog(resolve, reject) {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      if (this._pending) this._pending = null;
      this._worker?.postMessage("stop");
      reject(new Error("Stockfish op timed out"));
    }, this._opTimeoutMs);
    return {
      resolve: (v) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(v);
      },
      reject: (e) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(e);
      },
    };
  }

  // ── Convert UCI move string → chess.js move object ────────────────────────
  static uciToMove(uci) {
    if (!uci || uci.length < 4) return null;
    return {
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length === 5 ? uci[4] : undefined,
    };
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  destroy() {
    this._clearInitTimeout();
    if (this._pending) {
      this._pending.reject(new Error("Engine destroyed"));
      this._pending = null;
    }
    if (this._worker) {
      this._worker.terminate();
      this._worker = null;
    }
    this._ready = false;
    this._initPromise = null;
  }
}

// ── Singleton helpers ─────────────────────────────────────────────────────────
let _instance = null;

/**
 *
 */
export const getStockfishEngine = () => {
  if (!_instance) _instance = new StockfishEngine();
  return _instance;
};

/**
 *
 */
export const destroyStockfishEngine = () => {
  if (_instance) {
    _instance.destroy();
    _instance = null;
  }
};
