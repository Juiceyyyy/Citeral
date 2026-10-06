import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy" };

const sections = [
  ["What Citeral processes", "Citeral processes account information, assistant settings, conversation content, files you choose to provide, generated document chunks and embeddings, and limited technical usage records needed to operate the service."],
  ["Private knowledge", "Private documents and derived knowledge are scoped by workspace and user authorization in the database. Raw private upload objects are designed to be removed after successful ingestion; derived text chunks and embeddings remain available so your assistants can retrieve from the document."],
  ["AI providers", "When you send a message, the prompt and relevant retrieved context may be sent to the configured AI provider to generate a response. The reference deployment uses Cloudflare Workers AI. Citeral does not silently switch to a paid AI provider unless the operator explicitly enables that configuration."],
  ["Live web search", "Web search is optional per conversation. When you enable it, your query may be sent to the configured search provider and returned web material may be included as evidence for the answer."],
  ["Security", "Citeral uses authenticated access, database Row Level Security, private storage controls, scoped retrieval, bounded uploads, and other application safeguards. No internet service can guarantee absolute security, so avoid uploading information you do not need the service to process."],
  ["Health, legal and financial information", "Citeral can process sensitive material you intentionally provide to specialist assistants. These assistants provide informational and analytical help; they are not a substitute for a licensed professional who can examine your complete circumstances."],
  ["Open-source deployment", "Citeral is open source and may be self-hosted. The operator of the deployment you use controls its infrastructure, retention configuration and provider accounts. This page describes the behavior of the reference Citeral application, not every third-party deployment."],
];

export default function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-background px-5 py-10 sm:px-6 sm:py-16">
      <article className="mx-auto max-w-3xl">
        <Link href="/" className="text-xs text-muted-foreground hover:text-foreground">← Citeral</Link>
        <h1 className="mt-8 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Privacy</h1>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">Last updated October 6, 2026. This page explains how the reference Citeral application handles information.</p>
        <div className="mt-10 space-y-9">
          {sections.map(([title, body]) => (
            <section key={title}>
              <h2 className="text-sm font-semibold text-foreground">{title}</h2>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">{body}</p>
            </section>
          ))}
        </div>
        <p className="mt-12 border-t border-border pt-6 text-xs leading-6 text-subtle-foreground">For security reports, use the repository&apos;s private vulnerability-reporting channel rather than a public issue.</p>
      </article>
    </main>
  );
}
