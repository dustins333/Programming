-- 0065: a staff member can manage their OWN spc_clients row.
--
-- Every coach/admin account is also a real training client (dual-login),
-- and the new /(coach)/my-training screen lets a coach set their own group
-- and SPC memberships. Group memberships were already writable
-- (client_program_assignments' staff policy is plain core.is_staff()), but
-- spc_clients' staff policy is core.can_access_spc() — a coach whose SPC
-- module toggle is off would silently fail to enroll themself.
--
-- Scoped to the caller's own row only. Nothing about managing OTHER
-- clients' SPC rows changes; that stays behind can_access_spc().

create policy "staff manage own spc_clients row"
  on programming.spc_clients
  for all
  using (user_id = auth.uid() and core.is_staff())
  with check (user_id = auth.uid() and core.is_staff());

notify pgrst, 'reload schema';
