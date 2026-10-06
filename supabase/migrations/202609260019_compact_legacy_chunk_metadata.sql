-- Backfill chunks indexed before compact metadata was introduced.
-- page_start/page_end and heading_path already store the common source-location fields.
-- Preserve only non-contiguous page lists with >2 pages, matching the current worker.

set local lock_timeout = '5s';
set local statement_timeout = '2min';

with page_sets as (
  select c.id,
         array_agg(
           distinct (prov->>'page_no')::int
           order by (prov->>'page_no')::int
         ) as pages
  from public.chunks c
  cross join lateral jsonb_array_elements(
    coalesce(c.metadata->'doc_items','[]'::jsonb)
  ) item
  cross join lateral jsonb_array_elements(
    coalesce(item->'prov','[]'::jsonb)
  ) prov
  where c.metadata ? 'doc_items'
    and (prov->>'page_no') ~ '^[0-9]+$'
  group by c.id
), compact as (
  select c.id,
    case
      when cardinality(ps.pages) > 2
       and cardinality(ps.pages) <> ps.pages[cardinality(ps.pages)] - ps.pages[1] + 1
      then jsonb_build_object('pages',to_jsonb(ps.pages))
      else '{}'::jsonb
    end as metadata
  from public.chunks c
  left join page_sets ps on ps.id=c.id
  where c.metadata ? 'doc_items'
)
update public.chunks c
set metadata=compact.metadata
from compact
where c.id=compact.id;

-- The update above creates dead heap/TOAST tuples. This table is small during this
-- one-time migration, so rewrite it immediately to return those bytes to the database
-- instead of waiting for a future maintenance window. HNSW and other indexes are
-- rebuilt as part of CLUSTER.
cluster public.chunks using chunks_pkey;
analyze public.chunks;
