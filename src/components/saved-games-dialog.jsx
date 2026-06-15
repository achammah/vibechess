import { X, Save, FolderOpen, Trash2, Clock, ChevronRight } from "lucide-react";
import { useState, useEffect, useCallback } from "react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/editorial";
import { Input } from "@/components/ui/input";
import { loadAutoSave } from "@/lib/db";
import useGameStore from "@/store/use-game-store";

/**
 *
 */

const formatDate = (ts) =>
  new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

// ── Single saved-game row ─────────────────────────────────────────────────
/**
 *
 */
const GameRow = ({ game, onLoad, onDelete, isAutoSave = false }) => (
  <div className="flex items-center gap-3 px-3 py-3 border-b border-border hover:bg-secondary/30 transition-colors group">
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-foreground truncate">
          {game.name}
        </span>
        {isAutoSave && (
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-[2px] border border-primary/40 text-primary shrink-0">
            Auto
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 mt-1 font-mono text-[11px] text-muted-foreground tabular-nums">
        <Clock className="h-3 w-3 shrink-0" />
        <span>{formatDate(game.timestamp)}</span>
        <span>·</span>
        <span>{game.moveHistory?.length ?? 0} moves</span>
        {game.opponent && (
          <>
            <span>·</span>
            <span className="capitalize">{game.opponent}</span>
          </>
        )}
      </div>
    </div>

    <div className="flex items-center gap-1 shrink-0">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onLoad(game)}
        className="h-7 px-2 text-xs gap-1 text-primary hover:text-primary"
      >
        <ChevronRight className="h-3.5 w-3.5" />
        Load
      </Button>
      {!isAutoSave && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(game.id)}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  </div>
);

// ── SavedGamesDialog ──────────────────────────────────────────────────────
/**
 *
 */
export default function SavedGamesDialog({
  open,
  onClose,
  onLoadGame,
  currentGameSnapshot, // { pgn, fen, moveHistory, opponent, difficulty, boardOrientation }
}) {
  const { savedGames, fetchSavedGames, saveCurrentGame, deleteSavedGame } =
    useGameStore();

  const [saveName, setSaveName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [autoSaveEntry, setAutoSaveEntry] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Load list and autosave whenever dialog opens
  useEffect(() => {
    if (!open) return;
    fetchSavedGames();
    loadAutoSave()
      .then(setAutoSaveEntry)
      .catch(() => {});
  }, [open, fetchSavedGames]);

  const handleSave = useCallback(async () => {
    if (!currentGameSnapshot?.moveHistory?.length) return;
    setIsSaving(true);
    try {
      const opponent = currentGameSnapshot.opponent || "engine";
      const moves = currentGameSnapshot.moveHistory?.length ?? 0;
      const name =
        saveName.trim() ||
        `vs ${opponent.charAt(0).toUpperCase() + opponent.slice(1)} · ${moves} moves`;
      await saveCurrentGame({ ...currentGameSnapshot, name });
      setSaveName("");
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } finally {
      setIsSaving(false);
    }
  }, [currentGameSnapshot, saveName, saveCurrentGame]);

  const handleLoad = useCallback(
    (game) => {
      onLoadGame(game);
      onClose();
    },
    [onLoadGame, onClose],
  );

  const handleDelete = useCallback(
    async (id) => {
      await deleteSavedGame(id);
    },
    [deleteSavedGame],
  );

  if (!open) return null;

  const moveCount = currentGameSnapshot?.moveHistory?.length ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-primary" />
            <span className="font-display font-semibold text-base">
              Saved Games
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Save current game */}
          <section className="space-y-2">
            <Callout>Save current game</Callout>
            <div className="flex gap-2">
              <Input
                placeholder={
                  moveCount > 0
                    ? `e.g. My favourite game · ${moveCount} moves`
                    : "Play some moves first…"
                }
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
                disabled={moveCount === 0}
                className="text-sm h-8"
              />
              <Button
                size="sm"
                onClick={handleSave}
                disabled={moveCount === 0 || isSaving}
                className="shrink-0 h-8 px-3 gap-1.5"
              >
                <Save className="h-3.5 w-3.5" />
                {saveSuccess ? "Saved!" : isSaving ? "Saving…" : "Save"}
              </Button>
            </div>
            {moveCount === 0 && (
              <p className="text-xs text-muted-foreground">
                No moves yet — make at least one move to save.
              </p>
            )}
          </section>

          {/* Auto-save */}
          {autoSaveEntry && (
            <section className="space-y-2">
              <Callout>Auto-saved</Callout>
              <div className="border-t border-border">
                <GameRow
                  game={autoSaveEntry}
                  onLoad={handleLoad}
                  onDelete={() => {}}
                  isAutoSave
                />
              </div>
            </section>
          )}

          {/* Manual saves */}
          <section className="space-y-2">
            <Callout>
              Saved games
              {savedGames.length > 0 && (
                <span className="font-mono text-primary tabular-nums">
                  {savedGames.length}
                </span>
              )}
            </Callout>

            {savedGames.length === 0 ? (
              <div className="edit-grid rounded-[3px] border border-border py-12 px-6 text-center">
                <h3 className="font-display text-xl leading-tight text-foreground">
                  <span className="block">No games saved yet.</span>
                  <em className="block not-italic text-muted-foreground">
                    Your archive starts here.
                  </em>
                </h3>
                <p className="mt-3 text-sm text-muted-foreground max-w-[34ch] mx-auto">
                  Play a few moves, then save the position above to build your
                  personal library of games.
                </p>
              </div>
            ) : (
              <div className="border-t border-border">
                {savedGames.map((game) => (
                  <GameRow
                    key={game.id}
                    game={game}
                    onLoad={handleLoad}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
