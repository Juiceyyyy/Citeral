"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/components/auth/auth-shell";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");
    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });

    if (resetError) {
      setError(resetError.message);
      setLoading(false);
      return;
    }

    setSent(true);
    setMessage("If an account exists for that email, a secure password-reset link has been sent.");
    setLoading(false);
  }

  return (
    <AuthShell compact title="Reset your password" description="Enter your account email and we’ll send a secure, single-use reset link.">
      <form className="space-y-4" onSubmit={submit}>
        <div>
          <label className="field-label" htmlFor="email">Email</label>
          <Input id="email" className="h-11" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </div>
        {message ? <p role="status" className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs leading-5 text-[#c6cbd2]">{message}</p> : null}
        {error ? <p role="alert" className="rounded-lg border border-red-500/20 bg-red-500/[.06] px-3 py-2 text-xs leading-5 text-red-200">{error}</p> : null}
        <Button className="h-11 w-full" disabled={loading || sent}>{loading ? "Sending…" : sent ? "Reset email sent" : "Send reset link"}</Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">Remembered it? <Link className="font-medium text-foreground hover:text-[#c7d9ff]" href="/login">Sign in</Link></p>
    </AuthShell>
  );
}
