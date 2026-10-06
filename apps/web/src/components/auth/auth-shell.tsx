import Link from "next/link";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { BrandLockup } from "@/components/app/brand";

const principles = [
  "Private workspace by default",
  "Grounded answers with source citations",
  "Assistant-specific knowledge and controls",
] as const;

export function AuthShell({
  children,
  title,
  description,
  compact = false,
}: {
  children: React.ReactNode;
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <main className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(420px,560px)]">
      <section className="hidden border-r border-border bg-surface-soft lg:flex lg:min-h-dvh lg:flex-col lg:justify-between lg:p-10 xl:p-14">
        <Link href="/" className="inline-flex w-fit" aria-label="Citeral home">
          <BrandLockup priority markClassName="size-10" textClassName="text-[19px]" />
        </Link>
        <div className="max-w-xl pb-8">
          <div className="mb-5 inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <ShieldCheck className="size-4 text-primary" /> Evidence-first AI workspace
          </div>
          <h2 className="max-w-lg text-[40px] font-semibold leading-[1.05] tracking-[-0.05em] text-foreground xl:text-[48px]">
            Your sources stay central to the answer.
          </h2>
          <p className="mt-5 max-w-lg text-sm leading-7 text-muted-foreground">
            Citeral combines specialist assistants, private documents and curated knowledge in one focused workspace built for traceability.
          </p>
          <div className="mt-8 space-y-3">
            {principles.map((principle) => (
              <div key={principle} className="flex items-center gap-3 text-sm text-[#c5cad1]">
                <CheckCircle2 className="size-4 text-primary" />
                {principle}
              </div>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-subtle-foreground">Citeral · Private knowledge, inspectable answers.</p>
      </section>

      <section className="flex min-h-dvh items-center justify-center px-4 py-8 sm:px-8 lg:px-10">
        <div className={`w-full ${compact ? "max-w-[430px]" : "max-w-[460px]"}`}>
          <Link href="/" className="mb-9 inline-flex lg:hidden">
            <BrandLockup priority markClassName="size-10" textClassName="text-[19px]" />
          </Link>
          <div className="mb-7">
            <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.035em] text-foreground sm:text-[30px]">{title}</h1>
            <p className="mt-2.5 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
