-- Cloud Functions now authenticate with the private service API key.
-- Remove temporary runtime-role and authenticated bypass policies.

drop policy if exists orbit_runtime_users on public.users;
drop policy if exists orbit_runtime_workspaces on public.workspaces;
drop policy if exists orbit_runtime_members on public.workspace_members;
drop policy if exists orbit_runtime_tasks on public.tasks;
drop policy if exists orbit_runtime_programs on public.mini_programs;
drop policy if exists orbit_runtime_tools on public.task_tools;
drop policy if exists orbit_runtime_facts on public.facts;
drop policy if exists orbit_runtime_events on public.events;
drop policy if exists orbit_runtime_runs on public.agent_runs;

drop policy if exists orbit_authenticated_users on public.users;
drop policy if exists orbit_authenticated_workspaces on public.workspaces;
drop policy if exists orbit_authenticated_members on public.workspace_members;
drop policy if exists orbit_authenticated_tasks on public.tasks;
drop policy if exists orbit_authenticated_programs on public.mini_programs;
drop policy if exists orbit_authenticated_tools on public.task_tools;
drop policy if exists orbit_authenticated_facts on public.facts;
drop policy if exists orbit_authenticated_events on public.events;
drop policy if exists orbit_authenticated_runs on public.agent_runs;

revoke all on all tables in schema public from cloudbase_postgres_pgdb_b0pp5mb7;
revoke usage on schema public from cloudbase_postgres_pgdb_b0pp5mb7;
