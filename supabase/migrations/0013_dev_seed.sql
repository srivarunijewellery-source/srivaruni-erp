-- =====================================================================
-- 0013_dev_seed.sql
-- TEST DATA AND TEST ACCOUNTS. Not for production.
--
--   admin@srivaruni.com     / SV@2026   owner,   Boduppal
--   staff_test@srivaruni.com/ 12345     staff,   Boduppal
--
-- Passwords are written as bcrypt hashes straight into auth.users, which
-- bypasses the GoTrue API's six-character minimum. '12345' will therefore
-- sign in but cannot be re-set through the app's own password flow.
--
-- ROTATE BOTH before any real stock or customer data goes in. These
-- credentials have been shared in plain text.
--
-- To remove everything this file created:
--   delete from auth.users where email like '%@srivaruni.com';
--   delete from staff where auth_user_id is null;
-- =====================================================================

-- ------------------------------------------------------- auth accounts
-- Guarded so the file still runs on a plain Postgres test harness, which
-- has no auth schema.

do $$
declare
  v_admin uuid := '0a000000-0000-4000-8000-000000000001';
  v_staff uuid := '0a000000-0000-4000-8000-000000000002';
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'auth') then
    raise notice 'No auth schema (local harness) - skipping auth.users seed';
    return;
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  values
    ('00000000-0000-0000-0000-000000000000', v_admin, 'authenticated', 'authenticated',
     'admin@srivaruni.com', crypt('SV@2026', gen_salt('bf')),
     now(), now(), now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"name":"SB"}'::jsonb, '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_staff, 'authenticated', 'authenticated',
     'staff_test@srivaruni.com', crypt('12345', gen_salt('bf')),
     now(), now(), now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"name":"Test Counter Staff"}'::jsonb, '', '', '', '')
  on conflict (id) do update
    set encrypted_password = excluded.encrypted_password,
        email_confirmed_at = excluded.email_confirmed_at;

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  )
  values
    (gen_random_uuid(), v_admin, v_admin::text,
     format('{"sub":"%s","email":"%s","email_verified":true}', v_admin, 'admin@srivaruni.com')::jsonb,
     'email', now(), now(), now()),
    (gen_random_uuid(), v_staff, v_staff::text,
     format('{"sub":"%s","email":"%s","email_verified":true}', v_staff, 'staff_test@srivaruni.com')::jsonb,
     'email', now(), now(), now())
  on conflict (provider_id, provider) do nothing;
end
$$;

-- ------------------------------------------------------- staff records

insert into staff (id, auth_user_id, name, phone, role, home_location_id) values
  ('0b000000-0000-4000-8000-000000000001',
   '0a000000-0000-4000-8000-000000000001',
   'SB', null, 'owner',
   (select id from locations where code = 'BOD')),
  ('0b000000-0000-4000-8000-000000000002',
   '0a000000-0000-4000-8000-000000000002',
   'Test Counter Staff', null, 'staff',
   (select id from locations where code = 'BOD'))
on conflict (id) do update
  set auth_user_id = excluded.auth_user_id,
      role = excluded.role,
      home_location_id = excluded.home_location_id;

-- --------------------------------------------------------- test vendors
-- One registered Rajasthan vendor (interstate -> IGST, cost ex-GST) and
-- one local unregistered vendor (no tax, full amount is cost). Between
-- them they exercise both tax paths.

insert into staff (id, name, role, home_location_id) values
  ('0b000000-0000-4000-8000-000000000003', 'Zaheerabad Manager', 'manager',
   (select id from locations where code = 'ZHB'))
on conflict (id) do nothing;

insert into vendors (id, name, gst_status, gstin, city, payment_terms_days) values
  ('0c000000-0000-4000-8000-000000000001', 'Jaipur Imitation House',
   'registered', '08AAACJ1234A1ZQ', 'Jaipur', 30),
  ('0c000000-0000-4000-8000-000000000002', 'Hyderabad Local Supplier',
   'unregistered', null, 'Hyderabad', 0)
on conflict (id) do nothing;

-- -------------------------------------------------------- test customer

insert into customers (id, phone, name, city) values
  ('0d000000-0000-4000-8000-000000000001', '9848012345', 'Test Customer', 'Hyderabad')
on conflict (phone) do nothing;
