import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Terms" };

const sections = [
  ["Use of the service", "Use Citeral only for lawful purposes and only with material you are authorized to upload, process or share. Do not use the service to access another person's workspace, bypass security controls, distribute malware, or interfere with the service."],
  ["AI output", "AI-generated output can be incomplete, outdated or incorrect. Citations and retrieved evidence are provided to make important claims easier to inspect, but you remain responsible for checking information before relying on it."],
  ["Professional domains", "Health, legal, tax, accounting and portfolio assistants provide information, research and analysis. They do not create a doctor-patient, lawyer-client, accountant-client, fiduciary or other licensed professional relationship, and they cannot replace professional judgment where one is required."],
  ["Your content", "You retain responsibility for content you provide. You grant the deployment operator only the permissions needed to store, process, retrieve and transmit that content to provide the requested Citeral features."],
  ["Availability and third parties", "The reference deployment depends on third-party infrastructure and AI services. Features may be limited, unavailable or rate-limited when those providers are unavailable or when free-tier quotas are reached."],
  ["Open-source software", "The Citeral source code is distributed under the repository's open-source license. A third party that operates its own Citeral deployment may publish separate terms, privacy practices and service commitments."],
  ["Changes", "These terms may be updated as the product changes. Material product behavior should be reflected in this page and the public repository documentation."],
];

export default function TermsPage() {
  return (
    <main className="min-h-dvh bg-background px-5 py-10 sm:px-6 sm:py-16">
      <article className="mx-auto max-w-3xl">
        <Link href="/" className="text-xs text-muted-foreground hover:text-foreground">← Citeral</Link>
        <h1 className="mt-8 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Terms of use</h1>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">Last updated October 6, 2026. These terms apply to the reference Citeral application.</p>
        <div className="mt-10 space-y-9">
          {sections.map(([title, body]) => (
            <section key={title}>
              <h2 className="text-sm font-semibold text-foreground">{title}</h2>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">{body}</p>
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}
