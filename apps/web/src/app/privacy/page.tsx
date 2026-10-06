import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How the reference Citeral deployment processes, stores and lets you control your data.",
};

const sections = [
  ["What Citeral processes", "Citeral processes account information, assistant settings, saved jurisdiction preferences, conversation content, files you choose to provide, generated document chunks and embeddings, portfolio data you enter, and limited technical usage records needed to operate, secure and troubleshoot the service."],
  ["Why the data is used", "The reference deployment uses this information to authenticate you, provide your workspace, index and retrieve your private knowledge, generate requested answers, enforce quotas and security controls, maintain curated sources, and diagnose service failures."],
  ["Private knowledge", "Private documents and derived knowledge are scoped by workspace and user authorization in the database. Raw private upload objects are designed to be removed after successful ingestion; derived text chunks and embeddings remain available so your assistants can retrieve from the document until the document or account is deleted."],
  ["AI and optional web search", "When you send a message, the prompt and relevant retrieved context may be sent to the configured AI provider to generate a response. The reference deployment uses Cloudflare Workers AI and does not silently switch to a paid AI provider. If you enable live web search, your query may also be sent to the configured search provider and returned web material may be included as evidence."],
  ["Infrastructure providers", "The reference deployment uses Vercel for the web application, Supabase for authentication, database and private storage, Cloudflare for AI generation and embeddings, and GitHub Actions for scheduled ingestion and source refresh. Those providers may process operational metadata under their own service terms and retention practices."],
  ["Retention", "Account and workspace data is kept while needed to provide the service or until you remove it. Deleting a private document removes its application records and stored source object. Deleting your account removes your active Citeral account and user-owned private workspace data. Limited infrastructure logs, security records or provider backups may persist for their normal retention periods before aging out."],
  ["Your controls", "From Settings you can download a portable JSON export of your Citeral account data and permanently delete your account. You can also delete private documents and conversations individually. Account deletion is irreversible."],
  ["Security", "Citeral uses authenticated access, PostgreSQL Row Level Security, private storage policies, scoped retrieval, same-origin mutation checks, bounded uploads, database-backed rate limits, malware scanning in hosted ingestion, and automated tenant-isolation tests. No internet service can guarantee absolute security, so avoid uploading information you do not need the service to process."],
  ["Health, legal and financial information", "Citeral can process sensitive material you intentionally provide to specialist assistants. These assistants provide informational and analytical help; they are not a substitute for a licensed professional who can examine your complete circumstances."],
  ["Open-source deployments", "Citeral is open source and may be self-hosted. The operator of the deployment you use controls its infrastructure, provider accounts, configuration and retention. This page describes the reference deployment at citeral.vercel.app, not every third-party deployment."],
];

export default function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-background px-5 py-10 sm:px-6 sm:py-16">
      <article className="mx-auto max-w-3xl">
        <Link href="/" className="text-xs text-muted-foreground hover:text-foreground">← Citeral</Link>
        <h1 className="mt-8 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Privacy</h1>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">Last updated October 6, 2026. This page explains how the reference Citeral deployment handles information.</p>
        <div className="mt-10 space-y-9">
          {sections.map(([title, body]) => (
            <section key={title}>
              <h2 className="text-sm font-semibold text-foreground">{title}</h2>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">{body}</p>
            </section>
          ))}
        </div>
        <div className="mt-12 border-t border-border pt-6 text-xs leading-6 text-subtle-foreground">
          <p>For security reports, use the repository&apos;s private vulnerability-reporting channel rather than a public issue.</p>
          <p className="mt-2">For the exact implementation, retention controls and provider configuration of the reference deployment, see the public Citeral repository and its operations documentation.</p>
        </div>
      </article>
    </main>
  );
}
