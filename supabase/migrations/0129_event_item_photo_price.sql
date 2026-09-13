-- 0129_event_item_photo_price.sql
--
-- Order events become a small store: each item gets a product photo and an
-- optional price.
--
--   * image_path — a path in the PUBLIC `graphics` bucket (0060), same as an
--     event's own graphic. Product photos are marketing, never client data.
--   * price — per unit, dollars. Nullable: an item with no price just shows
--     no price, and the order still collects fine. This is display only;
--     nothing here takes payment.
--
-- Both additive and nullable, so every existing item keeps rendering exactly
-- as it does today, and older deployed JS never selects them explicitly
-- (`select *`) so nothing breaks mid-deploy. No RLS change: the existing
-- item policies cover every column.

alter table programming.event_items
  add column if not exists image_path text,
  add column if not exists price numeric(10, 2) check (price is null or price >= 0);

notify pgrst, 'reload schema';
