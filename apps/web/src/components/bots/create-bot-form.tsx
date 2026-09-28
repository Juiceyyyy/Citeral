"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BOT_PRESETS } from "@/lib/bots/presets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Surface, SectionHeading } from "@/components/app/page-shell";

const CUSTOM = BOT_PRESETS.custom;

export function CreateBotForm() {
  const router = useRouter();
  const [name, setName] = useState(CUSTOM.name);
  const [description, setDescription] = useState(CUSTOM.description);
  const [instructions, setInstructions] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    const response = await fetch("/api/bots", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, description, instructions, botType: "custom", country: null, region: null }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { toast.error(body.error || "Could not create assistant"); setLoading(false); return; }
    router.push(`/app/bots/${body.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl">
      <Surface className="overflow-hidden">
        <div className="border-b border-border p-5 sm:p-6">
          <SectionHeading title="Assistant identity" description="Keep the role clear and specific. You can change any of these settings later." />
        </div>
        <div className="space-y-5 p-5 sm:p-6">
          <div><label className="field-label" htmlFor="assistant-name">Assistant name</label><Input id="assistant-name" value={name} maxLength={80} required onChange={(event) => setName(event.target.value)} /></div>
          <div><label className="field-label" htmlFor="assistant-description">Description</label><Textarea id="assistant-description" value={description} maxLength={500} onChange={(event) => setDescription(event.target.value)} /></div>
        </div>

        <div className="border-t border-border p-5 sm:p-6">
          <SectionHeading title="Instructions" description="Describe the role, terminology, workflow and preferred output style." />
          <Textarea value={instructions} maxLength={8000} placeholder="Example: Act as a research assistant for technical due diligence. Prefer concise summaries, call out uncertainty, and separate source-backed facts from assumptions…" onChange={(event) => setInstructions(event.target.value)} className="mt-4 min-h-44" />
          <p className="helper-text mt-2">Instructions shape responses but cannot override workspace security, source permissions or platform safety rules.</p>
        </div>

        <div className="border-t border-border p-5 sm:p-6">
          <SectionHeading title="Web search" description="Every conversation includes a Web button next to attachments. It starts off by default and can be enabled for any message that needs fresh external information." />
        </div>

        <div className="flex justify-end border-t border-border bg-surface-soft p-4 sm:px-6">
          <Button size="lg" disabled={loading}>{loading ? "Creating…" : "Create assistant"}</Button>
        </div>
      </Surface>
    </form>
  );
}
