import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return NextResponse.json(
      { status: "degraded", services: { web: "ok", auth: "misconfigured" } },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const response = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: key },
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
    });
    const healthy = response.ok;
    return NextResponse.json(
      {
        status: healthy ? "ok" : "degraded",
        services: { web: "ok", auth: healthy ? "ok" : `http_${response.status}` },
        latency_ms: Date.now() - startedAt,
        checked_at: new Date().toISOString(),
      },
      { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        status: "degraded",
        services: { web: "ok", auth: "unreachable" },
        latency_ms: Date.now() - startedAt,
        checked_at: new Date().toISOString(),
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
