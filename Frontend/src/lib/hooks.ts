import { useCallback, useEffect, useState, useSyncExternalStore } from "react"
import type { Coords } from "./geo"

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb)
  window.addEventListener("offline", cb)
  return () => {
    window.removeEventListener("online", cb)
    window.removeEventListener("offline", cb)
  }
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  )
}

/** Current time that re-renders every `intervalMs`, so render stays pure. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

export function useVisible(): boolean {
  return useSyncExternalStore(
    (cb) => {
      document.addEventListener("visibilitychange", cb)
      return () => document.removeEventListener("visibilitychange", cb)
    },
    () => document.visibilityState === "visible",
    () => true,
  )
}

export type GeoStatus = "idle" | "locating" | "granted" | "denied" | "unavailable"

const GEO_KEY = "cb_last_position"

function readLastPosition(): Coords | null {
  try {
    const raw = localStorage.getItem(GEO_KEY)
    return raw ? (JSON.parse(raw) as Coords) : null
  } catch {
    return null
  }
}

export function useGeolocation() {
  const [coords, setCoords] = useState<Coords | null>(readLastPosition)
  const [status, setStatus] = useState<GeoStatus>(() =>
    "geolocation" in navigator ? "idle" : "unavailable",
  )

  const locate = useCallback(() => {
    if (!("geolocation" in navigator)) return
    setStatus("locating")
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { latitude: pos.coords.latitude, longitude: pos.coords.longitude }
        localStorage.setItem(GEO_KEY, JSON.stringify(next))
        setCoords(next)
        setStatus("granted")
      },
      (err) => setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    )
  }, [])

  useEffect(() => {
    let cancelled = false
    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((p) => {
        if (cancelled) return
        if (p.state === "granted") locate()
        else if (p.state === "denied") setStatus("denied")
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [locate])

  return { coords, status, locate }
}
