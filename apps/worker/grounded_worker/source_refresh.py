from __future__ import annotations

import mimetypes
from argparse import ArgumentParser
from hashlib import sha256
from pathlib import Path
from urllib.parse import urlparse
from uuid import uuid4

import psycopg
from psycopg.rows import dict_row
from supabase import create_client

from .config import Settings
from .security import fetch_public_source, scan_with_clamav

ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "text/markdown",
    "text/csv",
    "text/html",
    "image/png",
    "image/jpeg",
}


def mark_source_failure(source_id: str, error: Exception | str) -> None:
    settings = Settings.from_env()
    message = str(error)[:4000]
    with psycopg.connect(settings.database_url, row_factory=dict_row, autocommit=True) as conn:
        conn.execute(
            """
            update public.source_registry
            set last_checked_at=now(),
                last_refresh_status='failed',
                consecutive_failures=consecutive_failures+1,
                last_error_message=%s
            where id=%s
            """,
            (message, source_id),
        )



def refresh(source_id: str) -> None:
    settings = Settings.from_env()
    storage = create_client(settings.supabase_url, settings.supabase_service_role_key)
    # Autocommit keeps the initial registry lookup from holding an idle transaction
    # open while the remote source is fetched/scanned. Atomic writes still use
    # explicit conn.transaction() blocks below.
    with psycopg.connect(settings.database_url, row_factory=dict_row, autocommit=True) as conn:
        source = conn.execute(
            "select s.*,kb.organization_id from public.source_registry s join public.knowledge_bases kb on kb.id=s.knowledge_base_id where s.id=%s and s.enabled=true",
            (source_id,),
        ).fetchone()
        if not source:
            raise SystemExit("Source not found or disabled")

        payload, final_url, response_headers = fetch_public_source(
            source["canonical_url"], max_bytes=settings.max_source_bytes, timeout_seconds=60
        )
        if settings.clamav_host:
            scan_with_clamav(payload, settings.clamav_host, settings.clamav_port)
        elif settings.malware_scan_required:
            raise RuntimeError("Malware scanning is required but no ClamAV service is configured")

        digest = sha256(payload).hexdigest()
        if source["last_content_hash"] == digest:
            with conn.transaction():
                conn.execute(
                    """
                    update public.source_registry
                    set last_checked_at=now(),last_success_at=now(),last_refresh_status='ok',
                        consecutive_failures=0,last_error_message=null
                    where id=%s
                    """,
                    (source_id,),
                )
                conn.execute(
                    """
                    update public.documents d
                    set is_current=true,
                        status=case
                          when exists (
                            select 1 from public.document_versions v
                            where v.document_id=d.id and v.status='ready'
                          ) then 'ready'
                          else d.status
                        end,
                        updated_at=now()
                    where d.source_registry_id=%s
                    """,
                    (source_id,),
                )
                conn.execute(
                    """
                    insert into public.knowledge_base_documents(knowledge_base_id,document_id,priority)
                    select sk.knowledge_base_id,d.id,sk.priority
                    from public.source_knowledge_bases sk
                    join public.documents d on d.source_registry_id=sk.source_registry_id
                    where sk.source_registry_id=%s
                      and coalesce((to_jsonb(sk)->>'enabled')::boolean,true)
                      and d.is_current=true
                    on conflict(knowledge_base_id,document_id) do update set priority=excluded.priority
                    """,
                    (source_id,),
                )
            print("No content change")
            return

        parsed = urlparse(final_url)
        filename = Path(parsed.path).name or f"source-{source_id}.html"
        content_type = response_headers.get("content-type", "").split(";", 1)[0].strip().lower()
        if not content_type:
            content_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
        if content_type not in ALLOWED_CONTENT_TYPES:
            raise RuntimeError(f"Unsupported curated source content type: {content_type}")

        storage_path = f"curated/{source['knowledge_base_id']}/{uuid4()}-{filename[:160]}"
        storage.storage.from_("documents").upload(
            storage_path,
            payload,
            {"content-type": content_type, "upsert": "false"},
        )

        try:
            with conn.transaction():
                existing = conn.execute(
                    "select id from public.documents where source_registry_id=%s order by created_at desc limit 1",
                    (source_id,),
                ).fetchone()
                if existing:
                    document_id = existing["id"]
                    next_version = conn.execute(
                        "select coalesce(max(version_number),0)+1 n from public.document_versions where document_id=%s",
                        (document_id,),
                    ).fetchone()["n"]
                    conn.execute(
                        """update public.documents set status='queued',is_current=true,title=%s,mime_type=%s,source_url=%s,publisher=%s,
                           authority_level=%s,jurisdiction_country=%s,jurisdiction_region=%s,last_verified_at=now() where id=%s""",
                        (
                            source["title"], content_type, final_url, source["publisher"], source["authority_level"],
                            source["jurisdiction_country"], source["jurisdiction_region"], document_id,
                        ),
                    )
                else:
                    document_id = conn.execute(
                        """insert into public.documents(organization_id,knowledge_base_id,source_registry_id,title,mime_type,status,source_url,publisher,authority_level,jurisdiction_country,jurisdiction_region,last_verified_at)
                           values(%s,%s,%s,%s,%s,'queued',%s,%s,%s,%s,%s,now()) returning id""",
                        (
                            source["organization_id"], source["knowledge_base_id"], source_id, source["title"],
                            content_type, final_url, source["publisher"], source["authority_level"],
                            source["jurisdiction_country"], source["jurisdiction_region"],
                        ),
                    ).fetchone()["id"]
                    next_version = 1

                conn.execute(
                    """
                    insert into public.knowledge_base_documents(knowledge_base_id,document_id,priority)
                    select sk.knowledge_base_id,%s,sk.priority
                    from public.source_knowledge_bases sk
                    where sk.source_registry_id=%s
                      and coalesce((to_jsonb(sk)->>'enabled')::boolean,true)
                    on conflict(knowledge_base_id,document_id) do update set priority=excluded.priority
                    """,
                    (document_id, source_id),
                )

                version_id = conn.execute(
                    "insert into public.document_versions(document_id,version_number,storage_path,content_hash,status) values(%s,%s,%s,%s,'queued') returning id",
                    (document_id, next_version, storage_path, digest),
                ).fetchone()["id"]
                conn.execute(
                    "insert into public.ingestion_jobs(organization_id,document_version_id,job_type,status) values(%s,%s,'source_refresh','queued')",
                    (source["organization_id"], version_id),
                )
                conn.execute(
                    """update public.source_registry
                       set last_checked_at=now(),last_changed_at=now(),last_content_hash=%s,
                           last_refresh_status='queued',last_error_message=null
                       where id=%s""",
                    (digest, source_id),
                )
        except Exception:
            try:
                storage.storage.from_("documents").remove([storage_path])
            except Exception as cleanup_error:  # noqa: BLE001 - cleanup must not mask original failure
                print(f"Warning: failed to remove orphaned source object {storage_path}: {cleanup_error}")
            raise

        print(f"Queued version {next_version} of {source['title']}")


def main() -> None:
    parser = ArgumentParser(description="Fetch a registered authoritative source and enqueue re-indexing")
    parser.add_argument("source_id")
    source_id = parser.parse_args().source_id
    try:
        refresh(source_id)
    except Exception as exc:  # noqa: BLE001 - CLI boundary records source health before failing
        mark_source_failure(source_id, exc)
        raise


if __name__ == "__main__":
    main()
