import { Info, LoaderCircle } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { initials } from "@/lib/format"

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("eyebrow", className)}>{children}</p>
}

export function FeaturePill({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[13px] font-medium text-ink-900">
      <Icon className="size-[22px] text-brand-700" strokeWidth={1.75} aria-hidden />
      {label}
    </span>
  )
}

export function Card({
  className,
  children,
  as: As = "div",
}: {
  className?: string
  children: React.ReactNode
  as?: "div" | "section" | "article" | "li"
}) {
  return (
    <As className={cn("rounded-[16px] border border-line bg-white", className)}>{children}</As>
  )
}

export function InfoCard({
  icon: Icon,
  title,
  children,
  className,
}: {
  icon: LucideIcon
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-[16px] border border-line bg-white p-4 shadow-[var(--shadow-float)]",
        className,
      )}
    >
      <Icon className="mt-0.5 size-6 shrink-0 text-brand-700" strokeWidth={1.75} aria-hidden />
      <div>
        <p className="text-sm leading-5 font-semibold text-ink-900">{title}</p>
        <div className="mt-1.5 text-xs leading-[18px] text-ink-600">{children}</div>
      </div>
    </div>
  )
}

export function AdvisoryNote({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-start gap-1.5 text-xs leading-5 text-ink-600", className)}>
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      Guidance supports care. It does not replace a diagnosis.
    </p>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <LoaderCircle
      className={cn("size-6 animate-spin text-brand-700", className)}
      aria-label="Loading"
    />
  )
}

export function PageSpinner() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status">
      <Spinner className="size-8" />
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  action,
}: {
  icon: LucideIcon
  title: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-[16px] border border-dashed border-line px-6 py-10 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-mint">
        <Icon className="size-7 text-brand-700" strokeWidth={1.5} aria-hidden />
      </span>
      <p className="max-w-xs text-[15px] text-ink-600">{title}</p>
      {action}
    </div>
  )
}

const AVATAR_TONES = [
  "from-[#8a5a3c] to-[#5e3a24]",
  "from-[#6b4430] to-[#3f261a]",
  "from-[#9a6a48] to-[#6a4428]",
  "from-[#2e8b5e] to-[#0f5a3c]",
]

export function Avatar({
  name,
  size = "md",
  tone,
  className,
}: {
  name: string
  size?: "sm" | "md" | "lg"
  tone?: number
  className?: string
}) {
  const t = tone ?? [...name].reduce((n, c) => n + c.charCodeAt(0), 0) % AVATAR_TONES.length
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-display font-bold text-white ring-2 ring-white",
        AVATAR_TONES[t],
        size === "sm" && "size-9 text-xs",
        size === "md" && "size-11 text-sm",
        size === "lg" && "size-16 text-lg",
        className,
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  )
}

export function PageHeader({
  title,
  subtitle,
  back,
  action,
}: {
  title: string
  subtitle?: React.ReactNode
  back?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <header className="mb-6">
      {back}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] leading-tight font-extrabold lg:text-[32px]">{title}</h1>
          {subtitle && <p className="mt-1.5 text-[15px] text-ink-600">{subtitle}</p>}
        </div>
        {action}
      </div>
    </header>
  )
}

export function Notice({
  tone = "info",
  children,
  className,
}: {
  tone?: "info" | "error" | "success" | "warn"
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-[12px] px-4 py-3 text-sm leading-5",
        tone === "info" && "bg-mint text-brand-900",
        tone === "success" && "bg-urgent-green-50 text-urgent-green",
        tone === "warn" && "bg-urgent-amber-50 text-urgent-amber-ink",
        tone === "error" && "bg-urgent-red-50 text-urgent-red",
        className,
      )}
    >
      {children}
    </div>
  )
}
