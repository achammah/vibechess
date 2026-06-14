import { Chess } from "chess.js";
import { BookOpen, ChevronLeft, RotateCcw, FlipVertical2, Plus, GraduationCap } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Chessboard } from "react-chessboard";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { isCloud } from "@/lib/data-context";
import { getBookMoves, getPosition } from "@/lib/openings-db";
import {
  addLine,
  createRepertoire,
  getDueCards,
  listRepertoires,
  submitReview,
} from "@/lib/repertoire-db";

// ── Explore tab ────────────────────────────────────────────────────────────
const ExploreTab = () => {
  const gameRef = useRef(new Chess());
  const [fen, setFen] = useState(gameRef.current.fen());
  const [history, setHistory] = useState([]);
  const [node, setNode] = useState(null);
  const [moves, setMoves] = useState([]);
  const [orientation, setOrientation] = useState("white");
  const [loading, setLoading] = useState(false);

  // repertoire (signed-in only)
  const signedIn = isCloud();
  const [repertoires, setRepertoires] = useState([]);
  const [activeRep, setActiveRep] = useState("");
  const [added, setAdded] = useState({});

  const refresh = useCallback(async (f) => {
    setLoading(true);
    try {
      const [n, m] = await Promise.all([getPosition(f), getBookMoves(f)]);
      setNode(n);
      setMoves(m);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh(fen);
  }, [fen, refresh]);

  useEffect(() => {
    if (!signedIn) return;
    listRepertoires()
      .then((r) => {
        setRepertoires(r);
        if (r[0]) setActiveRep((cur) => cur || r[0].id);
      })
      .catch(() => {});
  }, [signedIn]);

  const sync = () => {
    setFen(gameRef.current.fen());
    setHistory(gameRef.current.history());
    setAdded({});
  };

  const playUci = (uci) => {
    try {
      gameRef.current.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      sync();
    } catch {
      /* illegal */
    }
  };

  const onDrop = ({ sourceSquare, targetSquare }) => {
    try {
      const mv = gameRef.current.move({ from: sourceSquare, to: targetSquare, promotion: "q" });
      if (!mv) return false;
      sync();
      return true;
    } catch {
      return false;
    }
  };

  const back = () => {
    gameRef.current.undo();
    sync();
  };
  const reset = () => {
    gameRef.current = new Chess();
    sync();
  };

  const handleCreateRep = async () => {
    const side = orientation === "white" ? "white" : "black";
    const name = window.prompt("Repertoire name", `My ${side} repertoire`);
    if (!name) return;
    const rep = await createRepertoire(name, side);
    setRepertoires((r) => [...r, rep]);
    setActiveRep(rep.id);
  };

  const handleAdd = async (move) => {
    if (!activeRep) return;
    await addLine(activeRep, {
      fen,
      move,
      linePath: gameRef.current.history({ verbose: true }).map((m) => m.from + m.to).join(""),
      ply: history.length,
    });
    setAdded((a) => ({ ...a, [move.id]: true }));
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-4">
      {/* Board */}
      <div className="min-w-0">
        <div className="max-w-[420px] mx-auto">
          <Chessboard
            options={{
              id: "openings-board",
              position: fen,
              onPieceDrop: onDrop,
              boardOrientation: orientation,
              animationDurationInMs: 150,
              darkSquareStyle: { backgroundColor: "#779952" },
              lightSquareStyle: { backgroundColor: "#edeed1" },
              boardStyle: { borderRadius: "4px" },
            }}
          />
        </div>
        <div className="flex items-center gap-2 mt-3 justify-center">
          <Button variant="outline" size="sm" onClick={back} disabled={history.length === 0}>
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
          <Button variant="outline" size="sm" onClick={reset} disabled={history.length === 0}>
            <RotateCcw className="h-4 w-4" /> Reset
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOrientation((o) => (o === "white" ? "black" : "white"))}
          >
            <FlipVertical2 className="h-4 w-4" /> Flip
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2 text-center break-words">
          {history.length > 0 ? history.join(" ") : "Starting position"}
        </p>
      </div>

      {/* Book moves */}
      <div className="min-w-0 flex flex-col">
        <div className="mb-2">
          <div className="text-sm font-semibold text-foreground">
            {node?.name ?? (history.length === 0 ? "Opening Explorer" : "Out of book")}
          </div>
          {node?.eco && <div className="text-xs text-muted-foreground">ECO {node.eco}</div>}
        </div>

        {signedIn && (
          <div className="flex items-center gap-1.5 mb-2">
            <select
              value={activeRep}
              onChange={(e) => setActiveRep(e.target.value)}
              className="flex h-8 flex-1 rounded-md border border-input bg-transparent px-2 text-xs"
            >
              {repertoires.length === 0 && <option value="">No repertoire</option>}
              {repertoires.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.side})
                </option>
              ))}
            </select>
            <Button variant="outline" size="sm" onClick={handleCreateRep}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto border border-border rounded-md divide-y divide-border">
          {loading && <div className="p-3 text-xs text-muted-foreground">Loading…</div>}
          {!loading && moves.length === 0 && (
            <div className="p-3 text-xs text-muted-foreground">
              No book moves here — you have left known opening theory.
            </div>
          )}
          {moves.map((m) => (
            <div key={m.id} className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-secondary/50">
              <button
                onClick={() => playUci(m.uci)}
                className="font-mono text-sm font-semibold text-primary flex-1 text-left"
              >
                {m.san}
              </button>
              {m.games_total ? (
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {m.games_total.toLocaleString()} games
                </span>
              ) : null}
              {signedIn && activeRep && (
                <button
                  title="Add as expected reply in repertoire"
                  onClick={() => handleAdd(m)}
                  className={`text-xs rounded px-1.5 py-0.5 ${
                    added[m.id]
                      ? "text-emerald-400"
                      : "text-muted-foreground hover:text-emerald-400"
                  }`}
                >
                  {added[m.id] ? "✓" : <Plus className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── Train tab (spaced repetition) ────────────────────────────────────────────
const TrainTab = () => {
  const [cards, setCards] = useState(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [result, setResult] = useState(null); // 'correct' | 'wrong'
  const gameRef = useRef(new Chess());
  const [fen, setFen] = useState(gameRef.current.fen());

  const card = cards?.[index];
  const line = card?.repertoire_lines;
  const expected = line?.expected;
  const position = line?.from_position;

  const load = useCallback(async () => {
    const due = await getDueCards({ limit: 20 });
    setCards(due);
    setIndex(0);
  }, []);

  useEffect(() => {
    if (!position?.fen) return;
    gameRef.current = new Chess(position.fen);
    setFen(position.fen);
    setRevealed(false);
    setResult(null);
  }, [position?.fen]);

  const onDrop = ({ sourceSquare, targetSquare }) => {
    if (revealed || !expected) return false;
    const tmp = new Chess(position.fen);
    let mv;
    try {
      mv = tmp.move({ from: sourceSquare, to: targetSquare, promotion: "q" });
    } catch {
      return false;
    }
    if (!mv) return false;
    const correct = sourceSquare + targetSquare === expected.uci.slice(0, 4);
    gameRef.current = tmp;
    setFen(tmp.fen());
    setRevealed(true);
    setResult(correct ? "correct" : "wrong");
    submitReview(card, { correct }).catch(() => {});
    return true;
  };

  const next = () => {
    if (index + 1 < (cards?.length ?? 0)) setIndex((i) => i + 1);
    else load();
  };

  if (cards === null) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <GraduationCap className="h-10 w-10 text-muted-foreground opacity-40" />
        <Button onClick={load}>Start review session</Button>
      </div>
    );
  }
  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
        <p className="text-sm">No cards due right now. 🎉</p>
        <p className="text-xs text-muted-foreground">
          Add lines in the Explore tab, then come back to drill them.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_280px] gap-4">
      <div className="max-w-[420px] mx-auto w-full">
        <Chessboard
          options={{
            id: "train-board",
            position: fen,
            onPieceDrop: onDrop,
            boardOrientation: position?.side_to_move === "b" ? "black" : "white",
            darkSquareStyle: { backgroundColor: "#779952" },
            lightSquareStyle: { backgroundColor: "#edeed1" },
          }}
        />
      </div>
      <div className="flex flex-col gap-3">
        <div className="text-xs text-muted-foreground">
          Card {index + 1} / {cards.length}
        </div>
        <div className="text-sm font-semibold">{position?.name ?? "Your repertoire"}</div>
        <p className="text-sm text-muted-foreground">
          {revealed
            ? result === "correct"
              ? "✅ Correct!"
              : `❌ The book move was ${expected?.san}.`
            : "Play the move your repertoire expects here."}
        </p>
        {revealed && (
          <Button onClick={next}>{index + 1 < cards.length ? "Next" : "Reload due"}</Button>
        )}
      </div>
    </div>
  );
};

// ── Dialog shell ─────────────────────────────────────────────────────────────
const OpeningsDialog = ({ open, onOpenChange }) => {
  const [tab, setTab] = useState("explore");
  const signedIn = isCloud();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[820px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> Openings
          </DialogTitle>
          <DialogDescription>
            Explore every opening line, build a repertoire, and drill it with spaced repetition.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 border-b border-border mb-3">
          {["explore", "train"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-px capitalize ${
                tab === t
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "explore" ? (
          <ExploreTab />
        ) : signedIn ? (
          <TrainTab />
        ) : (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Sign in to build and drill your own repertoires.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default OpeningsDialog;
