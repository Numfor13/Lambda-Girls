import { motion } from "motion/react"
import { CircleCheck, Clock, Siren } from "lucide-react"
import type { Urgency } from "@/api/types"
import { SPRING } from "@/design/motion"
import { cn } from "@/lib/utils"

/**
 * Clinical urgency. These colours are reserved for triage urgency — never decorative.
 * `page` tints the whole screen, `backdrop` picks the ambient tone behind the glass chrome.
 */
export const URGENCY_META: Record<
  Urgency,
  {
    label: string
    headline: string
    icon: typeof Siren
    badge: string
    dot: string
    hero: string
    page: string
    backdrop: "red" | "amber" | "green"
  }
> = {
  RED: {
    label: "Emergency",
    headline: "Go to emergency care now.",
    icon: Siren,
    badge: "bg-urgent-red-50 text-urgent-red",
    dot: "bg-urgent-red",
    hero: "bg-urgent-red text-white",
    page: "bg-urgent-red-50",
    backdrop: "red",
  },
  AMBER: {
    label: "See a doctor today",
    headline: "See a doctor today.",
    icon: Clock,
    badge: "bg-urgent-amber-50 text-urgent-amber-ink",
    dot: "bg-urgent-amber",
    hero: "bg-urgent-amber text-ink-900",
    page: "bg-urgent-amber-50",
    backdrop: "amber",
  },
  GREEN: {
    label: "Self-care",
    headline: "You can care for this at home.",
    icon: CircleCheck,
    badge: "bg-urgent-green-50 text-urgent-green",
    dot: "bg-urgent-green",
    hero: "bg-urgent-green text-white",
    page: "bg-urgent-green-50",
    backdrop: "green",
  },
}

export function UrgencyBadge({
  urgency,
  size = "md",
  short = false,
  className,
}: {
  urgency: Urgency
  size?: "sm" | "md"
  short?: boolean
  className?: string
}) {
  const meta = URGENCY_META[urgency]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full whitespace-nowrap",
        size === "sm" ? "h-6 px-2.5 text-label-m" : "h-8 px-3 text-label-l",
        meta.badge,
        className,
      )}
    >
      <span className="relative flex size-2">
        {urgency === "RED" && (
          <motion.span
            className={cn("absolute inset-0 rounded-full", meta.dot)}
            animate={{ scale: [1, 2.4], opacity: [0.6, 0] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
          />
        )}
        <span className={cn("relative size-2 rounded-full", meta.dot)} />
      </span>
      {short ? urgency : `${urgency} · ${meta.label}`}
    </span>
  )
}

/** Small urgency dot used in rule lists. */
export function UrgencyDot({ urgency, className }: { urgency: Urgency; className?: string }) {
  return (
    <motion.span
      className={cn("inline-block size-2.5 shrink-0 rounded-full", URGENCY_META[urgency].dot, className)}
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={SPRING.bouncy}
    />
  )
}
