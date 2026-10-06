-- Citeral: production baseline schema
-- Target: Supabase Postgres 17+

create extension if not exists pgcrypto;
create extension if not exists vector with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- ---------- Core identity / tenancy ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  default_country text,
  default_region text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member','viewer')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index if not exists organization_members_user_idx on public.organization_members(user_id, created_at);

create or replace function private.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.organization_members m
    where m.organization_id = target_org and m.user_id = auth.uid()
  );
$$;
revoke all on function private.is_org_member(uuid) from public, anon;
grant execute on function private.is_org_member(uuid) to authenticated, service_role;

create or replace function private.is_org_admin(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = auth.uid()
      and m.role in ('owner','admin')
  );
$$;
revoke all on function private.is_org_admin(uuid) from public, anon;
grant execute on function private.is_org_admin(uuid) to authenticated, service_role;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_org_id uuid := gen_random_uuid();
  base_name text;
  new_slug text;
begin
  base_name := coalesce(nullif(new.raw_user_meta_data ->> 'full_name',''), split_part(coalesce(new.email,'User'),'@',1), 'Personal');
  new_slug := lower(regexp_replace(base_name, '[^a-zA-Z0-9]+', '-', 'g'));
  new_slug := trim(both '-' from new_slug);
  if char_length(new_slug) < 2 then new_slug := 'workspace'; end if;
  new_slug := left(new_slug, 48) || '-' || substr(replace(new.id::text,'-',''),1,10);

  insert into public.profiles(id, display_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'full_name',''))
  on conflict (id) do nothing;

  insert into public.organizations(id, name, slug, created_by)
  values (new_org_id, base_name || '''s workspace', new_slug, new.id);

  insert into public.organization_members(organization_id, user_id, role)
  values (new_org_id, new.id, 'owner');

  return new;
end;
$$;
revoke all on function private.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

-- Backfill profile/workspace only for users created before this migration and lacking membership.
do $$
declare u record;
begin
  for u in select id, email, raw_user_meta_data from auth.users loop
    insert into public.profiles(id, display_name)
    values (u.id, nullif(u.raw_user_meta_data ->> 'full_name',''))
    on conflict (id) do nothing;
    if not exists (select 1 from public.organization_members where user_id=u.id) then
      declare
        oid uuid := gen_random_uuid();
        bname text := coalesce(nullif(u.raw_user_meta_data ->> 'full_name',''), split_part(coalesce(u.email,'User'),'@',1), 'Personal');
        oslug text := 'workspace-' || substr(replace(u.id::text,'-',''),1,16);
      begin
        insert into public.organizations(id,name,slug,created_by) values(oid,bname || '''s workspace',oslug,u.id);
        insert into public.organization_members(organization_id,user_id,role) values(oid,u.id,'owner');
      end;
    end if;
  end loop;
end $$;

-- ---------- Assistants / knowledge ----------
create table if not exists public.bots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  description text not null default '',
  bot_type text not null check (bot_type in ('general','custom','study','legal','accounting','health','portfolio')),
  instructions text not null default '',
  jurisdiction_country text,
  jurisdiction_region text,
  web_enabled boolean not null default false,
  citations_required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bots_org_idx on public.bots(organization_id, updated_at desc);
create index if not exists bots_owner_idx on public.bots(owner_user_id, updated_at desc);

create table if not exists public.knowledge_bases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete set null,
  name text not null check (char_length(name) between 1 and 160),
  slug text unique,
  description text not null default '',
  kind text not null default 'private' check (kind in ('private','curated','jurisdiction','system')),
  visibility text not null default 'private' check (visibility in ('private','organization','public')),
  jurisdiction_country text,
  jurisdiction_region text,
  version text,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((visibility='public' and organization_id is null) or (visibility<>'public' and organization_id is not null))
);
create index if not exists knowledge_bases_org_idx on public.knowledge_bases(organization_id);
create index if not exists knowledge_bases_visibility_idx on public.knowledge_bases(visibility);

