"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/components/auth/auth-shell";

type RecoveryState = "checking" | "ready" | "invalid";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [recoveryState, setRecoveryState] = useState<RecoveryState>("checking");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data, error: userError }) => {
      if (!active) return;
      setRecoveryState(!userError && data.user ? "ready" : "invalid");
    });
    return () => { active = false; };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    await supabase.auth.signOut();
    setMessage("Password updated. Returning you to sign in…");
    window.setTimeout(() => router.replace("/login"), 900);
    setLoading(false);
  }

  return (
    <AuthShell compact title="Choose a new password" description="This page only works from a valid password-reset email.">
      {recoveryState === "checking" ? (
        <div className="rounded-lg border border-border bg-surface-raised px-4 py-4 text-sm text-muted-foreground">Checking your reset link…</div>
      ) : recoveryState === "invalid" ? (
        <div className="space-y-4">
          <p role="alert" className="rounded-lg border border-red-500/20 bg-red-500/[.06] px-3 py-3 text-xs leading-5 text-red-200">
            This reset link is invalid, expired, or has already been used.
          </p>
          <Link href="/forgot-password"><Button className="h-11 w-full">Request a new reset link</Button></Link>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={submit}>
          <div>
            <label className="field-label" htmlFor="password">New password</label>
            <Input id="password" className="h-11" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} />
            <p className="helper-text mt-1.5">Minimum 8 characters. Use a password you do not reuse elsewhere.</p>
          </div>
          <div>
            <label className="field-label" htmlFor="confirm-password">Confirm new password</label>
            <Input id="confirm-password" className="h-11" type="password" autoComplete="new-password" required minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
          </div>
          {message ? <p role="status" className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs leading-5 text-[#c6cbd2]">{message}</p> : null}
          {error ? <p role="alert" className="rounded-lg border border-red-500/20 bg-red-500/[.06] px-3 py-2 text-xs leading-5 text-red-200">{error}</p> : null}
          <Button className="h-11 w-full" disabled={loading}>{loading ? "Updating…" : "Update password"}</Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-muted-foreground"><Link className="font-medium text-foreground hover:text-[#c7d9ff]" href="/login">Back to sign in</Link></p>
    </AuthShell>
  );
}
