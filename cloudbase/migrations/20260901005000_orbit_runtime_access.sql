-- Cloud function runtime access for the Orbit PostgreSQL boundary.
-- Application authorization remains enforced by cloud functions.

grant usage on schema public to cloudbase_postgres_pgdb_b0pp5mb7;
grant select, insert, update, delete on all tables in schema public to cloudbase_postgres_pgdb_b0pp5mb7;

drop policy if exists orbit_runtime_users on public.users;
create policy orbit_runtime_users on public.users
  for all to cloudbase_postgres_pgdb_b0pp5mb7
  using (true) with check (true);

drop policy if exists orbit_runtime_workspaces on public.workspaces;
create policy orbit_runtime_workspaces on public.workspaces
  for all to cloudbase_postgres_pgdb_b0pp5mb7
  using (true) with check (true);

drop policy if exists orbit_runtime_members on public.workspace_members;
create policy orbit_runtime_members on public.workspace_members
  for all to cloudbase_postgres_pgdb_b0pp5mb7
  using (true) with check (true);

drop policy if exists orbit_runtime_tasks on public.tasks;
create policy orbit_runtime_tasks on public.tasks
  for all to cloudbase_postgres_pgdb_b0pp5mb7
  using (true) with check (true);

drop policy if exists orbit_runtime_programs on public.mini_programs;
create policy orbit_runtime_programs on public.mini_programs
  for all to cloudbase_postgres_pgdb_b0pp5mb7
  using (true) with check (true);

drop policy if exists orbit_runtime_tools on public.task_tools;
create policy orbit_runtime_tools on public.task_tools
  for all to cloudbase_postgres_pgdb_b0pp5mb7
  using (true) with check (true);

drop policy if exists orbit_runtime_facts on public.facts;
create policy orbit_runtime_facts on public.facts
  for all to cloudbase_postgres_pgdb_b0pp5mb7
  using (true) with check (true);

drop policy if exists orbit_runtime_events on public.events;
create policy orbit_runtime_events on public.events
  for all to cloudbase_postgres_pgdb_b0pp5mb7
  using (true) with check (true);

drop policy if exists orbit_runtime_runs on public.agent_runs;
create policy orbit_runtime_runs on public.agent_runs
  for all to cloudbase_postgres_pgdb_b0pp5mb7
  using (true) with check (true);
