import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { AnimatePresence, motion } from "motion/react"
import { LocateFixed, MapPin, RefreshCw, Search, SearchX } from "lucide-react"
import type { Capability } from "@/api/types"
import { FacilityRow } from "@/design/components/FacilityRow"
import { Chip, Select } from "@/design/components/Field"
import { SPRING, staggerOnMount } from "@/design/motion"
import { EmptyState, PageHeader, PageSpinner } from "@/design/components/primitives"
import { useGeolocation, useOnline } from "@/lib/hooks"
import { quarterCentroids, rankFacilities } from "@/lib/geo"
import { CAPABILITY_LABELS, formatDate } from "@/lib/format"
import { refreshFacilities, useFacilities, useFacilitiesSyncedAt } from "@/offline/facilities"

type FilterKey = Capability | "backup_power" | "csu"

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "maternity", label: CAPABILITY_LABELS.maternity },
  { key: "emergency", label: CAPABILITY_LABELS.emergency },
  { key: "laboratory", label: CAPABILITY_LABELS.laboratory },
  { key: "pharmacy", label: CAPABILITY_LABELS.pharmacy },
  { key: "blood_bank", label: CAPABILITY_LABELS.blood_bank },
  { key: "x_ray", label: CAPABILITY_LABELS.x_ray },
  { key: "backup_power", label: "Backup power" },
  { key: "csu", label: "Accepts CSU card" },
]

export default function FacilityList() {
  const [params] = useSearchParams()
  const facilities = useFacilities()
  const syncedAt = useFacilitiesSyncedAt()
  const online = useOnline()
  const { coords, status, locate } = useGeolocation()
  const [query, setQuery] = useState("")
  const [quarter, setQuarter] = useState("")
  const [refreshing, setRefreshing] = useState(false)
  const [filters, setFilters] = useState<Set<FilterKey>>(() => {
    const cap = params.get("capability") as FilterKey | null
    return new Set(cap && FILTERS.some((f) => f.key === cap) ? [cap] : [])
  })

  const wantsLocate = params.get("locate") === "1"
  useEffect(() => {
    if (wantsLocate) locate()
  }, [wantsLocate, locate])

  const centroids = useMemo(() => quarterCentroids(facilities ?? []), [facilities])
  const quarters = useMemo(() => Object.keys(centroids).sort(), [centroids])
  const origin = quarter ? centroids[quarter] : coords

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = (facilities ?? []).filter((f) => {
      if (q && !`${f.name} ${f.quarter} ${f.address}`.toLowerCase().includes(q)) return false
      for (const key of filters) {
        if (key === "backup_power" && !f.has_backup_power) return false
        if (key === "csu" && !f.accepts_csu_card) return false
        if (key !== "backup_power" && key !== "csu" && !f.capabilities.includes(key)) return false
      }
      return true
    })
    return rankFacilities(filtered, origin ?? null)
  }, [facilities, query, filters, origin])

  const toggle = (key: FilterKey) =>
    setFilters((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const refresh = async () => {
    setRefreshing(true)
    await refreshFacilities().catch(() => undefined)
    setRefreshing(false)
  }

  if (!facilities) return <PageSpinner />

  return (
    <div>
      <PageHeader eyebrow="Facilities" title="Find care near you" subtitle="Health facilities in and around Buea — saved on your phone." />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-400"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search in Buea"
            aria-label="Search facilities"
            className="h-14 w-full rounded-full border-[1.5px] border-white/80 bg-white/80 pr-4 pl-12 text-body-l shadow-[var(--shadow-elev-1)] backdrop-blur-xl transition-shadow placeholder:text-ink-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 focus:outline-none"
          />
        </div>
        <div className="glass flex flex-wrap items-center gap-3 rounded-full py-1.5 pr-1.5 pl-4 text-label-l text-brand-900">
          {coords && !quarter ? (
            <span className="flex items-center gap-2">
              <LocateFixed className="size-4" aria-hidden /> Nearest first
            </span>
          ) : (
            <>
              <span className="flex items-center gap-2">
                <MapPin className="size-4" aria-hidden />
                {quarter ? `Nearest to ${quarter}` : "Sorted A–Z"}
              </span>
              {status !== "denied" && status !== "unavailable" && !quarter && (
                <button type="button" onClick={locate} className="text-brand-700 underline underline-offset-2">
                  {status === "locating" ? "Finding you…" : "Use my location"}
                </button>
              )}
            </>
          )}
          <label className="ml-auto flex items-center">
            <span className="sr-only">Choose your quarter</span>
            <Select
              value={quarter}
              onChange={(e) => setQuarter(e.target.value)}
              className="h-11 w-auto rounded-full bg-white text-label-l"
            >
              <option value="">{coords ? "My location" : "Choose your quarter"}</option>
              {quarters.map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </div>

      <div className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0" role="group" aria-label="Filters">
        {FILTERS.map((f) => (
          <Chip key={f.key} selected={filters.has(f.key)} onClick={() => toggle(f.key)}>
            {f.label}
          </Chip>
        ))}
      </div>

      <AnimatePresence mode="popLayout" initial={false}>
        <motion.p
          key={visible.length}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={SPRING.fast}
          className="mt-5 text-label-l text-ink-600"
          aria-live="polite"
        >
          {visible.length} {visible.length === 1 ? "facility" : "facilities"}
        </motion.p>
      </AnimatePresence>

      {visible.length === 0 ? (
        <div className="mt-3">
          <EmptyState icon={SearchX} title="No facilities match your search or filters." />
        </div>
      ) : (
        <motion.ul
          key={[...filters].join() + quarter}
          className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-2 lg:grid-cols-2 lg:gap-3"
          variants={staggerOnMount(0.03)}
          initial="hidden"
          animate="show"
        >
          {visible.map((f) => (
            <FacilityRow key={f.facility_id} facility={f} />
          ))}
        </motion.ul>
      )}

      <p className="mt-6 flex flex-wrap items-center gap-x-2 text-body-m text-ink-600">
        {syncedAt ? `Last updated ${formatDate(syncedAt)}` : "Built-in directory"} · Available offline
        {online && (
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="inline-flex h-10 items-center gap-1 rounded-full px-3 text-label-l text-brand-700 hover:bg-mint"
          >
            <RefreshCw className={refreshing ? "size-3.5 animate-spin" : "size-3.5"} aria-hidden />
            Refresh
          </button>
        )}
      </p>
    </div>
  )
}
