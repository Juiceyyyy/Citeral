import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { Globe2, Info, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { ensureBuiltinAssistantKnowledge } from "@/lib/bots/ensure-builtins";
import { COUNTRIES, countryLabel } from "@/lib/geo/countries";
import { PageHeader, PageShell, Surface, SectionHeading } from "@/components/app/page-shell";
import { GlobalDocumentUpload } from "@/components/knowledge/global-document-upload";
import { AccountActions } from "@/components/account/account-actions";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

function inferredDomain(slug: string, domains: string[] | null) {
  if (domains?.length) return domains.join(", ");
  return slug.split("-")[0]?.replaceAll("_", " ") || "general";
}

export default async function SettingsPage() {
  const { supabase, userId, claims } = await requireUser();
  const [{ data: profile }, requestHeaders] = await Promise.all([
    supabase.from("profiles").select("display_name,default_country,default_region,global_instructions,global_knowledge_base_id").eq("id", userId).maybeSingle(),
    headers(),
  ]);
  const ipCountry = requestHeaders.get("x-vercel-ip-country");
  const ipRegion = requestHeaders.get("x-vercel-ip-country-region");
  const suggestedCountry = countryLabel(ipCountry) || "";
  const selectedCountry = profile?.default_country || suggestedCountry;

  const [{ data: coverage }, { count: globalDocumentCount }] = await Promise.all([
    selectedCountry
      ? supabase.from("knowledge_bases").select("id,name,slug,domains,coverage_status,jurisdiction_region").eq("visibility", "public").ilike("jurisdiction_country", selectedCountry).order("name")
      : Promise.resolve({ data: [] }),
    profile?.global_knowledge_base_id
      ? supabase.from("knowledge_base_documents").select("document_id", { count: "exact", head: true }).eq("knowledge_base_id", profile.global_knowledge_base_id)
      : Promise.resolve({ count: 0 }),
  ]);

  async function save(formData: FormData) {
    "use server";
    const { supabase, userId } = await requireUser();
    const country = String(formData.get("country") || "").slice(0, 80) || null;
    const region = String(formData.get("region") || "").slice(0, 100) || null;
    const { error } = await supabase.from("profiles").update({
      display_name: String(formData.get("displayName") || "").slice(0, 120) || null,
      default_country: country,
      default_region: region,
      global_instructions: String(formData.get("globalInstructions") || "").slice(0, 12_000),
      updated_at: new Date().toISOString(),
    }).eq("id", userId);
    if (error) throw new Error(error.message);
    await ensureBuiltinAssistantKnowledge({ supabase, userId, jurisdiction: { country, region } });
    revalidatePath("/app", "layout"); revalidatePath("/app/settings");
  }

  return (
    <PageShell className="max-w-4xl">
      <PageHeader eyebrow="Account" title="Settings" description="Set the defaults that apply across your workspace. Individual specialist assistants can still override location when needed." />

      <form action={save} className="mt-7 space-y-4">
        <Surface className="overflow-hidden">
          <div className="border-b border-border p-5 sm:p-6"><SectionHeading title="Profile & jurisdiction" description="Your saved location controls which curated packs location-aware built-ins follow. Legal and tax jurisdiction is never applied silently." /></div>
          <div className="space-y-5 p-5 sm:p-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <div><label className="field-label" htmlFor="display-name">Display name</label><Input id="display-name" name="displayName" defaultValue={profile?.display_name || ""} /></div>
              <div><label className="field-label" htmlFor="account-email">Email</label><Input id="account-email" value={String(claims.email || "")} disabled /></div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div><label className="field-label" htmlFor="default-country">Default country / jurisdiction</label><Select id="default-country" name="country" defaultValue={selectedCountry}><option value="">Select country</option>{COUNTRIES.map((country) => <option key={country.code} value={country.name}>{country.name}</option>)}</Select></div>
              <div><label className="field-label" htmlFor="default-region">Default state / region</label><Input id="default-region" name="region" defaultValue={profile?.default_region || ipRegion || ""} placeholder="Optional" /></div>
            </div>
            {!profile?.default_country && suggestedCountry ? (
              <div className="flex gap-3 rounded-lg border border-border bg-surface-soft p-3 text-xs leading-5 text-muted-foreground"><Info className="mt-0.5 size-4 shrink-0 text-subtle-foreground" /><span>Suggested from coarse request location: {suggestedCountry}{ipRegion ? ` / ${ipRegion}` : ""}. Nothing is stored or applied to an assistant until you save.</span></div>
            ) : null}
          </div>

          <div className="border-t border-border p-5 sm:p-6">
            <div className="flex items-start gap-3"><Globe2 className="mt-0.5 size-4 shrink-0 text-subtle-foreground" /><div className="min-w-0 flex-1"><div className="text-sm font-medium text-foreground">Curated coverage for {selectedCountry || "selected country"}</div><p className="mt-1 text-xs leading-5 text-muted-foreground">Countries without an indexed pack remain selectable, but are treated as not yet curated rather than silently supported.</p><div className="mt-3 flex flex-wrap gap-1.5">{(coverage ?? []).length ? (coverage ?? []).map((pack) => <span key={pack.id} className="rounded-md border border-border bg-surface-raised px-2 py-1 text-[10px] text-muted-foreground">{inferredDomain(pack.slug || pack.name, pack.domains)} · {pack.coverage_status || "active"}{pack.jurisdiction_region ? ` · ${pack.jurisdiction_region}` : ""}</span>) : <span className="text-xs text-subtle-foreground">No curated specialist packs indexed yet.</span>}</div></div></div>
          </div>
        </Surface>

        <Surface className="overflow-hidden">
          <div className="border-b border-border p-5 sm:p-6"><SectionHeading title="Global instructions" description="Inherited by every existing and future assistant as personal response preferences." /></div>
          <div className="p-5 sm:p-6">
            <div className="mb-4 flex gap-3 rounded-lg border border-amber-300/15 bg-amber-300/[.035] p-3 text-xs leading-5 text-[#b7ad91]"><Info className="mt-0.5 size-4 shrink-0" /><span>These preferences can shape style and defaults, but cannot override platform safety, domain safeguards, source-grounding rules or jurisdiction requirements.</span></div>
            <Textarea name="globalInstructions" defaultValue={profile?.global_instructions || ""} rows={7} maxLength={12_000} placeholder="Example: Prefer concise answers. Use INR by default. Show calculations and distinguish facts from assumptions." className="min-h-40" />
          </div>
          <div className="flex justify-end border-t border-border bg-surface-soft p-4 sm:px-6"><Button type="submit">Save settings</Button></div>
        </Surface>
      </form>

      <Surface className="mt-4 overflow-hidden">
        <div className="border-b border-border p-5 sm:p-6"><SectionHeading title="Global knowledge" description="Documents added here are indexed once and become retrievable by all of your assistants." aside={<span className="text-xs text-subtle-foreground">{globalDocumentCount ?? 0} document{globalDocumentCount === 1 ? "" : "s"}</span>} /></div>
        <div className="p-5 sm:p-6"><div className="mb-4 flex gap-3 rounded-lg border border-border bg-surface-soft p-3 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-subtle-foreground" /><span>Only place information here when you intentionally want it available across every assistant. Use an assistant Knowledge scope or a chat attachment for narrower access.</span></div><GlobalDocumentUpload /></div>
      </Surface>

      <Surface className="mt-4 overflow-hidden">
        <div className="border-b border-border p-5 sm:p-6"><SectionHeading title="Account data" description="Download a portable copy of your Citeral data or permanently delete your account and private workspace data." /></div>
        <div className="p-5 sm:p-6"><AccountActions /></div>
      </Surface>

      <div className="mt-4 border-t border-border px-1 pt-5"><h2 className="text-sm font-medium text-foreground">Privacy defaults</h2><p className="mt-2 max-w-3xl text-xs leading-5 text-muted-foreground">Assistant uploads stay assistant-scoped, global uploads are inherited by your assistants, and chat attachments remain limited to the conversation where they were attached. Retrieved document text is treated as evidence, never as executable instruction.</p></div>
    </PageShell>
  );
}
