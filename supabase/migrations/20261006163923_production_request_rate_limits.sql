create table if not exists public.request_rate_counters (
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null check (char_length(bucket) between 1 and 64),
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, bucket)
);

alter table public.request_rate_counters enable row level security;
revoke all on public.request_rate_counters from public, anon, authenticated;
grant all on public.request_rate_counters to service_role;

create or replace function private.consume_request_rate(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_bucket is null or char_length(p_bucket) < 1 or char_length(p_bucket) > 64
     or p_bucket !~ '^[a-z0-9:_-]+$' then
    raise exception 'Invalid rate-limit bucket' using errcode='22023';
  end if;
  if p_limit < 1 or p_limit > 10000 then raise exception 'Invalid rate limit' using errcode='22023'; end if;
  if p_window_seconds < 10 or p_window_seconds > 86400 then raise exception 'Invalid rate-limit window' using errcode='22023'; end if;

  insert into public.request_rate_counters(user_id,bucket,window_started_at,request_count,updated_at)
  values(v_uid,p_bucket,now(),1,now())
  on conflict(user_id,bucket) do update
  set
    window_started_at = case
      when public.request_rate_counters.window_started_at <= now() - make_interval(secs => p_window_seconds) then now()
      else public.request_rate_counters.window_started_at
    end,
    request_count = case
      when public.request_rate_counters.window_started_at <= now() - make_interval(secs => p_window_seconds) then 1
      else public.request_rate_counters.request_count + 1
    end,
    updated_at = now()
  returning request_count into v_count;

  if v_count > p_limit then
    raise exception 'Too many requests. Please try again shortly.' using errcode='P0001';
  end if;
  return v_count;
end;
$$;

revoke all on function private.consume_request_rate(text,integer,integer) from public, anon;
grant execute on function private.consume_request_rate(text,integer,integer) to authenticated, service_role;

create or replace function public.reserve_request_rate(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns integer
language sql
security invoker
set search_path=''
as $$
  select private.consume_request_rate(p_bucket,p_limit,p_window_seconds);
$$;

revoke all on function public.reserve_request_rate(text,integer,integer) from public, anon;
grant execute on function public.reserve_request_rate(text,integer,integer) to authenticated, service_role;
