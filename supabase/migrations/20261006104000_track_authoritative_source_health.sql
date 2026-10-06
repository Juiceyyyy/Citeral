alter table public.source_registry
  add column if not exists last_refresh_status text not null default 'unknown',
  add column if not exists last_success_at timestamptz,
  add column if not exists consecutive_failures integer not null default 0,
  add column if not exists last_error_message text;

alter table public.source_registry
  drop constraint if exists source_registry_last_refresh_status_check;

alter table public.source_registry
  add constraint source_registry_last_refresh_status_check
  check (last_refresh_status in ('unknown','queued','ok','failed'));

update public.source_registry s
set last_refresh_status = case
      when exists (
        select 1
        from public.documents d
        join public.document_versions v on v.document_id=d.id
        where d.source_registry_id=s.id
          and d.is_current=true
          and v.status='ready'
      ) then 'ok'
      when exists (
        select 1
        from public.documents d
        join public.document_versions v on v.document_id=d.id
        where d.source_registry_id=s.id
          and d.is_current=true
          and v.status='failed'
      ) then 'failed'
      else 'unknown'
    end,
    last_success_at = case
      when exists (
        select 1
        from public.documents d
        join public.document_versions v on v.document_id=d.id
        where d.source_registry_id=s.id
          and d.is_current=true
          and v.status='ready'
      ) then coalesce(s.last_checked_at,s.last_changed_at,s.created_at)
      else s.last_success_at
    end;

comment on column public.source_registry.last_refresh_status is
  'Latest curated-source refresh/index state: unknown, queued, ok, or failed.';
comment on column public.source_registry.last_success_at is
  'Last time this authoritative source completed a usable refresh/index cycle.';
comment on column public.source_registry.consecutive_failures is
  'Consecutive fetch or ingestion failures since the last successful source refresh.';
comment on column public.source_registry.last_error_message is
  'Most recent bounded refresh or ingestion error for operator health monitoring.';
