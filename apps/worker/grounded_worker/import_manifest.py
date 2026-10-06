from __future__ import annotations

import json
from argparse import ArgumentParser
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

from .config import Settings

_ALLOWED_KINDS = {"curated", "jurisdiction", "system"}
_ALLOWED_BOT_TYPES = {"general", "study", "legal", "accounting", "health", "portfolio"}
_ALLOWED_COVERAGE = {"active", "partial", "planned", "deprecated"}


def _source_enabled(source: dict[str, object]) -> bool:
    value = source.get("enabled", True)
    if not isinstance(value, bool):
        raise TypeError(f"Source enabled must be a boolean: {source.get('title', 'unknown source')}")
    return value


def _has_canonical_memberships(conn: psycopg.Connection[object]) -> bool:
    row = conn.execute(
        """
        select exists (
          select 1
          from information_schema.columns
          where table_schema='public'
            and table_name='source_knowledge_bases'
            and column_name='enabled'
        ) as available
        """
    ).fetchone()
    return bool(row and row["available"])


def import_manifest(path: str) -> None:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    pack = payload["pack"]
    kind = str(pack.get("kind", "jurisdiction"))
    if kind not in _ALLOWED_KINDS:
        raise ValueError(f"Unsupported public knowledge-pack kind: {kind}")

    domain = str(pack["slug"]).split("-", 1)[0]
    domains = [str(item) for item in pack.get("domains", [])]
    if not domains and domain in _ALLOWED_BOT_TYPES:
        domains = [domain]
    coverage_status = str(pack.get("coverage_status", "active"))
    if coverage_status not in _ALLOWED_COVERAGE:
        raise ValueError(f"Unsupported coverage status: {coverage_status}")

    bot_types = [str(item) for item in pack.get("bot_types", [])]
    if not bot_types and domain in _ALLOWED_BOT_TYPES:
        bot_types = [domain]
    invalid_types = [item for item in bot_types if item not in _ALLOWED_BOT_TYPES]
    if invalid_types:
        raise ValueError(f"Unsupported bot types in manifest: {', '.join(invalid_types)}")

    sources = payload.get("sources", [])
    active_urls = [str(source["canonical_url"]) for source in sources if _source_enabled(source)]

    settings = Settings.from_env()
    with psycopg.connect(settings.database_url, row_factory=dict_row) as conn, conn.transaction():
        kb = conn.execute(
            """
            insert into public.knowledge_bases(
              name,slug,description,kind,visibility,jurisdiction_country,jurisdiction_region,
              version,last_verified_at,domains,coverage_status
            )
            values(%s,%s,%s,%s,'public',%s,%s,%s,now(),%s,%s)
            on conflict(slug) do update set
              name=excluded.name,
              description=excluded.description,
              kind=excluded.kind,
              jurisdiction_country=excluded.jurisdiction_country,
              jurisdiction_region=excluded.jurisdiction_region,
              version=excluded.version,
              domains=excluded.domains,
              coverage_status=excluded.coverage_status,
              last_verified_at=now()
            returning id
            """,
            (
                pack["name"],
                pack["slug"],
                pack.get("description", ""),
                kind,
                pack.get("jurisdiction_country"),
                pack.get("jurisdiction_region"),
                pack.get("version"),
                domains,
                coverage_status,
            ),
        ).fetchone()
        if not kb:
            raise RuntimeError("Knowledge pack upsert returned no row")

        canonical_memberships = _has_canonical_memberships(conn)
        if canonical_memberships:
            # Each manifest owns enablement only for its pack membership. The source
            # row itself is global and becomes enabled when any membership is active.
            conn.execute(
                "update public.source_knowledge_bases set enabled=false where knowledge_base_id=%s",
                (kb["id"],),
            )
        else:
            # Backward-compatible rollout path before the canonical-source migration.
            conn.execute("update public.source_registry set enabled=false where knowledge_base_id=%s", (kb["id"],))

        for source in sources:
            source_enabled = _source_enabled(source)
            canonical_url = str(source["canonical_url"])
            if canonical_memberships:
                source_row = conn.execute(
                    "select id from public.source_registry where canonical_url=%s limit 1",
                    (canonical_url,),
                ).fetchone()
                if source_row:
                    conn.execute(
                        """
                        update public.source_registry
                        set title=%s,
                            publisher=%s,
                            authority_level=%s,
                            jurisdiction_country=coalesce(jurisdiction_country,%s),
                            jurisdiction_region=coalesce(jurisdiction_region,%s),
                            license_type=coalesce(%s,license_type),
                            refresh_interval_hours=least(
                              coalesce(refresh_interval_hours,%s),
                              coalesce(%s,refresh_interval_hours)
                            ),
                            last_checked_at=case
                              when %s and (enabled=false or last_refresh_status='failed') then null
                              else last_checked_at
                            end,
                            last_refresh_status=case
                              when %s and (enabled=false or last_refresh_status='failed') then 'unknown'
                              else last_refresh_status
                            end,
                            consecutive_failures=case
                              when %s and (enabled=false or last_refresh_status='failed') then 0
                              else consecutive_failures
                            end,
                            last_error_message=case
                              when %s and (enabled=false or last_refresh_status='failed') then null
                              else last_error_message
                            end,
                            enabled=(enabled or %s)
                        where id=%s
                        """,
                        (
                            source["title"],
                            source.get("publisher"),
                            source.get("authority_level", "reference"),
                            pack.get("jurisdiction_country"),
                            pack.get("jurisdiction_region"),
                            source.get("license_type"),
                            source.get("refresh_interval_hours", 24),
                            source.get("refresh_interval_hours", 24),
                            source_enabled,
                            source_enabled,
                            source_enabled,
                            source_enabled,
                            source_enabled,
                            source_row["id"],
                        ),
                    )
                else:
                    # A manifest may move an authoritative source from a brittle landing page
                    # to a stable direct document URL. Reuse the existing canonical source row
                    # when the title/publisher and this pack membership identify the same source,
                    # so URL maintenance does not duplicate indexed documents.
                    source_row = conn.execute(
                        """
                        select s.id
                        from public.source_registry s
                        join public.source_knowledge_bases sk on sk.source_registry_id=s.id
                        where sk.knowledge_base_id=%s
                          and s.title=%s
                          and s.publisher is not distinct from %s
                        order by s.created_at
                        limit 1
                        """,
                        (kb["id"], source["title"], source.get("publisher")),
                    ).fetchone()
                    if source_row:
                        conn.execute(
                            """
                            update public.source_registry
                            set canonical_url=%s,
                                authority_level=%s,
                                jurisdiction_country=coalesce(jurisdiction_country,%s),
                                jurisdiction_region=coalesce(jurisdiction_region,%s),
                                license_type=coalesce(%s,license_type),
                                refresh_interval_hours=least(
                                  coalesce(refresh_interval_hours,%s),
                                  coalesce(%s,refresh_interval_hours)
                                ),
                                enabled=(enabled or %s),
                                last_checked_at=case when %s then null else last_checked_at end,
                                last_content_hash=case when %s then null else last_content_hash end,
                                last_refresh_status=case when %s then 'unknown' else last_refresh_status end,
                                consecutive_failures=case when %s then 0 else consecutive_failures end,
                                last_error_message=case when %s then null else last_error_message end
                            where id=%s
                            """,
                            (
                                canonical_url,
                                source.get("authority_level", "reference"),
                                pack.get("jurisdiction_country"),
                                pack.get("jurisdiction_region"),
                                source.get("license_type"),
                                source.get("refresh_interval_hours", 24),
                                source.get("refresh_interval_hours", 24),
                                source_enabled,
                                source_enabled,
                                source_enabled,
                                source_enabled,
                                source_enabled,
                                source_enabled,
                                source_row["id"],
                            ),
                        )
                    else:
                        source_row = conn.execute(
                            """
                            insert into public.source_registry(
                              knowledge_base_id,title,canonical_url,publisher,authority_level,
                              jurisdiction_country,jurisdiction_region,license_type,refresh_interval_hours,enabled
                            )
                            values(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                            returning id
                            """,
                            (
                                kb["id"],
                                source["title"],
                                canonical_url,
                                source.get("publisher"),
                                source.get("authority_level", "reference"),
                                pack.get("jurisdiction_country"),
                                pack.get("jurisdiction_region"),
                                source.get("license_type"),
                                source.get("refresh_interval_hours", 24),
                                source_enabled,
                            ),
                        ).fetchone()
            else:
                source_row = conn.execute(
                    """
                    insert into public.source_registry(
                      knowledge_base_id,title,canonical_url,publisher,authority_level,
                      jurisdiction_country,jurisdiction_region,license_type,refresh_interval_hours,enabled
                    )
                    values(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    on conflict(knowledge_base_id,canonical_url) do update set
                      title=excluded.title,
                      publisher=excluded.publisher,
                      authority_level=excluded.authority_level,
                      jurisdiction_country=excluded.jurisdiction_country,
                      jurisdiction_region=excluded.jurisdiction_region,
                      license_type=excluded.license_type,
                      refresh_interval_hours=excluded.refresh_interval_hours,
                      enabled=excluded.enabled
                    returning id
                    """,
                    (
                        kb["id"],
                        source["title"],
                        canonical_url,
                        source.get("publisher"),
                        source.get("authority_level", "reference"),
                        pack.get("jurisdiction_country"),
                        pack.get("jurisdiction_region"),
                        source.get("license_type"),
                        source.get("refresh_interval_hours", 24),
                        source_enabled,
                    ),
                ).fetchone()

            if not source_row:
                raise RuntimeError(f"Source registration returned no row for {canonical_url}")

            target_slugs = [str(item) for item in source.get("pack_slugs", [])]
            target_ids = [kb["id"]]
            if target_slugs:
                rows = conn.execute(
                    "select id,slug from public.knowledge_bases where slug = any(%s)",
                    (target_slugs,),
                ).fetchall()
                found = {row["slug"] for row in rows}
                missing = [slug for slug in target_slugs if slug not in found]
                if missing:
                    raise ValueError(f"Source {source['title']} references unknown pack slugs: {', '.join(missing)}")
                target_ids.extend(row["id"] for row in rows)

            for target_id in dict.fromkeys(target_ids):
                if canonical_memberships:
                    conn.execute(
                        """
                        insert into public.source_knowledge_bases(source_registry_id,knowledge_base_id,priority,enabled)
                        values(%s,%s,%s,%s)
                        on conflict(source_registry_id,knowledge_base_id) do update set
                          priority=excluded.priority,
                          enabled=excluded.enabled
                        """,
                        (source_row["id"], target_id, int(source.get("priority", 50)), source_enabled),
                    )
                else:
                    conn.execute(
                        """
                        insert into public.source_knowledge_bases(source_registry_id,knowledge_base_id,priority)
                        values(%s,%s,%s)
                        on conflict(source_registry_id,knowledge_base_id) do update set priority=excluded.priority
                        """,
                        (source_row["id"], target_id, int(source.get("priority", 50))),
                    )

            if canonical_memberships:
                conn.execute(
                    """
                    insert into public.knowledge_base_documents(knowledge_base_id,document_id,priority)
                    select sk.knowledge_base_id,d.id,sk.priority
                    from public.source_knowledge_bases sk
                    join public.documents d on d.source_registry_id=sk.source_registry_id
                    where sk.source_registry_id=%s and sk.enabled=true and d.is_current=true
                    on conflict(knowledge_base_id,document_id) do update set priority=excluded.priority
                    """,
                    (source_row["id"],),
                )
            else:
                conn.execute(
                    """
                    insert into public.knowledge_base_documents(knowledge_base_id,document_id,priority)
                    select sk.knowledge_base_id,d.id,sk.priority
                    from public.source_knowledge_bases sk
                    join public.documents d on d.source_registry_id=sk.source_registry_id
                    where sk.source_registry_id=%s and d.is_current=true
                    on conflict(knowledge_base_id,document_id) do update set priority=excluded.priority
                    """,
                    (source_row["id"],),
                )

        if canonical_memberships:
            # Remove retrieval access for sources removed from this manifest without
            # archiving the canonical document for other packs that still use it.
            conn.execute(
                """
                delete from public.knowledge_base_documents kbd
                using public.documents d,public.source_knowledge_bases sk
                where kbd.knowledge_base_id=%s
                  and kbd.document_id=d.id
                  and d.source_registry_id=sk.source_registry_id
                  and sk.knowledge_base_id=%s
                  and sk.enabled=false
                """,
                (kb["id"], kb["id"]),
            )
            conn.execute(
                """
                insert into public.knowledge_base_documents(knowledge_base_id,document_id,priority)
                select sk.knowledge_base_id,d.id,sk.priority
                from public.source_knowledge_bases sk
                join public.documents d on d.source_registry_id=sk.source_registry_id
                where sk.knowledge_base_id=%s and sk.enabled=true and d.is_current=true
                on conflict(knowledge_base_id,document_id) do update set priority=excluded.priority
                """,
                (kb["id"],),
            )
            conn.execute(
                """
                update public.source_registry s
                set enabled=exists (
                  select 1 from public.source_knowledge_bases sk
                  where sk.source_registry_id=s.id and sk.enabled=true
                )
                """
            )
        elif active_urls:
            conn.execute(
                """
                update public.documents d
                set is_current=false,status='archived',updated_at=now()
                where d.knowledge_base_id=%s
                  and d.source_registry_id in (
                    select s.id from public.source_registry s
                    where s.knowledge_base_id=%s and s.enabled=false
                  )
                  and d.is_current=true
                """,
                (kb["id"], kb["id"]),
            )
        else:
            conn.execute(
                """
                update public.documents d
                set is_current=false,status='archived',updated_at=now()
                where d.knowledge_base_id=%s and d.source_registry_id is not null and d.is_current=true
                """,
                (kb["id"],),
            )

        for bot_type in bot_types:
            country = pack.get("jurisdiction_country")
            region = pack.get("jurisdiction_region")
            if country:
                priority = 90 if region else 80
                conn.execute(
                    """
                    insert into public.bot_knowledge_bases(bot_id,knowledge_base_id,priority)
                    select b.id,%s,%s
                    from public.bots b
                    where b.bot_type=%s
                      and b.jurisdiction_country=%s
                      and (%s::text is null or b.jurisdiction_region=%s)
                    on conflict(bot_id,knowledge_base_id) do update set priority=excluded.priority
                    """,
                    (kb["id"], priority, bot_type, country, region, region),
                )
            else:
                conn.execute(
                    """
                    insert into public.bot_knowledge_bases(bot_id,knowledge_base_id,priority)
                    select b.id,%s,60
                    from public.bots b
                    where b.bot_type=%s
                    on conflict(bot_id,knowledge_base_id) do update set priority=excluded.priority
                    """,
                    (kb["id"], bot_type),
                )

    print(f"Imported {pack['slug']} with {len(sources)} sources")


def main() -> None:
    parser = ArgumentParser(description="Register a curated Citeral knowledge-pack manifest")
    parser.add_argument("manifest")
    import_manifest(parser.parse_args().manifest)


if __name__ == "__main__":
    main()
