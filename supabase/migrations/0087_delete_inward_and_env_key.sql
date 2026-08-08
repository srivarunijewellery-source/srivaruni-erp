-- Deleting an inward document.
--
-- Only ever a way to discard a mistake, never a way to undo a receipt.
-- Once an inward is approved the stock has landed, costs are posted, and
-- items exist carrying that provenance — deleting the paperwork then
-- would leave stock on the shelf with nothing explaining where it came
-- from. That case needs a reversal, which is a different act with a
-- different audit trail.
--
-- Draft, submitted and rejected can be deleted. Approved cannot, and
-- neither can anything carrying vendor payments or credit notes, because
-- those are real money rather than paperwork.
create or replace function delete_inward(p_id uuid, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare v_doc text; v_status text; v_lines int; v_money int;
begin
  if not is_owner() then
    raise exception 'Only the owner can delete an inward.';
  end if;

  select doc_no, status::text into v_doc, v_status
  from inwards where id = p_id for update;
  if v_doc is null then raise exception 'No such inward.'; end if;

  if v_status = 'approved' then
    raise exception
      '% is approved — the stock has already landed. Reverse it instead, so the ledger explains where those pieces went.',
      v_doc;
  end if;

  select count(*) into v_money from (
    select 1 from vendor_payment_allocations where inward_id = p_id
    union all select 1 from vendor_credit_allocations where inward_id = p_id
    union all select 1 from vendor_credit_notes where source_inward_id = p_id
    union all select 1 from vendor_money_history where inward_id = p_id
  ) x;
  if v_money > 0 then
    raise exception
      '% has vendor payments or credit notes against it. Undo those first.', v_doc;
  end if;

  select count(*) into v_lines from inward_lines where inward_id = p_id;

  -- Written before the rows go: afterwards there is nothing left to
  -- describe what was deleted.
  insert into audit_log (table_name, row_id, action, old_data, new_data, changed_by)
  values ('inwards', p_id, 'delete',
          jsonb_build_object('doc_no', v_doc, 'status', v_status, 'lines', v_lines),
          jsonb_build_object('reason', coalesce(p_reason, 'not given')),
          current_staff_id());

  delete from inward_attachments      where inward_id = p_id;
  delete from inward_additional_costs where inward_id = p_id;
  delete from inward_header_costs     where inward_id = p_id;
  delete from inward_line_costs
    where inward_line_id in (select id from inward_lines where inward_id = p_id);
  delete from inward_lines            where inward_id = p_id;
  delete from inwards                 where id = p_id;

  return jsonb_build_object('doc_no', v_doc, 'lines_removed', v_lines);
end $$;

do $$
begin
  revoke all on function public.delete_inward(uuid, text) from public, anon;
  grant execute on function public.delete_inward(uuid, text) to authenticated, service_role;
end $$;
