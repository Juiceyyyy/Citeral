-- Disposable two-user production isolation probe.
-- Creates transient identities/data inside a transaction, impersonates each user,
-- verifies cross-tenant reads and mutations are blocked, verifies scoped retrieval
-- and Storage isolation, then rolls everything back.

begin;

select set_config('citeral.test_user_a', gen_random_uuid()::text, true);
select set_config('citeral.test_user_b', gen_random_uuid()::text, true);
select set_config('citeral.test_bot', gen_random_uuid()::text, true);
select set_config('citeral.test_kb', gen_random_uuid()::text, true);
select set_config('citeral.test_doc', gen_random_uuid()::text, true);
select set_config('citeral.test_version', gen_random_uuid()::text, true);
select set_config('citeral.test_chunk', gen_random_uuid()::text, true);
select set_config('citeral.test_conversation', gen_random_uuid()::text, true);
select set_config('citeral.test_portfolio', gen_random_uuid()::text, true);

insert into auth.users(
  id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous
) values
(
  current_setting('citeral.test_user_a')::uuid,'authenticated','authenticated',
  'rls-a-'||replace(current_setting('citeral.test_user_a'),'-','')||'@example.test',
  '{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"RLS User A"}'::jsonb,now(),now(),false,false
),
(
  current_setting('citeral.test_user_b')::uuid,'authenticated','authenticated',
  'rls-b-'||replace(current_setting('citeral.test_user_b'),'-','')||'@example.test',
  '{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"RLS User B"}'::jsonb,now(),now(),false,false
);

select set_config(
  'citeral.test_org_a',
  (select organization_id::text from public.organization_members where user_id=current_setting('citeral.test_user_a')::uuid limit 1),
  true
);

select set_config('request.jwt.claim.sub', current_setting('citeral.test_user_a'), true);
select set_config('request.jwt.claims', json_build_object('sub',current_setting('citeral.test_user_a'),'role','authenticated')::text, true);
set local role authenticated;

insert into public.bots(id,organization_id,owner_user_id,name,description,bot_type,instructions)
values(current_setting('citeral.test_bot')::uuid,current_setting('citeral.test_org_a')::uuid,current_setting('citeral.test_user_a')::uuid,'RLS A Bot','','custom','');

insert into public.knowledge_bases(id,organization_id,owner_user_id,name,description,kind,visibility)
values(current_setting('citeral.test_kb')::uuid,current_setting('citeral.test_org_a')::uuid,current_setting('citeral.test_user_a')::uuid,'RLS A KB','','private','private');

insert into public.bot_knowledge_bases(bot_id,knowledge_base_id,priority)
values(current_setting('citeral.test_bot')::uuid,current_setting('citeral.test_kb')::uuid,50);

insert into public.documents(id,organization_id,owner_user_id,knowledge_base_id,title,mime_type,status)
values(current_setting('citeral.test_doc')::uuid,current_setting('citeral.test_org_a')::uuid,current_setting('citeral.test_user_a')::uuid,current_setting('citeral.test_kb')::uuid,'RLS A Document','text/plain','ready');

insert into public.knowledge_base_documents(knowledge_base_id,document_id,priority)
values(current_setting('citeral.test_kb')::uuid,current_setting('citeral.test_doc')::uuid,50);

insert into public.document_versions(id,document_id,version_number,status,extracted_text,processed_at)
values(current_setting('citeral.test_version')::uuid,current_setting('citeral.test_doc')::uuid,1,'ready','ultrasecretmarker',now());

insert into public.conversations(id,organization_id,owner_user_id,bot_id,title)
values(current_setting('citeral.test_conversation')::uuid,current_setting('citeral.test_org_a')::uuid,current_setting('citeral.test_user_a')::uuid,current_setting('citeral.test_bot')::uuid,'RLS A Conversation');

insert into public.messages(id,conversation_id,role,parts,position)
values('rls-msg-'||replace(current_setting('citeral.test_user_a'),'-',''),current_setting('citeral.test_conversation')::uuid,'user','[{"type":"text","text":"private"}]'::jsonb,0);

insert into public.portfolios(id,organization_id,owner_user_id,name,base_currency)
values(current_setting('citeral.test_portfolio')::uuid,current_setting('citeral.test_org_a')::uuid,current_setting('citeral.test_user_a')::uuid,'RLS A Portfolio','INR');

insert into public.portfolio_positions(portfolio_id,symbol,name,current_value)
values(current_setting('citeral.test_portfolio')::uuid,'RLS','Private Asset',123.45);

