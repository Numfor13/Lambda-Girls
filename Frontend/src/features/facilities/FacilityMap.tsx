import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { LocateFixed, List, Map, RefreshCw, Search, SearchX } from "lucide-react"
import type { Capability } from "@/api/types"
import { FacilityRow } from "@/design/components/FacilityRow"
import { Chip, Select } from "@/design/components/Field"
import { EmptyState, PageHeader, PageSpinner } from "@/design/components/primitives"
import { useGeolocation, useOnline } from "@/lib/hooks"
import { quarterCentroids, rankFacilities } from "@/lib/geo"
import { CAPABILITY_LABELS, formatDate } from "@/lib/format"
import { refreshFacilities, useFacilities, useFacilitiesSyncedAt } from "@/offline/facilities"
import type { Facility } from "@/api/types"

// Dynamic import leaflet to avoid SSR/CSS issues
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { env } from "@/config/env"

// Fix default leaflet icon paths broken by bundlers
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
})

const userIcon = new L.Icon({
  iconUrl: "data:image/svg+xml;base64," + btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#1a5c3a" width="24" height="24"><circle cx="12" cy="12" r="8" fill="#1a5c3a" stroke="white" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="white"/></svg>`),
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -12],
})

const facilityIcon = new L.Icon({
  iconUrl: "data:image/svg+xml;base64," + btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 40" width="32" height="40"><path d="M16 0C7.163 0 0 7.163 0 16c0 8.837 16 24 16 24s16-15.163 16-24C32 7.163 24.837 0 16 0z" fill="#1a5c3a"/><path d="M11 10h10v12H11z" fill="white"/><path d="M15 10v12M11 14h10" stroke="#1a5c3a" stroke-width="2"/></svg>`),
  iconSize: [32, 40],
  iconAnchor: [16, 40],
  popupAnchor: [0, -40],
})

const urgentIcon = new L.Icon({
  iconUrl: "data:image/svg+xml;base64," + btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 40" width="32" height="40"><path d="M16 0C7.163 0 0 7.163 0 16c0 8.837 16 24 16 24s16-15.163 16-24C32 7.163 24.837 0 16 0z" fill="#dc2626"/><path d="M11 10h10v12H11z" fill="white"/><path d="M15 10v12M11 14h10" stroke="#dc2626" stroke-width="2"/></svg>`),
  iconSize: [32, 40],
  iconAnchor: [16, 40],
  popupAnchor: [0, -40],
})

function FitBounds({ facilities, userPos }: { facilities: Facility[]; userPos: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    const points: [number, number][] = facilities.map((f) => [f.latitude, f.longitude])
    if (userPos) points.push(userPos)
    if (points.length > 0) {
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40] })
    }
  }, [map, facilities, userPos])
  return null
}

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

