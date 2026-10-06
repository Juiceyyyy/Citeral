create or replace function private.list_own_document_storage_paths()
returns table(path text)
language sql
stable
security definer
set search_path=''
as $$
  select o.name
  from storage.objects o
  where o.bucket_id='documents'
    and (o.owner=(select auth.uid()) or o.owner_id=(select auth.uid())::text)
  order by o.name;
$$;

revoke all on function private.list_own_document_storage_paths() from public, anon;
grant execute on function private.list_own_document_storage_paths() to authenticated, service_role;

create or replace function public.list_own_document_storage_paths()
returns table(path text)
language sql
stable
security invoker
set search_path=''
as $$
  select * from private.list_own_document_storage_paths();
$$;

revoke all on function public.list_own_document_storage_paths() from public, anon;
grant execute on function public.list_own_document_storage_paths() to authenticated, service_role;
