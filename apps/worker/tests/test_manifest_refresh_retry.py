from __future__ import annotations

from pathlib import Path


def test_manifest_importer_retries_previously_failed_sources():
    source = Path("grounded_worker/import_manifest.py").read_text(encoding="utf-8")
    assert "last_checked_at=case" in source
    assert "last_refresh_status='failed'" in source
    assert "then null" in source
    assert "consecutive_failures=case" in source
