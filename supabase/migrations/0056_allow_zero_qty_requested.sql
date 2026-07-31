-- =====================================================================
-- 0056_allow_zero_qty_requested.sql
--
-- The original transfer_lines_qty_requested_check (0041) assumed every
-- line had a positive requested quantity. qty_requested = 0 is now the
-- deliberate flag for "added later, not on the original request" (see
-- 0054, 0055) -- so the check has to allow it.
-- =====================================================================

alter table transfer_lines drop constraint if exists transfer_lines_qty_requested_check;
alter table transfer_lines add constraint transfer_lines_qty_requested_check check (qty_requested >= 0);

comment on column transfer_lines.qty_requested is
  'What the destination asked for. 0 means this line was added later -- '
  'during picking or at approval -- and was never part of the original ask.';
