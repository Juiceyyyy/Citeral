from grounded_worker.main import _suffix_for_job
from grounded_worker.source_refresh import ALLOWED_CONTENT_TYPES


def test_xhtml_authoritative_sources_are_supported_as_html():
    assert "application/xhtml+xml" in ALLOWED_CONTENT_TYPES
    assert _suffix_for_job({"mime_type": "application/xhtml+xml", "title": "Act contents"}) == ".html"
