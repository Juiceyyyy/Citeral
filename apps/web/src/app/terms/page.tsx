import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms",
  description: "Terms for use of the reference Citeral deployment.",
};

const sections = [
  ["Use of the service", "Use Citeral only for lawful purposes and only with material you are authorized to upload, process or share. Do not attempt to access another person's workspace, bypass authentication or authorization controls, distribute malware, abuse provider resources, or interfere with the service."],
  ["Accounts and security", "You are responsible for protecting your sign-in methods and for activity performed through your account. Use a unique password, keep authentication links and verification codes private, and report suspected security issues through the repository's private vulnerability-reporting channel."],
  ["AI output", "AI-generated output can be incomplete, outdated or incorrect. Citations and retrieved evidence are provided to make important claims easier to inspect, but you remain responsible for checking information before relying on it."],
  ["Professional domains", "Health, legal, tax, accounting and portfolio assistants provide information, research and analysis. They do not create a doctor-patient, lawyer-client, accountant-client, fiduciary or other licensed professional relationship, and they cannot replace professional judgment where one is required."],
  ["Your content", "You retain responsibility for content you provide and for having the rights needed to use it. You authorize the deployment operator and configured infrastructure providers to store, process, retrieve and transmit that content only as needed to provide, secure and maintain the requested Citeral features."],
  ["Service limits", "The reference deployment is operated on deliberately bounded infrastructure. Message, upload, storage and request limits may apply. Features may be delayed, rate-limited or temporarily unavailable when safety controls trigger or free-tier provider allocations are exhausted."],
  ["Availability and third parties", "The reference deployment depends on third-party infrastructure, authentication, storage, AI and source websites. Citeral cannot guarantee uninterrupted availability or the continued availability, correctness or freshness of a third-party service or external source."],
  ["Account deletion", "You can permanently delete your account from Settings. Deletion is irreversible and removes active user-owned Citeral data under the application's control, subject to normal infrastructure log and backup retention outside the application's active data store."],
  ["Open-source software", "The Citeral source code is distributed under the repository's open-source license. A third party that operates its own Citeral deployment may publish separate terms, privacy practices and service commitments."],
  ["Changes", "These terms may be updated as the product changes. Material behavior changes should be reflected in this page and the public repository documentation. Continuing to use the reference deployment after an update means you are using it under the then-current terms."],
];

export default function TermsPage() {
  return (
    <main className="min-h-dvh bg-background px-5 py-10 sm:px-6 sm:py-16">
      <article className="mx-auto max-w-3xl">
        <Link href="/" className="text-xs text-muted-foreground hover:text-foreground">← Citeral</Link>
        <h1 className="mt-8 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Terms of use</h1>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">Last updated October 6, 2026. These terms apply to the reference Citeral deployment at citeral.vercel.app.</p>
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
