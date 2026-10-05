-- Orbit Phase 1-5 core schema.
-- Cloud functions are the only application write boundary for the mini program.

create table if not exists public.users (
  id text primary key,
  openid_hash text not null unique,
  nickname text not null default 'Orbit 用户',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id text primary key,
  owner_id text not null,
  title text not null,
  goal text not null default '',
  scenario text not null default 'generic_task',
  status text not null default 'in_progress',
  budget_limit numeric(12, 2),
  start_at timestamptz,
  end_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  id text primary key,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  user_id text not null,
  role text not null default 'member',
  status text not null default 'active',
  joined_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table if not exists public.tasks (
  id text primary key,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  parent_id text references public.tasks(id) on delete set null,
  title text not null,
  description text not null default '',
  task_type text not null default 'service_task',
  status text not null default 'todo',
  owner_id text,
  owner_label text not null default '待分配',
  depends_on jsonb not null default '[]'::jsonb,
  required_inputs jsonb not null default '[]'::jsonb,
  expected_outputs jsonb not null default '[]'::jsonb,
  result_schema jsonb not null default '{}'::jsonb,
  source text not null default 'user_confirmed',
  sort_order integer not null default 0,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mini_programs (
  id text primary key,
  name text not null,
  app_id text,
  path text,
  short_link text,
  category text not null,
  capabilities jsonb not null default '[]'::jsonb,
  supported_tasks jsonb not null default '[]'::jsonb,
  target_users jsonb not null default '[]'::jsonb,
  geographic_scope jsonb not null default '[]'::jsonb,
  required_inputs jsonb not null default '[]'::jsonb,
  expected_outputs jsonb not null default '[]'::jsonb,
  handoff_mode text not null default 'manual_capture',
  verification jsonb not null default '{}'::jsonb,
  verification_status text not null default 'pending',
  last_checked_at timestamptz,
  fallback jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.task_tools (
  id text primary key,
  task_id text not null references public.tasks(id) on delete cascade,
  mini_program_id text not null references public.mini_programs(id) on delete restrict,
  rank integer not null default 1,
  match_reason text not null default '',
  missing_inputs jsonb not null default '[]'::jsonb,
  expected_output jsonb not null default '[]'::jsonb,
  availability text not null default 'available',
  created_at timestamptz not null default now(),
  unique (task_id, mini_program_id)
);

create table if not exists public.facts (
  id text primary key,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  task_id text references public.tasks(id) on delete set null,
  key text not null,
  value_json jsonb not null default '{}'::jsonb,
  unit text,
  source_type text not null,
  source_ref text not null default '',
  confidence text not null default 'confirmed',
  captured_at timestamptz not null default now(),
  confirmed_by text,
  is_current boolean not null default true,
  idempotency_key text not null,
  unique (workspace_id, idempotency_key)
);

create table if not exists public.events (
  id text primary key,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  actor_id text,
  event_type text not null,
  payload_json jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, idempotency_key)
);

create table if not exists public.agent_runs (
  id text primary key,
  workspace_id text,
  run_type text not null,
  adapter text not null,
  model text,
  input_version text,
  output_json jsonb not null default '{}'::jsonb,
  input_tokens integer,
  output_tokens integer,
  duration_ms integer,
  status text not null,
  error_code text,
  created_at timestamptz not null default now()
);

create index if not exists idx_workspace_members_user on public.workspace_members(user_id);
create index if not exists idx_tasks_workspace_order on public.tasks(workspace_id, sort_order);
create index if not exists idx_task_tools_task on public.task_tools(task_id, rank);
create index if not exists idx_facts_workspace_current on public.facts(workspace_id, is_current);
create index if not exists idx_events_workspace_created on public.events(workspace_id, created_at desc);

grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;

alter table public.users enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.tasks enable row level security;
alter table public.mini_programs enable row level security;
alter table public.task_tools enable row level security;
alter table public.facts enable row level security;
alter table public.events enable row level security;
alter table public.agent_runs enable row level security;

create policy orbit_service_users on public.users for all to service_role using (true) with check (true);
create policy orbit_service_workspaces on public.workspaces for all to service_role using (true) with check (true);
create policy orbit_service_members on public.workspace_members for all to service_role using (true) with check (true);
create policy orbit_service_tasks on public.tasks for all to service_role using (true) with check (true);
create policy orbit_service_programs on public.mini_programs for all to service_role using (true) with check (true);
create policy orbit_service_tools on public.task_tools for all to service_role using (true) with check (true);
create policy orbit_service_facts on public.facts for all to service_role using (true) with check (true);
create policy orbit_service_events on public.events for all to service_role using (true) with check (true);
create policy orbit_service_runs on public.agent_runs for all to service_role using (true) with check (true);
