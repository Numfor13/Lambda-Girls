import { CircleCheck, Clock, Siren } from "lucide-react"
import type { Urgency } from "@/api/types"
import { cn } from "@/lib/utils"

export const URGENCY_META: Record<
  Urgency,
  { label: string; headline: string; icon: typeof Siren; badge: string; hero: string }
> = {
  RED: {
    label: "Emergency",
    headline: "Go to emergency care now.",
    icon: Siren,
    badge: "bg-urgent-red-50 text-urgent-red border-urgent-red/30",
    hero: "bg-urgent-red text-white",
  },
  AMBER: {
    label: "Urgent",
    headline: "See a doctor today.",
    icon: Clock,
    badge: "bg-urgent-amber-50 text-urgent-amber-ink border-urgent-amber/40",
    hero: "bg-urgent-amber text-ink-900",
  },
  GREEN: {
    label: "Non-urgent",
    headline: "You can care for this at home or book a visit.",
    icon: CircleCheck,
    badge: "bg-urgent-green-50 text-urgent-green border-urgent-green/30",
    hero: "bg-urgent-green text-white",
  },
}

export function UrgencyBadge({
  urgency,
  size = "md",
  className,
}: {
  urgency: Urgency
  size?: "sm" | "md"
  className?: string
}) {
  const meta = URGENCY_META[urgency]
  const Icon = meta.icon
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-bold tracking-wide uppercase",
        size === "sm" ? "h-6 px-2 text-[10px]" : "h-7 px-3 text-[11px]",
        meta.badge,
        className,
      )}
    >
      <Icon className={size === "sm" ? "size-3" : "size-3.5"} aria-hidden />
      {urgency} · {meta.label}
    </span>
  )
}
