"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { AuthShell } from "@/components/auth/auth-shell";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) { setError(authError.message); setLoading(false); return; }
    router.push("/app");
    router.refresh();
  }

  return (
    <AuthShell title="Welcome back" description="Sign in to continue to your assistants, documents and conversations.">
      <OAuthButtons />
      <form className="space-y-4" onSubmit={submit}>
        <div><label className="field-label" htmlFor="email">Email</label><Input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="h-11" /></div>
        <div>
          <div className="mb-1.5 flex items-center justify-between"><label className="text-xs font-medium text-[#b7bcc5]" htmlFor="password">Password</label><Link href="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground">Forgot password?</Link></div>
          <Input id="password" type="password" autoComplete="current-password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} className="h-11" />
        </div>
        {error ? <p role="alert" className="rounded-lg border border-red-500/20 bg-red-500/[.06] px-3 py-2 text-xs leading-5 text-red-200">{error}</p> : null}
        <Button className="h-11 w-full" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">New to Citeral? <Link className="font-medium text-foreground hover:text-[#c7d9ff]" href="/signup">Create a workspace</Link></p>
    </AuthShell>
  );
}
