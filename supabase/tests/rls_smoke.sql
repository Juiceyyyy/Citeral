-- Safe to run against production with a privileged database connection: all fixture writes are enclosed in a transaction and rolled back.
begin;

select 1 / case when exists(select 1 from pg_extension where extname='vector') then 1 else 0 end as vector_installed;

select 1 / case when not exists(
  select 1
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and not c.relrowsecurity
) then 1 else 0 end as all_public_tables_have_rls;

select 1 / case when not exists(
  select 1
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relkind='v'
    and not (coalesce(c.reloptions,'{}'::text[]) @> array['security_invoker=true'])
) then 1 else 0 end as all_public_views_are_security_invoker;

select 1 / case when not exists(
  select 1
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosecdef
) then 1 else 0 end as no_public_security_definer_functions;
select 1 / case when exists(select 1 from pg_policies where schemaname='public' and tablename='chunks') then 1 else 0 end as chunks_has_rls_policy;
select 1 / case when exists(select 1 from pg_proc where proname='hybrid_search_chunks_scoped') then 1 else 0 end as scoped_retrieval_rpc_exists;
select 1 / case when exists(select 1 from storage.buckets where id='documents' and public=false) then 1 else 0 end as private_storage_bucket;
select 1 / case when exists(select 1 from pg_trigger where tgname='bots_identity_immutable' and not tgisinternal) then 1 else 0 end as bot_identity_guard_exists;
select 1 / case when exists(select 1 from pg_trigger where tgname='documents_identity_immutable' and not tgisinternal) then 1 else 0 end as document_identity_guard_exists;
select 1 / case when not exists(
  select 1 from information_schema.role_table_grants
  where grantee='authenticated' and table_schema='public' and table_name='daily_usage_counters' and privilege_type in ('INSERT','UPDATE','DELETE')
) then 1 else 0 end as quota_counter_not_client_mutable;

select 1 / case when not exists(
  select 1 from information_schema.role_table_grants
  where grantee in ('anon','authenticated')
    and table_schema='public'
    and table_name='request_rate_counters'
) then 1 else 0 end as rate_counter_not_client_accessible;

select 1 / case when exists(
  select 1 from pg_policies
  where schemaname='public'
    and tablename='request_rate_counters'
    and policyname='request_rate_counters_deny_direct'
) then 1 else 0 end as rate_counter_deny_policy_exists;

select 1 / case when exists(
  select 1 from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='list_own_document_storage_paths'
) then 1 else 0 end as account_storage_listing_rpc_exists;

select 1 / case when not exists(
  select 1 from information_schema.role_table_grants
  where grantee in ('anon','authenticated')
    and table_schema='public'
    and table_name='knowledge_upload_reservations'
) then 1 else 0 end as upload_reservations_rpc_only;

select 1 / case when exists(
  select 1 from pg_policies
  where schemaname='public'
    and tablename='knowledge_upload_reservations'
    and policyname='knowledge_upload_reservations_deny_direct'
) then 1 else 0 end as upload_reservations_deny_policy_exists;

select 1 / case when not exists(
  select 1
  from pg_policies
  where schemaname='public'
    and tablename='knowledge_base_documents'
    and policyname in ('kbd_insert_private','kbd_delete_private')
) then 1 else 0 end as broad_kb_membership_policies_absent;


