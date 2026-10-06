"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  Home,
  LoaderCircle,
  LogOut,
  Menu,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState, type MouseEvent, type UIEvent } from "react";
import { toast } from "sonner";
import { BrandLockup, BrandMark } from "@/components/app/brand";
import { AssistantIcon } from "@/components/app/assistant-icon";
import { createClient } from "@/lib/supabase/client";
import { ASSISTANT_CATALOG } from "@/lib/bots/catalog";
import { cn } from "@/lib/utils";

export type AssistantNavItem = { id: string; name: string; bot_type: string };
export type ConversationNavItem = { id: string; title: string; bot_id: string; bot_name: string; archived_at: string | null; last_message_at: string | null };
type SidebarConversationRow = Omit<ConversationNavItem, "bot_name">;

function NavLink({ href, children, active, collapsed = false, onNavigate, title }: { href: string; children: React.ReactNode; active?: boolean; collapsed?: boolean; onNavigate?: () => void; title?: string }) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      title={title}
      className={cn(
        "flex min-h-9 items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] transition-[background-color,color,border-color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/35",
        collapsed && "mx-auto size-10 min-h-10 justify-center px-0 py-0",
        active ? "bg-white/[.07] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,.035)]" : "text-[#aeb4bd] hover:bg-white/[.045] hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

function ConversationRow({ conversation, archived, working, onNavigate, onArchive, onDelete }: {
  conversation: ConversationNavItem;
  archived: boolean;
  working: boolean;
  onNavigate?: () => void;
  onArchive: (conversation: ConversationNavItem, archived: boolean) => void;
  onDelete: (conversation: ConversationNavItem) => void;
}) {
  return (
    <div className="group flex items-center rounded-xl transition hover:bg-white/[.035]">
      <Link href={`/app/bots/${conversation.bot_id}?conversation=${conversation.id}`} onClick={onNavigate} className="flex min-w-0 flex-1 items-start gap-2.5 px-2.5 py-2">
        <MessageSquare className="mt-0.5 size-3.5 shrink-0 text-subtle-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] text-[#c5cad1]">{conversation.title || "Conversation"}</span>
          <span className="mt-0.5 block truncate text-[10px] text-subtle-foreground">{conversation.bot_name}</span>
        </span>
      </Link>
      <div className="mr-1 flex shrink-0 items-center gap-0.5 opacity-70 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
        <button type="button" disabled={working} aria-label={archived ? "Restore conversation" : "Archive conversation"} title={archived ? "Restore" : "Archive"} onClick={() => onArchive(conversation, !archived)} className="grid size-7 place-items-center rounded-lg text-subtle-foreground hover:bg-white/[.05] hover:text-foreground disabled:opacity-40">
          {archived ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
        </button>
        <button type="button" disabled={working} aria-label="Delete conversation" title="Delete" onClick={() => onDelete(conversation)} className="grid size-7 place-items-center rounded-lg text-subtle-foreground hover:bg-red-500/[.08] hover:text-red-300 disabled:opacity-40">
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

function NavigationContent({
  assistants,
  conversations,
  email,
  collapsed = false,
  hasMoreConversations = false,
  loadingMoreConversations = false,
  onLoadMoreConversations,
  onToggleCollapse,
  onNavigate,
  onClose,
}: {
  assistants: AssistantNavItem[];
  conversations: ConversationNavItem[];
  email?: string;
  collapsed?: boolean;
  hasMoreConversations?: boolean;
  loadingMoreConversations?: boolean;
  onLoadMoreConversations?: () => void;
  onToggleCollapse?: () => void;
  onNavigate?: () => void;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [conversationBusy, setConversationBusy] = useState<string | null>(null);
  const [assistantsOpen, setAssistantsOpen] = useState(true);
  const assistantsByType = new Map<string, AssistantNavItem>();
  for (const assistant of assistants) if (!assistantsByType.has(assistant.bot_type)) assistantsByType.set(assistant.bot_type, assistant);
  const activeConversations = conversations.filter((conversation) => !conversation.archived_at);
  const archivedConversations = conversations.filter((conversation) => Boolean(conversation.archived_at));
  const builtinPresets = ASSISTANT_CATALOG.filter((preset) => preset.key !== "custom");

  async function signOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  async function setArchived(conversation: ConversationNavItem, archived: boolean) {
    const busyKey = `${archived ? "archive" : "restore"}:${conversation.id}`;
    setConversationBusy(busyKey);
    try {
      const response = await fetch(`/api/conversations/${conversation.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ archived }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Could not ${archived ? "archive" : "restore"} conversation`);
      const currentConversation = new URLSearchParams(window.location.search).get("conversation");
      if (archived && currentConversation === conversation.id) router.push(`/app/bots/${conversation.bot_id}`);
      router.refresh();
      toast.success(archived ? "Conversation archived" : "Conversation restored");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update conversation");
    } finally {
      setConversationBusy(null);
    }
  }

  async function deleteConversation(conversation: ConversationNavItem) {
    if (!window.confirm(`Delete “${conversation.title || "Conversation"}”? This cannot be undone.`)) return;
    setConversationBusy(`delete:${conversation.id}`);
    try {
      const response = await fetch(`/api/conversations/${conversation.id}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not delete conversation");
      const currentConversation = new URLSearchParams(window.location.search).get("conversation");
      if (currentConversation === conversation.id) router.push(`/app/bots/${conversation.bot_id}`);
      router.refresh();
      toast.success("Conversation deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete conversation");
    } finally {
      setConversationBusy(null);
    }
  }

  function handleHistoryScroll(event: UIEvent<HTMLDivElement>) {
    if (collapsed || !hasMoreConversations || loadingMoreConversations || !onLoadMoreConversations) return;
    const element = event.currentTarget;
    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (remaining < 160) onLoadMoreConversations();
  }

  return (
    <div className="liquid-glass-nav flex h-full min-h-0 flex-col overflow-hidden">
      <div className={cn("shrink-0", collapsed ? "flex h-16 items-center justify-center px-2" : "flex h-16 items-center justify-between px-3.5")}>
        {collapsed && onToggleCollapse && !onClose ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Expand sidebar"
            aria-expanded={false}
            title="Expand sidebar"
            className="relative grid size-10 place-items-center rounded-xl text-muted-foreground outline-none transition hover:bg-white/[.045] focus-visible:ring-2 focus-visible:ring-focus/35"
          >
            <span className="absolute inset-0 grid place-items-center transition-all duration-200 ease-out group-hover/sidebar:scale-90 group-hover/sidebar:opacity-0">
              <BrandMark priority className="size-8" />
            </span>
            <PanelLeftOpen className="absolute size-[19px] scale-90 opacity-0 transition-all duration-200 ease-out group-hover/sidebar:scale-100 group-hover/sidebar:opacity-100" />
          </button>
        ) : (
          <>
            <Link href="/app" onClick={onNavigate} aria-label="Citeral home">
              <BrandLockup priority markClassName="size-9" textClassName="text-[19px]" />
            </Link>
            {onClose ? (
              <button onClick={onClose} aria-label="Close navigation" className="grid size-9 place-items-center rounded-xl text-muted-foreground hover:bg-white/[.045] hover:text-foreground"><X className="size-[18px]" /></button>
            ) : onToggleCollapse ? (
              <button onClick={onToggleCollapse} aria-label="Collapse sidebar" aria-expanded={true} title="Collapse sidebar" className="grid size-9 place-items-center rounded-xl text-subtle-foreground hover:bg-white/[.045] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/35">
                <PanelLeftClose className="size-[18px]" />
              </button>
            ) : null}
          </>
        )}
      </div>

      <div onScroll={handleHistoryScroll} className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain pb-3 [scrollbar-gutter:stable]", collapsed ? "px-2" : "px-2.5")}>
        <nav className="space-y-0.5">
          <NavLink href="/app" active={pathname === "/app"} collapsed={collapsed} onNavigate={onNavigate} title={collapsed ? "Home" : undefined}>
            <Home className="size-[18px] shrink-0" />{!collapsed ? "Home" : null}
          </NavLink>
        </nav>

        <div className={cn("mt-3 border-t border-white/[.07] pt-3", collapsed && "mx-auto w-10")}>
          {!collapsed ? (
            <button
              type="button"
              onClick={() => setAssistantsOpen((current) => !current)}
              aria-expanded={assistantsOpen}
              className="mb-1 flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-[.12em] text-subtle-foreground hover:bg-white/[.03] hover:text-muted-foreground"
            >
              <span>Assistants</span>
              <ChevronDown className={cn("size-3.5 transition-transform duration-150", assistantsOpen && "rotate-180")} />
            </button>
          ) : null}

          {(collapsed || assistantsOpen) ? (
            <div className="space-y-0.5">
              {builtinPresets.map((preset) => {
                const existing = assistantsByType.get(preset.key);
                const href = existing ? `/app/bots/${existing.id}` : "/app";
                const active = Boolean(existing && pathname.startsWith(`/app/bots/${existing.id}`));
                return (
                  <NavLink key={preset.key} href={href} active={active} collapsed={collapsed} onNavigate={onNavigate} title={collapsed ? preset.name : undefined}>
                    <AssistantIcon type={preset.key} className="size-6 rounded-md border-0 bg-transparent text-[#a6b0bf]" />
                    {!collapsed ? <span className="min-w-0 flex-1 truncate">{preset.name}</span> : null}
                  </NavLink>
                );
              })}
              <NavLink href="/app/bots/new" active={pathname === "/app/bots/new"} collapsed={collapsed} onNavigate={onNavigate} title={collapsed ? "New custom assistant" : undefined}>
                <span className="grid size-6 shrink-0 place-items-center rounded-md text-[#9dbaf0]"><Plus className="size-[17px]" /></span>
                {!collapsed ? <span className="min-w-0 flex-1 truncate">New custom assistant</span> : null}
              </NavLink>
            </div>
          ) : null}
        </div>

        {!collapsed ? (
          <div className="mt-4 border-t border-white/[.07] pt-3">
            <div className="px-2.5 pb-1.5 text-[10px] font-medium uppercase tracking-[.12em] text-subtle-foreground">Recent chats</div>
            <div className="space-y-0.5">
              {activeConversations.length ? activeConversations.map((conversation) => (
                <ConversationRow key={conversation.id} conversation={conversation} archived={false} working={conversationBusy?.endsWith(`:${conversation.id}`) ?? false} onNavigate={onNavigate} onArchive={(item, next) => void setArchived(item, next)} onDelete={(item) => void deleteConversation(item)} />
              )) : <p className="px-2.5 py-2 text-xs leading-5 text-subtle-foreground">Your recent conversations will appear here.</p>}
            </div>

            {archivedConversations.length ? (
              <details className="group mt-3">
                <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl px-2.5 py-2 text-[11px] font-medium text-subtle-foreground hover:bg-white/[.035] hover:text-muted-foreground">
                  <span>Archived · {archivedConversations.length}</span><ChevronDown className="size-3.5 transition group-open:rotate-180" />
                </summary>
                <div className="mt-1 space-y-0.5">
                  {archivedConversations.map((conversation) => (
                    <ConversationRow key={conversation.id} conversation={conversation} archived working={conversationBusy?.endsWith(`:${conversation.id}`) ?? false} onNavigate={onNavigate} onArchive={(item, next) => void setArchived(item, next)} onDelete={(item) => void deleteConversation(item)} />
                  ))}
                </div>
              </details>
            ) : null}

            {hasMoreConversations ? (
              <button
                type="button"
                disabled={loadingMoreConversations}
                onClick={onLoadMoreConversations}
                className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-white/[.07] bg-white/[.025] text-[11px] text-muted-foreground hover:border-white/[.11] hover:bg-white/[.045] hover:text-foreground disabled:cursor-wait disabled:opacity-60"
              >
                {loadingMoreConversations ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
                {loadingMoreConversations ? "Loading…" : "Load older conversations"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className={cn("shrink-0 border-t border-white/[.07]", collapsed ? "px-2 py-2" : "p-2.5")}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-1">
            <div title={email || "Signed in"} className="mb-1 grid size-9 place-items-center rounded-full border border-white/[.08] bg-white/[.045] text-xs font-semibold text-[#dce1e7]">{(email?.[0] || "P").toUpperCase()}</div>
            <Link href="/app/settings" onClick={onNavigate} aria-label="Settings" title="Settings" className="grid size-10 place-items-center rounded-xl text-muted-foreground hover:bg-white/[.045] hover:text-foreground"><Settings className="size-[18px]" /></Link>
            <button onClick={signOut} disabled={signingOut} aria-label="Sign out" title="Sign out" className="grid size-10 place-items-center rounded-xl text-muted-foreground hover:bg-white/[.045] hover:text-foreground disabled:opacity-50"><LogOut className="size-[18px]" /></button>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl px-2 py-2">
            <div className="grid size-8 shrink-0 place-items-center rounded-full border border-white/[.08] bg-white/[.045] text-xs font-semibold text-[#dce1e7]">{(email?.[0] || "P").toUpperCase()}</div>
            <div className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{email || "Signed in"}</div>
            <Link href="/app/settings" onClick={onNavigate} aria-label="Settings" title="Settings" className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-white/[.045] hover:text-foreground"><Settings className="size-4" /></Link>
            <button onClick={signOut} disabled={signingOut} aria-label="Sign out" title="Sign out" className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-white/[.045] hover:text-foreground disabled:opacity-50"><LogOut className="size-4" /></button>
          </div>
        )}
      </div>
    </div>
  );
}

export function Sidebar({ assistants, conversations, hasMoreConversations = false, email }: { assistants: AssistantNavItem[]; conversations: ConversationNavItem[]; hasMoreConversations?: boolean; email?: string }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [conversationItems, setConversationItems] = useState(conversations);
  const [hasMore, setHasMore] = useState(hasMoreConversations);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setCollapsed(window.localStorage.getItem("citeral-sidebar-collapsed") === "1"));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setConversationItems(conversations);
      setHasMore(hasMoreConversations);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [conversations, hasMoreConversations]);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("citeral-sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  }

  function handleDesktopRailClick(event: MouseEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("a,button,input,textarea,select,summary,[role='button']")) return;
    toggleCollapsed();
  }

  async function loadMoreConversations() {
    if (loadingMore || !hasMore) return;
    const cursor = conversationItems[conversationItems.length - 1]?.last_message_at;
    if (!cursor) {
      setHasMore(false);
      return;
    }

    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ scope: "sidebar", limit: "20", cursor });
      const response = await fetch(`/api/conversations?${params.toString()}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({})) as { items?: SidebarConversationRow[]; hasMore?: boolean; error?: string };
      if (!response.ok) throw new Error(body.error || "Could not load older conversations");

      const names = new Map(assistants.map((assistant) => [assistant.id, assistant.name]));
      const loaded = (body.items ?? []).map((conversation) => ({
        ...conversation,
        bot_name: names.get(conversation.bot_id) ?? "Assistant",
      }));
      setConversationItems((current) => {
        const existing = new Set(current.map((conversation) => conversation.id));
        return [...current, ...loaded.filter((conversation) => !existing.has(conversation.id))];
      });
      setHasMore(Boolean(body.hasMore));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load older conversations");
    } finally {
      setLoadingMore(false);
    }
  }

  const widthClass = collapsed ? "w-[64px]" : "w-[260px]";

  return (
    <>
      <div aria-hidden="true" className={cn("hidden shrink-0 transition-[width] duration-200 ease-[cubic-bezier(.22,1,.36,1)] lg:block", widthClass)} />
      <aside
        onClick={handleDesktopRailClick}
        className={cn(
          "group/sidebar fixed inset-y-0 left-0 z-30 hidden overflow-hidden border-r border-white/[.07] cursor-ew-resize transition-[width] duration-200 ease-[cubic-bezier(.22,1,.36,1)] [&_a]:cursor-pointer [&_button]:cursor-pointer [&_summary]:cursor-pointer lg:block",
          widthClass,
        )}
      >
        <NavigationContent
          assistants={assistants}
          conversations={conversationItems}
          email={email}
          collapsed={collapsed}
          hasMoreConversations={hasMore}
          loadingMoreConversations={loadingMore}
          onLoadMoreConversations={() => void loadMoreConversations()}
          onToggleCollapse={toggleCollapsed}
        />
      </aside>

      <div aria-hidden="true" className="h-14 lg:hidden" />
      <header className="liquid-glass-nav fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-white/[.07] px-3 lg:hidden">
        <button onClick={() => setOpen(true)} aria-label="Open navigation" className="grid size-10 place-items-center rounded-xl text-muted-foreground hover:bg-white/[.045] hover:text-foreground"><Menu className="size-5" /></button>
        <Link href="/app" aria-label="Citeral home"><BrandLockup markClassName="size-8" textClassName="text-[17px]" /></Link>
        <Link href="/app/bots/new" aria-label="New custom assistant" className="grid size-10 place-items-center rounded-xl text-muted-foreground hover:bg-white/[.045] hover:text-foreground"><Plus className="size-5" /></Link>
      </header>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button aria-label="Close navigation" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/55 backdrop-blur-[3px]" />
          <aside className="absolute inset-y-0 left-0 w-[min(92vw,320px)] overflow-hidden border-r border-white/[.08] shadow-2xl shadow-black/40">
            <NavigationContent
              assistants={assistants}
              conversations={conversationItems}
              email={email}
              hasMoreConversations={hasMore}
              loadingMoreConversations={loadingMore}
              onLoadMoreConversations={() => void loadMoreConversations()}
              onNavigate={() => setOpen(false)}
              onClose={() => setOpen(false)}
            />
          </aside>
        </div>
      ) : null}
    </>
  );
}
