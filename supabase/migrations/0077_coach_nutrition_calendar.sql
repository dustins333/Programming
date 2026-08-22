-- Per-coach GHL calendar for nutrition check-in Zoom bookings.
--
-- Until now both booking Edge Functions (get-checkin-booking-slots,
-- book-checkin-session) hardcoded a single calendar id. That calendar
-- ("Nutrition Check In", t7fAF1sImGuso1im6UR6) is round-robin with exactly
-- one team member -- Terra -- so every nutrition client was booking onto
-- her availability regardless of who their assigned coach actually was.
-- With more than one nutrition coach that is simply wrong: as of this
-- migration Abby has 5 active nutrition clients and Dustin has 1.
--
-- Both functions now resolve the calendar from the member's own
-- public.clients.coach_id -> core.users.ghl_calendar_id, falling back to
-- the gym-wide default seeded below.
alter table core.users add column if not exists ghl_calendar_id text;

comment on column core.users.ghl_calendar_id is
  'GoHighLevel calendar id this coach''s nutrition check-in calls book onto. Null = use the nutrition_checkin_calendar_id gym default. Set from Settings -> Team.';

-- The fallback, seeded with the id both functions hardcoded until now, so
-- nothing changes on the day this runs: a coach who has not had a calendar
-- picked yet -- and a client with no coach at all, which has been possible
-- since 0033 made public.clients.coach_id nullable -- keeps landing exactly
-- where they land today.
insert into core.settings (key, value)
values ('nutrition_checkin_calendar_id', to_jsonb('t7fAF1sImGuso1im6UR6'::text))
on conflict (key) do nothing;

-- No new RLS. core.users' existing "admin can manage users" policy (0001)
-- already scopes writes to admins, which is where this is edited from
-- (Settings -> Team is admin-only), and nothing client-side ever needs to
-- READ the column -- resolution happens server-side under the service role
-- inside the two booking functions.
