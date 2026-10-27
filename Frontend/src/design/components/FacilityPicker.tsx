import { useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Check, Search } from "lucide-react"
import type { Capability, Facility } from "@/api/types"
import { CAPABILITY_ICON, hoursLabel, primaryCapability } from "@/design/components/FacilityRow"
import { SPRING } from "@/design/motion"
import { formatDistance, rankFacilities } from "@/lib/geo"
import { useGeolocation } from "@/lib/hooks"
import { cn } from "@/lib/utils"
import { useFacilities } from "@/offline/facilities"

/**
 * Choose one facility from the saved directory: a search box over radio rows (icon, quarter,
 * hours, distance), nearest first when location is on. `prefer` floats facilities with those
 * services to the top and labels them; `only` hides the rest. Replaces a 40-option <select>.
 */
export function FacilityPicker({
  value,
  onChange,
  error,
  prefer = [],
  only = false,
  label = "Facility",
  id = "facility-picker",
}: {
  value: string
  onChange: (id: string) => void
  error?: string
  prefer?: Capability[]
  only?: boolean
  label?: string
  id?: string
}) {
  const facilities = useFacilities()
  const { coords } = useGeolocation()
  const [q, setQ] = useState("")
  const [expanded, setExpanded] = useState(false)
  const matches = (f: Facility) => prefer.some((c) => f.capabilities.includes(c))

  // 40-odd rows: cheap enough to recompute on every render.
  const active = (facilities ?? []).filter((f) => f.is_active && (!only || !prefer.length || matches(f)))
  const needle = q.trim().toLowerCase()
  const ranked = rankFacilities(
    active.filter((f) => !needle || `${f.name} ${f.quarter}`.toLowerCase().includes(needle)),
    coords,
  )
  const list = prefer.length ? [...ranked.filter(matches), ...ranked.filter((f) => !matches(f))] : ranked

  const selected = facilities?.find((f) => f.facility_id === value)
  const shown = expanded || q ? list : list.slice(0, 5)
  const errId = `${id}-error`

  return (
    <fieldset className="flex min-w-0 flex-col gap-3" aria-describedby={error ? errId : undefined}>
      <legend className="mb-1 text-label-l text-ink-900">
        {label}
        <span className="ml-1.5 text-label-m font-normal text-ink-600">Required</span>
      </legend>
      <label className="relative">
        <span className="sr-only">Search facilities</span>
        <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-400" aria-hidden />
        <input
          type="search"
          value={q}
          maxLength={100}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or quarter"
          className="h-12 w-full rounded-full border border-ink-900/15 bg-white pr-4 pl-12 text-body-l focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 focus:outline-none"
        />
      </label>
      <ul className="flex flex-col gap-1.5" role="radiogroup" aria-label={label} id={id}>
        <AnimatePresence initial={false}>
          {shown.map((f) => {
            const on = f.facility_id === value
            const Icon = CAPABILITY_ICON[primaryCapability(f.capabilities)]
            const fit = prefer.length > 0 && matches(f)
            return (
              <motion.li key={f.facility_id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={SPRING.fast}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => onChange(f.facility_id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-[background-color,box-shadow] duration-150",
                    on
                      ? "bg-mint shadow-[inset_0_0_0_2px_var(--color-brand-700)]"
                      : "bg-white shadow-[inset_0_0_0_1px_var(--color-line)] hover:shadow-[inset_0_0_0_1px_var(--color-brand-500)]",
                  )}
                >
                  <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-md", on ? "bg-white text-brand-700" : "bg-mint text-brand-700")}>
                    <Icon className="size-5" strokeWidth={1.9} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block line-clamp-2 text-label-l text-ink-900 sm:line-clamp-1">{f.name}</span>
                    <span className="block truncate text-body-m text-ink-600">
                      {[f.quarter, hoursLabel(f.opening_hours)].filter(Boolean).join(" · ")}
                      {f.distanceKm !== null && <span className="font-semibold text-brand-700"> · {formatDistance(f.distanceKm)}</span>}
                    </span>
                  </span>
                  {fit && !on && <span className="hidden shrink-0 rounded-full bg-cream px-2 py-0.5 text-label-m text-ink-600 sm:inline">Suits this</span>}
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full border-2",
                      on ? "border-brand-700 bg-brand-700 text-white" : "border-ink-400",
                    )}
                    aria-hidden
                  >
                    {on && <Check className="size-3" />}
                  </span>
                </button>
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ul>
      {!list.length && <p className="text-body-m text-ink-600">No facility matches “{q}”.</p>}
      {!q && list.length > 5 && (
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          className="inline-flex h-10 items-center self-start rounded-full px-3 text-label-l text-brand-700 hover:bg-mint"
        >
          {expanded ? "Show fewer" : `Show all ${list.length}`}
        </button>
      )}
      {selected && !shown.some((f) => f.facility_id === value) && (
        <p className="text-body-m text-ink-600">
          Chosen: <span className="font-semibold text-ink-900">{selected.name}</span>
        </p>
      )}
      {error && (
        <p id={errId} role="alert" className="text-label-m text-urgent-red">
          {error}
        </p>
      )}
    </fieldset>
  )
}
