import { Chess } from "chess.js";
import { BookOpen, ChevronLeft, RotateCcw, FlipVertical2, Plus, GraduationCap } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Chessboard } from "react-chessboard";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Callout,
  EditorialButton,
  FadeInUp,
  SectionHeader,
} from "@/components/ui/editorial";
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
          <EditorialButton variant="outline" onClick={back} disabled={history.length === 0}>
            <ChevronLeft className="h-3.5 w-3.5" /> Back
          </EditorialButton>
          <EditorialButton variant="outline" onClick={reset} disabled={history.length === 0}>
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </EditorialButton>
          <EditorialButton
            variant="outline"
            onClick={() => setOrientation((o) => (o === "white" ? "black" : "white"))}
          >
            <FlipVertical2 className="h-3.5 w-3.5" /> Flip
          </EditorialButton>
        </div>
        <p className="font-mono text-[11px] text-muted-foreground mt-3 text-center break-words tabular-nums">
          {history.length > 0 ? history.join(" ") : "Starting position"}
        </p>
      </div>

      {/* Book moves */}
      <div className="min-w-0 flex flex-col">
        <div className="mb-3">
          <Callout>{history.length === 0 ? "Opening Explorer" : "Position"}</Callout>
          <h3 className="font-display font-semibold tracking-[-0.02em] leading-tight text-foreground text-lg mt-2">
            {node?.name ?? (history.length === 0 ? "Opening Explorer" : "Out of book")}
          </h3>
          {node?.eco && (
            <span className="mt-1.5 inline-flex font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              ECO {node.eco}
            </span>
          )}
        </div>

        {signedIn && (
          <div className="flex items-center gap-1.5 mb-3">
            <select
              value={activeRep}
              onChange={(e) => setActiveRep(e.target.value)}
              className="flex h-8 flex-1 rounded-[2px] border border-border bg-transparent px-2 font-mono text-[11px] uppercase tracking-[0.1em] text-foreground transition-colors duration-150 hover:border-foreground"
            >
              {repertoires.length === 0 && <option value="">No repertoire</option>}
              {repertoires.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.side})
                </option>
              ))}
            </select>
            <EditorialButton variant="outline" onClick={handleCreateRep} title="Create repertoire">
              <Plus className="h-3.5 w-3.5" />
            </EditorialButton>
          </div>
        )}

        <div className="flex-1 overflow-y-auto border border-border rounded-[2px] divide-y divide-border">
          {loading && (
            <div className="p-3 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              Loading…
            </div>
          )}
          {!loading && moves.length === 0 && (
            <div className="p-3 text-xs text-muted-foreground">
              No book moves here — you have left known opening theory.
            </div>
          )}
          {moves.map((m) => (
            <div
              key={m.id}
              className="group flex items-center gap-2 px-2.5 py-1.5 transition-colors duration-150 hover:bg-secondary/50"
            >
              <button
                onClick={() => playUci(m.uci)}
                className="font-mono text-sm font-semibold text-foreground flex-1 text-left transition-colors duration-150 group-hover:text-primary"
              >
                {m.san}
              </button>
              {m.games_total ? (
                <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                  {m.games_total.toLocaleString()} games
                </span>
              ) : null}
              {signedIn && activeRep && (
                <button
                  title="Add as expected reply in repertoire"
                  onClick={() => handleAdd(m)}
                  className={`text-xs rounded-[2px] px-1.5 py-0.5 transition-colors duration-150 ${
                    added[m.id]
                      ? "text-emerald-500 dark:text-emerald-400"
                      : "text-muted-foreground hover:text-emerald-500 dark:hover:text-emerald-400"
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
      <FadeInUp className="flex flex-col items-center justify-center py-12 gap-5 text-center">
        <GraduationCap className="h-10 w-10 text-muted-foreground opacity-40" />
        <SectionHeader
          align="center"
          eyebrow="Spaced Repetition"
          title="Drill your repertoire"
          em="One position at a time."
          titleClassName="text-[clamp(1.25rem,2.6vw,1.75rem)]"
        />
        <EditorialButton onClick={load}>Start review session</EditorialButton>
      </FadeInUp>
    );
  }
  if (cards.length === 0) {
    return (
      <FadeInUp className="flex flex-col items-center justify-center py-12 gap-4 text-center">
        <Callout>All clear</Callout>
        <SectionHeader
          align="center"
          title="No cards due right now."
          em="Add lines in the Explore tab, then come back to drill them."
          titleClassName="text-[clamp(1.25rem,2.6vw,1.75rem)]"
        />
      </FadeInUp>
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
        <Callout>
          Card <span className="tabular-nums">{index + 1}</span> /{" "}
          <span className="tabular-nums">{cards.length}</span>
        </Callout>
        <h3 className="font-display font-semibold tracking-[-0.02em] leading-tight text-foreground text-lg">
          {position?.name ?? "Your repertoire"}
        </h3>
        {revealed ? (
          result === "correct" ? (
            <div className="rounded-[2px] border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
              Correct.
            </div>
          ) : (
            <div className="rounded-[2px] border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
              The book move was{" "}
              <span className="font-mono font-semibold">{expected?.san}</span>.
            </div>
          )
        ) : (
          <p className="text-sm text-muted-foreground">
            Play the move your repertoire expects here.
          </p>
        )}
        {revealed && (
          <EditorialButton onClick={next}>
            {index + 1 < cards.length ? "Next" : "Reload due"}
          </EditorialButton>
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
          <DialogTitle className="flex items-center gap-2.5 font-display text-2xl font-semibold tracking-[-0.02em]">
            <BookOpen className="h-5 w-5 text-primary" /> Openings
          </DialogTitle>
          <DialogDescription>
            Explore every opening line, build a repertoire, and drill it with spaced repetition.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-5 border-b border-border mb-4">
          {["explore", "train"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-2.5 -mb-px font-mono text-[11px] uppercase tracking-[0.12em] border-b-2 transition-colors duration-150 ${
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
          <FadeInUp className="flex flex-col items-center justify-center py-12 gap-4 text-center">
            <Callout>Account required</Callout>
            <SectionHeader
              align="center"
              title="Sign in to build and drill"
              em="your own repertoires."
              titleClassName="text-[clamp(1.25rem,2.6vw,1.75rem)]"
            />
          </FadeInUp>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default OpeningsDialog;
