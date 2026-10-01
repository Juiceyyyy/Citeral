"use client";

export type CachedLocalAttachment = {
  documentId: string;
  name: string;
  mimeType: string;
  text: string;
  savedAt: number;
};

export type LocalAttachmentPayload = {
  documentId: string;
  text: string;
};

const DB_NAME = "provenance-local-knowledge-v1";
const STORE_NAME = "attachments";
const DB_VERSION = 1;
const MAX_CACHED_CHARS = 500_000;
const CHUNK_CHARS = 4_000;
const MAX_CHUNKS_PER_FILE = 5;
const MAX_CONTEXT_CHARS = 90_000;
const GENERIC_QUERY = /^(summari[sz]e|analy[sz]e|review|read|explain|what is this|tell me about|look at|check)(\s+(this|the|my)\s+(file|document|pdf|resume|cv))?[.!?\s]*$/i;

function extension(name: string) {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

export function canExtractLocally(file: Pick<File, "name" | "type">) {
  const ext = extension(file.name);
  return file.type === "application/pdf"
    || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    || file.type.startsWith("text/")
    || [".pdf", ".docx", ".txt", ".md", ".csv", ".html", ".htm"].includes(ext);
}

function normalizeText(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v]+/g, " ")
    .replace(/ +\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

async function extractPdf(file: File) {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  }
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await task.promise;
  const pages: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .filter(Boolean)
        .join(" ");
      if (text.trim()) pages.push(`[Page ${pageNumber}]\n${text}`);
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return pages.join("\n\n");
}

async function extractDocx(file: File) {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return result.value;
}

export async function extractLocalText(file: File) {
  if (!canExtractLocally(file)) return null;
  const ext = extension(file.name);
  let text = "";
  if (file.type === "application/pdf" || ext === ".pdf") {
    text = await extractPdf(file);
  } else if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || ext === ".docx") {
    text = await extractDocx(file);
  } else {
    text = await file.text();
    if (file.type === "text/html" || ext === ".html" || ext === ".htm") {
      const parsed = new DOMParser().parseFromString(text, "text/html");
      text = parsed.body?.innerText || parsed.body?.textContent || "";
    }
  }
  const normalized = normalizeText(text);
  if (normalized.length < 20) return null;
  return normalized.slice(0, MAX_CACHED_CHARS);
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "documentId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function requestPersistentLocalStorage() {
  try {
    if (navigator.storage?.persist) await navigator.storage.persist();
  } catch {
    // Best effort only. IndexedDB remains usable without persistent-storage approval.
  }
}

export async function cacheLocalAttachment(record: CachedLocalAttachment) {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getCachedLocalAttachment(documentId: string) {
  const db = await openDb();
  if (!db) return null;
  const value = await new Promise<CachedLocalAttachment | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(documentId);
    request.onsuccess = () => resolve((request.result as CachedLocalAttachment | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return value;
}

export async function removeCachedLocalAttachment(documentId: string) {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(documentId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

function splitChunks(text: string) {
  const chunks: string[] = [];
  for (let start = 0; start < text.length; start += CHUNK_CHARS) {
    chunks.push(text.slice(start, start + CHUNK_CHARS));
  }
  return chunks;
}

function queryTerms(query: string) {
  return [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])]
    .filter((term) => !["this", "that", "with", "from", "have", "what", "file", "document", "please", "about", "into"].includes(term))
    .slice(0, 24);
}

function selectChunks(text: string, query: string) {
  const chunks = splitChunks(text);
  if (chunks.length <= MAX_CHUNKS_PER_FILE) return chunks;
  const terms = queryTerms(query);
  if (!terms.length || GENERIC_QUERY.test(query.trim())) {
    const indexes = [0, 1, Math.floor(chunks.length / 2), chunks.length - 2, chunks.length - 1];
    return [...new Set(indexes)].filter((index) => index >= 0 && index < chunks.length).map((index) => chunks[index]);
  }
  return chunks
    .map((chunk, index) => {
      const lower = chunk.toLowerCase();
      const score = terms.reduce((sum, term) => sum + (lower.split(term).length - 1), 0) + (index === 0 ? 0.25 : 0);
      return { chunk, index, score };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, MAX_CHUNKS_PER_FILE)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.chunk);
}

export function buildLocalAttachmentPayload(records: CachedLocalAttachment[], query: string): LocalAttachmentPayload[] {
  let remaining = MAX_CONTEXT_CHARS;
  const output: LocalAttachmentPayload[] = [];
  for (const record of records) {
    if (remaining <= 0) break;
    const selected = selectChunks(record.text, query).join("\n\n").slice(0, remaining);
    if (!selected.trim()) continue;
    output.push({ documentId: record.documentId, text: selected });
    remaining -= selected.length;
  }
  return output;
}
