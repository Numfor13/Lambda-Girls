import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { LocateFixed, MapPin, RefreshCw, Search, SearchX } from "lucide-react"
import type { Capability } from "@/api/types"
import { FacilityRow } from "@/design/components/FacilityRow"
import { Chip, Select } from "@/design/components/Field"
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
      <PageHeader title="Find care near you" subtitle="Health facilities in and around Buea." />

      <div className="relative">
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
          className="h-12 w-full rounded-[12px] border border-line bg-cream pr-4 pl-12 text-[16px] placeholder:text-ink-400 focus:border-brand-500 focus:bg-white focus:outline-none"
        />
      </div>

      <div className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Filters">
        {FILTERS.map((f) => (
          <Chip key={f.key} selected={filters.has(f.key)} onClick={() => toggle(f.key)}>
            {f.label}
          </Chip>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 rounded-[12px] bg-mint px-4 py-3 text-sm text-brand-900">
        {coords && !quarter ? (
          <span className="flex items-center gap-2 font-medium">
            <LocateFixed className="size-4" aria-hidden /> Nearest first, from your location
          </span>
        ) : (
          <>
            <span className="flex items-center gap-2 font-medium">
              <MapPin className="size-4" aria-hidden />
              {quarter ? `Nearest to ${quarter}` : "Sorted A–Z"}
            </span>
            {status !== "denied" && status !== "unavailable" && !quarter && (
              <button
                type="button"
                onClick={locate}
                className="font-semibold text-brand-700 underline underline-offset-2"
              >
                {status === "locating" ? "Finding you…" : "Use my location"}
              </button>
            )}
          </>
        )}
        <label className="ml-auto flex items-center gap-2">
          <span className="sr-only">Choose your quarter</span>
          <Select
            value={quarter}
            onChange={(e) => setQuarter(e.target.value)}
            className="h-10 w-auto bg-white text-sm"
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

      <p className="mt-5 text-sm text-ink-600" aria-live="polite">
        {visible.length} {visible.length === 1 ? "facility" : "facilities"}
      </p>

      {visible.length === 0 ? (
        <div className="mt-3">
          <EmptyState icon={SearchX} title="No facilities match your search or filters." />
        </div>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {visible.map((f) => (
            <FacilityRow key={f.facility_id} facility={f} />
          ))}
        </ul>
      )}

      <p className="mt-6 flex flex-wrap items-center gap-x-2 text-xs text-ink-600">
        {syncedAt ? `Last updated ${formatDate(syncedAt)}` : "Built-in directory"} · Available
        offline
        {online && (
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1 font-semibold text-brand-700"
          >
            <RefreshCw className={refreshing ? "size-3 animate-spin" : "size-3"} aria-hidden />
            Refresh
          </button>
        )}
      </p>
    </div>
  )
}
