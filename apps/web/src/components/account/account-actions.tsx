"use client";

import { useState } from "react";
import { Download, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AccountActions() {
  const [showDelete, setShowDelete] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);

  async function deleteAccount() {
    if (confirmation !== "DELETE" || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmation }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not delete account");
      window.location.replace("/");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete account");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-soft p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-medium text-foreground">Export your data</div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Download your profile, assistants, private knowledge metadata and extracted text, conversations, portfolios, and usage records as JSON.</p>
        </div>
        <a
          href="/api/account/export"
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-surface-raised px-3 text-xs font-medium text-foreground transition hover:border-border-strong hover:bg-muted"
        >
          <Download className="size-3.5" />
          Export JSON
        </a>
      </div>

      <div className="rounded-xl border border-red-500/20 bg-red-500/[.025] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-sm font-medium text-red-100">Delete account</div>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-red-100/60">Permanently removes your Citeral account, private workspace data, conversations, portfolios, private knowledge and stored uploads. This cannot be undone.</p>
          </div>
          {!showDelete ? (
            <Button type="button" variant="danger" size="sm" onClick={() => setShowDelete(true)}>
              <Trash2 className="size-3.5" />
              Delete account
            </Button>
          ) : null}
        </div>

        {showDelete ? (
          <div className="mt-4 border-t border-red-500/15 pt-4">
            <label className="field-label text-red-100/80" htmlFor="delete-confirmation">Type DELETE to confirm</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="delete-confirmation"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder="DELETE"
                className="sm:max-w-52"
              />
              <Button type="button" variant="danger" disabled={confirmation !== "DELETE" || busy} onClick={() => void deleteAccount()}>
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                {busy ? "Deleting…" : "Permanently delete"}
              </Button>
              <Button type="button" variant="ghost" disabled={busy} onClick={() => { setShowDelete(false); setConfirmation(""); }}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
