"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type OAuthProvider = "google" | "github";

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 18" className="size-[18px] shrink-0">
      <path fill="#4285F4" d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.797 2.716v2.258h2.909c1.702-1.567 2.684-3.875 2.684-6.615Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.468-.806 5.956-2.18l-2.91-2.258c-.805.54-1.835.859-3.046.859-2.344 0-4.328-1.585-5.037-3.714H.956v2.332A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.963 10.707A5.41 5.41 0 0 1 3.682 9c0-.592.102-1.168.281-1.707V4.961H.956A9 9 0 0 0 0 9c0 1.45.347 2.824.956 4.039l3.007-2.332Z" />
      <path fill="#EA4335" d="M9 3.579c1.321 0 2.507.454 3.44 1.345l2.582-2.582C13.464.891 11.426 0 9 0A9 9 0 0 0 .956 4.961l3.007 2.332C4.672 5.164 6.656 3.579 9 3.579Z" />
    </svg>
  );
}

function GitHubMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[18px] shrink-0 fill-current">
      <path d="M12 .7C5.73.7.65 5.78.65 12.05c0 5.02 3.26 9.28 7.78 10.78.57.1.78-.25.78-.55v-2.17c-3.17.69-3.84-1.35-3.84-1.35-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.75 1.18 1.75 1.18 1.02 1.75 2.68 1.25 3.34.95.1-.74.4-1.25.73-1.54-2.53-.29-5.19-1.27-5.19-5.63 0-1.24.45-2.26 1.18-3.06-.12-.29-.51-1.45.11-3.02 0 0 .96-.31 3.12 1.17A10.8 10.8 0 0 1 12 6.06c.97 0 1.94.13 2.85.38 2.16-1.48 3.12-1.17 3.12-1.17.62 1.57.23 2.73.11 3.02.73.8 1.18 1.82 1.18 3.06 0 4.37-2.67 5.34-5.2 5.62.41.35.77 1.04.77 2.1v3.21c0 .3.21.66.79.55a11.36 11.36 0 0 0 7.73-10.78C23.35 5.78 18.27.7 12 .7Z" />
    </svg>
  );
}

const providers: { id: OAuthProvider; label: string; icon: React.ReactNode }[] = [
  { id: "google", label: "Google", icon: <GoogleMark /> },
  { id: "github", label: "GitHub", icon: <GitHubMark /> },
];

export function OAuthButtons() {
  const [busy, setBusy] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState("");

  async function signIn(provider: OAuthProvider) {
    setBusy(provider);
    setError("");
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (authError) {
      setError(authError.message);
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {providers.map((provider) => (
          <button
            key={provider.id}
            type="button"
            onClick={() => signIn(provider.id)}
            disabled={busy !== null}
            className="flex h-11 items-center justify-center gap-2.5 rounded-lg border border-border bg-surface-raised px-3 text-sm font-medium text-[#e2e5e9] transition hover:border-border-strong hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {provider.icon}
            <span>{busy === provider.id ? "Connecting…" : `Continue with ${provider.label}`}</span>
          </button>
        ))}
      </div>
      {error ? <p role="alert" className="mt-2 text-center text-xs text-red-300">{error}</p> : null}
      <div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-[.12em] text-subtle-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
        or continue with email
      </div>
    </div>
  );
}
