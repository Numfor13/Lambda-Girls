import { lazy, Suspense, useRef, useState } from "react"
import { useInView } from "motion/react"
import { Map, WifiOff } from "lucide-react"
import type { Facility } from "@/api/types"
import type { Coords } from "@/lib/geo"
import { env } from "@/config/env"
import { googleEmbed, validCoordinates, type MapPoint } from "@/lib/maps"
import { useOnline } from "@/lib/hooks"
import { cn } from "@/lib/utils"
import { Button } from "./Button"
import { OfflineFacilityMap } from "./OfflineFacilityMap"
import { Skeleton } from "./Lively"

const StreetMap = lazy(() => import("./StreetMap"))
function OnlineMap({
  points,
  highlight,
  onHover,
  onError,
}: {
  points: MapPoint[]
  highlight?: string | null
  onHover?: (id: string | null) => void
  onError: () => void
}) {
  const [useOsm, setUseOsm] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const visible = useInView(ref, { once: true })
  const embed =
    !useOsm && points.length === 1
      ? googleEmbed(points[0], env.googleMapsEmbedKey)
      : null
  return (
    <div ref={ref} className="min-w-0">
      {!visible ? (
        <Skeleton className="h-80" />
      ) : embed ? (
        <iframe
          title={"Google map: " + points[0].label}
          src={embed}
          loading="lazy"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="block h-80 w-full border-0"
        />
      ) : (
        <Suspense fallback={<Skeleton className="h-80" />}>
          <StreetMap
            points={points}
            highlight={highlight}
            onHover={onHover}
            onTileError={onError}
          />
        </Suspense>
      )}
      {embed && (
        <div className="bg-white px-3 py-1">
          <Button size="sm" variant="ghost" onClick={() => setUseOsm(true)}>
            Use OpenStreetMap instead
          </Button>
        </div>
      )}
    </div>
  )
}

/** Online street maps for the public facility directory; a local coordinate overview offline.
 * Personal origin coordinates are kept in the local overview and distance calculations, never
 * sent to the street-map provider. Providers receive only public facility positions here.
 */
export function FacilityMap({
  all,
  shown,
  highlight,
  origin,
  onHover,
  className,
}: {
  all: Facility[]
  shown: Facility[]
  highlight: string | null
  origin: Coords | null
  onHover?: (id: string | null) => void
  className?: string
}) {
  const online = useOnline()
  const [overview, setOverview] = useState(false)
  const [failed, setFailed] = useState(false)
  const validAll = all.filter(validCoordinates)
  const validShown = shown.filter(validCoordinates)
  const points = validShown.map((f) => ({
    id: f.facility_id,
    label: f.name,
    latitude: f.latitude,
    longitude: f.longitude,
    detail: f.quarter + " · " + f.address,
    href: "/app/facilities/" + encodeURIComponent(f.facility_id),
  }))
  const local = overview || !online || failed || !points.length
  return (
    <div className={cn("overflow-hidden rounded-xl bg-mint", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <p className="flex items-center gap-2 text-label-m text-brand-900">
          {online ? (
            <Map className="size-4" aria-hidden />
          ) : (
            <WifiOff className="size-4" aria-hidden />
          )}
          {!online
            ? "Offline · saved positions"
            : failed
              ? "Street map unavailable"
              : local
                ? "Saved positions"
                : validShown.length + " facility locations"}
        </p>
        {online && points.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (failed) {
                setFailed(false)
                setOverview(false)
              } else setOverview((v) => !v)
            }}
          >
            {failed
              ? "Retry street map"
              : overview
                ? "Street map"
                : "Offline overview"}
          </Button>
        )}
      </div>
      {local ? (
        validAll.length ? (
          <OfflineFacilityMap
            all={validAll}
            shown={validShown}
            highlight={highlight}
            origin={origin && validCoordinates(origin) ? origin : null}
            onHover={onHover}
          />
        ) : (
          <p className="p-5 text-body-m text-ink-600">
            No valid facility coordinates are available.
          </p>
        )
      ) : (
        <OnlineMap
          points={points}
          highlight={highlight}
          onHover={onHover}
          onError={() => setFailed(true)}
        />
      )}
      {!local && (
        <p className="px-4 py-2 text-label-m text-ink-600">
          Select a pin for facility details. Street maps need a connection.
        </p>
      )}
    </div>
  )
}

/** Precise shared/personal positions need an explicit load action before leaving this device. */
export function LocationMap({
  latitude,
  longitude,
  label,
  sensitive = true,
}: Coords & { label: string; sensitive?: boolean }) {
  const online = useOnline()
  const [allowed, setAllowed] = useState(!sensitive)
  const [failed, setFailed] = useState(false)
  if (!validCoordinates({ latitude, longitude })) return null
  const provider = env.googleMapsEmbedKey ? "Google Maps" : "OpenStreetMap"
  return (
    <div className="overflow-hidden rounded-xl bg-mint">
      {!allowed || !online || failed ? (
        <div className="flex flex-col items-start gap-3 p-4">
          <p className="text-title-m">{label}</p>
          <p className="text-code text-ink-600">
            {latitude.toFixed(5)}, {longitude.toFixed(5)}
          </p>
          <p className="text-body-m text-ink-600">
            {!online
              ? "Reconnect for a street map. The saved coordinates remain available."
              : failed
                ? "Street tiles could not load. Retry when connected."
                : "Loading this map shares the position with " + provider + "."}
          </p>
          {online && (
            <Button
              variant="secondary"
              onClick={() => {
                setAllowed(true)
                setFailed(false)
              }}
            >
              {failed ? "Retry map" : "Load location map"}
            </Button>
          )}
        </div>
      ) : (
        <OnlineMap
          points={[{ id: "shared-position", label, latitude, longitude }]}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  )
}
