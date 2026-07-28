-- Item photos and vendor invoice scans.
-- item-photos is public-read: paths carry a random UUID, the images are
-- product shots that end up in marketing anyway, and public read avoids
-- a signed-URL round trip on every thumbnail in a 40-line inward.
-- inward-invoices is PRIVATE. Those scans carry purchase rates, which is
-- exactly the data the cost-isolation design keeps away from staff.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('item-photos', 'item-photos', true, 10485760,
   array['image/jpeg','image/png','image/webp']),
  ('inward-invoices', 'inward-invoices', false, 20971520,
   array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "item photos readable" on storage.objects;
create policy "item photos readable" on storage.objects
  for select using (bucket_id = 'item-photos');

drop policy if exists "staff upload item photos" on storage.objects;
create policy "staff upload item photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'item-photos' and current_staff_id() is not null);

drop policy if exists "staff replace item photos" on storage.objects;
create policy "staff replace item photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'item-photos' and current_staff_id() is not null);

drop policy if exists "staff upload invoices" on storage.objects;
create policy "staff upload invoices" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'inward-invoices' and current_staff_id() is not null);

drop policy if exists "owner reads invoices" on storage.objects;
create policy "owner reads invoices" on storage.objects
  for select to authenticated
  using (bucket_id = 'inward-invoices' and is_owner());