create table if not exists public.bot_knowledge_bases (
  bot_id uuid not null references public.bots(id) on delete cascade,
  knowledge_base_id uuid not null references public.knowledge_bases(id) on delete cascade,
  priority integer not null default 50 check (priority between 0 and 1000),
  created_at timestamptz not null default now(),
  primary key(bot_id, knowledge_base_id)
);
create index if not exists bot_kb_kb_idx on public.bot_knowledge_bases(knowledge_base_id, bot_id);

create table if not exists public.source_registry (
  id uuid primary key default gen_random_uuid(),
  knowledge_base_id uuid not null references public.knowledge_bases(id) on delete cascade,
  title text not null,
  canonical_url text not null,
  publisher text,
  authority_level text not null default 'reference' check (authority_level in ('official','primary','regulator','standard','reference','user')),
  jurisdiction_country text,
  jurisdiction_region text,
  license_type text,
  refresh_interval_hours integer check (refresh_interval_hours is null or refresh_interval_hours >= 1),
  enabled boolean not null default true,
  last_checked_at timestamptz,
  last_changed_at timestamptz,
  last_content_hash text,
  created_at timestamptz not null default now(),
  unique(knowledge_base_id, canonical_url)
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete set null,
  knowledge_base_id uuid not null references public.knowledge_bases(id) on delete cascade,
  source_registry_id uuid references public.source_registry(id) on delete set null,
  title text not null,
  mime_type text,
  byte_size bigint check (byte_size is null or byte_size >= 0),
  status text not null default 'queued' check (status in ('queued','processing','ready','failed','archived')),
  source_url text,
  publisher text,
  authority_level text not null default 'user' check (authority_level in ('official','primary','regulator','standard','reference','user')),
  jurisdiction_country text,
  jurisdiction_region text,
  published_at timestamptz,
  effective_from date,
  effective_until date,
  is_current boolean not null default true,
  license_type text,
  last_verified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists documents_kb_idx on public.documents(knowledge_base_id, status);
create index if not exists documents_org_idx on public.documents(organization_id, created_at desc);

create table if not exists public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  version_number integer not null check (version_number >= 1),
  storage_path text,
  content_hash text,
  parser_version text,
  status text not null default 'queued' check (status in ('queued','processing','ready','failed','archived')),
  extracted_text text,
  error_message text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique(document_id, version_number)
);
create index if not exists document_versions_document_idx on public.document_versions(document_id, version_number desc);

create table if not exists public.chunks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  knowledge_base_id uuid not null references public.knowledge_bases(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  document_version_id uuid not null references public.document_versions(id) on delete cascade,
  parent_chunk_id uuid references public.chunks(id) on delete set null,
  chunk_index integer not null check (chunk_index >= 0),
  content text not null check (char_length(content) > 0),
  content_hash text not null,
  token_count integer,
  page_start integer,
  page_end integer,
  heading_path text[] not null default '{}',
  section_number text,
  embedding extensions.vector(1536),
  fts tsvector generated always as (to_tsvector('simple', coalesce(content,''))) stored,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(document_version_id, chunk_index)
);
create index if not exists chunks_kb_idx on public.chunks(knowledge_base_id, document_id);
create index if not exists chunks_document_idx on public.chunks(document_id, chunk_index);
create index if not exists chunks_fts_idx on public.chunks using gin(fts);
create index if not exists chunks_embedding_hnsw_idx on public.chunks using hnsw (embedding extensions.vector_cosine_ops) with (m=16, ef_construction=64);

create table if not exists public.ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  document_version_id uuid not null references public.document_versions(id) on delete cascade,
  job_type text not null default 'document_ingest' check (job_type in ('document_ingest','source_refresh')),
  status text not null default 'queued' check (status in ('queued','processing','succeeded','failed')),
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  locked_at timestamptz,
  locked_by text,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ingestion_jobs_queue_idx on public.ingestion_jobs(status, created_at) where status in ('queued','processing');

-- ---------- Chat / usage ----------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  bot_id uuid not null references public.bots(id) on delete cascade,
  title text not null default 'New conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists conversations_owner_idx on public.conversations(owner_user_id, updated_at desc);
