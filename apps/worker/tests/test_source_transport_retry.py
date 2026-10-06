from __future__ import annotations

import httpx

from grounded_worker import security


class _FakeClient:
    attempts = 0

    def __init__(self, *args, **kwargs):
        pass

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def stream(self, method, url, headers):
        type(self).attempts += 1
        if type(self).attempts < 3:
            raise httpx.ReadTimeout("temporary timeout")
        request = httpx.Request(method, url)
        return httpx.Response(
            200,
            request=request,
            headers={"content-type": "text/plain", "content-length": "2"},
            content=b"ok",
        )


def test_public_source_retries_transport_timeouts(monkeypatch):
    _FakeClient.attempts = 0
    monkeypatch.setattr(security.httpx, "Client", _FakeClient)
    monkeypatch.setattr(security, "validate_public_http_url", lambda url: url)
    monkeypatch.setattr(security, "_browser_compat_allowed", lambda url: False)
    monkeypatch.setattr(security.time, "sleep", lambda seconds: None)

    payload, final_url, headers = security.fetch_public_source(
        "https://example.com/source.txt",
        max_bytes=1024,
        timeout_seconds=1,
    )

    assert payload == b"ok"
    assert final_url == "https://example.com/source.txt"
    assert headers["content-type"] == "text/plain"
    assert _FakeClient.attempts == 3