export default function FacilityMap() {
  const [params] = useSearchParams()
  const facilities = useFacilities()
  const syncedAt = useFacilitiesSyncedAt()
  const online = useOnline()
  const { coords, status, locate } = useGeolocation()
  const [query, setQuery] = useState("")
  const [quarter, setQuarter] = useState("")
  const [refreshing, setRefreshing] = useState(false)
  const [viewMode, setViewMode] = useState<"map" | "list">("map")
  const [selected, setSelected] = useState<Facility | null>(null)
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

  const userPos: [number, number] | null = coords ? [coords.latitude, coords.longitude] : null
  const routePoints: [number, number][] = useMemo(() => {
    if (!userPos || !selected) return []
    return [userPos, [selected.latitude, selected.longitude]]
  }, [userPos, selected])

  if (!facilities) return <PageSpinner />

  const defaultCenter: [number, number] = userPos ?? [4.1537, 9.2317] // Buea, Cameroon
  const hasEmergency = visible.some((f) => f.capabilities.includes("emergency"))

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Find care near you" subtitle="Health facilities in and around Buea." />

      {/* Search + view toggle */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-400" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search facilities"
            aria-label="Search facilities"
            className="h-12 w-full rounded-[12px] border border-line bg-cream pr-4 pl-12 text-[16px] placeholder:text-ink-400 focus:border-brand-500 focus:bg-white focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => setViewMode((v) => (v === "map" ? "list" : "map"))}
          className="flex size-12 shrink-0 items-center justify-center rounded-[12px] border border-line bg-white text-brand-700"
          aria-label={viewMode === "map" ? "Switch to list" : "Switch to map"}
        >
          {viewMode === "map" ? <List className="size-5" /> : <Map className="size-5" />}
        </button>
      </div>

      {/* Filters */}
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Filters">
        {FILTERS.map((f) => (
          <Chip key={f.key} selected={filters.has(f.key)} onClick={() => toggle(f.key)}>
            {f.label}
          </Chip>
        ))}
      </div>

      {/* Location bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-[12px] bg-mint px-4 py-3 text-sm text-brand-900">
        {coords && !quarter ? (
          <span className="flex items-center gap-2 font-medium">
            <LocateFixed className="size-4" aria-hidden /> Nearest first, from your location
          </span>
        ) : (
          <>
            <span className="font-medium">{quarter ? `Near ${quarter}` : "Sorted A–Z"}</span>
            {status !== "denied" && status !== "unavailable" && !quarter && (
              <button type="button" onClick={locate} className="font-semibold text-brand-700 underline underline-offset-2">
                {status === "locating" ? "Finding you…" : "Use my location"}
              </button>
            )}
          </>
        )}
        <label className="ml-auto flex items-center gap-2">
          <Select value={quarter} onChange={(e) => setQuarter(e.target.value)} className="h-10 w-auto bg-white text-sm">
            <option value="">{coords ? "My location" : "Choose quarter"}</option>
            {quarters.map((q) => <option key={q} value={q}>{q}</option>)}
          </Select>
        </label>
      </div>

      <p className="text-sm text-ink-600" aria-live="polite">{visible.length} {visible.length === 1 ? "facility" : "facilities"}</p>

      {visible.length === 0 ? (
        <EmptyState icon={SearchX} title="No facilities match your search or filters." />
      ) : viewMode === "map" ? (
        <div className="overflow-hidden rounded-[16px] border border-line" style={{ height: "420px" }}>
          <MapContainer center={defaultCenter} zoom={13} style={{ height: "100%", width: "100%" }} zoomControl>
            <TileLayer
              url={env.osmTileUrl}
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
            <FitBounds facilities={visible.slice(0, 20)} userPos={userPos} />

            {userPos && (
              <Marker position={userPos} icon={userIcon}>
                <Popup>You are here</Popup>
              </Marker>
            )}

            {visible.slice(0, 30).map((f) => (
              <Marker
                key={f.facility_id}
                position={[f.latitude, f.longitude]}
                icon={f.capabilities.includes("emergency") ? urgentIcon : facilityIcon}
                eventHandlers={{ click: () => setSelected(f) }}
              >
                <Popup>
                  <div className="min-w-[180px]">
                    <p className="font-bold">{f.name}</p>
                    <p className="text-xs text-gray-600">{f.quarter} · {f.address}</p>
                    {f.phone && <p className="mt-1 text-xs"><a href={`tel:${f.phone}`} className="text-blue-600">{f.phone}</a></p>}
                    <div className="mt-1 flex flex-wrap gap-1">
                      {f.capabilities.slice(0, 3).map((c) => (
                        <span key={c} className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-800">{c}</span>
                      ))}
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}

            {routePoints.length === 2 && (
              <Polyline positions={routePoints} color="#1a5c3a" weight={3} dashArray="8,6" />
            )}
          </MapContainer>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((f) => (
            <li key={f.facility_id}>
              <FacilityRow facility={f} />
            </li>
          ))}
        </ul>
      )}

      {selected && viewMode === "map" && (
        <div className="rounded-[16px] border-2 border-brand-700 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-bold">{selected.name}</p>
              <p className="text-sm text-ink-600">{selected.quarter} · {selected.address}</p>
              {userPos && (
                <p className="mt-1 text-sm font-semibold text-brand-700">
                  Route shown on map — dashed green line
                </p>
              )}
            </div>
            <button type="button" onClick={() => setSelected(null)} className="text-ink-400 hover:text-ink-600" aria-label="Close">✕</button>
          </div>
          <div className="mt-3 flex flex-wrap gap-1">
            {selected.capabilities.map((c) => (
              <span key={c} className="rounded-full bg-mint px-2.5 py-0.5 text-[11px] font-semibold text-brand-700">
                {CAPABILITY_LABELS[c] ?? c}
              </span>
            ))}
          </div>
          {selected.phone && (
            <a href={`tel:${selected.phone}`} className="mt-3 flex items-center gap-2 text-sm font-semibold text-brand-700">
              📞 {selected.phone}
            </a>
          )}
        </div>
      )}

      <p className="flex flex-wrap items-center gap-x-2 text-xs text-ink-600">
        {syncedAt ? `Last updated ${formatDate(syncedAt)}` : "Built-in directory"} · Available offline
        {online && (
          <button type="button" onClick={async () => { setRefreshing(true); await refreshFacilities().catch(() => undefined); setRefreshing(false) }} disabled={refreshing} className="inline-flex items-center gap-1 font-semibold text-brand-700">
            <RefreshCw className={refreshing ? "size-3 animate-spin" : "size-3"} aria-hidden /> Refresh
          </button>
        )}
      </p>
    </div>
  )
}
