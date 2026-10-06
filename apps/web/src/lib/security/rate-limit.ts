import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function assertRateAvailable(
  supabase: SupabaseClient,
  bucket: string,
  limit: number,
  windowSeconds: number,
) {
  const { error } = await supabase.rpc("reserve_request_rate", {
    p_bucket: bucket,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (!error) return;

  const message = error.message || "Request rate limit failed";
  if (message.includes("Too many requests")) {
    throw new Error("Too many requests. Please try again shortly.");
  }
  throw new Error(message);
}