reset role;

insert into public.chunks(
  id,organization_id,knowledge_base_id,document_id,document_version_id,chunk_index,content,content_hash,token_count
) values(
  current_setting('citeral.test_chunk')::uuid,
  current_setting('citeral.test_org_a')::uuid,
  current_setting('citeral.test_kb')::uuid,
  current_setting('citeral.test_doc')::uuid,
  current_setting('citeral.test_version')::uuid,
  0,'ultrasecretmarker private retrieval content',
  encode(digest('ultrasecretmarker private retrieval content','sha256'),'hex'),
  5
);

insert into storage.objects(bucket_id,name,owner,owner_id,metadata)
values(
  'documents',
  current_setting('citeral.test_org_a')||'/'||current_setting('citeral.test_user_a')||'/rls-private.txt',
  current_setting('citeral.test_user_a')::uuid,
  current_setting('citeral.test_user_a'),
  '{"mimetype":"text/plain"}'::jsonb
);

select set_config('request.jwt.claim.sub', current_setting('citeral.test_user_b'), true);
select set_config('request.jwt.claims', json_build_object('sub',current_setting('citeral.test_user_b'),'role','authenticated')::text, true);
set local role authenticated;

select 1 / case when count(*)=0 then 1 else 0 end from public.bots where id=current_setting('citeral.test_bot')::uuid;
select 1 / case when count(*)=0 then 1 else 0 end from public.knowledge_bases where id=current_setting('citeral.test_kb')::uuid;
select 1 / case when count(*)=0 then 1 else 0 end from public.documents where id=current_setting('citeral.test_doc')::uuid;
select 1 / case when count(*)=0 then 1 else 0 end from public.document_versions where id=current_setting('citeral.test_version')::uuid;
select 1 / case when count(*)=0 then 1 else 0 end from public.chunks where id=current_setting('citeral.test_chunk')::uuid;
select 1 / case when count(*)=0 then 1 else 0 end from public.conversations where id=current_setting('citeral.test_conversation')::uuid;
select 1 / case when count(*)=0 then 1 else 0 end from public.messages where conversation_id=current_setting('citeral.test_conversation')::uuid;
select 1 / case when count(*)=0 then 1 else 0 end from public.portfolios where id=current_setting('citeral.test_portfolio')::uuid;
select 1 / case when count(*)=0 then 1 else 0 end from public.portfolio_positions where portfolio_id=current_setting('citeral.test_portfolio')::uuid;
select 1 / case when count(*)=0 then 1 else 0 end
from storage.objects
where bucket_id='documents'
  and name=current_setting('citeral.test_org_a')||'/'||current_setting('citeral.test_user_a')||'/rls-private.txt';

select 1 / case when count(*)=0 then 1 else 0 end
from public.hybrid_search_chunks_scoped(
  current_setting('citeral.test_bot')::uuid,
  null,
  'ultrasecretmarker',
  null,
  10
);

with changed as (
  update public.bots
  set name='Cross tenant breach'
  where id=current_setting('citeral.test_bot')::uuid
  returning id
)
select 1 / case when count(*)=0 then 1 else 0 end from changed;

reset role;

select set_config('request.jwt.claim.sub', current_setting('citeral.test_user_a'), true);
select set_config('request.jwt.claims', json_build_object('sub',current_setting('citeral.test_user_a'),'role','authenticated')::text, true);
set local role authenticated;

select 1 / case when count(*)=1 then 1 else 0 end from public.bots where id=current_setting('citeral.test_bot')::uuid;
select 1 / case when count(*)=1 then 1 else 0 end from public.documents where id=current_setting('citeral.test_doc')::uuid;
select 1 / case when count(*)=1 then 1 else 0 end from public.conversations where id=current_setting('citeral.test_conversation')::uuid;
select 1 / case when count(*)=1 then 1 else 0 end from public.portfolios where id=current_setting('citeral.test_portfolio')::uuid;
select 1 / case when count(*)=1 then 1 else 0 end
from storage.objects
where bucket_id='documents'
  and name=current_setting('citeral.test_org_a')||'/'||current_setting('citeral.test_user_a')||'/rls-private.txt';
select 1 / case when count(*)=1 then 1 else 0 end
from public.hybrid_search_chunks_scoped(
  current_setting('citeral.test_bot')::uuid,
  null,
  'ultrasecretmarker',
  null,
  10
);

reset role;
rollback;
