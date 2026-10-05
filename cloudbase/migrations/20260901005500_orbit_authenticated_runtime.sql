-- CloudBase app.rdb() cloud-function requests run as authenticated.
-- The mini program does not access these tables directly; cloud functions
-- enforce OPENID and workspace membership before every business operation.

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

drop policy if exists orbit_authenticated_users on public.users;
create policy orbit_authenticated_users on public.users
  for all to authenticated
  using (true) with check (true);

drop policy if exists orbit_authenticated_workspaces on public.workspaces;
create policy orbit_authenticated_workspaces on public.workspaces
  for all to authenticated
  using (true) with check (true);

drop policy if exists orbit_authenticated_members on public.workspace_members;
create policy orbit_authenticated_members on public.workspace_members
  for all to authenticated
  using (true) with check (true);

drop policy if exists orbit_authenticated_tasks on public.tasks;
create policy orbit_authenticated_tasks on public.tasks
  for all to authenticated
  using (true) with check (true);

drop policy if exists orbit_authenticated_programs on public.mini_programs;
create policy orbit_authenticated_programs on public.mini_programs
  for all to authenticated
  using (true) with check (true);

drop policy if exists orbit_authenticated_tools on public.task_tools;
create policy orbit_authenticated_tools on public.task_tools
  for all to authenticated
  using (true) with check (true);

drop policy if exists orbit_authenticated_facts on public.facts;
create policy orbit_authenticated_facts on public.facts
  for all to authenticated
  using (true) with check (true);

drop policy if exists orbit_authenticated_events on public.events;
create policy orbit_authenticated_events on public.events
  for all to authenticated
  using (true) with check (true);

drop policy if exists orbit_authenticated_runs on public.agent_runs;
create policy orbit_authenticated_runs on public.agent_runs
  for all to authenticated
  using (true) with check (true);
