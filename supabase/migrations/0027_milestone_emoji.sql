-- Coach picks an emoji when setting up a milestone (nullable — older
-- milestones created before this feature have none, and fall back to a
-- plain trophy icon client-side). Shown on the member's completed-
-- milestone slider card and History timeline; tapping it opens the
-- milestone's details.
alter table programming.nutrition_milestones add column emoji text;

-- New column needs the usual PostgREST schema-cache nudge —
-- NOTIFY pgrst, 'reload schema'; in the SQL Editor right after running this.
