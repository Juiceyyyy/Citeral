create policy request_rate_counters_deny_direct
on public.request_rate_counters
for all
to authenticated
using (false)
with check (false);
