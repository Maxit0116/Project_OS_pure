-- Cloud Functions use the CloudBase authenticated runtime identity.
-- Business authorization remains enforced by OPENID and workspace membership
-- checks in the function boundary.

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

create policy orbit_authenticated_users on public.users
  for all to authenticated
  using (true) with check (true);

create policy orbit_authenticated_workspaces on public.workspaces
  for all to authenticated
  using (true) with check (true);

create policy orbit_authenticated_members on public.workspace_members
  for all to authenticated
  using (true) with check (true);

create policy orbit_authenticated_tasks on public.tasks
  for all to authenticated
  using (true) with check (true);

create policy orbit_authenticated_programs on public.mini_programs
  for all to authenticated
  using (true) with check (true);

create policy orbit_authenticated_tools on public.task_tools
  for all to authenticated
  using (true) with check (true);

create policy orbit_authenticated_facts on public.facts
  for all to authenticated
  using (true) with check (true);

create policy orbit_authenticated_events on public.events
  for all to authenticated
  using (true) with check (true);

create policy orbit_authenticated_runs on public.agent_runs
  for all to authenticated
  using (true) with check (true);
