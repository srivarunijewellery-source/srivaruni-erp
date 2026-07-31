-- =====================================================================
-- 0057_allow_qty_picked_for_extras.sql
--
-- The original transfer_lines_qty_picked_check (0041) capped qty_picked
-- at qty_requested unconditionally. An extra (qty_requested = 0) has no
-- ceiling from picking -- however many times it gets scanned is however
-- many go in the box. approve_transfer's stock-on-hand check is the
-- real backstop.
-- =====================================================================

alter table transfer_lines drop constraint if exists transfer_lines_qty_picked_check;
alter table transfer_lines add constraint transfer_lines_qty_picked_check
  check (qty_picked >= 0 and (qty_requested = 0 or qty_picked <= qty_requested));
