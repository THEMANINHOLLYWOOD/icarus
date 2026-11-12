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
