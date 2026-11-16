-- The shared world: what everyone has charted, the marks they left, and the travellers themselves.
-- Only the server (api/world.js, with the secret key) reads or writes these; the public keys get nothing.
-- Safe to run more than once.

create table if not exists public.world_cells (          -- every 200 m square anyone has seen, and who saw it first
  realm text not null check (realm in ('over','under')),
  cx integer not null, cz integer not null,
  by_name text not null default '',
  at timestamptz not null default now(),
  primary key (realm, cx, cz)
);

create table if not exists public.world_marks (          -- where someone met a god (a shrine stays), or fell
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('met','fall')),
  realm text not null check (realm in ('over','under')),
  x real not null, y real not null, z real not null,
  god text not null default '', seed integer not null default 0,
  by_name text not null default '', by_hash text not null default '',
  at timestamptz not null default now()
);
create index if not exists world_marks_place on public.world_marks (realm, x, z);
create unique index if not exists world_marks_once on public.world_marks (by_hash, kind, god) where kind = 'met';

create table if not exists public.travellers (            -- one row per traveller, keyed by a hash of their secret code
  hash text primary key,
  name text not null default '',
  realm text not null default 'over', x real not null default 0, z real not null default 0,
  phase text not null default '',
  save jsonb, map jsonb,
  first_at timestamptz not null default now(), seen timestamptz not null default now()
);
create index if not exists travellers_seen on public.travellers (seen desc);

alter table public.world_cells enable row level security;
alter table public.world_marks enable row level security;
alter table public.travellers  enable row level security;
revoke all on public.world_cells, public.world_marks, public.travellers from anon, authenticated;
grant select, insert, update, delete on public.world_cells, public.world_marks, public.travellers to service_role;

-- Rivers of wind players blow across the sky (api/world.js). Anyone who flies into one is carried down it; they stay.
create table if not exists public.world_winds (
  id text primary key check (id ~ '^[a-z0-9]{4,12}$'),
  realm text not null check (realm in ('over','under')),
  cx real not null, cz real not null,                      -- its middle, to find the ones near someone
  pts jsonb not null check (jsonb_typeof(pts) = 'array' and jsonb_array_length(pts) between 15 and 180),   -- x, y, z, x, y, z, ...
  patron text not null default '',                         -- whose colour it flies in
  by_name text not null default '', by_hash text not null default '',
  at timestamptz not null default now()
);
create index if not exists world_winds_place on public.world_winds (realm, cx, cz);
create index if not exists world_winds_at on public.world_winds (at desc);
alter table public.world_winds enable row level security;
revoke all on public.world_winds from anon, authenticated;
grant select, insert, update, delete on public.world_winds to service_role;

-- Ring arenas (api/world.js): whoever last flew a course of rings from the first to the last holds it, and its rings burn
-- in their gods' colours (several, if they flew it together) until a flier of another god takes it.
create table if not exists public.world_rings (
  id text primary key check (id ~ '^[a-z0-9_-]{1,24}$'),
  realm text not null check (realm in ('over','under')),
  cx real not null, cz real not null,                      -- its first ring, to find the ones near someone
  patrons jsonb not null check (jsonb_typeof(patrons) = 'array' and jsonb_array_length(patrons) between 1 and 4),
  names jsonb not null default '[]'::jsonb check (jsonb_typeof(names) = 'array'),
  by_hash text not null default '',
  at timestamptz not null default now()
);
create index if not exists world_rings_place on public.world_rings (realm, cx, cz);
alter table public.world_rings enable row level security;
revoke all on public.world_rings from anon, authenticated;
grant select, insert, update, delete on public.world_rings to service_role;

