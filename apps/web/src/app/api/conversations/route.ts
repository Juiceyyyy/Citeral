import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { isTrustedMutation } from "@/lib/security/request";
import { assertRateAvailable } from "@/lib/security/rate-limit";

const createSchema = z.object({ botId: z.string().uuid() });
const sidebarLimitSchema = z.coerce.number().int().min(1).max(50).catch(20);

export async function GET(req: Request) {
  const { supabase, userId } = await requireApiUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const scope = url.searchParams.get("scope");

  if (scope === "sidebar") {
    const limit = sidebarLimitSchema.parse(url.searchParams.get("limit") ?? "20");
    const cursor = url.searchParams.get("cursor");
    if (cursor && Number.isNaN(Date.parse(cursor))) {
      return NextResponse.json({ error: "Invalid conversation cursor" }, { status: 400 });
    }

    let query = supabase
      .from("conversations")
      .select("id,title,last_message_at,archived_at,bot_id")
      .eq("owner_user_id", userId)
      .not("last_message_at", "is", null)
      .order("last_message_at", { ascending: false })
      .limit(limit + 1);

    if (cursor) query = query.lt("last_message_at", cursor);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const rows = data ?? [];
    return NextResponse.json({
      items: rows.slice(0, limit),
      hasMore: rows.length > limit,
    });
  }

  const botId = url.searchParams.get("botId");
  if (!botId || !z.string().uuid().safeParse(botId).success) {
    return NextResponse.json({ error: "Valid botId is required" }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("conversations")
    .select("id,title,updated_at,last_message_at")
    .eq("bot_id", botId)
    .eq("owner_user_id", userId)
    .is("archived_at", null)
    .not("last_message_at", "is", null)
    .order("last_message_at", { ascending: false })
    .limit(100);
  return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  if (!isTrustedMutation(req)) return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 });
  const { supabase, userId } = await requireApiUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { await assertRateAvailable(supabase, "conversation_create", 30, 60); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Too many requests" }, { status: 429 }); }
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid conversation request" }, { status: 400 });

  const { data: bot } = await supabase
    .from("bots")
    .select("id,organization_id")
    .eq("id", parsed.data.botId)
    .maybeSingle();
  if (!bot) return NextResponse.json({ error: "Assistant not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("conversations")
    .insert({ organization_id: bot.organization_id, bot_id: bot.id, owner_user_id: userId, title: "New conversation" })
    .select("id,title,updated_at,last_message_at")
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message || "Could not create conversation" }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
