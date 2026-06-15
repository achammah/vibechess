-- opening_stats: per-opening-family play-style stats (engine soundness + optional
-- game-database popularity/win-rates). Powers "discover openings by play style"
-- filters in the catalog UI. Public reference data, world-readable, seeded
-- server-side by scripts/ingest-openings/stats.js (npm run db:ingest-stats).
--
-- One row per opening FAMILY = familyOf(name) in src/lib/courses-db.js
-- (text before the first ":" or ","). eval_cp is the Stockfish evaluation of the
-- family's characteristic position (its representative line's final position),
-- normalised to +white (positive favours White). popularity + win percentages
-- come from a games database when reachable, else null with source='engine-only'.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS, policy dropped+recreated.

create table if not exists public.opening_stats (
  family      text primary key,                 -- familyOf(name), e.g. "Sicilian Defense"
  slug        text not null,                     -- slugify(family)
  eco         char(3),                           -- representative line's ECO
  line_count  int,                               -- # distinct lines in the family
  rep_fen     text,                              -- characteristic position (final FEN of rep line)
  eval_cp     int,                               -- Stockfish eval, centipawns, +white
  eval_mate   int,                               -- mate-in-N if forced mate found (else null), +white
  eval_depth  int,                               -- search depth used
  assessment  text,                              -- "White edge" | "equal" | "Black edge"
  popularity  int,                               -- total games at rep position (null if unavailable)
  white_pct   numeric(5,2),                      -- white win %% (null if unavailable)
  draw_pct    numeric(5,2),                      -- draw %% (null if unavailable)
  black_pct   numeric(5,2),                      -- black win %% (null if unavailable)
  source      text not null default 'engine-only', -- provenance of popularity/win-rates
  updated_at  timestamptz not null default now()
);
create index if not exists opening_stats_eval_idx on public.opening_stats(eval_cp);
create index if not exists opening_stats_popularity_idx on public.opening_stats(popularity);

drop trigger if exists opening_stats_touch on public.opening_stats;
create trigger opening_stats_touch before update on public.opening_stats
  for each row execute function public.touch_updated_at();

-- public reference data: world-readable, no client writes (seeded server-side).
alter table public.opening_stats enable row level security;
drop policy if exists opening_stats_read on public.opening_stats;
create policy opening_stats_read on public.opening_stats for select using (true);
