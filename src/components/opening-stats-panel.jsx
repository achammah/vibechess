import { X, Trash2, TrendingUp, BarChart2 } from "lucide-react";
import { useState, useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/editorial";
import { getOpeningStats, clearOpeningStats } from "@/lib/opening-stats";

// Win / draw / loss is a real tri-state, so we keep three tones but pull them
// into the editorial system: wins = signal-orange, draws = muted, losses =
// destructive. CSS custom properties keep it correct in light AND dark.
const WIN_TONE = "var(--primary)";
const DRAW_TONE = "color-mix(in srgb, var(--muted-foreground) 70%, transparent)";
const LOSS_TONE = "var(--destructive)";

/**
 *
 */
const WinBar = ({ wins, draws, losses }) => {
  const total = wins + draws + losses;
  if (total === 0) {
    return <div className="h-1.5 rounded-full bg-border w-full" />;
  }
  const wPct = (wins / total) * 100;
  const dPct = (draws / total) * 100;
  const lPct = (losses / total) * 100;

  return (
    <div className="flex h-1.5 rounded-full overflow-hidden w-full">
      <div style={{ width: `${wPct}%`, backgroundColor: WIN_TONE }} />
      <div style={{ width: `${dPct}%`, backgroundColor: DRAW_TONE }} />
      <div style={{ width: `${lPct}%`, backgroundColor: LOSS_TONE }} />
    </div>
  );
};

/**
 *
 */
export default function OpeningStatsPanel({ open, onClose }) {
  const [clearFlag, setClearFlag] = useState(false);

  const stats = useMemo(() => {
    void clearFlag; // trigger recompute when clearFlag changes
    return open ? getOpeningStats() : [];
  }, [open, clearFlag]);

  if (!open) return null;

  const totalGames = stats.reduce((s, e) => s + e.total, 0);
  const totalWins = stats.reduce((s, e) => s + e.wins, 0);
  const totalDraws = stats.reduce((s, e) => s + e.draws, 0);
  const totalLosses = stats.reduce((s, e) => s + e.losses, 0);
  const overallWinPct =
    totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0;

  /**
   *
   */
  const handleClear = () => {
    if (
      window.confirm("Clear all opening statistics? This cannot be undone.")
    ) {
      clearOpeningStats();
      setClearFlag((f) => !f);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-card border border-border rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-200 w-full max-w-xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-primary" />
            <div>
              <h2 className="font-display font-semibold text-base text-foreground">
                Opening Statistics
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Track your performance per opening
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-secondary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Overall summary */}
        {totalGames > 0 && (
          <div className="px-5 py-4 border-b border-border bg-secondary/20">
            <div className="flex items-end justify-between mb-2.5">
              <Callout>
                Overall
                <span className="font-mono tabular-nums text-foreground">
                  {totalGames}
                </span>
                games
              </Callout>
              <span className="font-mono text-2xl leading-none tabular-nums text-foreground">
                {overallWinPct}
                <span className="text-sm text-muted-foreground">% wins</span>
              </span>
            </div>
            <WinBar wins={totalWins} draws={totalDraws} losses={totalLosses} />
            <div className="flex gap-5 mt-2.5">
              {[
                { label: "Wins", val: totalWins, color: "text-primary" },
                {
                  label: "Draws",
                  val: totalDraws,
                  color: "text-muted-foreground",
                },
                {
                  label: "Losses",
                  val: totalLosses,
                  color: "text-destructive",
                },
              ].map(({ label, val, color }) => (
                <span
                  key={label}
                  className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground"
                >
                  {label}{" "}
                  <span className={`font-semibold tabular-nums ${color}`}>
                    {val}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Stats table */}
        <div className="overflow-y-auto flex-1">
          {stats.length === 0 ? (
            <div className="edit-grid m-5 rounded-[3px] border border-border flex flex-col items-center justify-center py-14 px-6 text-center gap-3">
              <TrendingUp className="w-9 h-9 text-muted-foreground opacity-30" />
              <div>
                <h3 className="font-display text-xl leading-tight text-foreground">
                  <span className="block">No data yet.</span>
                  <em className="block not-italic text-muted-foreground">
                    Every game counts.
                  </em>
                </h3>
                <p className="text-sm text-muted-foreground mt-3 max-w-[36ch] mx-auto">
                  Play complete games to track your performance per opening.
                </p>
              </div>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border sticky top-0 bg-card font-mono text-[10px] uppercase tracking-[0.1em]">
                  <th className="text-left px-5 py-2.5 text-muted-foreground font-medium">
                    Opening
                  </th>
                  <th className="text-center px-2 py-2.5 text-muted-foreground font-medium w-10">
                    G
                  </th>
                  <th className="text-center px-2 py-2.5 text-primary font-medium w-10">
                    W
                  </th>
                  <th className="text-center px-2 py-2.5 text-muted-foreground font-medium w-10">
                    D
                  </th>
                  <th className="text-center px-2 py-2.5 text-destructive font-medium w-10">
                    L
                  </th>
                  <th className="text-right px-5 py-2.5 text-muted-foreground font-medium w-20">
                    Win%
                  </th>
                </tr>
              </thead>
              <tbody>
                {stats.map((e) => (
                  <tr
                    key={e.eco + e.name}
                    className="border-b border-border hover:bg-secondary/20 transition-colors"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono uppercase tracking-[0.08em] text-muted-foreground border border-border px-1 rounded-[2px]">
                          {e.eco}
                        </span>
                        <span
                          className="font-medium text-foreground truncate max-w-[180px]"
                          title={e.name}
                        >
                          {e.name}
                        </span>
                      </div>
                      <WinBar wins={e.wins} draws={e.draws} losses={e.losses} />
                    </td>
                    <td className="text-center px-2 py-3 font-mono text-muted-foreground tabular-nums">
                      {e.total}
                    </td>
                    <td className="text-center px-2 py-3 font-mono text-primary font-semibold tabular-nums">
                      {e.wins}
                    </td>
                    <td className="text-center px-2 py-3 font-mono text-muted-foreground tabular-nums">
                      {e.draws}
                    </td>
                    <td className="text-center px-2 py-3 font-mono text-destructive tabular-nums">
                      {e.losses}
                    </td>
                    <td className="text-right px-5 py-3">
                      <span
                        className={`font-mono font-semibold tabular-nums ${
                          e.winPct >= 60
                            ? "text-primary"
                            : e.winPct >= 40
                              ? "text-foreground"
                              : "text-destructive"
                        }`}
                      >
                        {e.winPct}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border shrink-0">
          <p className="text-[11px] text-muted-foreground">
            Stats are recorded automatically at game end
          </p>
          {stats.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="text-muted-foreground hover:text-destructive text-xs h-7"
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Clear all
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
