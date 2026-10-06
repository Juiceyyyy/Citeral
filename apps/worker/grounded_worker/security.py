from __future__ import annotations

import ipaddress
import socket
import struct
import time
from urllib.parse import urljoin, urlparse

import httpx


class UnsafeSourceUrl(RuntimeError):
    pass


class MalwareDetected(RuntimeError):
    pass


_BROWSER_COMPAT_ROOTS = {
    # India
    "cbic-gst.gov.in",
    "consumeraffairs.nic.in",
    "egazette.gov.in",
    "incometax.gov.in",
    "incometaxindia.gov.in",
    "indiacode.nic.in",
    "legislative.gov.in",
    "mca.gov.in",
    "meity.gov.in",
    "mha.gov.in",
    # International / United Nations
    "ohchr.org",
    "treaties.un.org",
    "un.org",
    # United States authorities
    "archives.gov",
    "cdc.gov",
    "congress.gov",
    "ecfr.gov",
    "irs.gov",
    "sec.gov",
    "uscode.house.gov",
    # United Kingdom authorities
    "gov.uk",
    "legislation.gov.uk",
    "nhs.uk",
}
_TRANSIENT_STATUSES = {429, 500, 502, 503, 504}
_MAX_TRANSIENT_ATTEMPTS = 4


def _host_is_public(hostname: str) -> bool:
    if hostname.lower() in {"localhost", "localhost.localdomain"}:
        return False
    try:
        addresses = socket.getaddrinfo(hostname, None, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise UnsafeSourceUrl(f"Could not resolve source host: {hostname}") from exc
    if not addresses:
        raise UnsafeSourceUrl(f"Source host resolved to no addresses: {hostname}")
    for item in addresses:
        raw = item[4][0]
        ip = ipaddress.ip_address(raw)
        if not ip.is_global:
            return False
    return True


def validate_public_http_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise UnsafeSourceUrl("Only HTTP(S) source URLs are allowed")
    if not parsed.hostname or parsed.username or parsed.password:
        raise UnsafeSourceUrl("Source URL must have a normal public hostname and no embedded credentials")
    if parsed.port and parsed.port not in {80, 443}:
        raise UnsafeSourceUrl("Non-standard source URL ports are blocked")
    if not _host_is_public(parsed.hostname):
        raise UnsafeSourceUrl("Source URL resolves to a private, loopback, link-local or otherwise non-public address")
    return url


def _browser_compat_allowed(url: str) -> bool:
    hostname = (urlparse(url).hostname or "").lower().rstrip(".")
    return any(hostname == root or hostname.endswith(f".{root}") for root in _BROWSER_COMPAT_ROOTS)


def _request_headers(url: str, *, browser_compat: bool) -> dict[str, str]:
    if not browser_compat:
        return {
            "User-Agent": "CiteralKnowledgeBot/1.0 (+source-refresh)",
            "Accept": "application/pdf,text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
        }

    parsed = urlparse(url)
    origin = f"{parsed.scheme}://{parsed.netloc}/"
    return {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"
        ),
        "Accept": "application/pdf,text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": origin,
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
    }


def _retry_delay(response: httpx.Response, attempt: int) -> float:
    retry_after = response.headers.get("retry-after")
    if retry_after:
        try:
            return min(20.0, max(1.0, float(retry_after)))
        except ValueError:
            pass
    return min(20.0, float(2**attempt))


def fetch_public_source(
    url: str,
    *,
    max_bytes: int,
    timeout_seconds: float = 60.0,
    max_redirects: int = 5,
) -> tuple[bytes, str, httpx.Headers]:
    current = validate_public_http_url(url)
    timeout = httpx.Timeout(timeout_seconds, connect=min(15.0, timeout_seconds))
    redirects = 0
    browser_compat = False
    transient_attempts = 0

    with httpx.Client(follow_redirects=False, timeout=timeout) as client:
        while redirects <= max_redirects:
            validate_public_http_url(current)
            headers = _request_headers(current, browser_compat=browser_compat)
            with client.stream("GET", current, headers=headers) as response:
                if response.status_code in {301, 302, 303, 307, 308}:
                    location = response.headers.get("location")
                    if not location:
                        raise UnsafeSourceUrl("Redirect response did not include a Location header")
                    current = urljoin(current, location)
                    redirects += 1
                    browser_compat = False
                    transient_attempts = 0
                    continue

                if (
                    response.status_code in {403, 406}
                    and not browser_compat
                    and _browser_compat_allowed(current)
                ):
                    browser_compat = True
                    transient_attempts = 0
                    continue

                if response.status_code in _TRANSIENT_STATUSES and transient_attempts < _MAX_TRANSIENT_ATTEMPTS - 1:
                    delay = _retry_delay(response, transient_attempts)
                    transient_attempts += 1
                    time.sleep(delay)
                    continue

                response.raise_for_status()
                length = response.headers.get("content-length")
                if length and int(length) > max_bytes:
                    raise RuntimeError(f"Source exceeds maximum allowed size of {max_bytes} bytes")
                body = bytearray()
                for chunk in response.iter_bytes(chunk_size=64 * 1024):
                    body.extend(chunk)
                    if len(body) > max_bytes:
                        raise RuntimeError(f"Source exceeds maximum allowed size of {max_bytes} bytes")
                return bytes(body), str(response.url), response.headers

    raise UnsafeSourceUrl(f"Source exceeded {max_redirects} redirects")


def scan_with_clamav(payload: bytes, host: str, port: int, timeout_seconds: float = 30.0) -> None:
    """Scan bytes using clamd's INSTREAM protocol. Raises on malware or scanner errors."""
    with socket.create_connection((host, port), timeout=timeout_seconds) as sock:
        sock.settimeout(timeout_seconds)
        sock.sendall(b"zINSTREAM\0")
        view = memoryview(payload)
        for offset in range(0, len(payload), 64 * 1024):
            chunk = view[offset : offset + 64 * 1024]
            sock.sendall(struct.pack("!I", len(chunk)))
            sock.sendall(chunk)
        sock.sendall(struct.pack("!I", 0))
        response = bytearray()
        while True:
            piece = sock.recv(4096)
            if not piece:
                break
            response.extend(piece)
            if b"\0" in piece or b"\n" in piece:
                break
    result = response.decode("utf-8", errors="replace").strip("\x00\r\n ")
    if not result:
        raise RuntimeError("ClamAV returned an empty response")
    if result.endswith("FOUND"):
        raise MalwareDetected(result)
    if not result.endswith("OK"):
        raise RuntimeError(f"ClamAV scan failed: {result}")
