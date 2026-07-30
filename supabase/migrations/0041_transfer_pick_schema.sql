-- =====================================================================
-- 0041_transfer_pick_schema.sql
--
-- Adds the PICK stage to stock transfers.
--
--   REQUESTED  anyone raises it and builds the line list
--   PICKING    sending store scans each tag into the box
--   PICKED     box sealed; what was picked is what ships
--   APPROVED   owner signs off on what is ACTUALLY in the box
--   DISPATCHED stock leaves the source and belongs to no store
--   RECEIVED   destination scans it in; transit nets to zero
--
-- Approval deliberately sits AFTER picking. Signing off on a request
-- before anyone has walked the rail approves quantities that may not
-- exist, and the shortfall is then discovered at the far end.
--
-- Discrepancy rule: a short pick drops the line to what was found and
-- records the shortfall on the document. The box contains what it
-- contains, and the destination should not scan for something that was
-- never packed.
-- =====================================================================

alter table transfer_lines
  add column if not exists qty_requested int,
  add column if not exists qty_picked    int not null default 0;

update transfer_lines set qty_requested = qty_sent where qty_requested is null;

alter table transfer_lines alter column qty_requested set not null;

-- qty_sent may now legitimately be zero: a line can be requested and then
-- not found. The old check demanded > 0 and would have blocked the seal.
alter table transfer_lines drop constraint if exists transfer_lines_qty_sent_check;
alter table transfer_lines add constraint transfer_lines_qty_sent_check check (qty_sent >= 0);
alter table transfer_lines drop constraint if exists transfer_lines_qty_requested_check;
alter table transfer_lines add constraint transfer_lines_qty_requested_check check (qty_requested > 0);
alter table transfer_lines drop constraint if exists transfer_lines_qty_picked_check;
alter table transfer_lines add constraint transfer_lines_qty_picked_check check (qty_picked >= 0 and qty_picked <= qty_requested);

comment on column transfer_lines.qty_requested is 'What the destination asked for. Never changes after request.';
comment on column transfer_lines.qty_picked    is 'What was physically found and scanned into the box.';
comment on column transfer_lines.qty_sent      is 'What was dispatched. Set from qty_picked at pick confirmation.';

alter table transfers
  add column if not exists picking_by  uuid references staff(id),
  add column if not exists picking_at  timestamptz,
  add column if not exists picked_by   uuid references staff(id),
  add column if not exists picked_at   timestamptz,
  add column if not exists pick_note   text;

alter table transfers drop constraint if exists transfers_status_check;
alter table transfers add constraint transfers_status_check check (
  status in ('requested','picking','picked','approved',
             'dispatched','received','rejected','cancelled')
);

comment on column transfers.pick_note is
  'Free text from the picker, typically explaining a shortfall.';