-- What the gods share (api/_pantheon.js): each god is one mind speaking with many mortals at once, and they talk among
-- themselves. A row is one thing worth telling: a god's own short note after a conversation (kind 'talk'), or a deed
-- the game saw (kind 'deed': found a god, finished a task, chose a patron, went under the sea). Notes are written by
-- the god, cleaned on the server, and forgotten after a month.
create table if not exists public.god_notes (
  id bigint generated always as identity primary key,
  god text not null default '' check (god ~ '^[a-z]{0,16}$'),   -- who tells it ('' when it was simply seen)
  kind text not null check (kind in ('talk','deed')),
  name text not null check (char_length(name) <= 12),
  by_hash text not null,                                     -- whose it is about (the hash of their travel code)
  note text not null check (char_length(note) between 1 and 200),
  at timestamptz not null default now()
);
create index if not exists god_notes_at on public.god_notes (at desc);
create index if not exists god_notes_god on public.god_notes (god, at desc);
create index if not exists god_notes_who on public.god_notes (by_hash, at desc);
alter table public.god_notes enable row level security;
revoke all on public.god_notes from anon, authenticated;
grant select, insert, delete on public.god_notes to service_role;

-- A course of rings goes on past its first length for whoever keeps flying it: how far it has been opened (it only grows).
alter table public.world_rings add column if not exists len integer not null default 0 check (len between 0 and 400);

-- Who may not play (api/_bans.js, api/admin.js): a traveller (c: + the hash of their travel code), an address (i: + a
-- salted hash of the IP, or of the IPv6 /64), or a name (n: + the name). Written and read only by the server.
create table if not exists public.world_bans (
  key text primary key check (key ~ '^[cin]:[A-Za-z0-9 ]{1,64}$'),
  kind text not null check (kind in ('code','ip','name')),
  name text not null default '',
  by_name text not null default '',
  at timestamptz not null default now()
);
alter table public.world_bans enable row level security;
revoke all on public.world_bans from anon, authenticated;
grant select, insert, update, delete on public.world_bans to service_role;

-- ── Accounts. Signing in (email, or Google) ties a Supabase user to a traveller: the travel code is kept here so that
-- signing in on another device brings the same traveller back. Written and read only by the server (api/account.js).
create table if not exists public.accounts (
  user_id uuid primary key,
  email text not null default '',
  code text not null check (code ~ '^[A-Z0-9]{12}$'),
  name text not null default '',
  created_at timestamptz not null default now(),
  seen_at timestamptz not null default now()
);
create unique index if not exists accounts_code on public.accounts (code);
alter table public.accounts enable row level security;
revoke all on public.accounts from anon, authenticated;
grant select, insert, update, delete on public.accounts to service_role;

-- ── Stats (api/stats.js): what each traveller has done, kept as one record they add to (distance, the fastest they
-- have been, their fastest mile, the water they have thrown, crashes, words said ...).
create table if not exists public.player_stats (
  key text primary key check (key ~ '^[0-9a-f]{64}$'),   -- sha-256 of the travel code
  name text not null default '',
  data jsonb not null default '{}'::jsonb check (pg_column_size(data) < 32768),
  updated_at timestamptz not null default now()
);
alter table public.player_stats enable row level security;
revoke all on public.player_stats from anon, authenticated;
grant select, insert, update, delete on public.player_stats to service_role;

-- Where they flew: a point every couple of seconds, so the stats page can play their flights back.
create table if not exists public.flight_points (
  id bigserial primary key,
  key text not null check (key ~ '^[0-9a-f]{64}$'),
  t timestamptz not null,
  x real not null, y real not null, z real not null,
  r smallint not null default 0,          -- realm: 0 the world, 1 the Underworld
  v real not null default 0,              -- speed, m/s
  f char(1) not null default 'h'          -- form: p bird, h on foot, w wings, ...
);
create index if not exists flight_points_key_t on public.flight_points (key, t);
alter table public.flight_points enable row level security;
revoke all on public.flight_points from anon, authenticated;
grant select, insert, update, delete on public.flight_points to service_role;
grant usage, select on sequence public.flight_points_id_seq to service_role;

