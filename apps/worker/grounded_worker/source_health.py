from __future__ import annotations

from dataclasses import dataclass

import psycopg
from psycopg.rows import dict_row

from .config import Settings


@dataclass
class PackHealth:
    name: str
    slug: str
    coverage_status: str
    enabled_sources: int = 0
    ready_sources: int = 0
    failed_sources: int = 0
    queued_sources: int = 0
    unknown_sources: int = 0


def main() -> None:
    settings = Settings.from_env()
    with psycopg.connect(settings.database_url, row_factory=dict_row) as conn:
        rows = conn.execute(
            """
            select kb.name,kb.slug,kb.coverage_status,
                   count(*) filter (where skb.enabled) as enabled_sources,
                   count(*) filter (
                     where skb.enabled and exists (
                       select 1 from public.documents d
                       join public.document_versions v on v.document_id=d.id and v.status='ready'
                       where d.source_registry_id=s.id and d.is_current=true
                     )
                   ) as ready_sources,
                   count(*) filter (where skb.enabled and s.last_refresh_status='failed') as failed_sources,
                   count(*) filter (where skb.enabled and s.last_refresh_status='queued') as queued_sources,
                   count(*) filter (where skb.enabled and s.last_refresh_status='unknown') as unknown_sources
            from public.knowledge_bases kb
            join public.source_knowledge_bases skb on skb.knowledge_base_id=kb.id
            join public.source_registry s on s.id=skb.source_registry_id
            where kb.visibility='public' and kb.coverage_status in ('active','partial')
            group by kb.id,kb.name,kb.slug,kb.coverage_status
            order by kb.slug
            """
        ).fetchall()

        stale_jobs = conn.execute(
            """
            select j.id,d.title,j.status,j.locked_at,j.created_at
            from public.ingestion_jobs j
            join public.document_versions v on v.id=j.document_version_id
            join public.documents d on d.id=v.document_id
            where j.status in ('queued','processing')
              and coalesce(j.locked_at,j.created_at) < now() - interval '45 minutes'
            order by coalesce(j.locked_at,j.created_at)
            """
        ).fetchall()

        failing_sources = conn.execute(
            """
            select s.title,s.canonical_url,s.consecutive_failures,s.last_success_at,s.last_error_message,
                   array_agg(kb.slug order by kb.slug) filter (where skb.enabled) as packs
            from public.source_registry s
            join public.source_knowledge_bases skb on skb.source_registry_id=s.id
            join public.knowledge_bases kb on kb.id=skb.knowledge_base_id
            where s.enabled=true and skb.enabled=true and s.consecutive_failures > 0
            group by s.id
            order by s.consecutive_failures desc,s.title
            limit 25
            """
        ).fetchall()

    critical: list[str] = []
    warnings: list[str] = []

    print("### Curated source health")
    print()
    print("| Pack | Coverage | Enabled | Usable | Failed | Queued | Unknown |")
    print("| --- | --- | ---: | ---: | ---: | ---: | ---: |")
    for row in rows:
        health = PackHealth(
            name=str(row["name"]),
            slug=str(row["slug"]),
            coverage_status=str(row["coverage_status"]),
            enabled_sources=int(row["enabled_sources"] or 0),
            ready_sources=int(row["ready_sources"] or 0),
            failed_sources=int(row["failed_sources"] or 0),
            queued_sources=int(row["queued_sources"] or 0),
            unknown_sources=int(row["unknown_sources"] or 0),
        )
        print(
            f"| {health.name} | {health.coverage_status} | {health.enabled_sources} | "
            f"{health.ready_sources} | {health.failed_sources} | {health.queued_sources} | {health.unknown_sources} |"
        )
        if health.enabled_sources and health.ready_sources == 0:
            critical.append(f"{health.name} has enabled sources but no usable indexed source")

    if stale_jobs:
        critical.append(f"{len(stale_jobs)} ingestion job(s) have been queued/processing for more than 45 minutes")

    if failing_sources:
        print()
        print("#### Degraded sources")
        for row in failing_sources:
            packs = ", ".join(row["packs"] or [])
            message = str(row["last_error_message"] or "unknown error").replace("\n", " ")[:220]
            warnings.append(
                f"{row['title']} ({packs}) has {row['consecutive_failures']} consecutive failure(s): {message}"
            )
            print(f"- {warnings[-1]}")

    if stale_jobs:
        print()
        print("#### Stale ingestion jobs")
        for row in stale_jobs:
            print(f"- {row['title']}: {row['status']} since {row['locked_at'] or row['created_at']}")

    print()
    if critical:
        print("CRITICAL:")
        for item in critical:
            print(f"- {item}")
        raise SystemExit(1)

    if warnings:
        print(f"Health gate passed with {len(warnings)} degraded source warning(s); every active/partial pack still has usable indexed evidence.")
    else:
        print("Health gate passed with no degraded curated sources.")


if __name__ == "__main__":
    main()
