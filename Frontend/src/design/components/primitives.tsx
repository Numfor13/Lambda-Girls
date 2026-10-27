import { Link } from "react-router-dom"
import { motion, useReducedMotion } from "motion/react"
import { ChevronRight, Inbox, Info, LoaderCircle } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { SPRING, popIn } from "@/design/motion"
import { cn } from "@/lib/utils"
import { initials } from "@/lib/format"

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("eyebrow", className)}>{children}</p>
}

export function FeaturePill({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="inline-flex h-9 items-center gap-2 rounded-full bg-white/80 px-3.5 text-label-l text-ink-900 ring-1 ring-ink-900/8">
      <Icon className="size-[18px] text-brand-700" strokeWidth={2} aria-hidden />
      {label}
    </span>
  )
}

/** Solid reading surface. Lists, forms and chat always sit on these, never on glass. */
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
    <As className={cn("rounded-lg bg-white shadow-[var(--shadow-elev-1)]", className)}>{children}</As>
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
    <div className={cn("flex gap-3 rounded-lg bg-white p-4 shadow-[var(--shadow-elev-1)]", className)}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-mint">
        <Icon className="size-5 text-brand-700" strokeWidth={2} aria-hidden />
      </span>
      <div>
        <p className="text-title-m text-ink-900">{title}</p>
        <div className="mt-1 text-body-m text-ink-600">{children}</div>
      </div>
    </div>
  )
}

/** Triage results always carry this. Solid surface: it is reading content. */
export function AdvisoryNote({ className, long = false }: { className?: string; long?: boolean }) {
  return (
    <p
      className={cn(
        "flex items-start gap-3 rounded-md bg-ink-900/[0.035] p-4 text-body-m text-ink-600",
        className,
      )}
    >
      <Info className="mt-0.5 size-5 shrink-0 text-brand-800" aria-hidden />
      {long
        ? "Advisory, not a diagnosis. Our rules are not yet clinically validated — if in doubt, go now."
        : "Guidance supports care. It does not replace a diagnosis."}
    </p>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <LoaderCircle className={cn("size-6 animate-spin text-brand-700", className)} aria-label="Loading" />
  )
}

/**
 * Route/page loading. v2: a plain ring, shown only after 300ms so fast loads (cached chunks,
 * the production build) never flash it, while slow phones still see that something is coming.
 */
export function PageSpinner() {
  return (
    <motion.div
      className="flex min-h-[50vh] items-center justify-center"
      role="status"
      aria-label="Loading"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.3, duration: 0.2 }}
    >
      <LoaderCircle className="size-8 animate-spin text-brand-700 motion-reduce:animate-none" strokeWidth={1.75} aria-hidden />
    </motion.div>
  )
}

/**
 * Big status mark for outcome screens (payment, saved offline). Waiting = a still icon with a
 * soft ring breathing out of it; done = a check that settles in; error and info = still.
 * No morphing or rotation (v2 motion rules). Brand colours only.
 */
export function StatusMark({
  state,
  icon: Icon,
}: {
  state: "waiting" | "done" | "error" | "info"
  icon: LucideIcon
}) {
  const reduce = useReducedMotion()
  return (
    <span className="relative flex size-24 items-center justify-center">
      {state === "waiting" && !reduce && (
        <motion.span
          className="absolute inset-0 rounded-full bg-brand-500/20"
          initial={{ scale: 1, opacity: 0.7 }}
          animate={{ scale: 1.45, opacity: 0 }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
          aria-hidden
        />
      )}
      {state === "done" && !reduce &&
        [0, 1].map((i) => (
          <motion.span
            key={i}
            className="absolute inset-0 rounded-full bg-brand-500/25"
            initial={{ scale: 0.6, opacity: 0.8 }}
            animate={{ scale: 1.8, opacity: 0 }}
            transition={{ duration: 1.2, delay: 0.2 + i * 0.25, ease: "easeOut" }}
            aria-hidden
          />
        ))}
      <motion.span
        className={cn(
          "relative flex size-24 items-center justify-center rounded-full",
          state === "done" && "bg-brand-700 text-white",
          state === "error" && "bg-urgent-red-50 text-urgent-red",
          (state === "info" || state === "waiting") && "bg-mint text-brand-700",
        )}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={SPRING.default}
      >
        <Icon className="size-11" strokeWidth={1.75} aria-hidden />
      </motion.span>
    </span>
  )
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  body,
  action,
}: {
  /** Defaults to an inbox: an empty state must never crash for want of an icon. */
  icon?: LucideIcon
  title: string
  /** Optional second line: what will make this list fill up. */
  body?: string
  action?: React.ReactNode
}) {
  return (
    <motion.div
      variants={popIn}
      initial="hidden"
      animate="show"
      className="flex flex-col items-center gap-4 rounded-xl bg-white px-6 py-12 text-center shadow-[var(--shadow-elev-1)]"
    >
      <motion.span
        className="flex size-14 items-center justify-center rounded-full bg-mint"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={SPRING.bouncy}
      >
        <Icon className="size-6 text-brand-700" strokeWidth={1.75} aria-hidden />
      </motion.span>
      <div>
        <p className="max-w-sm text-body-l text-ink-600">{title}</p>
        {body && <p className="mt-1 max-w-sm text-body-m text-ink-600">{body}</p>}
      </div>
      {action}
    </motion.div>
  )
}

const AVATAR_TONES = ["bg-brand-700", "bg-brand-500", "bg-land-near", "bg-brand-900"]

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
        "inline-flex shrink-0 items-center justify-center rounded-full font-sans font-semibold text-white ring-2 ring-white",
        AVATAR_TONES[t],
        size === "sm" && "size-9 text-xs",
        size === "md" && "size-12 text-sm",
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
  eyebrow,
}: {
  title: string
  subtitle?: React.ReactNode
  back?: React.ReactNode
  action?: React.ReactNode
  eyebrow?: string
}) {
  return (
    <motion.header
      className="mb-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING.default}
    >
      {back}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
          <h1 className="text-headline-l lg:text-display-m">{title}</h1>
          {subtitle && <p className="mt-2 text-body-l text-ink-600">{subtitle}</p>}
        </div>
        {action}
      </div>
    </motion.header>
  )
}

export function SectionHeader({
  title,
  to,
  linkLabel,
  className,
  id,
}: {
  title: string
  to?: string
  linkLabel?: string
  className?: string
  /** Lets the parent <section aria-labelledby> point at this heading. */
  id?: string
}) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3", className)}>
      <h2 id={id} className="text-title-l">{title}</h2>
      {to && linkLabel && (
        <Link
          to={to}
          className="group -mr-3 inline-flex h-10 items-center gap-0.5 rounded-full px-3 text-label-l text-brand-700 hover:bg-mint"
        >
          {linkLabel}
          <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
      )}
    </div>
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
    <motion.div
      role={tone === "error" ? "alert" : "status"}
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={SPRING.fast}
      className={cn(
        "rounded-md px-4 py-3 text-body-m",
        tone === "info" && "bg-mint text-brand-900",
        // Urgency greens/ambers are reserved for triage; success and warn stay neutral.
        // Error keeps red: a failed action is the one non-clinical place it is allowed.
        tone === "success" && "bg-mint text-brand-900 ring-1 ring-brand-500/25 ring-inset",
        tone === "warn" && "bg-cream text-ink-900 ring-1 ring-line ring-inset",
        tone === "error" && "bg-urgent-red-50 text-urgent-red",
        className,
      )}
    >
      {children}
    </motion.div>
  )
}
