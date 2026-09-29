"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ArrowUp, Check, Copy, FileText, Globe2, Loader2, MessageSquarePlus, Paperclip, Pencil, Settings2, Square, X } from "lucide-react";
import { toast } from "sonner";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { AssistantIcon } from "@/components/app/assistant-icon";
import { createClient } from "@/lib/supabase/client";

export type ChatBotInfo = {
  id: string;
  name: string;
  description: string | null;
  bot_type: string;
  web_enabled: boolean;
  jurisdiction_country: string | null;
  jurisdiction_region: string | null;
};

type ConversationAttachment = { id: string; name: string; status: string; mimeType: string };

function messageText(message: UIMessage) {
  return message.parts.filter((part): part is Extract<UIMessage["parts"][number], { type: "text" }> => part.type === "text").map((part) => part.text).join("\n");
}

function IconButton({ label, children, onClick, disabled, className = "" }: { label: string; children: React.ReactNode; onClick?: () => void; disabled?: boolean; className?: string }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className={`grid size-9 place-items-center rounded-lg text-muted-foreground transition hover:bg-white/[.04] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/35 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}>{children}</button>;
}

function formatElapsed(ms: number) {
  return `${(Math.max(0, ms) / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
}

export function ChatShell({ bot, conversationId, initialMessages, initialAttachments, starterPrompts, welcomeTitle, welcomeBody, placeholder }: {
  bot: ChatBotInfo;
  conversationId: string;
  initialMessages: UIMessage[];
  initialAttachments: ConversationAttachment[];
  starterPrompts: string[];
  welcomeTitle: string;
  welcomeBody: string;
  placeholder: string;
}) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [web, setWeb] = useState(false);
  const [attachments, setAttachments] = useState(initialAttachments);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [savingMessageId, setSavingMessageId] = useState<string | null>(null);
  const [thinkingStartedAt, setThinkingStartedAt] = useState<number | null>(null);
  const [thinkingElapsedMs, setThinkingElapsedMs] = useState(0);
  const [lastThinkingMs, setLastThinkingMs] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const requestMessageCountRef = useRef(initialMessages.length);
  const messagesRef = useRef(initialMessages);
  const statusRef = useRef<string>("ready");
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat" }), []);
  const { messages, setMessages, sendMessage, status, error, stop } = useChat({ id: conversationId, messages: initialMessages, transport });
  messagesRef.current = messages;
  statusRef.current = status;
  const busy = status === "streaming" || status === "submitted";
  const emptyConversation = messages.length === 0;
  const indexing = attachments.some((item) => item.status === "queued" || item.status === "processing");

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, status]);
  useEffect(() => { if (error) toast.error(error.message); }, [error]);

  useEffect(() => {
    if (thinkingStartedAt === null) return;
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - thinkingStartedAt;
      const freshAssistantText = messagesRef.current
        .slice(requestMessageCountRef.current)
        .some((message) => message.role === "assistant" && messageText(message).trim().length > 0);
      const currentStatus = statusRef.current;
      setThinkingElapsedMs(elapsed);
      if (freshAssistantText || currentStatus === "ready" || currentStatus === "error") {
        setLastThinkingMs(elapsed);
        setThinkingStartedAt(null);
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [thinkingStartedAt]);

  useEffect(() => {
    if (!indexing) return;
    const timer = window.setInterval(async () => {
      const pending = attachments.filter((item) => item.status === "queued" || item.status === "processing");
      const updates = await Promise.all(pending.map(async (item) => {
        const response = await fetch(`/api/documents/${item.id}`, { cache: "no-store" });
        if (!response.ok) return item;
        const body = await response.json();
        return { ...item, status: String(body.status || item.status) };
      }));
      if (updates.length) {
        const updateMap = new Map(updates.map((item) => [item.id, item]));
        setAttachments((current) => current.map((item) => updateMap.get(item.id) || item));
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [attachments, indexing]);

  async function submit(text = input) {
    const value = text.trim();
    if (!value || busy) return;
    requestMessageCountRef.current = messages.length;
    setThinkingStartedAt(Date.now());
    setThinkingElapsedMs(0);
    setLastThinkingMs(null);
    setInput("");
    await sendMessage({ text: value }, { body: { botId: bot.id, conversationId, webSearch: web } });
    router.refresh();
  }

  async function copyMessage(message: UIMessage) {
    const text = messageText(message).trim();
    if (!text) return;
    try { await navigator.clipboard.writeText(text); toast.success("Message copied"); }
    catch { toast.error("Could not copy message"); }
  }

  function beginEdit(message: UIMessage) {
    if (busy || message.role !== "user") return;
    setEditingMessageId(message.id); setEditText(messageText(message));
  }

  async function saveEdit(messageId: string) {
    const value = editText.trim();
    if (!value || savingMessageId) return;
    setSavingMessageId(messageId);
    try {
      const response = await fetch(`/api/messages/${encodeURIComponent(messageId)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: value }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not edit message");
      setMessages((current) => current.map((message) => message.id === messageId ? { ...message, parts: body.parts as UIMessage["parts"] } : message));
      setEditingMessageId(null); setEditText(""); router.refresh(); toast.success("Message updated");
    } catch (editError) { toast.error(editError instanceof Error ? editError.message : "Could not edit message"); }
    finally { setSavingMessageId(null); }
  }

  async function uploadOne(file: File) {
    const mimeType = file.type || "text/plain";
    const prep = await fetch("/api/documents/upload-url", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "conversation", botId: bot.id, conversationId, filename: file.name, mimeType, size: file.size }) });
    const info = await prep.json();
    if (!prep.ok) throw new Error(info.error || "Upload preparation failed");
    const supabase = createClient();
    const { error: uploadError } = await supabase.storage.from("documents").uploadToSignedUrl(info.path, info.token, file, { contentType: mimeType });
    if (uploadError) throw new Error(uploadError.message);
    const finalize = await fetch("/api/documents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "conversation", botId: bot.id, conversationId, knowledgeBaseId: info.knowledgeBaseId, reservationId: info.reservationId, path: info.path, filename: file.name, mimeType, size: file.size }) });
    const body = await finalize.json();
    if (!finalize.ok) throw new Error(body.error || "Could not enqueue document");
    return { id: String(body.id), name: file.name, status: String(body.status || "queued"), mimeType } satisfies ConversationAttachment;
  }

  async function uploadFiles(files: File[]) {
    if (!files.length || uploading) return;
    setUploading(true);
    try {
      for (const file of files) {
        try { const attachment = await uploadOne(file); setAttachments((current) => [...current, attachment]); }
        catch (uploadError) { toast.error(`${file.name}: ${uploadError instanceof Error ? uploadError.message : "upload failed"}`); }
      }
    } finally { setUploading(false); setDragging(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  }

  async function removeAttachment(id: string) {
    const response = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { toast.error(body.error || "Could not remove attachment"); return; }
    setAttachments((current) => current.filter((item) => item.id !== id));
  }

  async function newChat() {
    const response = await fetch("/api/conversations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ botId: bot.id }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { toast.error(body.error || "Could not create conversation"); return; }
    router.push(`/app/bots/${bot.id}?conversation=${body.id}`); router.refresh();
  }

  const locationLabel = bot.jurisdiction_country ? `${bot.jurisdiction_country}${bot.jurisdiction_region ? ` · ${bot.jurisdiction_region}` : ""}` : "Grounded assistant";
  const thinkingLabel = web ? "Searching & thinking" : "Thinking";

  return (
    <div className="flex h-[calc(100dvh-5rem)] min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface lg:h-[calc(100dvh-3.5rem)]">
      <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <AssistantIcon type={bot.bot_type} className="size-8" />
          <div className="min-w-0"><div className="truncate text-[13px] font-medium sm:text-sm">{bot.name}</div><div className="mt-0.5 hidden truncate text-[10px] text-subtle-foreground sm:block">{locationLabel}</div></div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton label="New chat" onClick={() => void newChat()}><MessageSquarePlus className="size-4" /></IconButton>
          <Link aria-label="Assistant settings" title="Assistant settings" href={`/app/bots/${bot.id}/settings`} className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-white/[.04] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/35"><Settings2 className="size-4" /></Link>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-5 sm:px-6 md:px-8 md:py-7">
        <div className="mx-auto w-full max-w-[860px] space-y-5 sm:space-y-6">
          {emptyConversation ? (
            <div className="flex min-h-[40vh] flex-col justify-end pb-3 pt-10 sm:min-h-[44vh] sm:pb-5">
              <AssistantIcon type={bot.bot_type} className="size-10 rounded-xl" />
              <h1 className="mt-5 max-w-2xl text-[26px] font-semibold leading-tight tracking-[-0.035em] sm:text-[30px]">{welcomeTitle}</h1>
              <p className="mt-3 max-w-2xl text-[15px] leading-6 text-muted-foreground sm:text-base sm:leading-7">{welcomeBody}</p>
              <div className="mt-7 grid gap-2 sm:grid-cols-2">
                {starterPrompts.slice(0, 4).map((prompt) => (
                  <button type="button" onClick={() => void submit(prompt)} key={prompt} className="min-h-16 rounded-lg border border-border bg-surface-soft px-3.5 py-3 text-left text-[13px] leading-5 text-[#b7bdc7] transition hover:border-border-strong hover:bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/35 sm:text-sm">{prompt}</button>
                ))}
              </div>
            </div>
          ) : null}

          {messages.map((message) => {
            const editing = editingMessageId === message.id && message.role === "user";
            const text = messageText(message);
            return (
              <Message from={message.role} key={message.id}>
                <MessageContent className={message.role === "user" ? "max-w-[90%] rounded-xl bg-[#e7edf6] px-3.5 py-2.5 text-[16px] leading-7 text-[#172033] sm:max-w-[78%] sm:px-4 sm:py-3" : "w-full text-[16px] leading-7"}>
                  {editing ? (
                    <div className="min-w-[min(70vw,22rem)] sm:min-w-80">
                      <textarea autoFocus value={editText} onChange={(event) => setEditText(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { setEditingMessageId(null); setEditText(""); } if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void saveEdit(message.id); } }} rows={Math.min(8, Math.max(2, editText.split("\n").length))} className="max-h-48 w-full resize-none bg-transparent text-[16px] leading-7 text-[#172033] outline-none" />
                      <div className="mt-2 flex justify-end gap-1.5"><button type="button" aria-label="Cancel edit" onClick={() => { setEditingMessageId(null); setEditText(""); }} className="grid size-7 place-items-center rounded-full bg-[#d3dce9] text-[#445064] hover:bg-[#c9d4e3]"><X className="size-3.5" /></button><button type="button" aria-label="Save message edit" disabled={!editText.trim() || savingMessageId === message.id} onClick={() => void saveEdit(message.id)} className="grid size-7 place-items-center rounded-full bg-[#2e6fdd] text-white hover:bg-[#2865cc] disabled:opacity-50">{savingMessageId === message.id ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}</button></div>
                    </div>
                  ) : message.parts.map((part, index) => {
                    if (part.type === "text") return message.role === "assistant" ? <MessageResponse key={index}>{part.text}</MessageResponse> : <div key={index} className="whitespace-pre-wrap">{part.text}</div>;
                    if (part.type === "source-url") return <a key={index} href={part.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex max-w-full truncate rounded-md border border-border bg-surface-soft px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground">{part.title || part.url}</a>;
                    return null;
                  })}
                </MessageContent>
                {!editing && text.trim() ? <div className={`flex items-center gap-0.5 px-1 text-subtle-foreground transition-opacity sm:opacity-0 sm:group-hover:opacity-100 ${message.role === "user" ? "justify-end" : "justify-start"}`}>{message.role === "user" ? <IconButton label="Edit message" disabled={busy} onClick={() => beginEdit(message)} className="size-7"><Pencil className="size-3.5" /></IconButton> : null}<IconButton label="Copy message" onClick={() => void copyMessage(message)} className="size-7"><Copy className="size-3.5" /></IconButton></div> : null}
              </Message>
            );
          })}

          {thinkingStartedAt !== null ? (
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground" aria-live="polite">
              <Loader2 className="size-3.5 animate-spin" />
              <span>{thinkingLabel} · {formatElapsed(thinkingElapsedMs)}</span>
            </div>
          ) : lastThinkingMs !== null && busy ? (
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground" aria-live="polite">
              <span className="size-1.5 rounded-full bg-primary/70" />
              <span>Thought for {formatElapsed(lastThinkingMs)} · Responding…</span>
            </div>
          ) : lastThinkingMs !== null && status === "ready" ? (
            <div className="text-[12px] text-subtle-foreground">Thought for {formatElapsed(lastThinkingMs)}</div>
          ) : null}
          <div ref={endRef} />
        </div>
      </div>

      <div className="shrink-0 bg-surface px-2.5 pb-2.5 sm:px-4 sm:pb-4">
        <div className="mx-auto max-w-[860px]">
          <input ref={fileInputRef} type="file" multiple className="hidden" accept=".pdf,.docx,.pptx,.xlsx,.txt,.md,.csv,.html,.png,.jpg,.jpeg" onChange={(event) => void uploadFiles(Array.from(event.target.files || []))} />
          <form
            onSubmit={(event) => { event.preventDefault(); void submit(); }}
            onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={(event) => { event.preventDefault(); if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
            onDrop={(event) => { event.preventDefault(); setDragging(false); void uploadFiles(Array.from(event.dataTransfer.files || [])); }}
            className={`rounded-2xl border bg-input p-2 transition focus-within:border-focus/60 focus-within:ring-2 focus-within:ring-focus/10 ${dragging ? "border-primary/60 bg-primary/[.035]" : "border-border"}`}
          >
            {attachments.length ? <div className="flex flex-wrap gap-1.5 px-1.5 pb-1.5">{attachments.map((item) => <div key={item.id} className="flex max-w-full items-center gap-1.5 rounded-md border border-border bg-surface-raised px-2 py-1.5 text-[10px] text-muted-foreground"><FileText className="size-3.5 shrink-0" /><span className="max-w-48 truncate">{item.name}</span><span className={item.status === "ready" ? "text-emerald-300/80" : item.status === "failed" ? "text-red-300/80" : "text-amber-200/70"}>{item.status === "ready" ? "Ready" : item.status === "failed" ? "Failed" : "Processing"}</span><button type="button" aria-label={`Remove ${item.name}`} onClick={() => void removeAttachment(item.id)} className="rounded p-0.5 hover:bg-white/[.05]"><X className="size-3" /></button></div>)}</div> : null}
            <textarea value={input} onChange={(event) => setInput(event.target.value)} onPaste={(event) => { const files = Array.from(event.clipboardData.files || []); if (files.length) { event.preventDefault(); void uploadFiles(files); } }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(); } }} rows={1} placeholder={dragging ? "Drop files to attach to this conversation" : placeholder} className="max-h-40 min-h-12 w-full resize-none bg-transparent px-2.5 py-2.5 text-[16px] leading-6 outline-none placeholder:text-subtle-foreground" />
            <div className="flex items-center justify-between px-0.5">
              <div className="flex items-center gap-1">
                <IconButton label="Attach files" disabled={uploading} onClick={() => fileInputRef.current?.click()}>{uploading ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}</IconButton>
                <button
                  type="button"
                  aria-label={web ? "Turn off web search" : "Turn on web search"}
                  aria-pressed={web}
                  title={web ? "Web search on" : "Web search off"}
                  onClick={() => setWeb((current) => !current)}
                  className={`flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/35 ${web ? "bg-primary/15 text-[#9fc0ff] ring-1 ring-inset ring-primary/30 hover:bg-primary/20" : "text-muted-foreground hover:bg-white/[.04] hover:text-foreground"}`}
                >
                  <Globe2 className="size-4" />
                  <span>Web</span>
                </button>
              </div>
              {busy ? <button type="button" aria-label="Stop generating" title="Stop generating" onClick={() => stop()} className="grid size-9 place-items-center rounded-full bg-primary text-white hover:bg-primary-hover"><Square className="size-3.5 fill-current" /></button> : <button type="submit" aria-label="Send message" title="Send message" disabled={!input.trim()} className="grid size-9 place-items-center rounded-full bg-primary text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-muted disabled:text-subtle-foreground"><ArrowUp className="size-[17px]" /></button>}
            </div>
          </form>
          {indexing ? <p className="mt-1.5 text-center text-[10px] leading-4 text-[#a29578]">Attached files are conversation-only. Use them after they show Ready.</p> : null}
          <p className="mt-1.5 text-center text-[9px] leading-4 text-subtle-foreground sm:text-[10px]">{web ? "Web is on for new messages. Verify important claims against linked sources." : "Web is off by default. Turn it on when you want fresh external information."}</p>
        </div>
      </div>
    </div>
  );
}
