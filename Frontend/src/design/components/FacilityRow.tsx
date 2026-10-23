import { Link } from "react-router-dom"
import { motion } from "motion/react"
import {
  Activity,
  Baby,
  Droplet,
  FlaskConical,
  HeartPulse,
  Hospital,
  Phone,
  Pill,
  ScanLine,
  Zap,
  type LucideIcon,
} from "lucide-react"
import type { Capability, Facility } from "@/api/types"
import { popIn } from "@/design/motion"
import { formatDistance, type RankedFacility } from "@/lib/geo"
import { CAPABILITY_LABELS, telHref } from "@/lib/format"
import { iconButtonClass } from "./Button"

export const CAPABILITY_ICON: Record<Capability, LucideIcon> = {
  general: Activity,
  maternity: Baby,
  emergency: HeartPulse,
  laboratory: FlaskConical,
  pharmacy: Pill,
  blood_bank: Droplet,
  x_ray: ScanLine,
  dental: Hospital,
  eye_clinic: Hospital,
}

/** Headline capability for the tile: emergency wins, then the first specialist one. */
export function primaryCapability(caps: Capability[]): Capability {
  if (caps.includes("emergency")) return "emergency"
  return caps.find((c) => c !== "general") ?? "general"
}

/** "Open 24/7", a short hours string, or nothing when hours are structured per day. */
export function hoursLabel(hours: Facility["opening_hours"]): string | null {
  if (typeof hours !== "string" || !hours.trim()) return null
  return hours.trim() === "24/7" ? "Open 24/7" : hours.trim()
}

/**
 * Directory row (Airbnb/Zocdoc listing density): capability tile · name · where/when/how far ·
 * up to three service tags · call button. Solid white surface (reading content).
 */
export function FacilityRow({
  facility,
  compact = false,
  focus,
}: {
  facility: RankedFacility
  compact?: boolean
  focus?: Capability
}) {
  const cap = focus && facility.capabilities.includes(focus) ? focus : primaryCapability(facility.capabilities)
  const Icon = CAPABILITY_ICON[cap]
  const hours = hoursLabel(facility.opening_hours)
  const tags = [cap, ...facility.capabilities.filter((c) => c !== cap && c !== "general")]
  const extra = tags.length - 3
  return (
    <motion.li
      variants={popIn}
      layout
      className="group/row relative flex items-start gap-3 rounded-lg bg-white p-3 shadow-[var(--shadow-elev-1)] transition-shadow duration-200 hover:shadow-[var(--shadow-elev-2)] sm:p-4"
    >
      <span
        className={
          cap === "emergency"
            ? "flex size-12 shrink-0 items-center justify-center rounded-md bg-brand-900 text-white"
            : "flex size-12 shrink-0 items-center justify-center rounded-md bg-mint text-brand-700"
        }
      >
        <Icon className="size-[22px]" strokeWidth={1.9} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <Link
          to={`/app/facilities/${facility.facility_id}`}
          className="line-clamp-2 text-title-m text-ink-900 after:absolute after:inset-0 after:rounded-lg hover:text-brand-700 sm:line-clamp-1"
        >
          {facility.name}
        </Link>
        <p className="mt-0.5 line-clamp-2 text-body-m text-ink-600">
          {[facility.quarter, hours].filter(Boolean).join(" · ")}
          {facility.distanceKm !== null && (
            <span className="font-semibold text-brand-700 tabular"> · {formatDistance(facility.distanceKm)}</span>
          )}
        </p>
        {!compact && (
          <p className="mt-2 flex flex-wrap items-center gap-1.5">
            {tags.slice(0, 3).map((c) => (
              <span key={c} className="inline-flex h-6 items-center rounded-full bg-cream px-2 text-label-m text-ink-600">
                {CAPABILITY_LABELS[c]}
              </span>
            ))}
            {extra > 0 && <span className="text-label-m text-ink-400">+{extra}</span>}
            {facility.has_backup_power && (
              <span className="inline-flex h-6 items-center gap-1 rounded-full px-1 text-label-m text-ink-600">
                <Zap className="size-3.5 fill-current text-brand-600" aria-hidden />
                Backup power
              </span>
            )}
          </p>
        )}
      </div>
      <motion.a
        href={telHref(facility.phone)}
        className={iconButtonClass("tonal", "relative z-10 self-center")}
        aria-label={`Call ${facility.name}`}
        whileTap={{ scale: 0.92 }}
      >
        <Phone className="size-[18px]" aria-hidden />
      </motion.a>
    </motion.li>
  )
}
