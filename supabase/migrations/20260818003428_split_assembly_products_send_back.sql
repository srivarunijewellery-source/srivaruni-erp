create or replace function public.split_assembly_products(
  p_assembly uuid,
  p_products uuid[],
  p_reason   text
)
returns table(new_assembly_id uuid, new_doc_no text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_src      assemblies%rowtype;
  v_new      uuid;
  v_doc      text;
  v_asked    int;
  v_moving   int;
  v_total    int;
begin
  -- Sending work back is the owner's call, same as rejecting the whole
  -- document. The bench cannot send its own work back to itself.
  if not is_owner() then
    raise exception 'Only the owner can send products back.';
  end if;
  if current_staff_id() is null then
    raise exception 'Not signed in.';
  end if;

  select count(distinct u) into v_asked from unnest(coalesce(p_products, '{}'::uuid[])) u;
  if v_asked = 0 then
    raise exception 'Tick at least one product to send back.';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Say what needs fixing -- this note is the only thing the bench sees.';
  end if;

  select * into v_src from assemblies where id = p_assembly;
  if not found then
    raise exception 'That assembly could not be found.';
  end if;

  -- Submitted only. A draft is already editable, so there is nothing to
  -- send back; an approved one has consumed its materials and written
  -- item_costs, and moving a product out of it would restate a cost the
  -- stock ledger already agrees on. That one needs Dismantle.
  if v_src.status <> 'submitted' then
    raise exception 'Only a submitted assembly can have products sent back. This one is %.', v_src.status;
  end if;

  select count(*) into v_total from assembly_items where assembly_id = p_assembly;
  select count(*) into v_moving
    from assembly_items where assembly_id = p_assembly and id = any(p_products);

  -- Refuse a partial match rather than quietly moving the ones that did
  -- match: the screen would then show a send-back that half happened.
  if v_moving <> v_asked then
    raise exception 'Some of those products are no longer on this document. Reload the page and try again.';
  end if;
  if v_moving = v_total then
    raise exception 'That is every product on the document. Use Send back, which returns the whole thing and keeps one document number.';
  end if;

  -- The new document inherits the SOURCE labour rate, not today's
  -- setting. Each assembly snapshots the rate when it is started, so
  -- reading business_settings here would silently reprice the work if
  -- the rate had changed since -- and the piece would come back costing
  -- something different for no reason anyone could see.
  v_doc := next_assembly_no(v_src.location_id);

  insert into assemblies (
    doc_no, location_id, status, labour_rate_paise, note, created_by, rejected_reason
  )
  values (
    v_doc, v_src.location_id, 'draft', v_src.labour_rate_paise,
    'Sent back from ' || v_src.doc_no,
    current_staff_id(),
    'Sent back from ' || v_src.doc_no || ': ' || btrim(p_reason)
  )
  returning id into v_new;

  -- Re-pointing the parent row carries its materials with it, because
  -- assembly_components hang off assembly_item_id and never reference
  -- the document. Line numbers restart so the new document reads 1..n
  -- instead of inheriting gaps from the one it left.
  update assembly_items ai
     set assembly_id = v_new,
         line_no     = s.rn
    from (
      select id, row_number() over (order by line_no nulls last, id) as rn
        from assembly_items
       where assembly_id = p_assembly and id = any(p_products)
    ) s
   where ai.id = s.id;

  -- Both documents: the source lost lines and the new one gained them,
  -- so every batch total on both screens is now stale.
  perform compute_assembly_costs(p_assembly);
  perform compute_assembly_costs(v_new);

  return query select v_new, v_doc;
end
$function$;