-- Everything said with the gods, both ways. "Deleted" by the player only hides a line from them: it is kept.
create table if not exists public.talk_log (
  id bigserial primary key,
  key text not null check (key ~ '^[0-9a-f]{64}$'),
  god text not null default '' check (length(god) <= 24),
  who text not null check (who in ('me','god')),
  text text not null check (length(text) <= 1200),
  at timestamptz not null default now(),
  hidden boolean not null default false
);
create index if not exists talk_log_key_at on public.talk_log (key, at);
alter table public.talk_log enable row level security;
revoke all on public.talk_log from anon, authenticated;
grant select, insert, update, delete on public.talk_log to service_role;
grant usage, select on sequence public.talk_log_id_seq to service_role;

-- ── Areas (api/areas.js): the world cut into squares three kilometres across, each named (by the gods' voice, the
-- first time anyone flies into it) and the name kept for everyone.
create table if not exists public.world_areas (
  key text primary key check (key ~ '^(over|under):-?\d{1,5}:-?\d{1,5}$'),
  name text not null check (length(name) between 2 and 40),
  style smallint not null default 0,
  by_name text not null default '',
  at timestamptz not null default now()
);
alter table public.world_areas enable row level security;
revoke all on public.world_areas from anon, authenticated;
grant select, insert, update, delete on public.world_areas to service_role;

-- ── The keeper's agent (api/agent.js): skills it has been taught, kept between conversations.
create table if not exists public.agent_skills (
  name text primary key check (name ~ '^[a-z0-9_]{2,40}$'),
  body text not null check (length(body) <= 4000),
  by_email text not null default '',
  at timestamptz not null default now()
);
alter table public.agent_skills enable row level security;
revoke all on public.agent_skills from anon, authenticated;
grant select, insert, update, delete on public.agent_skills to service_role;

-- ── Areas, who holds them (api/_areas.js): whoever finds a place may name it (owner_hash: the hash of their travel code,
-- never the code); found by someone of a faction, it is the faction's too (group_tag: its public tag; group_key: the hash of a
-- proof only its members can make; group_name: how it is shown). named_by and renamed_at: the name somebody gave it. And each
-- place's wreath of torches: where it stands (wx, wy, wz, wyaw), the god it was last lit for (hero) and by whom (holder).
-- All nullable: a place found before this has none of them, and the server works without these columns until they are added.
alter table public.world_areas
  add column if not exists owner_hash text,
  add column if not exists group_tag text,
  add column if not exists group_key text,
  add column if not exists group_name text,
  add column if not exists named_by text,
  add column if not exists renamed_at timestamptz,
  add column if not exists hero text,
  add column if not exists holder text,
  add column if not exists held_at timestamptz,
  add column if not exists wx real,
  add column if not exists wy real,
  add column if not exists wz real,
  add column if not exists wyaw real;

-- ── The keeper's scenes (api/_story.js, /api/hub?fn=story): the campaign he writes in the studio. body is the scene as the
-- page and the server both clean it (words, a place, a trigger, a few effects from a safe list: never code). Published ones
-- are read by every player's page through the server; drafts only by him. Nobody reaches the table but the server's key.
create table if not exists public.story_scenes (
  id text primary key check (id ~ '^[a-z0-9_-]{2,40}$'),
  body jsonb not null check (pg_column_size(body) <= 16384),
  published boolean not null default false,
  ord integer not null default 0,
  by_email text not null default '',
  at timestamptz not null default now()
);
create index if not exists story_scenes_published on public.story_scenes (published, ord);
alter table public.story_scenes enable row level security;
revoke all on public.story_scenes from anon, authenticated;
grant select, insert, update, delete on public.story_scenes to service_role;

-- ── Travellers' own agents (api/_mcp.js), and what a traveller and their agents say to each other (api/_talk.js).
-- No table of their own: an agent is a row of `travellers` with phase 'agent', a sign-in waiting to be collected is one
-- with phase 'pair', and a note between a traveller and one of their agents is one with phase 'note' (gone when it has
-- been handed over, or a day old). Everything works without what follows; these two only save the server from reading
-- the whole table to find them, once there are many travellers.
create index if not exists travellers_agents on public.travellers ((save->>'owner')) where phase = 'agent';
create index if not exists travellers_notes on public.travellers ((save->>'agent'), seen) where phase = 'note';
