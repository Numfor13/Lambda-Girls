import { useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import type { Facility } from "@/api/types"
import type { Coords } from "@/lib/geo"
import { SPRING } from "@/design/motion"
import { cn } from "@/lib/utils"

const W = 400
const H = 300
const PAD = 26

/**
 * A schematic map of the directory (Airbnb/ClassPass list + map split), drawn from the saved
 * coordinates alone: no tiles, no network, no invented streets. Every facility is a faint dot;
 * the ones that match the current search are solid; the row under the pointer pulses. Pins
 * open the facility. The list beside it stays the accessible way through the same content.
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
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const project = useMemo(() => {
    const pts = all.map((f) => ({ lat: f.latitude, lon: f.longitude }))
    if (origin) pts.push({ lat: origin.latitude, lon: origin.longitude })
    const lats = pts.map((p) => p.lat)
    const lons = pts.map((p) => p.lon)
    const minLat = Math.min(...lats), maxLat = Math.max(...lats)
    const minLon = Math.min(...lons), maxLon = Math.max(...lons)
    // Equirectangular with the latitude's cosine, so distances look right this close to the equator.
    const k = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180))
    const spanX = Math.max((maxLon - minLon) * k, 1e-6)
    const spanY = Math.max(maxLat - minLat, 1e-6)
    const scale = Math.min((W - PAD * 2) / spanX, (H - PAD * 2) / spanY)
    const offX = (W - spanX * scale) / 2
    const offY = (H - spanY * scale) / 2
    return (c: { latitude: number; longitude: number }) => ({
      x: offX + (c.longitude - minLon) * k * scale,
      y: H - (offY + (c.latitude - minLat) * scale),
    })
  }, [all, origin])

  const shownIds = useMemo(() => new Set(shown.map((f) => f.facility_id)), [shown])
  const hot = highlight ? all.find((f) => f.facility_id === highlight) : undefined
  const me = origin ? project(origin) : null

  return (
    <figure className={cn("overflow-hidden rounded-xl bg-mint", className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full"
        role="img"
        aria-label={`Map of ${shown.length} matching facilities${origin ? " and your position" : ""}`}
        onMouseLeave={() => onHover?.(null)}
      >
        <defs>
          <pattern id="fm-grid" width="25" height="25" patternUnits="userSpaceOnUse">
            <path d="M25 0H0V25" fill="none" className="stroke-brand-700/10" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={W} height={H} fill="url(#fm-grid)" />
        <g aria-hidden>
          {all.map((f) => {
            const p = project(f)
            const on = shownIds.has(f.facility_id)
            const er = f.capabilities.includes("emergency")
            return (
              <motion.circle
                key={f.facility_id}
                cx={p.x}
                cy={p.y}
                initial={false}
                animate={{ r: on ? (er ? 6.5 : 5) : 3, opacity: on ? 1 : 0.35 }}
                transition={SPRING.default}
                className={cn(
                  on ? (er ? "fill-brand-900 stroke-white" : "fill-brand-600 stroke-white") : "fill-brand-700/40",
                  on && "cursor-pointer",
                )}
                strokeWidth={on ? 2 : 0}
                onMouseEnter={on ? () => onHover?.(f.facility_id) : undefined}
                onClick={on ? () => navigate(`/app/facilities/${f.facility_id}`) : undefined}
              >
                <title>{f.name}</title>
              </motion.circle>
            )
          })}
          {me && (
            <g>
              {!reduce && (
                <motion.circle
                  cx={me.x}
                  cy={me.y}
                  r={7}
                  className="fill-brand-500/30"
                  animate={{ r: [7, 18], opacity: [0.6, 0] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
                />
              )}
              <circle cx={me.x} cy={me.y} r={6} className="fill-white" />
              <circle cx={me.x} cy={me.y} r={4} className="fill-brand-500" />
            </g>
          )}
          <AnimatePresence>
            {hot && (
              <motion.g
                key={hot.facility_id}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={SPRING.fast}
                style={{ transformOrigin: `${project(hot).x}px ${project(hot).y}px` }}
              >
                <circle cx={project(hot).x} cy={project(hot).y} r={13} className="fill-brand-500/25" />
                <circle cx={project(hot).x} cy={project(hot).y} r={7.5} className="fill-brand-900 stroke-white" strokeWidth={2.5} />
              </motion.g>
            )}
          </AnimatePresence>
        </g>
      </svg>
      <figcaption className="flex items-center justify-between gap-3 px-4 py-2.5 text-label-m text-ink-600">
        <span className="min-w-0 truncate">{hot ? hot.name : "Positions only, no streets · works offline"}</span>
        <span className="flex shrink-0 items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-brand-900" aria-hidden /> Emergency
          </span>
          {origin && (
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-brand-500 ring-2 ring-white" aria-hidden /> You
            </span>
          )}
        </span>
      </figcaption>
    </figure>
  )
}
