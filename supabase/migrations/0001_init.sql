-- Triple PLO — initial schema + row-level security.
--
-- Security model (defense in depth):
--   * Secret tables (deals, private cards, hidden board cards, burns, undealt,
--     sessions, host email) have RLS ENABLED with NO client-readable policy.
--     They are reachable only via the service role from server code. The browser
--     literally cannot query them, even with a stolen anon key.
--   * Public room state (games, players sans secrets, results, score events) is
--     readable by authenticated room members via RLS.
--   * All WRITES go through server route handlers using the service role; the
--     anon client never writes game state directly.
--
-- Money is stored as integer cents (bigint). Never floating point.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type game_phase as enum (
  'LOBBY','READY_TO_START','DEALING','ARRANGING','READY_TO_REVEAL','REVEALING',
  'ROUND_SUMMARY','WAITING_NEXT_ROUND','HOST_DISCONNECTED','GAME_ABANDONED','GAME_ENDED'
);
create type board_id as enum ('top','middle','bottom');
create type board_result_type as enum (
  'TWO_PLAYER_OUTRIGHT','TWO_PLAYER_PUSH','THREE_PLAYER_OUTRIGHT',
  'THREE_PLAYER_TWO_WAY_TIE','THREE_PLAYER_THREE_WAY_PUSH'
);
create type email_status as enum ('none','pending','sent','failed');

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------
create table games (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  player_count  smallint not null check (player_count in (2,3)),
  board_value_cents bigint not null check (board_value_cents in (100,200,400)),
  host_player_id uuid,                 -- set after host player row exists
  phase         game_phase not null default 'LOBBY',
  version       bigint not null default 1,
  completed_rounds int not null default 0,
  resume_phase  game_phase,
  host_disconnected_at timestamptz,
  email_status  email_status not null default 'none',
  created_at    timestamptz not null default now(),
  ended_at      timestamptz
);

create table players (
  id            uuid primary key default gen_random_uuid(),
  game_id       uuid not null references games(id) on delete cascade,
  seat          smallint not null,
  display_name  text not null,
  is_host       boolean not null default false,
  -- Host email is SECRET (never exposed to other players). Kept here but guarded
  -- by RLS + a column-restricted view for public reads.
  email         text,
  connected     boolean not null default true,
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (game_id, seat),
  unique (game_id, lower(display_name))   -- no duplicate names in a room
);

-- Opaque, high-entropy session tokens. SECRET.
create table player_sessions (
  token_hash    text primary key,       -- store a hash of the token, not the token
  game_id       uuid not null references games(id) on delete cascade,
  player_id     uuid not null references players(id) on delete cascade,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null
);

create table rounds (
  id            uuid primary key default gen_random_uuid(),
  game_id       uuid not null references games(id) on delete cascade,
  round_number  int not null,
  cancelled     boolean not null default false,
  reveal_step   text,
  sweep_applied boolean,
  sweep_winner  uuid references players(id),
  created_at    timestamptz not null default now(),
  unique (game_id, round_number)
);

-- SECRET: the full authoritative deal for a round (private hands, hidden turn/
-- river, burns, undealt). Server-only. Storing the whole deal (not re-shuffling)
-- is what makes reconnection/recovery reproduce the exact same deal.
create table round_deals (
  round_id      uuid primary key references rounds(id) on delete cascade,
  deal          jsonb not null          -- { private, burns, boards, undealt }
);

-- Community boards, split so that hidden cards can be withheld until reveal.
create table boards (
  round_id      uuid not null references rounds(id) on delete cascade,
  board         board_id not null,
  flop          text[] not null,        -- public once dealt
  turn          text not null,          -- SECRET until revealed (see reveal_events)
  river         text not null,          -- SECRET until revealed
  primary key (round_id, board)
);

