-- Progress-photo framing: how one photo sits inside its frame.
--
-- Two photos of the same person weeks apart rarely line up, because what
-- moved between them is the CAMERA, not her -- she stood a foot further
-- back, or the phone was propped higher. Every compare surface crops with
-- `cover`, which centres, so the misalignment survives into the comparison
-- and the coach reads a difference that isn't there.
--
-- This is deliberately stored ON THE PHOTO rather than on a pair. The
-- distortion belongs to the shot, so nudging a photo once into a standard
-- frame makes it line up against EVERY other adjusted photo, not just the
-- one it happens to be sitting next to today. Adjust once, correct forever,
-- and the client's own Photos tab and the shareable board get it for free.
--
-- Shape: {"scale": 1.4, "x": -0.06, "y": 0.11, "ar": 0.75}
--   scale  >= 1. 1 is exactly the cover fit every photo renders as today.
--   x, y   the image centre's offset from the frame centre, as a FRACTION
--          of the frame's own width/height -- never pixels, because the
--          same photo draws at five different sizes across the app.
--   ar     the source image's intrinsic aspect ratio (w/h), captured once
--          by the editor so a renderer can work out the cover fit
--          synchronously instead of an async Image.getSize per photo.
--
-- NULL means untouched, and that is the whole backward-compatibility story:
-- every photo already on file keeps rendering byte-identically until
-- someone deliberately adjusts it. public.photos is the table the
-- standalone Nutrition Tracker app shares, so this follows the same
-- additive, nullable, default-preserving pattern as 0031 / 0033 / 0042 --
-- that app never selects this column and is unaffected.
--
-- The CHECK is deliberately shallow. A constraint that cast the members to
-- numeric would ERROR rather than return false on a malformed value, which
-- turns a bad write into a failure that is harder to reason about than a
-- clamped read; the app clamps every field on the way in and on the way
-- out, so out-of-range numbers can only ever render conservatively.
--
-- Rollback: alter table public.photos drop column framing;

alter table public.photos
  add column if not exists framing jsonb;

alter table public.photos
  drop constraint if exists photos_framing_is_object;

alter table public.photos
  add constraint photos_framing_is_object
  check (framing is null or jsonb_typeof(framing) = 'object');

comment on column public.photos.framing is
  'Coach-set display framing {scale,x,y,ar}; NULL = untouched, renders as a plain cover fit. Kova only; the standalone Nutrition Tracker app does not read this.';
