create or replace function private.reserve_knowledge_upload_internal(p_bytes bigint, p_storage_path text)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  uid uuid := auth.uid();
  lim public.user_knowledge_limits%rowtype;
  use_row public.user_knowledge_usage%rowtype;
  reserved_bytes bigint;
  reserved_docs integer;
  reservation_id uuid;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_bytes <= 0 or p_bytes > 52428800 then raise exception 'Invalid upload size' using errcode='22023'; end if;
  if p_storage_path is null or length(p_storage_path) < 10 or position(uid::text in p_storage_path)=0 then
    raise exception 'Invalid upload path' using errcode='22023';
  end if;

  perform private.ensure_user_knowledge_rows(uid);
  select * into lim from public.user_knowledge_limits where user_id=uid for update;
  select * into use_row from public.user_knowledge_usage where user_id=uid for update;
  select coalesce(sum(r.byte_size),0)::bigint,count(*)::integer
    into reserved_bytes,reserved_docs
  from public.knowledge_upload_reservations r
  where r.user_id=uid and r.consumed_at is null and r.expires_at>now();

  if use_row.document_count + reserved_docs + 1 > lim.max_documents then
    raise exception 'Private knowledge document limit reached (%).', lim.max_documents using errcode='23514';
  end if;
  if use_row.raw_storage_bytes + reserved_bytes + p_bytes > lim.max_raw_storage_bytes then
    raise exception 'Temporary raw upload storage limit reached.' using errcode='23514';
  end if;

  insert into public.knowledge_upload_reservations(user_id,byte_size,storage_path)
  values(uid,p_bytes,p_storage_path)
  returning id into reservation_id;
  return reservation_id;
end;
$$;

create or replace function private.claim_knowledge_upload_reservation_internal(
  p_reservation_id uuid,
  p_bytes bigint,
  p_storage_path text
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  uid uuid := auth.uid();
  claimed uuid;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  update public.knowledge_upload_reservations r
  set consumed_at=now()
  where r.id=p_reservation_id
    and r.user_id=uid
    and r.byte_size=p_bytes
    and r.storage_path=p_storage_path
    and r.consumed_at is null
    and r.expires_at>now()
  returning r.id into claimed;
  return claimed is not null;
end;
$$;

revoke all on function private.reserve_knowledge_upload_internal(bigint,text) from public, anon;
revoke all on function private.claim_knowledge_upload_reservation_internal(uuid,bigint,text) from public, anon;
grant execute on function private.reserve_knowledge_upload_internal(bigint,text) to authenticated, service_role;
grant execute on function private.claim_knowledge_upload_reservation_internal(uuid,bigint,text) to authenticated, service_role;

create or replace function public.reserve_knowledge_upload(p_bytes bigint, p_storage_path text)
returns uuid
language sql
security invoker
set search_path=''
as $$ select private.reserve_knowledge_upload_internal(p_bytes,p_storage_path); $$;

create or replace function public.claim_knowledge_upload_reservation(
  p_reservation_id uuid,
  p_bytes bigint,
  p_storage_path text
)
returns boolean
language sql
security invoker
set search_path=''
as $$ select private.claim_knowledge_upload_reservation_internal(p_reservation_id,p_bytes,p_storage_path); $$;

revoke all on function public.reserve_knowledge_upload(bigint,text) from public, anon;
revoke all on function public.claim_knowledge_upload_reservation(uuid,bigint,text) from public, anon;
grant execute on function public.reserve_knowledge_upload(bigint,text) to authenticated, service_role;
grant execute on function public.claim_knowledge_upload_reservation(uuid,bigint,text) to authenticated, service_role;
