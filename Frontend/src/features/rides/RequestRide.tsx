import { useEffect, useMemo, useState } from "react"
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { Car, CheckCircle, Clock, MapPin, Navigation, Phone, Star } from "lucide-react"
import { Button } from "@/design/components/Button"
import { PageHeader } from "@/design/components/primitives"
import { Reveal } from "@/design/motion"
import { env } from "@/config/env"
import { formatXaf } from "@/lib/format"
import { useGeolocation } from "@/lib/hooks"
import { useFacilities } from "@/offline/facilities"
import type { Facility } from "@/api/types"

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
})

const userIcon = new L.Icon({
  iconUrl: "data:image/svg+xml;base64," + btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28"><circle cx="12" cy="12" r="10" fill="#1a5c3a" stroke="white" stroke-width="2.5"/><circle cx="12" cy="12" r="4" fill="white"/></svg>`),
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -14],
})

const facilityIcon = new L.Icon({
  iconUrl: "data:image/svg+xml;base64," + btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 40" width="32" height="40"><path d="M16 0C7.163 0 0 7.163 0 16c0 8.837 16 24 16 24s16-15.163 16-24C32 7.163 24.837 0 16 0z" fill="#dc2626"/><rect x="10" y="10" width="12" height="14" rx="1" fill="white"/><path d="M14 10v14M10 14h12" stroke="#dc2626" stroke-width="2"/></svg>`),
  iconSize: [32, 40],
  iconAnchor: [16, 40],
  popupAnchor: [0, -40],
})

