import { Link } from "react-router-dom"
import { MapPin, Phone, Zap } from "lucide-react"
import { formatDistance, type RankedFacility } from "@/lib/geo"
import { CAPABILITY_LABELS, telHref } from "@/lib/format"
import { cn } from "@/lib/utils"

export function FacilityRow({
  facility,
  compact = false,
}: {
  facility: RankedFacility
  compact?: boolean
}) {
  const shown = facility.capabilities.filter((c) => c !== "general").slice(0, compact ? 2 : 3)
  return (
    <li className="flex items-center gap-3 rounded-[16px] border border-line bg-white p-3 pr-3 sm:p-4">
      <Link
        to={`/app/facilities/${facility.facility_id}`}
        className="flex min-w-0 flex-1 items-start gap-3 rounded-[10px]"
      >
        <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-mint">
          <MapPin className="size-5 text-brand-700" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-ink-900">
            {facility.name}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[13px] text-ink-600">
            {facility.quarter}
            {facility.distanceKm !== null && (
              <>
                <span aria-hidden>·</span>
                <span className="font-medium text-brand-700">
                  {formatDistance(facility.distanceKm)}
                </span>
              </>
            )}
            {facility.has_backup_power && (
              <Zap
                className="size-3.5 fill-urgent-amber text-urgent-amber"
                aria-label="Backup power"
              />
            )}
          </span>
          {!compact && shown.length > 0 && (
            <span className="mt-2 flex flex-wrap gap-1.5">
              {shown.map((c) => (
                <span
                  key={c}
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    c === "emergency" ? "bg-urgent-red-50 text-urgent-red" : "bg-cream text-ink-600",
                  )}
                >
                  {CAPABILITY_LABELS[c]}
                </span>
              ))}
            </span>
          )}
        </span>
      </Link>
      <a
        href={telHref(facility.phone)}
        className="flex h-11 shrink-0 items-center gap-1.5 rounded-[10px] bg-brand-700 px-3.5 text-sm font-semibold text-white hover:bg-brand-800"
        aria-label={`Call ${facility.name}`}
      >
        <Phone className="size-4" aria-hidden />
        Call
      </a>
    </li>
  )
}
