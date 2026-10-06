-- Shared/scoped knowledge architecture for Citeral.
-- One indexed document can belong to many knowledge packs without duplicating bytes/chunks.

alter table public.profiles
  add column if not exists global_instructions text not null default '',
  add column if not exists global_knowledge_base_id uuid references public.knowledge_bases(id) on delete set null;

create table if not exists public.knowledge_base_documents (
  knowledge_base_id uuid not null references public.knowledge_bases(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  priority integer not null default 50 check (priority between 0 and 1000),
  created_at timestamptz not null default now(),
  primary key (knowledge_base_id, document_id)
);
create index if not exists knowledge_base_documents_document_idx on public.knowledge_base_documents(document_id, knowledge_base_id);

insert into public.knowledge_base_documents(knowledge_base_id,document_id,priority)
select d.knowledge_base_id,d.id,50 from public.documents d
on conflict do nothing;

create table if not exists public.source_knowledge_bases (
  source_registry_id uuid not null references public.source_registry(id) on delete cascade,
  knowledge_base_id uuid not null references public.knowledge_bases(id) on delete cascade,
  priority integer not null default 50 check (priority between 0 and 1000),
  created_at timestamptz not null default now(),
  primary key (source_registry_id, knowledge_base_id)
);
create index if not exists source_knowledge_bases_kb_idx on public.source_knowledge_bases(knowledge_base_id,source_registry_id);
insert into public.source_knowledge_bases(source_registry_id,knowledge_base_id,priority)
select id,knowledge_base_id,50 from public.source_registry
on conflict do nothing;

create table if not exists public.conversation_documents (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (conversation_id, document_id)
);
create index if not exists conversation_documents_document_idx on public.conversation_documents(document_id,conversation_id);

alter table public.knowledge_bases add column if not exists domains text[] not null default '{}';
alter table public.knowledge_bases add column if not exists coverage_status text not null default 'active'
  check (coverage_status in ('active','partial','planned','deprecated'));

alter table public.knowledge_base_documents enable row level security;
alter table public.source_knowledge_bases enable row level security;
alter table public.conversation_documents enable row level security;

-- Since May 2026 new public tables may not be exposed through the Data API automatically.
grant select,insert,delete on public.knowledge_base_documents to authenticated;
grant all on public.knowledge_base_documents to service_role;
grant select on public.source_knowledge_bases to authenticated;
grant all on public.source_knowledge_bases to service_role;
grant select,insert,delete on public.conversation_documents to authenticated;
grant all on public.conversation_documents to service_role;

drop policy if exists kbd_select_accessible on public.knowledge_base_documents;
create policy kbd_select_accessible on public.knowledge_base_documents for select to authenticated using (
  exists (select 1 from public.knowledge_bases kb where kb.id=knowledge_base_id)
);
drop policy if exists kbd_insert_private on public.knowledge_base_documents;
drop policy if exists kbd_insert_owned_private on public.knowledge_base_documents;
create policy kbd_insert_owned_private on public.knowledge_base_documents for insert to authenticated with check (
  exists (
    select 1 from public.knowledge_bases kb
    where kb.id=knowledge_base_id
      and kb.visibility='private'
      and kb.owner_user_id=(select auth.uid())
      and kb.organization_id is not null
      and private.is_org_member(kb.organization_id)
  )
  and exists (
    select 1 from public.documents d
    where d.id=document_id
      and d.owner_user_id=(select auth.uid())
      and d.organization_id is not null
      and private.is_org_member(d.organization_id)
  )
);
drop policy if exists kbd_delete_private on public.knowledge_base_documents;
drop policy if exists kbd_delete_owned_private on public.knowledge_base_documents;
create policy kbd_delete_owned_private on public.knowledge_base_documents for delete to authenticated using (
  exists (
    select 1 from public.knowledge_bases kb
    where kb.id=knowledge_base_id
      and kb.visibility='private'
      and kb.owner_user_id=(select auth.uid())
  )
  and exists (select 1 from public.documents d where d.id=document_id and d.owner_user_id=(select auth.uid()))
);

drop policy if exists skb_select_accessible on public.source_knowledge_bases;
create policy skb_select_accessible on public.source_knowledge_bases for select to authenticated using (
  exists (select 1 from public.knowledge_bases kb where kb.id=knowledge_base_id)
);

drop policy if exists conversation_documents_select_owner on public.conversation_documents;
create policy conversation_documents_select_owner on public.conversation_documents for select to authenticated using (
  exists (select 1 from public.conversations c where c.id=conversation_id and c.owner_user_id=(select auth.uid()))
);
drop policy if exists conversation_documents_insert_owner on public.conversation_documents;
create policy conversation_documents_insert_owner on public.conversation_documents for insert to authenticated with check (
  exists (select 1 from public.conversations c where c.id=conversation_id and c.owner_user_id=(select auth.uid()))
  and exists (select 1 from public.documents d where d.id=document_id and d.owner_user_id=(select auth.uid()))
);
drop policy if exists conversation_documents_delete_owner on public.conversation_documents;
create policy conversation_documents_delete_owner on public.conversation_documents for delete to authenticated using (
  exists (select 1 from public.conversations c where c.id=conversation_id and c.owner_user_id=(select auth.uid()))
);

-- Fix tenant-match tautologies in existing mutation policies before broadening sharing scopes.
drop policy if exists documents_insert_private on public.documents;
create policy documents_insert_private on public.documents for insert to authenticated with check (
  organization_id is not null
  and private.is_org_member(organization_id)
  and owner_user_id=(select auth.uid())
  and exists (
    select 1 from public.knowledge_bases kb
    where kb.id=knowledge_base_id and kb.organization_id=documents.organization_id
  )
);

drop policy if exists convo_insert_owner on public.conversations;
create policy convo_insert_owner on public.conversations for insert to authenticated with check (
  owner_user_id=(select auth.uid())
  and private.is_org_member(organization_id)
  and exists (
    select 1 from public.bots b
    where b.id=bot_id and b.organization_id=conversations.organization_id
  )
);

drop policy if exists jobs_insert_org on public.ingestion_jobs;
create policy jobs_insert_org on public.ingestion_jobs for insert to authenticated with check (
  organization_id is not null
  and private.is_org_member(organization_id)
  and exists (
    select 1 from public.document_versions v
    join public.documents d on d.id=v.document_id
    where v.id=document_version_id and d.organization_id=ingestion_jobs.organization_id
  )
);

-- Scoped hybrid retrieval. Eligibility is resolved before vector/lexical ranking.
create or replace function public.hybrid_search_chunks_scoped(
  p_bot_id uuid,
  p_conversation_id uuid,
  p_query_text text,
  p_query_embedding extensions.vector(1024),
  p_match_count integer default 10
)
returns table (
  chunk_id uuid,
  content text,
  document_id uuid,
  document_title text,
  page_start integer,
  page_end integer,
  heading_path text[],
  source_url text,
  publisher text,
  authority_level text,
  effective_from date,
  effective_until date,
  score double precision
)
language sql stable security invoker set search_path=''
as $$
with caller as (
  select b.id bot_id,b.owner_user_id,b.organization_id,p.global_knowledge_base_id
  from public.bots b
  left join public.profiles p on p.id=b.owner_user_id
  where b.id=p_bot_id and b.owner_user_id=(select auth.uid())
), eligible_raw as (
  select kbd.document_id, greatest(bkb.priority,kbd.priority) priority
  from caller x
  join public.bot_knowledge_bases bkb on bkb.bot_id=x.bot_id
  join public.knowledge_base_documents kbd on kbd.knowledge_base_id=bkb.knowledge_base_id
  union all
  select kbd.document_id,95
  from caller x
  join public.knowledge_base_documents kbd on kbd.knowledge_base_id=x.global_knowledge_base_id
  where x.global_knowledge_base_id is not null
  union all
  select cd.document_id,110
  from caller x
  join public.conversations c on c.id=p_conversation_id and c.bot_id=x.bot_id and c.owner_user_id=x.owner_user_id
  join public.conversation_documents cd on cd.conversation_id=c.id
), eligible_documents as (
  select document_id,max(priority)::integer priority from eligible_raw group by document_id
), permitted as (
  select c.*,ed.priority,d.title document_title,d.source_url,d.publisher,d.authority_level,d.effective_from,d.effective_until
  from eligible_documents ed
  join public.documents d on d.id=ed.document_id
  join public.chunks c on c.document_id=d.id
  left join public.source_registry sr on sr.id=d.source_registry_id
  where d.status<>'archived' and d.is_current=true
    and (d.source_registry_id is null or sr.enabled=true)
    and c.document_version_id=(
      select v2.id from public.document_versions v2
      where v2.document_id=d.id and v2.status='ready'
      order by v2.version_number desc limit 1
    )
    and (d.effective_until is null or d.effective_until>=current_date)
), semantic as (
  select p.id,row_number() over(order by p.embedding OPERATOR(extensions.<=>) p_query_embedding) rank
  from permitted p where p.embedding is not null
  order by p.embedding OPERATOR(extensions.<=>) p_query_embedding
  limit greatest(20,least(200,p_match_count*5))
), lexical as (
  select p.id,row_number() over(order by ts_rank_cd(p.fts,websearch_to_tsquery('simple',p_query_text)) desc) rank
  from permitted p
  where nullif(btrim(p_query_text),'') is not null and p.fts @@ websearch_to_tsquery('simple',p_query_text)
  order by ts_rank_cd(p.fts,websearch_to_tsquery('simple',p_query_text)) desc
  limit greatest(20,least(200,p_match_count*5))
), fused as (
  select coalesce(s.id,l.id) id,
    coalesce(1.0/(60.0+s.rank),0.0)+coalesce(1.0/(60.0+l.rank),0.0) rrf
  from semantic s full outer join lexical l on l.id=s.id
)
select p.id,p.content,p.document_id,p.document_title,p.page_start,p.page_end,p.heading_path,p.source_url,p.publisher,p.authority_level,p.effective_from,p.effective_until,
  f.rrf*(1.0+least(greatest(p.priority,0),1000)::double precision/10000.0) score
from fused f join permitted p on p.id=f.id
order by score desc limit greatest(1,least(50,p_match_count));
$$;
revoke all on function public.hybrid_search_chunks_scoped(uuid,uuid,text,extensions.vector,integer) from public,anon;
grant execute on function public.hybrid_search_chunks_scoped(uuid,uuid,text,extensions.vector,integer) to authenticated,service_role;
