"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { RotateCcw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Surface, SectionHeading } from "@/components/app/page-shell";
import { BOT_PRESETS, isPresetKey } from "@/lib/bots/presets";
import { COUNTRIES } from "@/lib/geo/countries";

export type EditableBot = {
  id: string; name: string; description: string | null; instructions: string | null; bot_type: string;
  jurisdiction_country: string | null; jurisdiction_region: string | null; web_enabled: boolean; is_builtin: boolean;
  preset_version: string | null; follow_profile_jurisdiction?: boolean | null;
};

type PublicPackOption = { id: string; name: string; slug: string | null; domains: string[]; coverageStatus: string; country: string | null; region: string | null };

export function BotSettingsForm({ bot, publicPacks = [], linkedPackIds = [] }: { bot: EditableBot; publicPacks?: PublicPackOption[]; linkedPackIds?: string[] }) {
  const router = useRouter();
  const [name, setName] = useState(bot.name);
  const [description, setDescription] = useState(bot.description || "");
  const [instructions, setInstructions] = useState(bot.instructions || "");
  const [country, setCountry] = useState(bot.jurisdiction_country || "");
  const [region, setRegion] = useState(bot.jurisdiction_region || "");
  const [followGlobal, setFollowGlobal] = useState(Boolean(bot.follow_profile_jurisdiction));
  const [selectedPackIds, setSelectedPackIds] = useState(() => new Set(linkedPackIds));
  const [packQuery, setPackQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const requiresJurisdiction = bot.bot_type === "legal" || bot.bot_type === "accounting";
  const locationAware = requiresJurisdiction || bot.bot_type === "health";
  const isCustom = bot.bot_type === "custom";
  const canFollowGlobal = bot.is_builtin && locationAware;

  const filteredPacks = useMemo(() => {
    const needle = packQuery.trim().toLocaleLowerCase();
    if (!needle) return publicPacks;
    return publicPacks.filter((pack) => [pack.name, pack.slug || "", pack.country || "", pack.region || "", ...pack.domains].join(" ").toLocaleLowerCase().includes(needle));
  }, [packQuery, publicPacks]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/bots/${bot.id}`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name, description, instructions,
          country: locationAware && !followGlobal ? country || null : undefined,
          region: locationAware && !followGlobal ? region || null : undefined,
          followGlobalJurisdiction: canFollowGlobal ? followGlobal : undefined,
          packIds: isCustom ? [...selectedPackIds] : undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not save assistant");
      toast.success("Assistant settings saved");
      router.refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save assistant"); }
    finally { setSaving(false); }
  }

  function restorePreset() {
    if (!bot.is_builtin || !isPresetKey(bot.bot_type)) return;
    const preset = BOT_PRESETS[bot.bot_type];
    setName(preset.name); setDescription(preset.description); setInstructions("");
    toast.message("Preset defaults restored in the form. Jurisdiction preferences are unchanged.");
  }

  function togglePack(id: string) {
    setSelectedPackIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  async function remove() {
    if (!window.confirm(`Delete ${bot.name}? This also deletes its private uploaded knowledge and conversation history.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/bots/${bot.id}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not delete assistant");
      toast.success("Assistant deleted");
      router.push("/app/bots"); router.refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not delete assistant"); setDeleting(false); }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      {bot.is_builtin ? (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface-soft p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2"><span className="text-xs font-medium text-[#cbd2dc]">Built-in preset</span>{bot.preset_version ? <span className="text-[10px] text-subtle-foreground">v{bot.preset_version}</span> : null}</div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Your changes layer on top of Provenance’s specialist role and safeguards.</p>
          </div>
          <Button type="button" size="sm" variant="secondary" onClick={restorePreset}><RotateCcw className="size-3.5" />Restore defaults</Button>
        </div>
      ) : null}

      <Surface className="overflow-hidden">
        <div className="border-b border-border p-5 sm:p-6"><SectionHeading title="Profile" description="Name the assistant and describe what it should be used for." /></div>
        <div className="space-y-5 p-5 sm:p-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <div><label className="field-label" htmlFor="bot-name">Name</label><Input id="bot-name" required minLength={2} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></div>
            <div><label className="field-label" htmlFor="bot-type">Type</label><Input id="bot-type" value={bot.bot_type} disabled /></div>
          </div>
          <div><label className="field-label" htmlFor="bot-description">Description</label><Textarea id="bot-description" maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} /></div>
        </div>

        <div className="border-t border-border p-5 sm:p-6">
          <SectionHeading title={bot.is_builtin ? "Additional instructions" : "Instructions"} description="Add preferences for format, terminology and workflow. Core security and safety rules always remain in force." />
          <Textarea className="mt-4 min-h-40" maxLength={8000} value={instructions} onChange={(event) => setInstructions(event.target.value)} />
        </div>

        {locationAware ? (
          <div className="border-t border-border p-5 sm:p-6">
            <SectionHeading title="Location & jurisdiction" description={requiresJurisdiction ? "Legal and accounting specialists require an explicit jurisdiction." : "Use local guidance when relevant to health information."} />
            {canFollowGlobal ? (
              <label className="mt-4 flex cursor-pointer items-center justify-between gap-4 border-b border-border pb-4">
                <span><span className="block text-sm font-medium">Follow global jurisdiction</span><span className="mt-1 block text-xs text-muted-foreground">Stay synced to the country and region saved in Settings.</span></span>
                <Switch checked={followGlobal} onCheckedChange={setFollowGlobal} />
              </label>
            ) : null}
            <div className={`mt-4 grid gap-5 sm:grid-cols-2 ${followGlobal ? "opacity-45" : ""}`}>
              <div><label className="field-label" htmlFor="bot-country">{requiresJurisdiction ? "Country / jurisdiction" : "Local guidance country"}</label><Select id="bot-country" required={requiresJurisdiction && !followGlobal} value={country} disabled={followGlobal} onChange={(event) => setCountry(event.target.value)}><option value="">{requiresJurisdiction ? "Select country" : "No local guidance country"}</option>{COUNTRIES.map((item) => <option key={item.code} value={item.name}>{item.name}</option>)}</Select></div>
              <div><label className="field-label" htmlFor="bot-region">State / region</label><Input id="bot-region" value={region} disabled={followGlobal} onChange={(event) => setRegion(event.target.value)} placeholder="Optional" /></div>
            </div>
          </div>
        ) : null}

        {isCustom ? (
          <div className="border-t border-border p-5 sm:p-6">
            <SectionHeading title="Shared knowledge packs" description="Reference curated public packs without duplicating their files or embeddings into your workspace." aside={<span className="text-xs text-subtle-foreground">{selectedPackIds.size} selected</span>} />
            <div className="relative mt-4"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" /><Input value={packQuery} onChange={(event) => setPackQuery(event.target.value)} placeholder="Search country, domain or pack" className="pl-9" /></div>
            <div className="mt-3 max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {filteredPacks.length ? filteredPacks.map((pack) => (
                <label key={pack.id} className="flex cursor-pointer items-start gap-3 px-3 py-3 transition hover:bg-white/[.025]">
                  <input type="checkbox" checked={selectedPackIds.has(pack.id)} onChange={() => togglePack(pack.id)} className="mt-0.5 size-4 accent-[#4f8cff]" />
                  <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium text-[#d7dce3]">{pack.name}</span><span className="mt-0.5 block text-[10px] leading-4 text-subtle-foreground">{pack.country || "International / global"}{pack.region ? ` · ${pack.region}` : ""} · {pack.domains.join(", ") || "general"} · {pack.coverageStatus}</span></span>
                </label>
              )) : <p className="px-3 py-5 text-center text-xs text-subtle-foreground">No matching indexed packs.</p>}
            </div>
          </div>
        ) : null}

        <div className="border-t border-border bg-surface-soft px-5 py-4 sm:px-6">
          <p className="text-xs leading-5 text-muted-foreground">Live web search is available directly in every conversation from the Web button beside the attachment control. It is off by default for each chat.</p>
        </div>

        <div className="flex justify-end border-t border-border bg-surface-soft p-4 sm:px-6"><Button disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button></div>
      </Surface>

      {!bot.is_builtin ? (
        <section className="rounded-xl border border-red-500/20 bg-red-500/[.035] p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-medium text-red-100">Delete assistant</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-[#9f898d]">Deletes this assistant’s conversation history and private knowledge base. Shared curated packs are unaffected.</p></div><Button type="button" variant="danger" onClick={remove} disabled={deleting}><Trash2 className="size-4" />{deleting ? "Deleting…" : "Delete assistant"}</Button></div>
        </section>
      ) : null}
    </form>
  );
}
