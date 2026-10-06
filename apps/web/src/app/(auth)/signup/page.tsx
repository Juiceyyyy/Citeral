"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { AuthShell } from "@/components/auth/auth-shell";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");
    const supabase = createClient();
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    setConfirmationSent(true);
    setMessage("Check your inbox to confirm your email address. The confirmation link will sign you in securely.");
    setLoading(false);
  }

  async function resendConfirmation() {
    if (!email || resending) return;
    setResending(true);
    setError("");
    setMessage("");
    const supabase = createClient();
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (resendError) setError(resendError.message);
    else setMessage("A fresh confirmation email has been sent.");
    setResending(false);
  }

  return (
    <AuthShell title="Create your workspace" description="Start with six specialist assistants, then add your own documents and instructions.">
      <OAuthButtons />
      <form className="space-y-4" onSubmit={submit}>
        <div>
          <label className="field-label" htmlFor="email">Email</label>
          <Input id="email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-11" />
        </div>
        <div>
          <label className="field-label" htmlFor="password">Password</label>
          <Input id="password" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-11" />
          <p className="helper-text mt-1.5">Use at least 8 characters and a password you do not reuse elsewhere.</p>
        </div>
        {message ? <p role="status" className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs leading-5 text-[#c6cbd2]">{message}</p> : null}
        {error ? <p role="alert" className="rounded-lg border border-red-500/20 bg-red-500/[.06] px-3 py-2 text-xs leading-5 text-red-200">{error}</p> : null}
        <Button className="h-11 w-full" disabled={loading || confirmationSent}>{loading ? "Creating…" : confirmationSent ? "Confirmation sent" : "Create account"}</Button>
        <p className="text-center text-[11px] leading-5 text-subtle-foreground">
          By creating an account, you agree to the <Link href="/terms" className="text-muted-foreground underline decoration-border-strong underline-offset-2 hover:text-foreground">Terms</Link> and acknowledge the <Link href="/privacy" className="text-muted-foreground underline decoration-border-strong underline-offset-2 hover:text-foreground">Privacy notice</Link>.
        </p>
        {confirmationSent ? (
          <button type="button" onClick={resendConfirmation} disabled={resending} className="w-full text-center text-xs text-muted-foreground transition hover:text-foreground disabled:opacity-50">
            {resending ? "Resending…" : "Didn't get it? Resend confirmation"}
          </button>
        ) : null}
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">Already have an account? <Link className="font-medium text-foreground hover:text-[#c7d9ff]" href="/login">Sign in</Link></p>
    </AuthShell>
  );
}
