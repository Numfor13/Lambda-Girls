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
import type { Capability } from "@/api/types"
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

/**
 * Figma: FacilityRow. Capability tile · name · distance pill + one-line meta · tonal call button.
 * Solid white surface (reading content). Animates in when used inside a stagger parent.
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
  const meta = [facility.quarter, CAPABILITY_LABELS[cap]].join(" · ")
  return (
    <motion.li
      variants={popIn}
      layout
      className="flex items-center gap-3 rounded-lg bg-white p-3 shadow-[var(--shadow-elev-1)]"
    >
      <Link
        to={`/app/facilities/${facility.facility_id}`}
        className="group flex min-w-0 flex-1 items-center gap-3 rounded-md"
      >
        <span className="flex size-[52px] shrink-0 items-center justify-center rounded-md bg-mint transition-[border-radius] duration-300 ease-[var(--ease-emphasized)] group-hover:rounded-[26px]">
          <Icon className="size-[22px] text-brand-700" strokeWidth={2} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-title-m text-ink-900">{facility.name}</span>
          <span className="mt-1 flex min-w-0 items-center gap-2 text-body-m text-ink-600">
            {facility.distanceKm !== null && (
              <span className="shrink-0 rounded-full bg-cream px-2 py-0.5 text-label-m text-brand-800">
                {formatDistance(facility.distanceKm)}
              </span>
            )}
            <span className="truncate">{meta}</span>
            {facility.has_backup_power && !compact && (
              <Zap className="size-3.5 shrink-0 fill-urgent-amber text-urgent-amber" aria-label="Backup power" />
            )}
          </span>
        </span>
      </Link>
      <motion.a
        href={telHref(facility.phone)}
        className={iconButtonClass("tonal")}
        aria-label={`Call ${facility.name}`}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.88 }}
      >
        <Phone className="size-5" aria-hidden />
      </motion.a>
    </motion.li>
  )
}
