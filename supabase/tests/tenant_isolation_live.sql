-- Read-only two-user production isolation probe.
-- Requires at least two auth users. It impersonates each authenticated JWT in turn
-- and asserts that directly user-owned rows belonging to the other account are invisible.
begin;

select 1 / case when (select count(*) from auth.users) >= 2 then 1 else 0 end as two_auth_users_available;

select set_config(
  'citeral.user_a',
  (select id::text from auth.users order by created_at limit 1),
  true
);
select set_config(
  'citeral.user_b',
  (select id::text from auth.users order by created_at offset 1 limit 1),
  true
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', current_setting('citeral.user_a'), 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select 1 / case when not exists(
  select 1 from public.profiles where id=current_setting('citeral.user_b')::uuid
) then 1 else 0 end as a_cannot_read_b_profile;
select 1 / case when not exists(
  select 1 from public.bots where owner_user_id=current_setting('citeral.user_b')::uuid
) then 1 else 0 end as a_cannot_read_b_bots;
select 1 / case when not exists(
  select 1 from public.knowledge_bases
  where owner_user_id=current_setting('citeral.user_b')::uuid and visibility='private'
) then 1 else 0 end as a_cannot_read_b_private_kbs;
select 1 / case when not exists(
  select 1 from public.documents where owner_user_id=current_setting('citeral.user_b')::uuid
) then 1 else 0 end as a_cannot_read_b_documents;
select 1 / case when not exists(
  select 1 from public.conversations where owner_user_id=current_setting('citeral.user_b')::uuid
) then 1 else 0 end as a_cannot_read_b_conversations;
select 1 / case when not exists(
  select 1 from public.messages m
  join public.conversations c on c.id=m.conversation_id
  where c.owner_user_id=current_setting('citeral.user_b')::uuid
) then 1 else 0 end as a_cannot_read_b_messages;
select 1 / case when not exists(
  select 1 from public.portfolios where owner_user_id=current_setting('citeral.user_b')::uuid
) then 1 else 0 end as a_cannot_read_b_portfolios;
select 1 / case when not exists(
  select 1 from public.usage_events where user_id=current_setting('citeral.user_b')::uuid
) then 1 else 0 end as a_cannot_read_b_usage;

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', current_setting('citeral.user_b'), 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select 1 / case when not exists(
  select 1 from public.profiles where id=current_setting('citeral.user_a')::uuid
) then 1 else 0 end as b_cannot_read_a_profile;
select 1 / case when not exists(
  select 1 from public.bots where owner_user_id=current_setting('citeral.user_a')::uuid
) then 1 else 0 end as b_cannot_read_a_bots;
select 1 / case when not exists(
  select 1 from public.knowledge_bases
  where owner_user_id=current_setting('citeral.user_a')::uuid and visibility='private'
) then 1 else 0 end as b_cannot_read_a_private_kbs;
select 1 / case when not exists(
  select 1 from public.documents where owner_user_id=current_setting('citeral.user_a')::uuid
) then 1 else 0 end as b_cannot_read_a_documents;
select 1 / case when not exists(
  select 1 from public.conversations where owner_user_id=current_setting('citeral.user_a')::uuid
) then 1 else 0 end as b_cannot_read_a_conversations;
select 1 / case when not exists(
  select 1 from public.messages m
  join public.conversations c on c.id=m.conversation_id
  where c.owner_user_id=current_setting('citeral.user_a')::uuid
) then 1 else 0 end as b_cannot_read_a_messages;
select 1 / case when not exists(
  select 1 from public.portfolios where owner_user_id=current_setting('citeral.user_a')::uuid
) then 1 else 0 end as b_cannot_read_a_portfolios;
select 1 / case when not exists(
  select 1 from public.usage_events where user_id=current_setting('citeral.user_a')::uuid
) then 1 else 0 end as b_cannot_read_a_usage;

rollback;
