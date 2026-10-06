from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed

import psycopg
from psycopg.rows import dict_row

from .config import Settings
from .source_refresh import mark_source_failure, refresh

_MAX_REFRESH_WORKERS = 2


def _refresh_one(source_id: str) -> tuple[str, str | None]:
    try:
        refresh(source_id)
        return source_id, None
    except Exception as exc:  # noqa: BLE001 - isolate each source refresh
        try:
            mark_source_failure(source_id, exc)
        except Exception as health_error:  # noqa: BLE001 - health telemetry must not mask the source failure
            return source_id, f"{exc}; additionally failed to record source health: {health_error}"
        return source_id, str(exc)


def main() -> None:
    settings = Settings.from_env()
    with psycopg.connect(settings.database_url, row_factory=dict_row) as conn:
        started_at = conn.execute("select now() as started_at").fetchone()["started_at"]
        rows = conn.execute(
            """
            select id,title from public.source_registry
            where enabled=true and refresh_interval_hours is not null
              and (last_checked_at is null or last_checked_at <= now() - make_interval(hours => refresh_interval_hours))
            order by coalesce(last_checked_at,'epoch'::timestamptz),title
            limit 100
            """
        ).fetchall()

    sources = {str(row["id"]): str(row["title"]) for row in rows}
    source_ids = list(sources)
    if not source_ids:
        print("No authoritative sources are due for refresh")
        return

    print(f"Refreshing {len(source_ids)} authoritative sources")
    for source_id in source_ids:
        print(f"Due source: {sources[source_id]} ({source_id})")

    failures: dict[str, str] = {}
    workers = min(_MAX_REFRESH_WORKERS, len(source_ids))
    with ThreadPoolExecutor(max_workers=workers, thread_name_prefix="source-refresh") as executor:
        futures = {executor.submit(_refresh_one, source_id): source_id for source_id in source_ids}
        for future in as_completed(futures):
            source_id, error = future.result()
            title = sources[source_id]
            if error:
                failures[source_id] = error
                print(f"Source failed: {title} ({source_id}): {error}")
            else:
                print(f"Source refresh returned successfully: {title} ({source_id})")

    # A refresh is only successful if it actually records a check in the registry.
    # This catches connection/config drift or unexpected no-op behavior that would
    # otherwise let the workflow report green while sources remain permanently due.
    with psycopg.connect(settings.database_url, row_factory=dict_row) as conn:
        verified_rows = conn.execute(
            """
            select id,last_checked_at from public.source_registry
            where id = any(%s::uuid[])
            """,
            (source_ids,),
        ).fetchall()

    verified = {str(row["id"]): row["last_checked_at"] for row in verified_rows}
    for source_id in source_ids:
        checked_at = verified.get(source_id)
        if source_id not in failures and (checked_at is None or checked_at < started_at):
            failures[source_id] = "refresh returned without advancing last_checked_at"
            print(f"Source verification failed: {sources[source_id]} ({source_id}): {failures[source_id]}")

    if failures:
        raise SystemExit(f"{len(failures)} source refreshes failed verification")

    print(f"Verified {len(source_ids)} authoritative source refreshes")


if __name__ == "__main__":
    main()