const driverIcon = new L.Icon({
  iconUrl: "data:image/svg+xml;base64," + btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="36" height="36"><circle cx="18" cy="18" r="16" fill="#f59e0b" stroke="white" stroke-width="2"/><rect x="8" y="16" width="20" height="9" rx="2" fill="white"/><rect x="10" y="12" width="16" height="7" rx="2" fill="white" opacity="0.8"/><circle cx="12" cy="25" r="2.5" fill="#f59e0b"/><circle cx="24" cy="25" r="2.5" fill="#f59e0b"/></svg>`),
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  popupAnchor: [0, -18],
})

function haversineKm(a: [number, number], b: [number, number]) {
  const R = 6371
  const dLat = ((b[0] - a[0]) * Math.PI) / 180
  const dLon = ((b[1] - a[1]) * Math.PI) / 180
  const lat1 = (a[0] * Math.PI) / 180
  const lat2 = (b[0] * Math.PI) / 180
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

interface NearbyDriver {
  id: string
  name: string
  phone: string
  rating: number
  trips: number
  plate: string
  lat: number
  lng: number
  etaMin: number
}

function generateNearbyDrivers(center: [number, number]): NearbyDriver[] {
  return [
    { id: "d1", name: "Ayuk Celestin", phone: "+237670123456", rating: 4.9, trips: 312, plate: "LT 4521 SW", lat: center[0] + 0.003, lng: center[1] - 0.004, etaMin: 3 },
    { id: "d2", name: "Tabe Roland", phone: "+237681234567", rating: 4.7, trips: 187, plate: "LT 7783 SW", lat: center[0] - 0.005, lng: center[1] + 0.002, etaMin: 6 },
    { id: "d3", name: "Ngale Peter", phone: "+237677890123", rating: 4.8, trips: 540, plate: "LT 2290 SW", lat: center[0] + 0.006, lng: center[1] + 0.005, etaMin: 9 },
  ]
}

type RideState = "select_facility" | "choosing_driver" | "confirmed" | "en_route" | "arrived"

function AutoFit({ points }: { points: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [50, 50] })
  }, [map, points])
  return null
}

export default function RequestRide() {
  const { coords, status, locate } = useGeolocation()
  const facilities = useFacilities()
  const [state, setState] = useState<RideState>("select_facility")
  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null)
  const [selectedDriver, setSelectedDriver] = useState<NearbyDriver | null>(null)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => { locate() }, [locate])

  const userPos: [number, number] | null = coords ? [coords.latitude, coords.longitude] : null
  const defaultCenter: [number, number] = userPos ?? [4.1537, 9.2317]

  const nearbyFacilities = useMemo(() => {
    if (!userPos || !facilities) return (facilities ?? []).slice(0, 6)
    return [...facilities]
      .filter((f) => f.capabilities.includes("emergency") || f.capabilities.includes("general"))
      .sort((a, b) => haversineKm(userPos, [a.latitude, a.longitude]) - haversineKm(userPos, [b.latitude, b.longitude]))
      .slice(0, 6)
  }, [facilities, userPos])

  const drivers = useMemo(() => userPos ? generateNearbyDrivers(userPos) : [], [userPos])

  const distanceKm = useMemo(() => {
    if (!userPos || !selectedFacility) return 0
    return haversineKm(userPos, [selectedFacility.latitude, selectedFacility.longitude])
  }, [userPos, selectedFacility])

  const estimatedFare = Math.max(500, Math.round(distanceKm * env.rideBaseRateXafPerKm / 100) * 100)

  const routePoints: [number, number][] = useMemo(() => {
    if (!userPos || !selectedFacility) return []
    return [userPos, [selectedFacility.latitude, selectedFacility.longitude]]
  }, [userPos, selectedFacility])

  // Simulate ride timer
  useEffect(() => {
    if (state !== "en_route") return
    const t = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(t)
  }, [state])

  const driverPos: [number, number] | null = useMemo(() => {
    if (!selectedDriver || !userPos) return null
    if (state === "en_route" || state === "arrived") return userPos
    return [selectedDriver.lat, selectedDriver.lng]
  }, [selectedDriver, userPos, state])

  const mapPoints = useMemo(() => {
    const pts: [number, number][] = []
    if (userPos) pts.push(userPos)
    if (selectedFacility) pts.push([selectedFacility.latitude, selectedFacility.longitude])
    if (driverPos) pts.push(driverPos)
    return pts
  }, [userPos, selectedFacility, driverPos])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Emergency ride" subtitle="A CareBridge driver takes you to the facility — tracked live." />

      {/* Map always visible */}
      <div className="overflow-hidden rounded-[16px] border border-line" style={{ height: "300px" }}>
        <MapContainer center={defaultCenter} zoom={14} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            url={env.osmTileUrl}
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          {mapPoints.length > 1 && <AutoFit points={mapPoints} />}

          {userPos && (
            <Marker position={userPos} icon={userIcon}>
              <Popup>Your location</Popup>
            </Marker>
          )}
          {selectedFacility && (
            <Marker position={[selectedFacility.latitude, selectedFacility.longitude]} icon={facilityIcon}>
              <Popup>{selectedFacility.name}</Popup>
            </Marker>
          )}
          {driverPos && state !== "arrived" && (
            <Marker position={driverPos} icon={driverIcon}>
              <Popup>{selectedDriver?.name} · {selectedDriver?.plate}</Popup>
            </Marker>
          )}
          {routePoints.length === 2 && (
            <Polyline positions={routePoints} color="#dc2626" weight={4} dashArray={state === "en_route" ? undefined : "10,8"} />
          )}

          {/* Show nearby drivers on the map when selecting */}
          {state === "select_facility" && drivers.map((d) => (
            <Marker key={d.id} position={[d.lat, d.lng]} icon={driverIcon}>
              <Popup>{d.name} · {d.etaMin} min away</Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* State machine panels */}
      {state === "select_facility" && (
        <section>
          <h2 className="mb-3 text-[16px] font-bold">Where do you need to go?</h2>
          {status !== "granted" && status !== "locating" ? (
            <div className="rounded-[14px] bg-cream p-4 text-sm text-ink-600">
              <p>Enable location so we can calculate distance and fare.</p>
              <button type="button" onClick={locate} className="mt-2 font-semibold text-brand-700">Allow location</button>
            </div>
          ) : null}
          <div className="flex flex-col gap-2 mt-2">
            {nearbyFacilities.map((f) => {
              const km = userPos ? haversineKm(userPos, [f.latitude, f.longitude]) : null
              const fare = km ? Math.max(500, Math.round(km * env.rideBaseRateXafPerKm / 100) * 100) : null
              return (
                <button
                  key={f.facility_id}
                  type="button"
                  onClick={() => { setSelectedFacility(f); setState("choosing_driver") }}
                  className={`flex items-center gap-3 rounded-[14px] border p-4 text-left transition-colors hover:bg-cream ${selectedFacility?.facility_id === f.facility_id ? "border-brand-700 bg-mint" : "border-line bg-white"}`}
                >
                  <MapPin className="size-5 shrink-0 text-urgent-red" aria-hidden />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{f.name}</p>
                    <p className="text-sm text-ink-600">{f.quarter}{km ? ` · ${km.toFixed(1)} km` : ""}</p>
                  </div>
                  {fare && <span className="shrink-0 font-display text-[15px] font-extrabold text-brand-700">{formatXaf(fare)}</span>}
                </button>
              )
            })}
          </div>
        </section>
      )}

      {state === "choosing_driver" && selectedFacility && (
        <section>
          <div className="mb-4 rounded-[14px] bg-mint px-4 py-3">
            <p className="font-bold text-brand-900">To: {selectedFacility.name}</p>
            <p className="text-sm text-brand-700">{distanceKm.toFixed(1)} km · Estimated fare: {formatXaf(estimatedFare)}</p>
          </div>
          <h2 className="mb-3 text-[16px] font-bold">Available drivers near you</h2>
          <div className="flex flex-col gap-3">
            {drivers.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelectedDriver(d)}
                className={`flex items-center gap-4 rounded-[16px] border-2 p-4 text-left transition-colors ${selectedDriver?.id === d.id ? "border-brand-700 bg-mint" : "border-line bg-white hover:bg-cream"}`}
              >
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-urgent-amber text-[20px]">🚗</span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold">{d.name}</p>
                  <p className="text-sm text-ink-600">{d.plate}</p>
                  <p className="flex items-center gap-1 text-sm">
                    <Star className="size-3.5 fill-urgent-amber text-urgent-amber" /> {d.rating} · {d.trips} trips
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="flex items-center gap-1 text-sm font-semibold text-brand-700"><Clock className="size-4" /> {d.etaMin} min</p>
                  <p className="text-xs text-ink-600">ETA</p>
                </div>
              </button>
            ))}
          </div>
          <div className="mt-4 flex gap-3">
            <Button variant="secondary" onClick={() => { setState("select_facility"); setSelectedDriver(null) }}>Back</Button>
            <Button
              full
              disabled={!selectedDriver}
              onClick={() => setState("confirmed")}
            >
              Confirm {selectedDriver ? selectedDriver.name.split(" ")[0] : "driver"}
            </Button>
          </div>
        </section>
      )}

      {state === "confirmed" && selectedDriver && selectedFacility && (
        <Reveal variant="up">
          <div className="flex flex-col gap-4">
            <div className="rounded-[16px] bg-brand-700 p-5 text-center text-white">
              <CheckCircle className="mx-auto size-12" strokeWidth={1.5} />
              <h2 className="mt-2 text-[20px] font-extrabold">Driver confirmed!</h2>
              <p className="mt-1 opacity-80">{selectedDriver.name} is on the way · {selectedDriver.etaMin} min ETA</p>
            </div>
            <div className="flex flex-col gap-2 rounded-[14px] border border-line bg-white p-4 text-[15px]">
              <div className="flex justify-between"><span className="text-ink-600">Driver</span><span className="font-semibold">{selectedDriver.name}</span></div>
              <div className="flex justify-between"><span className="text-ink-600">Plate</span><span className="font-semibold">{selectedDriver.plate}</span></div>
              <div className="flex justify-between"><span className="text-ink-600">Destination</span><span className="max-w-[55%] text-right font-semibold">{selectedFacility.name}</span></div>
              <div className="flex justify-between"><span className="text-ink-600">Distance</span><span className="font-semibold">{distanceKm.toFixed(1)} km</span></div>
              <div className="flex justify-between border-t border-line pt-2"><span className="font-bold">Estimated fare</span><span className="font-display text-[18px] font-extrabold text-brand-700">{formatXaf(estimatedFare)}</span></div>
            </div>
            <p className="text-center text-xs text-ink-600">Pay the driver directly in cash or Mobile Money at the end of the ride.</p>
            <div className="flex gap-3">
              <a
                href={`tel:${selectedDriver.phone}`}
                className="flex flex-1 items-center justify-center gap-2 rounded-[12px] border-2 border-brand-700 py-3 text-sm font-semibold text-brand-700"
              >
                <Phone className="size-4" /> Call driver
              </a>
              <Button full onClick={() => setState("en_route")}>
                <Navigation className="size-4" /> Start ride
              </Button>
            </div>
          </div>
        </Reveal>
      )}

      {(state === "en_route" || state === "arrived") && selectedDriver && selectedFacility && (
        <div className="flex flex-col gap-4">
          <div className={`rounded-[16px] p-4 text-center text-white ${state === "arrived" ? "bg-urgent-green" : "bg-brand-700"}`}>
            {state === "arrived" ? (
              <>
                <CheckCircle className="mx-auto size-10" strokeWidth={1.5} />
                <p className="mt-1 text-[18px] font-extrabold">You have arrived!</p>
                <p className="opacity-80">{selectedFacility.name}</p>
              </>
            ) : (
              <>
                <Car className="mx-auto size-10 animate-bounce" strokeWidth={1.5} />
                <p className="mt-1 text-[18px] font-extrabold">Ride in progress</p>
                <p className="font-mono text-[28px] font-extrabold">{String(Math.floor(elapsed / 60)).padStart(2, "0")}:{String(elapsed % 60).padStart(2, "0")}</p>
              </>
            )}
          </div>
          <div className="flex flex-col gap-2 rounded-[14px] border border-line bg-white p-4 text-[15px]">
            <div className="flex justify-between"><span className="text-ink-600">Driver</span><span className="font-semibold">{selectedDriver.name}</span></div>
            <div className="flex justify-between"><span className="text-ink-600">Destination</span><span className="max-w-[55%] text-right font-semibold">{selectedFacility.name}</span></div>
            <div className="flex justify-between border-t border-line pt-2"><span className="font-bold">Fare</span><span className="font-display text-[18px] font-extrabold text-brand-700">{formatXaf(estimatedFare)}</span></div>
          </div>
          {state === "en_route" && (
            <div className="flex gap-3">
              <a href={`tel:${selectedDriver.phone}`} className="flex flex-1 items-center justify-center gap-2 rounded-[12px] border-2 border-line py-3 text-sm font-semibold text-ink-700">
                <Phone className="size-4" /> Driver
              </a>
              <Button full onClick={() => setState("arrived")}>Mark as arrived</Button>
            </div>
          )}
          {state === "arrived" && (
            <Button full variant="secondary" onClick={() => { setState("select_facility"); setSelectedFacility(null); setSelectedDriver(null); setElapsed(0) }}>
              Book another ride
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
