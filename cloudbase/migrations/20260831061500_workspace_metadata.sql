alter table public.workspaces
  add column if not exists metadata jsonb not null default '{}'::jsonb;