-- Behavioral two-user isolation test. Fixed fixture IDs are transaction-local and rolled back.
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,email_confirmed_at,created_at,updated_at)
values
  ('f17e0000-0000-4000-8000-00000000a001','authenticated','authenticated','rls-a@citeral.invalid','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now(),now()),
  ('f17e0000-0000-4000-8000-00000000b001','authenticated','authenticated','rls-b@citeral.invalid','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now(),now());

insert into public.organizations(id,name,slug,created_by)
values
  ('f17e0000-0000-4000-8000-000000000a01','RLS Fixture A','rls-fixture-a','f17e0000-0000-4000-8000-00000000a001'),
  ('f17e0000-0000-4000-8000-000000000b01','RLS Fixture B','rls-fixture-b','f17e0000-0000-4000-8000-00000000b001');

insert into public.organization_members(organization_id,user_id,role)
values
  ('f17e0000-0000-4000-8000-000000000a01','f17e0000-0000-4000-8000-00000000a001','owner'),
  ('f17e0000-0000-4000-8000-000000000b01','f17e0000-0000-4000-8000-00000000b001','owner');

insert into public.bots(id,organization_id,owner_user_id,name,description,bot_type)
values
  ('f17e0000-0000-4000-8000-000000000a02','f17e0000-0000-4000-8000-000000000a01','f17e0000-0000-4000-8000-00000000a001','Fixture A','','custom'),
  ('f17e0000-0000-4000-8000-000000000b02','f17e0000-0000-4000-8000-000000000b01','f17e0000-0000-4000-8000-00000000b001','Fixture B','','custom');

insert into public.knowledge_bases(id,organization_id,owner_user_id,name,kind,visibility)
values
  ('f17e0000-0000-4000-8000-000000000a03','f17e0000-0000-4000-8000-000000000a01','f17e0000-0000-4000-8000-00000000a001','Fixture KB A','private','private'),
  ('f17e0000-0000-4000-8000-000000000b03','f17e0000-0000-4000-8000-000000000b01','f17e0000-0000-4000-8000-00000000b001','Fixture KB B','private','private');

insert into public.documents(id,organization_id,owner_user_id,knowledge_base_id,title,mime_type,status)
values
  ('f17e0000-0000-4000-8000-000000000a04','f17e0000-0000-4000-8000-000000000a01','f17e0000-0000-4000-8000-00000000a001','f17e0000-0000-4000-8000-000000000a03','Fixture doc A','text/plain','ready'),
  ('f17e0000-0000-4000-8000-000000000b04','f17e0000-0000-4000-8000-000000000b01','f17e0000-0000-4000-8000-00000000b001','f17e0000-0000-4000-8000-000000000b03','Fixture doc B','text/plain','ready');

insert into public.document_versions(id,document_id,version_number,status,content_hash)
values
  ('f17e0000-0000-4000-8000-000000000a05','f17e0000-0000-4000-8000-000000000a04',1,'ready','fixture-a'),
  ('f17e0000-0000-4000-8000-000000000b05','f17e0000-0000-4000-8000-000000000b04',1,'ready','fixture-b');

insert into public.chunks(id,organization_id,knowledge_base_id,document_id,document_version_id,chunk_index,content,content_hash)
values
  ('f17e0000-0000-4000-8000-000000000a06','f17e0000-0000-4000-8000-000000000a01','f17e0000-0000-4000-8000-000000000a03','f17e0000-0000-4000-8000-000000000a04','f17e0000-0000-4000-8000-000000000a05',0,'fixture A','fixture-a'),
  ('f17e0000-0000-4000-8000-000000000b06','f17e0000-0000-4000-8000-000000000b01','f17e0000-0000-4000-8000-000000000b03','f17e0000-0000-4000-8000-000000000b04','f17e0000-0000-4000-8000-000000000b05',0,'fixture B','fixture-b');

insert into public.conversations(id,organization_id,owner_user_id,bot_id,title)
values
  ('f17e0000-0000-4000-8000-000000000a07','f17e0000-0000-4000-8000-000000000a01','f17e0000-0000-4000-8000-00000000a001','f17e0000-0000-4000-8000-000000000a02','Fixture A'),
  ('f17e0000-0000-4000-8000-000000000b07','f17e0000-0000-4000-8000-000000000b01','f17e0000-0000-4000-8000-00000000b001','f17e0000-0000-4000-8000-000000000b02','Fixture B');

insert into public.messages(id,conversation_id,role,parts,position)
values
  ('rls-fixture-a','f17e0000-0000-4000-8000-000000000a07','user','[]'::jsonb,0),
  ('rls-fixture-b','f17e0000-0000-4000-8000-000000000b07','user','[]'::jsonb,0);

insert into public.portfolios(id,organization_id,owner_user_id,name)
values
  ('f17e0000-0000-4000-8000-000000000a08','f17e0000-0000-4000-8000-000000000a01','f17e0000-0000-4000-8000-00000000a001','Fixture A'),
  ('f17e0000-0000-4000-8000-000000000b08','f17e0000-0000-4000-8000-000000000b01','f17e0000-0000-4000-8000-00000000b001','Fixture B');

insert into public.portfolio_positions(id,portfolio_id,name,current_value)
values
  ('f17e0000-0000-4000-8000-000000000a09','f17e0000-0000-4000-8000-000000000a08','Fixture A',1),
  ('f17e0000-0000-4000-8000-000000000b09','f17e0000-0000-4000-8000-000000000b08','Fixture B',1);

set local role authenticated;
select set_config('request.jwt.claim.sub','f17e0000-0000-4000-8000-00000000a001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select 1 / case when auth.uid()='f17e0000-0000-4000-8000-00000000a001'::uuid then 1 else 0 end as fixture_identity_active;
select 1 / case when (select count(*) from public.profiles where id in ('f17e0000-0000-4000-8000-00000000a001','f17e0000-0000-4000-8000-00000000b001'))=1 then 1 else 0 end as profiles_isolated;
select 1 / case when (select count(*) from public.organizations where id in ('f17e0000-0000-4000-8000-000000000a01','f17e0000-0000-4000-8000-000000000b01'))=1 then 1 else 0 end as organizations_isolated;
select 1 / case when (select count(*) from public.organization_members where organization_id in ('f17e0000-0000-4000-8000-000000000a01','f17e0000-0000-4000-8000-000000000b01'))=1 then 1 else 0 end as memberships_isolated;
select 1 / case when (select count(*) from public.bots where id in ('f17e0000-0000-4000-8000-000000000a02','f17e0000-0000-4000-8000-000000000b02'))=1 then 1 else 0 end as bots_isolated;
select 1 / case when (select count(*) from public.knowledge_bases where id in ('f17e0000-0000-4000-8000-000000000a03','f17e0000-0000-4000-8000-000000000b03'))=1 then 1 else 0 end as private_kbs_isolated;
select 1 / case when (select count(*) from public.documents where id in ('f17e0000-0000-4000-8000-000000000a04','f17e0000-0000-4000-8000-000000000b04'))=1 then 1 else 0 end as documents_isolated;
select 1 / case when (select count(*) from public.document_versions where id in ('f17e0000-0000-4000-8000-000000000a05','f17e0000-0000-4000-8000-000000000b05'))=1 then 1 else 0 end as document_versions_isolated;
select 1 / case when (select count(*) from public.chunks where id in ('f17e0000-0000-4000-8000-000000000a06','f17e0000-0000-4000-8000-000000000b06'))=1 then 1 else 0 end as chunks_isolated;
select 1 / case when (select count(*) from public.conversations where id in ('f17e0000-0000-4000-8000-000000000a07','f17e0000-0000-4000-8000-000000000b07'))=1 then 1 else 0 end as conversations_isolated;
select 1 / case when (select count(*) from public.messages where id in ('rls-fixture-a','rls-fixture-b'))=1 then 1 else 0 end as messages_isolated;
select 1 / case when (select count(*) from public.portfolios where id in ('f17e0000-0000-4000-8000-000000000a08','f17e0000-0000-4000-8000-000000000b08'))=1 then 1 else 0 end as portfolios_isolated;
select 1 / case when (select count(*) from public.portfolio_positions where id in ('f17e0000-0000-4000-8000-000000000a09','f17e0000-0000-4000-8000-000000000b09'))=1 then 1 else 0 end as portfolio_positions_isolated;

with attempted as (
  update public.conversations
  set title='should-not-update'
  where id='f17e0000-0000-4000-8000-000000000b07'
  returning 1
)
select 1 / case when (select count(*) from attempted)=0 then 1 else 0 end as cross_tenant_update_blocked;

with attempted as (
  delete from public.documents
  where id='f17e0000-0000-4000-8000-000000000b04'
  returning 1
)
select 1 / case when (select count(*) from attempted)=0 then 1 else 0 end as cross_tenant_delete_blocked;

reset role;
rollback;
