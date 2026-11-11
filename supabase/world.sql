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
