-- Citeral: built-in assistants are ready for every user.
-- Custom assistants remain user-created; built-ins stay editable but are provisioned automatically.

alter table public.bots
  add column if not exists is_builtin boolean not null default false,
  add column if not exists preset_version text;

create index if not exists bots_builtin_owner_idx
  on public.bots(owner_user_id, bot_type)
  where is_builtin;

create or replace function private.ensure_user_builtin_assistants(
  p_user_id uuid,
  p_org_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  spec record;
  v_bot_id uuid;
  v_kb_id uuid;
begin
  if p_user_id is null or p_org_id is null then
    return;
  end if;

  for spec in
    select * from (values
      ('general'::text, 'Document Analyst'::text, 'Evidence-based Q&A, summaries, comparisons and analysis across uploaded documents.'::text, false, true),
      ('health'::text, 'Health Information Assistant'::text, 'Explain health records and medical information using curated sources, without acting as a clinician.'::text, false, true),
      ('legal'::text, 'Legal Research Assistant'::text, 'Research and document analysis grounded in authoritative law and the applicable jurisdiction.'::text, false, true),
      ('portfolio'::text, 'Portfolio Manager Assistant'::text, 'Analyze portfolio weights, concentration, diversification and exposures without market predictions or options calls.'::text, false, false),
      ('study'::text, 'Study Assistant'::text, 'Learn from notes, lectures, assignments and textbooks; create revision material and practice questions.'::text, false, true),
      ('accounting'::text, 'Tax & Accounting Assistant'::text, 'Accounting, reporting and tax research grounded in standards, official tax material and company documents.'::text, false, true)
    ) as v(bot_type, name, description, web_enabled, citations_required)
  loop
    v_bot_id := null;
    v_kb_id := null;

    -- Adopt an existing specialist of this type if an older install already created one.
    select b.id into v_bot_id
    from public.bots b
    where b.owner_user_id = p_user_id
      and b.bot_type = spec.bot_type
    order by b.created_at asc
    limit 1;

    if v_bot_id is null then
      insert into public.bots(
        organization_id,
        owner_user_id,
        name,
        description,
        bot_type,
        instructions,
        web_enabled,
        citations_required,
        is_builtin,
        preset_version
      ) values (
        p_org_id,
        p_user_id,
        spec.name,
        spec.description,
        spec.bot_type,
        '',
        spec.web_enabled,
        spec.citations_required,
        true,
        '2026.09'
      )
      returning id into v_bot_id;
    else
      update public.bots
      set is_builtin = true,
          preset_version = coalesce(preset_version, '2026.09')
      where id = v_bot_id;
    end if;

    select bkb.knowledge_base_id into v_kb_id
    from public.bot_knowledge_bases bkb
    join public.knowledge_bases kb on kb.id = bkb.knowledge_base_id
    where bkb.bot_id = v_bot_id
      and kb.kind = 'private'
      and kb.owner_user_id = p_user_id
    order by kb.created_at asc
    limit 1;

    if v_kb_id is null then
      insert into public.knowledge_bases(
        organization_id,
        owner_user_id,
        name,
        kind,
        visibility
      ) values (
        p_org_id,
        p_user_id,
        spec.name || ' uploads',
        'private',
        'private'
      )
      returning id into v_kb_id;

      insert into public.bot_knowledge_bases(bot_id, knowledge_base_id, priority)
      values (v_bot_id, v_kb_id, 100)
      on conflict (bot_id, knowledge_base_id) do update set priority = excluded.priority;
    end if;
  end loop;
end;
$$;

revoke all on function private.ensure_user_builtin_assistants(uuid, uuid) from public, anon, authenticated;

-- New signups receive the built-ins as part of the existing workspace bootstrap.
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

  perform private.ensure_user_builtin_assistants(new.id, new_org_id);

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

-- Backfill existing users/workspaces without deleting or replacing user data.
do $$
declare
  row record;
begin
  for row in
    select distinct on (m.user_id)
      m.user_id,
      m.organization_id
    from public.organization_members m
    order by m.user_id, m.created_at asc
  loop
    perform private.ensure_user_builtin_assistants(row.user_id, row.organization_id);
  end loop;
end $$;
