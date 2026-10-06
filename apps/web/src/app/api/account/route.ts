import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertRateAvailable } from "@/lib/security/rate-limit";
import { isTrustedMutation } from "@/lib/security/request";

const bodySchema = z.object({ confirmation: z.literal("DELETE") });

function chunks<T>(items: T[], size: number) {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size));
  return output;
}

export async function DELETE(req: Request) {
  try {
    if (!isTrustedMutation(req)) return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 });

    const { supabase, userId } = await requireApiUser();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await assertRateAvailable(supabase, "account_delete", 3, 3600);

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Type "DELETE" to confirm account deletion.' }, { status: 400 });

    const { data: currentUser, error: userError } = await supabase.auth.getUser();
    if (userError || currentUser.user?.id !== userId) {
      return NextResponse.json({ error: "Your session could not be revalidated. Sign in again before deleting the account." }, { status: 401 });
    }

    const { data: storageRows, error: storageListError } = await supabase.rpc("list_own_document_storage_paths");
    if (storageListError) throw new Error(storageListError.message);
    const paths: string[] = ((storageRows ?? []) as Array<{ path: string | null }>)
      .map((row) => row.path)
      .filter((path): path is string => typeof path === "string" && path.length > 0);

    const admin = createAdminClient();

    for (const batch of chunks(paths, 100)) {
      const { error } = await admin.storage.from("documents").remove(batch);
      if (error) throw new Error(`Could not remove private storage objects: ${error.message}`);
    }

    const cleanupResults = await Promise.all([
      admin.from("usage_events").delete().eq("user_id", userId),
      admin.from("documents").delete().eq("owner_user_id", userId),
      admin.from("knowledge_bases").delete().eq("owner_user_id", userId),
    ]);
    const cleanupError = cleanupResults.find((result) => result.error)?.error;
    if (cleanupError) throw new Error(cleanupError.message);

    const { data: memberships, error: membershipsError } = await admin
      .from("organization_members")
      .select("organization_id,role")
      .eq("user_id", userId);
    if (membershipsError) throw new Error(membershipsError.message);

    for (const membership of memberships ?? []) {
      if (membership.role !== "owner") continue;
      const { count, error: countError } = await admin
        .from("organization_members")
        .select("user_id", { count: "exact", head: true })
        .eq("organization_id", membership.organization_id);
      if (countError) throw new Error(countError.message);
      if (count === 1) {
        const { error } = await admin.from("organizations").delete().eq("id", membership.organization_id);
        if (error) throw new Error(error.message);
      }
    }

    const { error: signOutError } = await supabase.auth.signOut({ scope: "global" });
    if (signOutError) throw new Error(`Could not revoke account sessions: ${signOutError.message}`);

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId, false);
    if (deleteError) throw new Error(deleteError.message);

    return NextResponse.json(
      { ok: true },
      {
        headers: {
          "Cache-Control": "no-store",
          "Clear-Site-Data": '"cache", "cookies", "storage"',
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not delete account";
    const status = message.includes("Too many requests") ? 429 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
