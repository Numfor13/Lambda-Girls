import { Link } from "react-router-dom"
import { motion } from "motion/react"
import { ChevronRight, Info, LoaderCircle } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { SPRING, popIn } from "@/design/motion"
import { cn } from "@/lib/utils"
import { initials } from "@/lib/format"

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("eyebrow", className)}>{children}</p>
}

export function FeaturePill({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="glass inline-flex h-10 items-center gap-2 rounded-full px-4 text-label-l text-ink-900">
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
    <div className={cn("glass-strong flex gap-3 rounded-lg p-4", className)}>
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
        "flex items-start gap-3 rounded-md border border-line bg-white/85 p-4 text-body-m text-ink-600",
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

/** M3 Expressive loading indicator: a morphing, rotating shape instead of a bare spinner. */
export function PageSpinner() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-label="Loading">
      <motion.span
        className="block size-12 bg-brand-700"
        animate={{
          rotate: [0, 180, 360],
          borderRadius: ["40% 60% 40% 60%", "50% 50% 30% 70%", "40% 60% 40% 60%"],
          scale: [1, 0.85, 1],
        }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  )
}

/**
 * Big status mark for outcome screens (payment, saved offline). Waiting = morphing M3 loading
 * shape; done = check that springs in with ripples; error = gentle shake. Brand colours only.
 */
export function StatusMark({
  state,
  icon: Icon,
}: {
  state: "waiting" | "done" | "error" | "info"
  icon: LucideIcon
}) {
  if (state === "waiting") {
    return (
      <motion.span
        className="flex size-24 items-center justify-center bg-mint"
        animate={{
          rotate: [0, 90, 180, 270, 360],
          borderRadius: ["40% 60% 40% 60%", "50%", "60% 40% 60% 40%", "50%", "40% 60% 40% 60%"],
        }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
        role="presentation"
      >
        <motion.span animate={{ rotate: [0, -360] }} transition={{ duration: 3.2, repeat: Infinity, ease: "linear" }}>
          <Icon className="size-10 text-brand-700" strokeWidth={1.75} aria-hidden />
        </motion.span>
      </motion.span>
    )
  }
  return (
    <span className="relative flex size-24 items-center justify-center">
      {state === "done" &&
        [0, 1].map((i) => (
          <motion.span
            key={i}
            className="absolute inset-0 rounded-full bg-brand-500/25"
            initial={{ scale: 0.6, opacity: 0.8 }}
            animate={{ scale: 1.8, opacity: 0 }}
            transition={{ duration: 1.2, delay: 0.2 + i * 0.25, ease: "easeOut" }}
          />
        ))}
      <motion.span
        className={cn(
          "relative flex size-24 items-center justify-center shape-bl",
          state === "done" && "bg-brand-700 text-white",
          state === "error" && "bg-urgent-red-50 text-urgent-red",
          state === "info" && "bg-mint text-brand-700",
        )}
        initial={{ scale: 0.3, rotate: -30, opacity: 0 }}
        animate={
          state === "error"
            ? { scale: 1, rotate: 0, opacity: 1, x: [0, -8, 8, -4, 0] }
            : { scale: 1, rotate: 0, opacity: 1 }
        }
        transition={SPRING.bouncy}
      >
        <Icon className="size-11" strokeWidth={1.75} aria-hidden />
      </motion.span>
    </span>
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
    <motion.div
      variants={popIn}
      initial="hidden"
      animate="show"
      className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-brand-500/30 bg-white/60 px-6 py-10 text-center"
    >
      <motion.span
        className="flex size-16 items-center justify-center bg-mint shape-bl"
        initial={{ rotate: -12, scale: 0.6 }}
        animate={{ rotate: 0, scale: 1 }}
        transition={SPRING.bouncy}
      >
        <Icon className="size-7 text-brand-700" strokeWidth={1.75} aria-hidden />
      </motion.span>
      <p className="max-w-xs text-body-l text-ink-600">{title}</p>
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
        "inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold text-white ring-2 ring-white",
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
}: {
  title: string
  to?: string
  linkLabel?: string
  className?: string
}) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3", className)}>
      <h2 className="text-headline-s">{title}</h2>
      {to && linkLabel && (
        <Link
          to={to}
          className="group inline-flex h-10 items-center gap-0.5 rounded-full px-3 text-label-l text-brand-700 hover:bg-mint"
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
