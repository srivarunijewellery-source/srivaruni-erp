-- How the slip prints, and what the QR on it points at.
--
-- The first real print came back with the left column clipped and the
-- strokes too thin to read: side padding was 0 because "the driver adds
-- its own", which is true of the TOP margin and false of the sides. And
-- a thermal head under-burns thin strokes, so normal-weight text prints
-- grey.
--
-- These are settings rather than constants because the right numbers
-- depend on the printer, and the only way to find them is to print one
-- and look.
create table if not exists print_settings (
  id                uuid primary key default gen_random_uuid(),
  singleton         boolean not null default true unique,
  paper_mm          integer not null default 80  check (paper_mm between 50 and 110),
  print_width_mm    numeric not null default 72  check (print_width_mm between 40 and 105),
  side_margin_mm    numeric not null default 3   check (side_margin_mm between 0 and 10),
  base_font_px      integer not null default 12  check (base_font_px between 9 and 18),
  bold_body         boolean not null default true,
  show_photos       boolean not null default false,
  show_savings      boolean not null default true,
  show_gst_block    boolean not null default true,
  show_barcode      boolean not null default true,
  footer_feed_mm    integer not null default 6   check (footer_feed_mm between 0 and 30),
  layout            text not null default 'standard'
                      check (layout in ('standard','compact','detailed')),
  font_family       text not null default 'editorial'
                      check (font_family in ('editorial','mono','grotesk')),
  qr_url            text default 'https://www.instagram.com/sri_varuni_fashion_jewellery/',
  qr_caption        text default 'Follow us',
  qr_handle         text default '@sri_varuni_fashion_jewellery',
  updated_by        uuid references staff(id),
  updated_at        timestamptz not null default now()
);

insert into print_settings (singleton) values (true) on conflict do nothing;

alter table print_settings enable row level security;
create policy print_settings_read on print_settings
  for select using (current_staff_id() is not null);

create or replace function save_print_settings(p jsonb)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not (has_permission('settings.manage') or is_owner()) then
    raise exception 'Only the owner can change print settings.';
  end if;

  update print_settings set
    paper_mm       = coalesce((p->>'paper_mm')::int, paper_mm),
    print_width_mm = coalesce((p->>'print_width_mm')::numeric, print_width_mm),
    side_margin_mm = coalesce((p->>'side_margin_mm')::numeric, side_margin_mm),
    base_font_px   = coalesce((p->>'base_font_px')::int, base_font_px),
    bold_body      = coalesce((p->>'bold_body')::boolean, bold_body),
    show_photos    = coalesce((p->>'show_photos')::boolean, show_photos),
    show_savings   = coalesce((p->>'show_savings')::boolean, show_savings),
    show_gst_block = coalesce((p->>'show_gst_block')::boolean, show_gst_block),
    show_barcode   = coalesce((p->>'show_barcode')::boolean, show_barcode),
    footer_feed_mm = coalesce((p->>'footer_feed_mm')::int, footer_feed_mm),
    layout         = coalesce(p->>'layout', layout),
    font_family    = coalesce(p->>'font_family', font_family),
    qr_url         = coalesce(p->>'qr_url', qr_url),
    qr_caption     = coalesce(p->>'qr_caption', qr_caption),
    qr_handle      = coalesce(p->>'qr_handle', qr_handle),
    updated_by     = current_staff_id(),
    updated_at     = now()
  where singleton;

  return (select to_jsonb(x) from print_settings x where singleton);
end $$;

do $$
begin
  revoke all on function public.save_print_settings(jsonb) from public, anon;
  grant execute on function public.save_print_settings(jsonb) to authenticated, service_role;
end $$;
