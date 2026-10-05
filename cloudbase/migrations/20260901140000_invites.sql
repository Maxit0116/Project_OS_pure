create table if not exists public.invites (
  id text primary key,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  token_hash text not null,
  created_by text not null,
  expires_at timestamptz not null,
  max_uses integer not null default 10,
  used_count integer not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create index if not exists idx_invites_workspace on public.invites(workspace_id, status);
create index if not exists idx_invites_token_hash on public.invites(token_hash);

alter table public.invites enable row level security;
create policy orbit_service_invites on public.invites for all to service_role using (true) with check (true);
grant select, insert, update, delete on public.invites to service_role;
