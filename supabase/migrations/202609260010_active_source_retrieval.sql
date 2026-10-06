-- Exclude superseded/disabled curated source registrations from RAG retrieval while
-- preserving their documents and chunks for source history and audit. Private
-- user documents have no source_registry_id and remain eligible.

create or replace function public.hybrid_search_chunks(
  p_bot_id uuid,
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
language sql
stable
security invoker
set search_path = ''
as $$
with permitted as (
  select c.*, bkb.priority, d.title as document_title, d.source_url, d.publisher,
         d.authority_level, d.effective_from, d.effective_until
  from public.bot_knowledge_bases bkb
  join public.bots b on b.id=bkb.bot_id
  join public.chunks c on c.knowledge_base_id=bkb.knowledge_base_id
  join public.documents d on d.id=c.document_id
  left join public.source_registry sr on sr.id=d.source_registry_id
  where bkb.bot_id=p_bot_id
    and d.status <> 'archived'
    and d.is_current=true
    and (d.source_registry_id is null or sr.enabled=true)
    and c.document_version_id = (
      select v2.id from public.document_versions v2
      where v2.document_id=d.id and v2.status='ready'
      order by v2.version_number desc limit 1
    )
    and (d.effective_until is null or d.effective_until >= current_date)
),
semantic as (
  select p.id, row_number() over(order by p.embedding OPERATOR(extensions.<=>) p_query_embedding) as rank
  from permitted p
  where p.embedding is not null
  order by p.embedding OPERATOR(extensions.<=>) p_query_embedding
  limit greatest(20, least(200, p_match_count*5))
),
lexical as (
  select p.id, row_number() over(order by ts_rank_cd(p.fts, websearch_to_tsquery('simple',p_query_text)) desc) as rank
  from permitted p
  where nullif(btrim(p_query_text),'') is not null
    and p.fts @@ websearch_to_tsquery('simple',p_query_text)
  order by ts_rank_cd(p.fts, websearch_to_tsquery('simple',p_query_text)) desc
  limit greatest(20, least(200,p_match_count*5))
),
fused as (
  select coalesce(s.id,l.id) as id,
    coalesce(1.0/(60.0+s.rank),0.0)+coalesce(1.0/(60.0+l.rank),0.0) as rrf
  from semantic s full outer join lexical l on l.id=s.id
)
select p.id as chunk_id, p.content, p.document_id, p.document_title, p.page_start, p.page_end,
       p.heading_path, p.source_url, p.publisher, p.authority_level, p.effective_from,
       p.effective_until,
       (f.rrf * (1.0 + least(greatest(p.priority,0),1000)::double precision/10000.0)) as score
from fused f join permitted p on p.id=f.id
order by score desc
limit greatest(1, least(50,p_match_count));
$$;

revoke all on function public.hybrid_search_chunks(uuid,text,extensions.vector,integer) from public, anon;
grant execute on function public.hybrid_search_chunks(uuid,text,extensions.vector,integer) to authenticated, service_role;
