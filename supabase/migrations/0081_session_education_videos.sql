-- A coaching note can carry more than one video.
--
-- One link was enough while a note explained a single cue; a coach
-- introducing a new lift wants the setup and the common fault, which is two
-- clips. jsonb array rather than text[] to match how this schema already
-- stores string lists (rep_scheme, event_questions.options,
-- group_programs.session_days).
--
-- video_url is BACKFILLED then DROPPED rather than left inert. The usual
-- convention here is to leave a superseded column alone, but this one is two
-- days old with a single writer, and a column that still holds the first
-- video while nothing reads it is exactly the sort of thing that costs a
-- future session an afternoon. The guard below aborts the whole migration
-- rather than dropping anything if a single row would lose its link.
--
-- TO ROLL BACK:
--   alter table programming.session_education add column video_url text;
--   update programming.session_education
--      set video_url = video_urls->>0 where jsonb_array_length(video_urls) > 0;
--   alter table programming.session_education drop column video_urls;

alter table programming.session_education
  add column video_urls jsonb not null default '[]'::jsonb;

update programming.session_education
   set video_urls = jsonb_build_array(trim(video_url))
 where coalesce(trim(video_url), '') <> '';

do $$
declare had int; kept int;
begin
  select count(*) into had from programming.session_education where coalesce(trim(video_url), '') <> '';
  select count(*) into kept from programming.session_education where jsonb_array_length(video_urls) > 0;
  if had <> kept then
    raise exception 'video backfill mismatch: % rows had a link, % carried over — refusing to drop video_url', had, kept;
  end if;
end $$;

alter table programming.session_education drop column video_url;

-- Column changes — PostgREST needs the usual nudge:
-- NOTIFY pgrst, 'reload schema';
