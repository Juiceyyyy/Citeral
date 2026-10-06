from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from typing import Any

import tiktoken
from docling.chunking import HybridChunker
from docling_core.transforms.chunker.tokenizer.openai import OpenAITokenizer


@dataclass(frozen=True)
class ParsedChunk:
    index: int
    text: str
    embedding_text: str
    content_hash: str
    token_count: int
    page_start: int | None
    page_end: int | None
    headings: list[str]
    metadata: dict[str, Any]


def _pages(meta: dict[str, Any]) -> list[int]:
    result: set[int] = set()
    for item in meta.get("doc_items", []) or []:
        for source_ref in item.get("prov", []) or []:
            page = source_ref.get("page_no")
            if isinstance(page, int) and page > 0:
                result.add(page)
    return sorted(result)


def _compact_metadata(pages: list[int]) -> dict[str, Any]:
    # page_start/page_end and heading_path have dedicated indexed columns. Keep JSON
    # only when the source pages are non-contiguous, which preserves source location without
    # duplicating Docling's very large structural payload on every chunk.
    if len(pages) <= 2:
        return {}
    if pages == list(range(pages[0], pages[-1] + 1)):
        return {}
    return {"pages": pages}


def chunk_document(document: Any, max_tokens: int = 700) -> list[ParsedChunk]:
    encoding = tiktoken.get_encoding("cl100k_base")
    tokenizer = OpenAITokenizer(tokenizer=encoding, max_tokens=max_tokens)
    chunker = HybridChunker(tokenizer=tokenizer, merge_peers=True, repeat_table_header=True)
    output: list[ParsedChunk] = []

    for index, chunk in enumerate(chunker.chunk(dl_doc=document)):
        text = (chunk.text or "").strip()
        if not text:
            continue
        raw_metadata = chunk.meta.export_json_dict() if chunk.meta is not None else {}
        pages = _pages(raw_metadata)
        headings = [str(x) for x in (raw_metadata.get("headings") or []) if str(x).strip()]
        embedding_text = chunker.contextualize(chunk).strip() or text
        output.append(
            ParsedChunk(
                index=index,
                text=text,
                embedding_text=embedding_text,
                content_hash=sha256(text.encode("utf-8")).hexdigest(),
                token_count=len(encoding.encode(embedding_text)),
                page_start=min(pages) if pages else None,
                page_end=max(pages) if pages else None,
                headings=headings,
                metadata=_compact_metadata(pages),
            )
        )
    return output