create index if not exists conversations_bot_idx on public.conversations(bot_id, updated_at desc);

create table if not exists public.messages (
  id text primary key,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('system','user','assistant')),
  parts jsonb not null default '[]'::jsonb,
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  unique(conversation_id, position)
);
create index if not exists messages_conversation_idx on public.messages(conversation_id, position);

create table if not exists public.usage_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  kind text not null check (kind in ('chat','embedding','web_search','ingestion')),
  bot_id uuid references public.bots(id) on delete set null,
  input_tokens integer,
  output_tokens integer,
  cost_micros bigint,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists usage_user_day_idx on public.usage_events(user_id, created_at desc);

-- ---------- Portfolio manager ----------
create table if not exists public.portfolios (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'My Portfolio',
  base_currency text not null default 'INR',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists portfolios_owner_idx on public.portfolios(owner_user_id, updated_at desc);

create table if not exists public.portfolio_positions (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  symbol text,
  name text not null,
  current_value numeric(20,4) not null check (current_value >= 0),
  sector text,
  industry text,
  asset_class text,
  region text,
  currency text,
  account_name text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists portfolio_positions_portfolio_idx on public.portfolio_positions(portfolio_id);

-- ---------- Timestamps ----------
create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path='' as $$
begin new.updated_at = now(); return new; end; $$;

create trigger bots_touch before update on public.bots for each row execute function private.touch_updated_at();
create trigger kbs_touch before update on public.knowledge_bases for each row execute function private.touch_updated_at();
create trigger docs_touch before update on public.documents for each row execute function private.touch_updated_at();
create trigger jobs_touch before update on public.ingestion_jobs for each row execute function private.touch_updated_at();
create trigger convos_touch before update on public.conversations for each row execute function private.touch_updated_at();
create trigger portfolios_touch before update on public.portfolios for each row execute function private.touch_updated_at();

-- ---------- Row Level Security ----------
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.bots enable row level security;
alter table public.knowledge_bases enable row level security;
alter table public.bot_knowledge_bases enable row level security;
alter table public.source_registry enable row level security;
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.chunks enable row level security;
alter table public.ingestion_jobs enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.usage_events enable row level security;
alter table public.portfolios enable row level security;
alter table public.portfolio_positions enable row level security;

create policy profiles_select_self on public.profiles for select to authenticated using ((select auth.uid())=id);
create policy profiles_update_self on public.profiles for update to authenticated using ((select auth.uid())=id) with check ((select auth.uid())=id);
create policy org_select_member on public.organizations for select to authenticated using ((select private.is_org_member(id)));
create policy org_update_admin on public.organizations for update to authenticated using ((select private.is_org_admin(id))) with check ((select private.is_org_admin(id)));
create policy member_select_same_org on public.organization_members for select to authenticated using ((select private.is_org_member(organization_id)));
create policy member_insert_admin on public.organization_members for insert to authenticated with check ((select private.is_org_admin(organization_id)));
create policy member_update_admin on public.organization_members for update to authenticated using ((select private.is_org_admin(organization_id))) with check ((select private.is_org_admin(organization_id)));
create policy member_delete_admin on public.organization_members for delete to authenticated using ((select private.is_org_admin(organization_id)) and user_id <> (select auth.uid()));
create policy bots_select_org on public.bots for select to authenticated using ((select private.is_org_member(organization_id)));
create policy bots_insert_org on public.bots for insert to authenticated with check ((select private.is_org_member(organization_id)) and owner_user_id=(select auth.uid()));
create policy bots_update_owner_admin on public.bots for update to authenticated using (owner_user_id=(select auth.uid()) or (select private.is_org_admin(organization_id))) with check ((select private.is_org_member(organization_id)));
create policy bots_delete_owner_admin on public.bots for delete to authenticated using (owner_user_id=(select auth.uid()) or (select private.is_org_admin(organization_id)));
create policy kb_select_accessible on public.knowledge_bases for select to authenticated using (visibility='public' or (organization_id is not null and (select private.is_org_member(organization_id))));
create policy kb_insert_member on public.knowledge_bases for insert to authenticated with check (organization_id is not null and (select private.is_org_member(organization_id)) and owner_user_id=(select auth.uid()) and visibility<>'public');
create policy kb_update_owner_admin on public.knowledge_bases for update to authenticated using (organization_id is not null and (owner_user_id=(select auth.uid()) or (select private.is_org_admin(organization_id)))) with check (organization_id is not null and (select private.is_org_member(organization_id)) and visibility<>'public');
create policy kb_delete_owner_admin on public.knowledge_bases for delete to authenticated using (organization_id is not null and (owner_user_id=(select auth.uid()) or (select private.is_org_admin(organization_id))));
create policy bkb_select_via_bot on public.bot_knowledge_bases for select to authenticated using (exists(select 1 from public.bots b where b.id=bot_id));
create policy bkb_insert_via_bot on public.bot_knowledge_bases for insert to authenticated with check (
  exists(select 1 from public.bots b where b.id=bot_id and (b.owner_user_id=(select auth.uid()) or (select private.is_org_admin(b.organization_id))))
  and exists(select 1 from public.knowledge_bases kb where kb.id=knowledge_base_id)
);
create policy bkb_delete_via_bot on public.bot_knowledge_bases for delete to authenticated using (exists(select 1 from public.bots b where b.id=bot_id and (b.owner_user_id=(select auth.uid()) or (select private.is_org_admin(b.organization_id)))));
create policy sources_select_kb on public.source_registry for select to authenticated using (exists(select 1 from public.knowledge_bases kb where kb.id=knowledge_base_id));
create policy sources_manage_admin on public.source_registry for all to authenticated using (exists(select 1 from public.knowledge_bases kb where kb.id=knowledge_base_id and kb.organization_id is not null and (kb.owner_user_id=(select auth.uid()) or (select private.is_org_admin(kb.organization_id))))) with check (exists(select 1 from public.knowledge_bases kb where kb.id=knowledge_base_id and kb.organization_id is not null and (kb.owner_user_id=(select auth.uid()) or (select private.is_org_admin(kb.organization_id)))));
create policy documents_select_kb on public.documents for select to authenticated using (exists(select 1 from public.knowledge_bases kb where kb.id=knowledge_base_id));
create policy documents_insert_private on public.documents for insert to authenticated with check (organization_id is not null and (select private.is_org_member(organization_id)) and owner_user_id=(select auth.uid()) and exists(select 1 from public.knowledge_bases kb where kb.id=knowledge_base_id and kb.organization_id=organization_id));
create policy documents_update_owner_admin on public.documents for update to authenticated using (organization_id is not null and (owner_user_id=(select auth.uid()) or (select private.is_org_admin(organization_id)))) with check (organization_id is not null and (select private.is_org_member(organization_id)));
create policy documents_delete_owner_admin on public.documents for delete to authenticated using (organization_id is not null and (owner_user_id=(select auth.uid()) or (select private.is_org_admin(organization_id))));
create policy versions_select_doc on public.document_versions for select to authenticated using (exists(select 1 from public.documents d where d.id=document_id));
create policy versions_insert_doc on public.document_versions for insert to authenticated with check (exists(select 1 from public.documents d where d.id=document_id and d.organization_id is not null and (d.owner_user_id=(select auth.uid()) or (select private.is_org_admin(d.organization_id)))));
create policy versions_delete_doc on public.document_versions for delete to authenticated using (exists(select 1 from public.documents d where d.id=document_id and d.organization_id is not null and (d.owner_user_id=(select auth.uid()) or (select private.is_org_admin(d.organization_id)))));
create policy chunks_select_kb on public.chunks for select to authenticated using (exists(select 1 from public.knowledge_bases kb where kb.id=knowledge_base_id));
create policy jobs_select_org on public.ingestion_jobs for select to authenticated using (organization_id is not null and (select private.is_org_member(organization_id)));
create policy jobs_insert_org on public.ingestion_jobs for insert to authenticated with check (organization_id is not null and (select private.is_org_member(organization_id)) and exists(select 1 from public.document_versions v join public.documents d on d.id=v.document_id where v.id=document_version_id and d.organization_id=organization_id));
create policy convo_select_owner on public.conversations for select to authenticated using (owner_user_id=(select auth.uid()));
create policy convo_insert_owner on public.conversations for insert to authenticated with check (owner_user_id=(select auth.uid()) and (select private.is_org_member(organization_id)) and exists(select 1 from public.bots b where b.id=bot_id and b.organization_id=organization_id));
create policy convo_update_owner on public.conversations for update to authenticated using (owner_user_id=(select auth.uid())) with check (owner_user_id=(select auth.uid()));
create policy convo_delete_owner on public.conversations for delete to authenticated using (owner_user_id=(select auth.uid()));
create policy messages_select_owner on public.messages for select to authenticated using (exists(select 1 from public.conversations c where c.id=conversation_id and c.owner_user_id=(select auth.uid())));
create policy messages_insert_owner on public.messages for insert to authenticated with check (exists(select 1 from public.conversations c where c.id=conversation_id and c.owner_user_id=(select auth.uid())));
create policy messages_update_owner on public.messages for update to authenticated using (exists(select 1 from public.conversations c where c.id=conversation_id and c.owner_user_id=(select auth.uid()))) with check (exists(select 1 from public.conversations c where c.id=conversation_id and c.owner_user_id=(select auth.uid())));
create policy messages_delete_owner on public.messages for delete to authenticated using (exists(select 1 from public.conversations c where c.id=conversation_id and c.owner_user_id=(select auth.uid())));
create policy usage_select_self on public.usage_events for select to authenticated using (user_id=(select auth.uid()));
create policy usage_insert_self on public.usage_events for insert to authenticated with check (user_id=(select auth.uid()));
create policy portfolio_select_owner on public.portfolios for select to authenticated using (owner_user_id=(select auth.uid()));
create policy portfolio_insert_owner on public.portfolios for insert to authenticated with check (owner_user_id=(select auth.uid()) and (select private.is_org_member(organization_id)));
create policy portfolio_update_owner on public.portfolios for update to authenticated using (owner_user_id=(select auth.uid())) with check (owner_user_id=(select auth.uid()));
create policy portfolio_delete_owner on public.portfolios for delete to authenticated using (owner_user_id=(select auth.uid()));
create policy positions_select_owner on public.portfolio_positions for select to authenticated using (exists(select 1 from public.portfolios p where p.id=portfolio_id and p.owner_user_id=(select auth.uid())));
create policy positions_insert_owner on public.portfolio_positions for insert to authenticated with check (exists(select 1 from public.portfolios p where p.id=portfolio_id and p.owner_user_id=(select auth.uid())));
create policy positions_update_owner on public.portfolio_positions for update to authenticated using (exists(select 1 from public.portfolios p where p.id=portfolio_id and p.owner_user_id=(select auth.uid()))) with check (exists(select 1 from public.portfolios p where p.id=portfolio_id and p.owner_user_id=(select auth.uid())));
create policy positions_delete_owner on public.portfolio_positions for delete to authenticated using (exists(select 1 from public.portfolios p where p.id=portfolio_id and p.owner_user_id=(select auth.uid())));

-- ---------- Hybrid RAG retrieval ----------
create or replace function public.hybrid_search_chunks(
  p_bot_id uuid,
  p_query_text text,
  p_query_embedding extensions.vector(1536),
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
  where bkb.bot_id=p_bot_id
    and d.status='ready'
    and d.is_current=true
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
  limit greatest(20, least(200, p_match_count*5))
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

-- Atomic message persistence. Security invoker means message/conversation RLS remains authoritative.
create or replace function public.save_conversation_messages(p_conversation_id uuid, p_messages jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare item jsonb; idx integer := 0;
begin
  if not exists (select 1 from public.conversations c where c.id=p_conversation_id) then
    raise exception 'Conversation not accessible';
  end if;
  if jsonb_typeof(p_messages) <> 'array' then raise exception 'Messages must be an array'; end if;
  delete from public.messages where conversation_id=p_conversation_id;
  for item in select value from jsonb_array_elements(p_messages) loop
    if coalesce(item->>'id','')='' or coalesce(item->>'role','') not in ('system','user','assistant') then
      raise exception 'Invalid message payload';
    end if;
    insert into public.messages(id,conversation_id,role,parts,position)
    values(item->>'id',p_conversation_id,item->>'role',coalesce(item->'parts','[]'::jsonb),idx);
    idx := idx+1;
  end loop;
end;
$$;
revoke all on function public.save_conversation_messages(uuid,jsonb) from public, anon;
grant execute on function public.save_conversation_messages(uuid,jsonb) to authenticated;

-- ---------- Private storage bucket ----------
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('documents','documents',false,52428800,array[
  'application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain','text/markdown','text/csv','text/html','image/png','image/jpeg'
])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function private.org_storage_path_allowed(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare org_part text; org_uuid uuid;
begin
  if auth.uid() is null then return false; end if;
  org_part := split_part(object_name,'/',1);
  begin org_uuid := org_part::uuid; exception when others then return false; end;
  return private.is_org_member(org_uuid);
end;
$$;
revoke all on function private.org_storage_path_allowed(text) from public, anon;
grant execute on function private.org_storage_path_allowed(text) to authenticated, service_role;

create or replace function private.user_storage_path_allowed(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare org_part text; user_part text; org_uuid uuid;
begin
  if auth.uid() is null then return false; end if;
  org_part := split_part(object_name,'/',1);
  user_part := split_part(object_name,'/',2);
  begin org_uuid := org_part::uuid; exception when others then return false; end;
  return user_part=auth.uid()::text and private.is_org_member(org_uuid);
end;
$$;
revoke all on function private.user_storage_path_allowed(text) from public, anon;
grant execute on function private.user_storage_path_allowed(text) to authenticated, service_role;

create policy documents_storage_select on storage.objects for select to authenticated using (bucket_id='documents' and (select private.org_storage_path_allowed(name)));
create policy documents_storage_insert on storage.objects for insert to authenticated with check (bucket_id='documents' and (select private.user_storage_path_allowed(name)));
create policy documents_storage_update on storage.objects for update to authenticated using (bucket_id='documents' and (select private.user_storage_path_allowed(name))) with check (bucket_id='documents' and (select private.user_storage_path_allowed(name)));
create policy documents_storage_delete on storage.objects for delete to authenticated using (bucket_id='documents' and (select private.user_storage_path_allowed(name)));

-- ---------- Seed shared knowledge pack definitions ----------
insert into public.knowledge_bases(id,organization_id,owner_user_id,name,slug,description,kind,visibility)
values
 ('10000000-0000-4000-8000-000000000001',null,null,'Study Foundations','study-foundations','Shared study/tutoring behavioral knowledge pack.','system','public'),
 ('10000000-0000-4000-8000-000000000002',null,null,'Legal Global Foundations','legal-global','Shared legal research foundations; jurisdiction-specific authoritative sources should be attached separately.','system','public'),
 ('10000000-0000-4000-8000-000000000003',null,null,'Accounting Foundations','accounting-global','Shared accounting concepts; jurisdiction tax/standards sources should be attached separately.','system','public'),
 ('10000000-0000-4000-8000-000000000004',null,null,'Health Information Foundations','health-general','General health information foundations; not a diagnosis or prescribing corpus.','system','public')
on conflict (slug) do nothing;

grant select,insert,update,delete on public.profiles,public.organizations,public.organization_members,public.bots,
  public.knowledge_bases,public.bot_knowledge_bases,public.source_registry,public.documents,public.document_versions,
  public.chunks,public.ingestion_jobs,public.conversations,public.messages,public.usage_events,public.portfolios,
  public.portfolio_positions to authenticated;
grant usage,select on sequence public.usage_events_id_seq to authenticated;
