-- vibechess initial schema
-- Auth model: Clerk is wired as a Supabase third-party-auth provider.
-- The Clerk user id arrives in the JWT `sub` claim; we use it as a text PK/FK
-- everywhere and gate per-user rows with RLS: auth.jwt()->>'sub' = user_id.
--
-- Public reference data (puzzles, opening tree, repertoire templates) is
-- world-readable; everything user-owned is private to its owner.

-- ── Helpers ──────────────────────────────────────────────────────────────────
-- Current Clerk user id from the verified JWT (null when anonymous).
create or replace function public.clerk_uid()
returns text
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'sub', '')
$$;

-- updated_at trigger
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── users ────────────────────────────────────────────────────────────────────
create table if not exists public.users (
  id              text primary key,                 -- Clerk user id (sub)
  email           text,
  username        text,
  display_name    text,
  image_url       text,
  rating_puzzles  int  not null default 1200,
  rating_practice int  not null default 1200,
  settings        jsonb not null default '{}'::jsonb, -- provider, model, elo, voice, llm key ref
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger users_touch before update on public.users
  for each row execute function public.touch_updated_at();

-- ── games + analyses ──────────────────────────────────────────────────────────
create table if not exists public.games (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null references public.users(id) on delete cascade,
  name        text,
  pgn         text,
  fen         text,
  result      text,
  white       text,
  black       text,
  eco         char(3),
  source      text not null default 'play',          -- play | import | practice | analysis
  is_autosave boolean not null default false,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists games_user_created_idx on public.games(user_id, created_at desc);
-- one rolling autosave row per user
create unique index if not exists games_one_autosave_per_user
  on public.games(user_id) where is_autosave;
create trigger games_touch before update on public.games
  for each row execute function public.touch_updated_at();

create table if not exists public.game_analyses (
  id              uuid primary key default gen_random_uuid(),
  game_id         uuid not null unique references public.games(id) on delete cascade,
  user_id         text not null references public.users(id) on delete cascade,
  status          text not null default 'pending',   -- pending | running | done | error
  engine_version  text,
  depth           int,
  move_evals      jsonb,                              -- [{ply, fen, cp, mate, bestUci, bestSan, classification}]
  critical_moments jsonb,                             -- [{ply, type, swingCp, note}]
  summary         text,
  created_at      timestamptz not null default now(),
  completed_at    timestamptz
);

-- ── generic training progress (tutorial | puzzle | quiz | opening) ────────────
create table if not exists public.progress (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null references public.users(id) on delete cascade,
  type       text not null,
  item_id    text not null,
  solved     boolean not null default false,
  solved_at  timestamptz,
  unique (user_id, type, item_id)
);
create index if not exists progress_user_type_idx on public.progress(user_id, type);

-- ── puzzles (public reference, Lichess CC0) + attempts ────────────────────────
create table if not exists public.puzzles (
  id               text primary key,                 -- Lichess puzzle id
  fen              text not null,
  moves            text[] not null,                  -- solution UCI moves
  rating           int,
  rating_deviation int,
  themes           text[] not null default '{}',
  opening_tags     text[] not null default '{}',
  popularity       int,
  nb_plays         int
);
create index if not exists puzzles_rating_idx on public.puzzles(rating);
create index if not exists puzzles_themes_idx on public.puzzles using gin(themes);

create table if not exists public.puzzle_attempts (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null references public.users(id) on delete cascade,
  puzzle_id     text not null references public.puzzles(id) on delete cascade,
  solved        boolean not null,
  moves_played  text[],
  time_ms       int,
  hints_used    int not null default 0,
  rating_before int,
  rating_after  int,
  created_at    timestamptz not null default now()
);
create index if not exists puzzle_attempts_user_idx on public.puzzle_attempts(user_id, created_at desc);

-- ── opening move-tree (public reference) ──────────────────────────────────────
-- Nodes keyed by EPD (FEN minus halfmove/fullmove clocks) so transpositions merge.
create table if not exists public.opening_positions (
  id            text primary key,                    -- stable hash of epd
  epd           text not null unique,
  fen           text not null,                        -- representative full FEN
  side_to_move  char(1) not null,
  eco           char(3),
  name          text,
  ply           int not null default 0,
  is_named      boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists opening_positions_eco_idx on public.opening_positions(eco);
create index if not exists opening_positions_name_idx on public.opening_positions(name);

create table if not exists public.opening_moves (
  id                text primary key,                 -- hash(from_position_id|uci)
  from_position_id  text not null references public.opening_positions(id) on delete cascade,
  to_position_id    text not null references public.opening_positions(id) on delete cascade,
  uci               varchar(6) not null,
  san               text not null,
  source            text not null,                    -- named | explorer_masters | explorer_lichess | curated
  games_total       bigint,
  white_wins        bigint,
  draws             bigint,
  black_wins        bigint,
  avg_rating        int,
  unique (from_position_id, uci)
);
create index if not exists opening_moves_from_idx on public.opening_moves(from_position_id);

-- named openings backbone (Lichess chess-openings TSV)
create table if not exists public.openings (
  id                 text primary key,                -- slug
  eco                char(3),
  name               text not null,
  pgn                text,
  uci                text,
  epd                text,
  side               text,                            -- white | black | null
  final_position_id  text references public.opening_positions(id) on delete set null
);
create index if not exists openings_eco_idx on public.openings(eco);

-- ── repertoires + spaced repetition ───────────────────────────────────────────
create table if not exists public.repertoires (
  id                 uuid primary key default gen_random_uuid(),
  user_id            text references public.users(id) on delete cascade,  -- null = system template
  name               text not null,
  side               text not null check (side in ('white','black')),
  is_template        boolean not null default false,
  source_template_id uuid references public.repertoires(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists repertoires_user_idx on public.repertoires(user_id);
create trigger repertoires_touch before update on public.repertoires
  for each row execute function public.touch_updated_at();

create table if not exists public.repertoire_lines (
  id               uuid primary key default gen_random_uuid(),
  repertoire_id    uuid not null references public.repertoires(id) on delete cascade,
  from_position_id text not null references public.opening_positions(id) on delete cascade,
  expected_move_id text not null references public.opening_moves(id) on delete cascade,
  line_path        text,                              -- UCI path from root for ordering/display
  ply              int not null default 0,
  added_at         timestamptz not null default now(),
  unique (repertoire_id, from_position_id)
);
create index if not exists repertoire_lines_rep_idx on public.repertoire_lines(repertoire_id);

create table if not exists public.sr_cards (
  id                 uuid primary key default gen_random_uuid(),
  user_id            text not null references public.users(id) on delete cascade,
  repertoire_line_id uuid not null references public.repertoire_lines(id) on delete cascade,
  -- FSRS state
  stability      double precision not null default 0,
  difficulty     double precision not null default 0,
  due            timestamptz not null default now(),
  last_review    timestamptz,
  reps           int not null default 0,
  lapses         int not null default 0,
  state          text not null default 'new',         -- new | learning | review | relearning
  scheduled_days int not null default 0,
  elapsed_days   int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, repertoire_line_id)
);
create index if not exists sr_cards_due_idx on public.sr_cards(user_id, due);
create trigger sr_cards_touch before update on public.sr_cards
  for each row execute function public.touch_updated_at();

create table if not exists public.sr_reviews (
  id                uuid primary key default gen_random_uuid(),
  card_id           uuid not null references public.sr_cards(id) on delete cascade,
  user_id           text not null references public.users(id) on delete cascade,
  rating            smallint not null,                -- 1 Again | 2 Hard | 3 Good | 4 Easy
  state_before      text,
  stability_before  double precision,
  difficulty_before double precision,
  elapsed_days      int,
  scheduled_days    int,
  review_duration_ms int,
  reviewed_at       timestamptz not null default now()
);
create index if not exists sr_reviews_user_idx on public.sr_reviews(user_id, reviewed_at desc);

-- ── coach conversations ───────────────────────────────────────────────────────
create table if not exists public.coach_conversations (
  id           uuid primary key default gen_random_uuid(),
  user_id      text not null references public.users(id) on delete cascade,
  context_type text not null,                          -- analysis | puzzle | opening | concept | practice
  context_ref  text,
  created_at   timestamptz not null default now()
);

create table if not exists public.coach_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.coach_conversations(id) on delete cascade,
  role            text not null,                       -- user | assistant | system
  content         text not null,
  position_fen    text,
  token_usage     jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists coach_messages_conv_idx on public.coach_messages(conversation_id, created_at);

-- ── Row Level Security ─────────────────────────────────────────────────────────
alter table public.users               enable row level security;
alter table public.games               enable row level security;
alter table public.game_analyses       enable row level security;
alter table public.progress            enable row level security;
alter table public.puzzle_attempts     enable row level security;
alter table public.repertoires         enable row level security;
alter table public.repertoire_lines    enable row level security;
alter table public.sr_cards            enable row level security;
alter table public.sr_reviews          enable row level security;
alter table public.coach_conversations enable row level security;
alter table public.coach_messages      enable row level security;
-- public reference tables
alter table public.puzzles             enable row level security;
alter table public.opening_positions   enable row level security;
alter table public.opening_moves       enable row level security;
alter table public.openings            enable row level security;

-- Owner-only policies (read+write where clerk_uid() matches user_id)
do $$
declare t text;
begin
  foreach t in array array[
    'users','games','game_analyses','progress','puzzle_attempts',
    'sr_cards','sr_reviews','coach_conversations'
  ] loop
    execute format($f$
      create policy %1$s_owner_all on public.%1$s
        for all
        using (
          %2$s = (case when '%1$s' = 'users' then id else user_id end)
        )
        with check (
          %2$s = (case when '%1$s' = 'users' then id else user_id end)
        );
    $f$, t, 'public.clerk_uid()');
  end loop;
end $$;

-- repertoires: owner read+write; templates are world-readable
create policy repertoires_select on public.repertoires
  for select using (is_template or user_id = public.clerk_uid());
create policy repertoires_modify on public.repertoires
  for all using (user_id = public.clerk_uid())
  with check (user_id = public.clerk_uid());

-- repertoire_lines: visible if parent repertoire is a template or owned by user
create policy repertoire_lines_select on public.repertoire_lines
  for select using (
    exists (
      select 1 from public.repertoires r
      where r.id = repertoire_id
        and (r.is_template or r.user_id = public.clerk_uid())
    )
  );
create policy repertoire_lines_modify on public.repertoire_lines
  for all using (
    exists (select 1 from public.repertoires r
            where r.id = repertoire_id and r.user_id = public.clerk_uid())
  )
  with check (
    exists (select 1 from public.repertoires r
            where r.id = repertoire_id and r.user_id = public.clerk_uid())
  );

-- coach_messages: visible/writable if parent conversation is owned by user
create policy coach_messages_all on public.coach_messages
  for all using (
    exists (select 1 from public.coach_conversations c
            where c.id = conversation_id and c.user_id = public.clerk_uid())
  )
  with check (
    exists (select 1 from public.coach_conversations c
            where c.id = conversation_id and c.user_id = public.clerk_uid())
  );

-- public reference data: world-readable, no client writes (seeded server-side)
create policy puzzles_read           on public.puzzles           for select using (true);
create policy opening_positions_read on public.opening_positions for select using (true);
create policy opening_moves_read     on public.opening_moves     for select using (true);
create policy openings_read          on public.openings          for select using (true);
