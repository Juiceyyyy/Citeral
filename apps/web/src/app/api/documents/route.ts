import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { resolveUploadScope } from "@/lib/knowledge/scopes";
import { isTrustedMutation } from "@/lib/security/request";
import { assertRateAvailable } from "@/lib/security/rate-limit";

const schema = z.object({
  scope: z.enum(["assistant", "global", "conversation"]).default("assistant"),
  botId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
  knowledgeBaseId: z.string().uuid(),
  reservationId: z.string().uuid(),
  path: z.string().min(10).max(700),
  filename: z.string().min(1).max(240),
  mimeType: z.string().max(160),
  size: z.number().int().positive().max(50 * 1024 * 1024),
});

export async function GET() {
  const { supabase, userId } = await requireApiUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await supabase
    .from("documents")
    .select("id,title,status,mime_type,byte_size,raw_storage_bytes,processed_byte_size,chunk_count,created_at,knowledge_bases(name),document_versions(version_number,status,error_message,processed_at)")
    .eq("owner_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  return error
    ? NextResponse.json({ error: error.message }, { status: 400 })
    : NextResponse.json(data ?? [], { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request) {
  if (!isTrustedMutation(req)) return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 });
  const { supabase, userId } = await requireApiUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { await assertRateAvailable(supabase, "upload_finalize", 20, 60); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Too many requests" }, { status: 429 }); }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid document metadata" }, { status: 400 });
  const input = parsed.data;

  try {
    const resolved = await resolveUploadScope({
      supabase,
      userId,
      scope: input.scope,
      botId: input.botId,
      conversationId: input.conversationId,
    });
    if (resolved.knowledgeBaseId !== input.knowledgeBaseId) {
      return NextResponse.json({ error: "Knowledge base mismatch" }, { status: 403 });
    }
    if (!input.path.startsWith(resolved.storagePrefix)) {
      return NextResponse.json({ error: "Invalid storage path" }, { status: 403 });
    }

    const cleanupFile = async () => { await supabase.storage.from("documents").remove([input.path]); };
    const { data: claimed, error: claimError } = await supabase.rpc("claim_knowledge_upload_reservation", {
      p_reservation_id: input.reservationId,
      p_bytes: input.size,
      p_storage_path: input.path,
    });
    if (claimError || claimed !== true) {
      await cleanupFile();
      return NextResponse.json({ error: claimError?.message || "Upload reservation expired or was already used" }, { status: 409 });
    }

    const { data: document, error } = await supabase
      .from("documents")
      .insert({
        organization_id: resolved.organizationId,
        owner_user_id: userId,
        knowledge_base_id: input.knowledgeBaseId,
        title: input.filename,
        mime_type: input.mimeType,
        byte_size: input.size,
        raw_storage_bytes: input.size,
        status: "queued",
        metadata: { scope: input.scope, conversation_id: input.conversationId || null },
      })
      .select("id")
      .single();
    if (error || !document) {
      await cleanupFile();
      return NextResponse.json({ error: error?.message || "Could not create document" }, { status: 400 });
    }

    const rollback = async () => {
      await supabase.from("documents").delete().eq("id", document.id);
      await cleanupFile();
    };

    const { error: membershipError } = await supabase.from("knowledge_base_documents").insert({
      knowledge_base_id: input.knowledgeBaseId,
      document_id: document.id,
      priority: input.scope === "global" ? 95 : 50,
    });
    if (membershipError) {
      await rollback();
      return NextResponse.json({ error: membershipError.message }, { status: 400 });
    }

    if (input.scope === "conversation") {
      if (!input.conversationId) {
        await rollback();
        return NextResponse.json({ error: "Conversation is required" }, { status: 400 });
      }
      const { error: conversationError } = await supabase.from("conversation_documents").insert({
        conversation_id: input.conversationId,
        document_id: document.id,
      });
      if (conversationError) {
        await rollback();
        return NextResponse.json({ error: conversationError.message }, { status: 400 });
      }
    }

    const { data: version, error: versionError } = await supabase
      .from("document_versions")
      .insert({ document_id: document.id, version_number: 1, storage_path: input.path, status: "queued" })
      .select("id")
      .single();
    if (versionError || !version) {
      await rollback();
      return NextResponse.json({ error: versionError?.message || "Could not create document version" }, { status: 400 });
    }

    const { error: jobError } = await supabase
      .from("ingestion_jobs")
      .insert({ organization_id: resolved.organizationId, document_version_id: version.id, job_type: "document_ingest", status: "queued" });
    if (jobError) {
      await rollback();
      return NextResponse.json({ error: jobError.message }, { status: 400 });
    }
    return NextResponse.json({ id: document.id, status: "queued" }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not queue document" }, { status: 400 });
  }
}
