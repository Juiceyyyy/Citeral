import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { resolveUploadScope } from "@/lib/knowledge/scopes";
import { isTrustedMutation } from "@/lib/security/request";
import { assertRateAvailable } from "@/lib/security/rate-limit";

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const allowed = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/html",
  "image/png",
  "image/jpeg",
]);
const schema = z.object({
  scope: z.enum(["assistant", "global", "conversation"]).default("assistant"),
  botId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
  filename: z.string().min(1).max(240),
  mimeType: z.string().max(160),
  size: z.number().int().positive().max(MAX_FILE_BYTES),
});

function clean(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(-180) || "document";
}

export async function POST(req: Request) {
  try {
    if (!isTrustedMutation(req)) return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 });
    const { supabase, userId } = await requireApiUser();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await assertRateAvailable(supabase, "upload_prepare", 20, 60);
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid upload request or file exceeds 50 MB" }, { status: 400 });
    if (!allowed.has(parsed.data.mimeType)) return NextResponse.json({ error: "Unsupported file type" }, { status: 415 });

    const resolved = await resolveUploadScope({
      supabase,
      userId,
      scope: parsed.data.scope,
      botId: parsed.data.botId,
      conversationId: parsed.data.conversationId,
    });
    const path = `${resolved.storagePrefix}${crypto.randomUUID()}-${clean(parsed.data.filename)}`;

    const { data: reservationId, error: reservationError } = await supabase.rpc("reserve_knowledge_upload", {
      p_bytes: parsed.data.size,
      p_storage_path: path,
    });
    if (reservationError || !reservationId) {
      return NextResponse.json({ error: reservationError?.message || "Knowledge storage quota reached" }, { status: 409 });
    }

    const { data, error } = await supabase.storage.from("documents").createSignedUploadUrl(path);
    if (error || !data) return NextResponse.json({ error: error?.message || "Could not create upload URL" }, { status: 400 });
    return NextResponse.json({
      path,
      token: data.token,
      reservationId,
      knowledgeBaseId: resolved.knowledgeBaseId,
      scope: parsed.data.scope,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not prepare upload";
    const status = message.includes("Too many requests") ? 429 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
