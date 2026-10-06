update public.knowledge_bases kb
set coverage_status='deprecated',
    description=case kb.slug
      when 'accounting-global' then 'Deprecated empty legacy system container. Superseded by maintained accounting and tax knowledge packs.'
      when 'health-general' then 'Deprecated empty legacy system container. Superseded by maintained global and jurisdiction health packs.'
      when 'legal-global' then 'Deprecated empty legacy system container. Superseded by maintained global and jurisdiction legal packs.'
      when 'study-foundations' then 'Deprecated empty legacy system container. Study behavior is provided by the built-in assistant preset and user-provided material.'
      else kb.description
    end
where kb.slug in ('accounting-global','health-general','legal-global','study-foundations')
  and kb.kind='system'
  and not exists (select 1 from public.source_knowledge_bases skb where skb.knowledge_base_id=kb.id)
  and not exists (select 1 from public.knowledge_base_documents kbd where kbd.knowledge_base_id=kb.id)
  and not exists (select 1 from public.bot_knowledge_bases bkb where bkb.knowledge_base_id=kb.id);
