import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { AnimatePresence, motion } from "motion/react"
import { LocateFixed, MapPin, Phone, RefreshCw, Search, SearchX } from "lucide-react"
import type { Capability } from "@/api/types"
import { FacilityRow, hoursLabel } from "@/design/components/FacilityRow"
import { Chip } from "@/design/components/Field"
import { AppPage, Panel } from "@/design/components/AppPage"
import { buttonClass } from "@/design/components/Button"
import { SPRING, staggerOnMount } from "@/design/motion"
import { EmptyState, PageSpinner } from "@/design/components/primitives"
import { useGeolocation, useOnline } from "@/lib/hooks"
import { quarterCentroids, rankFacilities } from "@/lib/geo"
import { CAPABILITY_LABELS, formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"
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

  // Real counts from the directory, for the "by service" shortcuts in the aside.
  const counts = FILTERS.map((f) => ({
    ...f,
    n: facilities.filter((x) =>
      f.key === "backup_power" ? x.has_backup_power : f.key === "csu" ? x.accepts_csu_card : x.capabilities.includes(f.key),
    ).length,
  }))
  const open247 = facilities.filter((f) => hoursLabel(f.opening_hours) === "Open 24/7").length

  return (
    <AppPage
      eyebrow="Facilities"
      title="Find care near you"
      subtitle="Every health facility in and around Buea, saved on your phone so it works without a network."
      aside={
        <>
          <Panel tone="mint" className="hidden lg:block">
            <p className="eyebrow">By service</p>
            <ul className="mt-3 flex flex-col">
              {counts.map((c) => (
                <li key={c.key}>
                  <button
                    type="button"
                    onClick={() => toggle(c.key)}
                    aria-pressed={filters.has(c.key)}
                    className={cn(
                      "flex h-10 w-full items-center justify-between rounded-md px-3 text-label-l transition-colors",
                      filters.has(c.key) ? "bg-brand-900 text-white" : "text-brand-900 hover:bg-white/70",
                    )}
                  >
                    {c.label}
                    <span className={cn("tabular", filters.has(c.key) ? "text-white/80" : "text-ink-600")}>{c.n}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-3 px-3 text-body-m text-ink-600">{open247} open around the clock.</p>
          </Panel>
          <Panel>
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-urgent-red-50 text-urgent-red">
                <Phone className="size-[18px]" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-title-m">Someone can&apos;t breathe, won&apos;t wake or is bleeding heavily?</p>
                <p className="mt-1 text-body-m text-ink-600">Don&apos;t search. Call the emergency line now.</p>
              </div>
            </div>
            <a href="tel:15" className={buttonClass({ variant: "danger", full: true, className: "mt-4" })}>
              <Phone className="size-5" aria-hidden /> Call 15
            </a>
          </Panel>
          <p className="flex flex-wrap items-center gap-x-2 px-1 text-body-m text-ink-600">
            {syncedAt ? `Updated ${formatDate(syncedAt)}` : "Built-in directory"} · Works offline
            {online && (
              <button
                type="button"
                onClick={refresh}
                disabled={refreshing}
                className="inline-flex h-9 items-center gap-1 rounded-full px-2 text-label-l text-brand-700 hover:bg-mint"
              >
                <RefreshCw className={refreshing ? "size-3.5 animate-spin" : "size-3.5"} aria-hidden />
                Refresh
              </button>
            )}
          </p>
        </>
      }
    >
      {/* Search bar: one solid surface with three segments (Airbnb pattern). */}
      <div className="flex flex-col gap-2 rounded-xl bg-white p-2 shadow-[var(--shadow-elev-2)] md:flex-row md:items-center md:gap-0 md:rounded-full">
        <label className="relative flex min-w-0 flex-1 items-center">
          <Search className="pointer-events-none absolute left-4 size-5 text-ink-400" aria-hidden />
          <span className="sr-only">Search facilities</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, quarter or street"
            className="h-12 w-full rounded-full bg-transparent pr-4 pl-12 text-body-l placeholder:text-ink-400 hover:bg-cream focus:bg-cream focus:outline-none"
          />
        </label>
        <span className="mx-1 hidden h-8 w-px bg-line md:block" aria-hidden />
        <label className="relative flex items-center md:w-56">
          <MapPin className="pointer-events-none absolute left-4 size-[18px] text-ink-400" aria-hidden />
          <span className="sr-only">Sort by distance from a quarter</span>
          <select
            value={quarter}
            onChange={(e) => setQuarter(e.target.value)}
            className="h-12 w-full appearance-none rounded-full bg-transparent pr-8 pl-11 text-label-l text-ink-900 hover:bg-cream focus:bg-cream focus:outline-none"
          >
            <option value="">{coords ? "My location" : "Any quarter"}</option>
            {quarters.map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
        </label>
        {status !== "denied" && status !== "unavailable" && (
          <button
            type="button"
            onClick={locate}
            className={buttonClass({ variant: coords && !quarter ? "tonal" : "primary", className: "md:ml-1" })}
          >
            <LocateFixed className="size-[18px]" aria-hidden />
            {status === "locating" ? "Finding you…" : coords && !quarter ? "Nearest first" : "Near me"}
          </button>
        )}
      </div>

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filters">
        {FILTERS.map((f) => (
          <Chip key={f.key} selected={filters.has(f.key)} onClick={() => toggle(f.key)}>
            {f.label}
          </Chip>
        ))}
      </div>

      <div className="flex items-baseline justify-between gap-3">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.p
            key={visible.length}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={SPRING.fast}
            className="text-label-l text-ink-900"
            aria-live="polite"
          >
            {visible.length} {visible.length === 1 ? "facility" : "facilities"}
            <span className="font-normal text-ink-600">
              {" "}
              · {coords && !quarter ? "nearest first" : quarter ? `nearest to ${quarter}` : "A–Z"}
            </span>
          </motion.p>
        </AnimatePresence>
        {(filters.size > 0 || query) && (
          <button
            type="button"
            onClick={() => {
              setFilters(new Set())
              setQuery("")
            }}
            className="text-label-l text-brand-700 underline-offset-4 hover:underline"
          >
            Clear all
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={SearchX} title="No facilities match your search or filters." />
      ) : (
        <motion.ul
          key={[...filters].join() + quarter}
          className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-3"
          variants={staggerOnMount(0.03)}
          initial="hidden"
          animate="show"
        >
          {visible.map((f) => (
            <FacilityRow key={f.facility_id} facility={f} />
          ))}
        </motion.ul>
      )}
    </AppPage>
  )
}
