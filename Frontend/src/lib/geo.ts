import type { Facility } from "@/api/types"

export interface Coords {
  latitude: number
  longitude: number
}

const R_KM = 6371

export function haversineKm(a: Coords, b: Coords): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.latitude - a.latitude)
  const dLon = toRad(b.longitude - a.longitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2
  return 2 * R_KM * Math.asin(Math.sqrt(h))
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km.toFixed(1)} km`
}

/** Average position of each quarter's facilities, used when location access is denied. */
export function quarterCentroids(facilities: Facility[]): Record<string, Coords> {
  const acc: Record<string, { lat: number; lon: number; n: number }> = {}
  for (const f of facilities) {
    const q = (acc[f.quarter] ??= { lat: 0, lon: 0, n: 0 })
    q.lat += f.latitude
    q.lon += f.longitude
    q.n += 1
  }
  return Object.fromEntries(
    Object.entries(acc).map(([k, v]) => [k, { latitude: v.lat / v.n, longitude: v.lon / v.n }]),
  )
}

export interface RankedFacility extends Facility {
  distanceKm: number | null
}

export function rankFacilities(facilities: Facility[], origin: Coords | null): RankedFacility[] {
  const ranked = facilities.map((f) => ({
    ...f,
    distanceKm: origin ? haversineKm(origin, f) : null,
  }))
  return ranked.sort((a, b) =>
    a.distanceKm !== null && b.distanceKm !== null
      ? a.distanceKm - b.distanceKm || a.name.localeCompare(b.name)
      : a.name.localeCompare(b.name),
  )
}
