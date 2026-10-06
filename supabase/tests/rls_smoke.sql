-- Run in a Supabase local/branch test database after applying all migrations.
-- For full tenant-isolation coverage, add two seeded auth users and execute application-level cross-tenant tests.
begin;

select 1 / case when exists(select 1 from pg_extension where extname='vector') then 1 else 0 end as vector_installed;
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

rollback;
