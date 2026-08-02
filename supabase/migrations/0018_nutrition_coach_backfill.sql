-- Bridges Kova's coach/admin accounts into the standalone Nutrition Tracker
-- app's `public.coaches` table, which its `is_coach()` RLS helper checks by
-- row existence. Kova's nutrition module now reads/writes the same live
-- public.* tables that app uses (see CLAUDE.md's nutrition-rebuild section)
-- rather than Kova's own placeholder `nutrition.*` schema, so every Kova
-- coach/admin needs a matching public.coaches row or every is_coach()-gated
-- policy silently returns zero rows for them (not a loud error).
--
-- One-time backfill for coaches that already exist as of this migration.
-- Going forward, supabase/functions/invite-staff and
-- supabase/functions/ensure-nutrition-coach keep this in sync automatically.
insert into public.coaches (id, name, email)
select id, name, email
from core.users
where role in ('coach', 'admin')
on conflict (id) do nothing;
