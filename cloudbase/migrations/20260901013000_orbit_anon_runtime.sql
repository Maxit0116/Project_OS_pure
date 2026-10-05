-- CloudBase event-function app.rdb() requests use the anon database role.
-- The mini program does not access PostgreSQL directly; all business writes
-- still pass through OPENID and workspace-membership checks in cloud functions.

grant usage on schema public to anon;
grant select, insert, update, delete on all tables in schema public to anon;

create policy orbit_anon_users on public.users
  for all to anon
  using (true) with check (true);

create policy orbit_anon_workspaces on public.workspaces
  for all to anon
  using (true) with check (true);

create policy orbit_anon_members on public.workspace_members
  for all to anon
  using (true) with check (true);

create policy orbit_anon_tasks on public.tasks
  for all to anon
  using (true) with check (true);

create policy orbit_anon_programs on public.mini_programs
  for all to anon
  using (true) with check (true);

create policy orbit_anon_tools on public.task_tools
  for all to anon
  using (true) with check (true);

create policy orbit_anon_facts on public.facts
  for all to anon
  using (true) with check (true);

create policy orbit_anon_events on public.events
  for all to anon
  using (true) with check (true);

create policy orbit_anon_runs on public.agent_runs
  for all to anon
  using (true) with check (true);