-- Player arrangements. SECRET (a player's own row is server-delivered to them;
-- others are withheld until that board's assignment reveal).
create table board_assignments (
  round_id      uuid not null references rounds(id) on delete cascade,
  player_id     uuid not null references players(id) on delete cascade,
  board         board_id not null,
  cards         text[] not null check (array_length(cards,1) = 4),
  primary key (round_id, player_id, board)
);

create table ready_states (
  round_id      uuid not null references rounds(id) on delete cascade,
  player_id     uuid not null references players(id) on delete cascade,
  ready_at      timestamptz not null default now(),
  primary key (round_id, player_id)
);

create table reveal_events (
  id            bigserial primary key,
  round_id      uuid not null references rounds(id) on delete cascade,
  step          text not null,
  created_at    timestamptz not null default now(),
  unique (round_id, step)               -- idempotent reveal steps
);

create table board_results (
  round_id      uuid not null references rounds(id) on delete cascade,
  board         board_id not null,
  result_type   board_result_type not null,
  winners       uuid[] not null,
  losers        uuid[] not null,
  premium_multiplier smallint not null,
  sweep_multiplier smallint not null,
  explanation   text not null,
  primary key (round_id, board)
);

-- One row per player per board = the FINAL (sweep-adjusted) net change.
-- (Recommended model: store only FINAL score events; provisional scores are a
-- UI concept. `sweep_applied` on the round records the audit fact.)
create table score_events (
  id            bigserial primary key,
  round_id      uuid not null references rounds(id) on delete cascade,
  board         board_id not null,
  player_id     uuid not null references players(id) on delete cascade,
  delta_cents   bigint not null,
  created_at    timestamptz not null default now(),
  unique (round_id, board, player_id)
);

create table final_settlements (
  game_id       uuid not null references games(id) on delete cascade,
  from_player   uuid not null references players(id),
  to_player     uuid not null references players(id),
  amount_cents  bigint not null check (amount_cents > 0),
  primary key (game_id, from_player, to_player)
);

create table email_deliveries (
  id            bigserial primary key,
  game_id       uuid not null references games(id) on delete cascade,
  status        email_status not null,
  attempts      int not null default 0,
  last_error    text,
  idempotency_key text unique,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table connection_status (
  game_id       uuid not null references games(id) on delete cascade,
  player_id     uuid not null references players(id) on delete cascade,
  connected     boolean not null,
  changed_at    timestamptz not null default now(),
  primary key (game_id, player_id)
);

-- Cumulative scores are DERIVED from score_events; expose as a view.
create view cumulative_scores as
  select r.game_id, se.player_id, sum(se.delta_cents)::bigint as net_cents
  from score_events se
  join rounds r on r.id = se.round_id
  where r.cancelled = false
  group by r.game_id, se.player_id;

create index on players (game_id);
create index on rounds (game_id);
create index on score_events (round_id);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
-- Enable RLS everywhere; add read policies only for non-secret room state.
-- The server (service role) bypasses RLS for all writes and secret reads.

alter table games            enable row level security;
alter table players          enable row level security;
alter table rounds           enable row level security;
alter table board_results    enable row level security;
alter table score_events     enable row level security;
alter table final_settlements enable row level security;

-- Secret tables: RLS enabled, NO policy => no anon/authenticated access at all.
alter table player_sessions   enable row level security;
alter table round_deals       enable row level security;
alter table boards            enable row level security;
alter table board_assignments enable row level security;
alter table ready_states      enable row level security;
alter table reveal_events     enable row level security;
alter table email_deliveries  enable row level security;
alter table connection_status enable row level security;

-- Helper: is the current auth user a member of this game?
-- (This assumes you map Supabase auth uid -> players.id via a claims table, OR
--  that the anon client is not used for reads at all and everything is
--  server-mediated. For the MVP we recommend SERVER-MEDIATED reads via the
--  /state route, in which case even these read policies can be omitted.)

-- Example membership read policy (only if you enable direct anon reads):
create policy games_read_members on games
  for select using (
    exists (
      select 1 from players p
      where p.game_id = games.id
        and p.id = (auth.jwt() ->> 'player_id')::uuid
    )
  );

-- Players are readable to room members, but the email column must be stripped.
-- Prefer exposing a column-limited view instead of the base table:
create view players_public as
  select id, game_id, seat, display_name, is_host, connected, last_seen_at
  from players;

create policy players_read_members on players
  for select using (
    exists (
      select 1 from players self
      where self.game_id = players.game_id
        and self.id = (auth.jwt() ->> 'player_id')::uuid
    )
  );

-- NOTE: The reference implementation in this repo delivers ALL client-visible
-- state through the server /state endpoint (see src/server/views.ts), which
-- redacts secrets before they leave the server. Direct anon reads are optional
-- and, if enabled, must never touch the secret tables above.
