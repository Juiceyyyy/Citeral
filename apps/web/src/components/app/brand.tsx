import Image from "next/image";
import { cn } from "@/lib/utils";

export function BrandMark({ className, priority = false }: { className?: string; priority?: boolean }) {
  return (
    <span className={cn("relative inline-flex size-10 shrink-0 overflow-hidden rounded-[14px] bg-transparent", className)}>
      <Image
        src="/citeral-mark.png"
        alt="Citeral logo"
        fill
        priority={priority}
        sizes="(max-width: 768px) 44px, 48px"
        className="object-contain"
      />
    </span>
  );
}

export function BrandLockup({ className, markClassName, textClassName, priority = false }: { className?: string; markClassName?: string; textClassName?: string; priority?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <BrandMark className={markClassName} priority={priority} />
      <span className={cn("text-[19px] font-semibold leading-none tracking-[-0.035em] text-foreground", textClassName)}>Citeral</span>
    </span>
  );
}
