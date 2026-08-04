-- Replaces 0021_first_login_at.sql's approach entirely — that migration
-- added a brand-new core.users.first_login_at column, stamped client-side
-- on session load. Real flaw found immediately after shipping: a new column
-- has no history, so it only starts reflecting reality from the moment the
-- migration ran forward. Real clients (Rosa, Lisa, Abbi) who'd clearly
-- logged in before all showed as "Never signed in" simply because they
-- hadn't force-reopened the app again since — indistinguishable from someone
-- who's genuinely never signed in at all, which defeats the entire point.
--
-- Correct fix: auth.users.last_sign_in_at is already tracked natively by
-- Supabase Auth for every account, since it was created — no custom
-- stamping code, no backfill gap. It's just not reachable from the client
-- SDK directly (auth schema isn't exposed via PostgREST), so this exposes
-- it through a narrow, staff-only, read-only security-definer function
-- instead of a new column.
drop function if exists core.stamp_own_first_login();
alter table core.users drop column if exists first_login_at;

create function core.get_login_activity(user_ids uuid[])
returns table(id uuid, last_sign_in_at timestamptz)
language sql
security definer
set search_path = core, auth
stable
as $$
  select au.id, au.last_sign_in_at
  from auth.users au
  where au.id = any(user_ids) and core.is_staff();
$$;

grant execute on function core.get_login_activity(uuid[]) to authenticated;

-- Dropping a column needs the same PostgREST schema-cache nudge as adding
-- one — NOTIFY pgrst, 'reload schema'; in the SQL Editor right after running
-- this.
