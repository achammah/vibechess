import { Chess } from "chess.js";
import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Callout, Chip, EditorialButton } from "@/components/ui/editorial";
import { Input } from "@/components/ui/input";

const FIELD_LABEL =
  "font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-2 block";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const PRESET_POSITIONS = [
  { label: "Starting Position", fen: STARTING_FEN },
  { label: "King & Rook vs King", fen: "4k3/8/8/8/8/8/8/4K2R w K - 0 1" },
  { label: "King & Queen vs King", fen: "4k3/8/8/8/8/8/8/4KQ2 w - - 0 1" },
  {
    label: "Scholar's Mate threat",
    fen: "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
  },
  { label: "King & Pawn vs King", fen: "4k3/4P3/4K3/8/8/8/8/8 w - - 0 1" },
];

/**
 *
 */
export default function PositionSetupDialog({
  open,
  onOpenChange,
  onLoadPosition,
}) {
  const [tab, setTab] = useState("fen"); // "fen" | "pgn"
  const [fenInput, setFenInput] = useState("");
  const [pgnInput, setPgnInput] = useState("");
  const [error, setError] = useState("");

  /**
   *
   */
  const resetState = () => {
    setFenInput("");
    setPgnInput("");
    setError("");
    setTab("fen");
  };

  /**
   *
   */
  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  /**
   *
   */
  const handleLoadFen = () => {
    const fen = fenInput.trim() || STARTING_FEN;
    try {
      const g = new Chess(fen);
      onLoadPosition({ type: "fen", fen: g.fen() });
      handleClose();
    } catch {
      setError("Invalid FEN string. Please check the format and try again.");
    }
  };

  /**
   *
   */
  const handleLoadPgn = () => {
    const pgn = pgnInput.trim();
    if (!pgn) {
      setError("Please enter a PGN string.");
      return;
    }
    try {
      const g = new Chess();
      g.loadPgn(pgn);
      onLoadPosition({ type: "pgn", pgn: g.pgn(), game: g });
      handleClose();
    } catch {
      setError("Invalid PGN. Please check the format and try again.");
    }
  };

  /**
   *
   */
  const handlePreset = (fen) => {
    try {
      const g = new Chess(fen);
      onLoadPosition({ type: "fen", fen: g.fen() });
      handleClose();
    } catch {
      setError("Failed to load preset position.");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Set Position</DialogTitle>
        </DialogHeader>

        {/* Tab switcher */}
        <div className="flex gap-2 mb-4">
          {["fen", "pgn"].map((t) => (
            <Chip
              key={t}
              active={tab === t}
              onClick={() => {
                setTab(t);
                setError("");
              }}
            >
              {t.toUpperCase()}
            </Chip>
          ))}
        </div>

        {tab === "fen" && (
          <div className="space-y-4">
            <div>
              <label className={FIELD_LABEL}>FEN string</label>
              <Input
                value={fenInput}
                onChange={(e) => {
                  setFenInput(e.target.value);
                  setError("");
                }}
                placeholder={STARTING_FEN}
                className="font-mono text-xs"
                onKeyDown={(e) => e.key === "Enter" && handleLoadFen()}
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                Leave blank to load the starting position.
              </p>
            </div>

            {/* Preset positions */}
            <div>
              <Callout className="mb-2.5">Presets</Callout>
              <div className="flex flex-wrap gap-2">
                {PRESET_POSITIONS.map((p) => (
                  <Chip
                    key={p.label}
                    className="normal-case tracking-[0.02em]"
                    onClick={() => handlePreset(p.fen)}
                  >
                    {p.label}
                  </Chip>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "pgn" && (
          <div className="space-y-2">
            <label className={FIELD_LABEL}>PGN string</label>
            <textarea
              value={pgnInput}
              onChange={(e) => {
                setPgnInput(e.target.value);
                setError("");
              }}
              placeholder="1. e4 e5 2. Nf3 Nc6 ..."
              rows={6}
              className="w-full rounded-[3px] border border-border bg-background px-3 py-2 text-xs font-mono
                         text-foreground placeholder:text-muted-foreground resize-none
                         focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              Paste a full PGN game to import and replay.
            </p>
          </div>
        )}

        {error && (
          <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-[3px] px-2.5 py-1.5 mt-3">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <EditorialButton variant="ghost" onClick={handleClose}>
            Cancel
          </EditorialButton>
          <EditorialButton
            variant="primary"
            onClick={tab === "fen" ? handleLoadFen : handleLoadPgn}
          >
            Load {tab.toUpperCase()}
          </EditorialButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
