import Link from "next/link";
import { ArrowRight, BookOpen, Calculator, FileText, HeartPulse, PieChart, Scale, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLockup } from "@/components/app/brand";

const assistants = [
  [FileText, "Document Analyst", "Read, compare and cite private files."],
  [HeartPulse, "Health", "Ground health information in curated sources."],
  [Scale, "Legal", "Research with explicit jurisdiction context."],
  [PieChart, "Portfolio", "Inspect allocation and concentration."],
  [BookOpen, "Study", "Turn source material into guided learning."],
  [Calculator, "Tax & Accounting", "Work through records and rules with sources."],
] as const;

export default function LandingPage() {
  return (
    <main className="min-h-dvh bg-background">
      <nav className="mx-auto flex h-[72px] w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="Citeral home">
          <BrandLockup priority markClassName="size-10" textClassName="text-[20px]" />
        </Link>
        <div className="flex items-center gap-1.5">
          <Link href="/login"><Button variant="ghost" className="px-3 sm:px-4">Log in</Button></Link>
          <Link href="/signup"><Button className="px-3 sm:px-4">Get started</Button></Link>
        </div>
      </nav>

      <section className="mx-auto grid w-full max-w-7xl gap-12 px-5 pb-20 pt-16 sm:px-6 sm:pt-24 lg:grid-cols-[minmax(0,.9fr)_minmax(480px,1.1fr)] lg:items-center lg:px-8 lg:pb-28 lg:pt-28">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <ShieldCheck className="size-4 text-primary" /> Grounded, private, inspectable
          </div>
          <h1 className="mt-5 text-[2.8rem] font-semibold leading-[.98] tracking-[-0.06em] text-foreground sm:text-6xl lg:text-[4.7rem]">
            Ask your knowledge.<br />See the evidence.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
            Specialist AI assistants that work from your documents and trusted sources, with citations you can inspect instead of answers you have to take on faith.
          </p>
          <div className="mt-8 flex flex-col gap-2.5 sm:flex-row">
            <Link href="/signup"><Button size="lg" className="w-full sm:w-auto">Create your workspace <ArrowRight className="size-4" /></Button></Link>
            <Link href="/login"><Button size="lg" variant="secondary" className="w-full sm:w-auto">Open workspace</Button></Link>
          </div>
          <p className="mt-4 text-xs text-subtle-foreground">Six specialist assistants are ready by default. Custom stays optional.</p>
        </div>

        <div className="relative mx-auto w-full max-w-2xl lg:mx-0">
          <div className="rounded-2xl border border-border bg-surface-soft p-2 shadow-[0_30px_80px_rgba(0,0,0,.22)] sm:p-3">
            <div className="overflow-hidden rounded-xl border border-border bg-surface">
              <div className="flex h-12 items-center justify-between border-b border-border px-4">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-7 place-items-center rounded-md border border-border bg-surface-raised"><Scale className="size-3.5 text-[#b8c5d8]" /></span>
                  <div>
                    <div className="text-xs font-medium">Legal</div>
                    <div className="text-[10px] text-subtle-foreground">India · grounded sources</div>
                  </div>
                </div>
                <span className="rounded-full border border-border px-2 py-1 text-[10px] text-muted-foreground">Sources on</span>
              </div>
              <div className="space-y-5 p-4 sm:p-6">
                <div className="ml-auto max-w-[82%] rounded-xl bg-[#e7edf6] px-3.5 py-3 text-sm leading-6 text-[#172033]">
                  Summarize the key obligations in this agreement and flag anything that needs a closer review.
                </div>
                <div className="max-w-[94%] text-sm leading-6 text-[#d9dde3]">
                  <p>The agreement creates three obligations worth reviewing first:</p>
                  <ol className="mt-3 space-y-2 pl-4 text-[#bcc2cb]">
                    <li><span className="text-foreground">1.</span> A broad confidentiality duty that survives termination.</li>
                    <li><span className="text-foreground">2.</span> A liability clause with a carve-out that may exceed the general cap.</li>
                    <li><span className="text-foreground">3.</span> A notice period that changes depending on the termination ground.</li>
                  </ol>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-md border border-border bg-surface-raised px-2 py-1 text-[10px] text-[#b7c7df]">Agreement.pdf · §7</span>
                    <span className="rounded-md border border-border bg-surface-raised px-2 py-1 text-[10px] text-[#b7c7df]">Agreement.pdf · §11</span>
                  </div>
                </div>
              </div>
              <div className="border-t border-border p-3">
                <div className="flex h-12 items-center justify-between rounded-lg border border-border bg-input px-3 text-xs text-subtle-foreground">
                  Ask a follow-up… <span className="grid size-7 place-items-center rounded-full bg-primary text-white"><ArrowRight className="size-3.5" /></span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-surface-soft">
        <div className="mx-auto grid max-w-7xl divide-y divide-border px-5 sm:px-6 md:grid-cols-3 md:divide-x md:divide-y-0 lg:px-8">
          {["Private sources stay scoped to your workspace", "Retrieval happens before the answer is generated", "Citations link important claims back to evidence"].map((text, index) => (
            <div key={text} className="py-6 md:px-6 md:first:pl-0 md:last:pr-0">
              <div className="text-[11px] font-medium text-subtle-foreground">0{index + 1}</div>
              <p className="mt-2 max-w-xs text-sm leading-6 text-[#c7ccd3]">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-6 sm:py-24 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[.14em] text-subtle-foreground">Specialists, not blank canvases</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Start with a workflow that already makes sense.</h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">Built-in assistants arrive configured and ready. Change their settings when you need to; create Custom only when the job is genuinely different.</p>
        </div>
        <div className="mt-10 grid border-y border-border sm:grid-cols-2 lg:grid-cols-3">
          {assistants.map(([Icon, title, description], index) => (
            <div key={title} className={`min-h-44 border-border py-6 sm:px-6 ${index % 3 !== 2 ? "lg:border-r" : ""} ${index < 3 ? "lg:border-b" : ""} ${index % 2 === 0 ? "sm:border-r lg:border-r" : "sm:border-r-0"} ${index < 4 ? "sm:border-b" : ""}`}>
              <Icon className="size-5 text-[#aab7ca]" />
              <h3 className="mt-5 text-sm font-medium text-foreground">{title}</h3>
              <p className="mt-2 max-w-xs text-xs leading-5 text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-20 sm:px-6 sm:pb-24 lg:px-8">
        <div className="flex flex-col items-start justify-between gap-6 rounded-2xl border border-border bg-surface px-6 py-8 sm:flex-row sm:items-center sm:px-8 sm:py-9">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.03em]">Bring your sources. Keep the trail.</h2>
            <p className="mt-2 text-sm text-muted-foreground">Create a private workspace and start with a specialist in minutes.</p>
          </div>
          <Link href="/signup"><Button size="lg">Get started <ArrowRight className="size-4" /></Button></Link>
        </div>
      </section>

      <footer className="border-t border-border px-5 py-7 text-[11px] text-subtle-foreground sm:text-xs">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 sm:flex-row">
          <span>Private workspaces · Versioned sources · Inline citations · Open source</span>
          <span className="flex items-center gap-4">
            <Link href="/privacy" className="transition hover:text-foreground">Privacy</Link>
            <Link href="/terms" className="transition hover:text-foreground">Terms</Link>
          </span>
        </div>
      </footer>
    </main>
  );
}
