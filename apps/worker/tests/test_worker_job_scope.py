from __future__ import annotations

import pytest

from grounded_worker.config import job_types_from_env


def test_job_types_default_to_both_for_local_worker(monkeypatch):
    monkeypatch.delenv("WORKER_JOB_TYPES", raising=False)
    assert job_types_from_env() == ("document_ingest", "source_refresh")


def test_job_types_are_deduplicated_and_scoped(monkeypatch):
    monkeypatch.setenv("WORKER_JOB_TYPES", "source_refresh,source_refresh")
    assert job_types_from_env() == ("source_refresh",)


def test_unknown_job_type_is_rejected(monkeypatch):
    monkeypatch.setenv("WORKER_JOB_TYPES", "source_refresh,unknown")
    with pytest.raises(RuntimeError, match="Unsupported WORKER_JOB_TYPES"):
        job_types_from_env()
