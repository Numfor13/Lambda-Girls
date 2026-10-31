import { useEffect, useMemo } from "react"
import { Link } from "react-router-dom"
import L from "leaflet"
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet"
import { env } from "@/config/env"
import { type MapPoint } from "@/lib/maps"
import "leaflet/dist/leaflet.css"
import "./StreetMap.css"

const pin = (selected: boolean) =>
  L.divIcon({
    className: "care-map-marker",
    html:
      '<span class="' +
      (selected ? "care-map-pin care-map-pin-selected" : "care-map-pin") +
      '"></span>',
    iconSize: [40, 44],
    iconAnchor: [20, 34],
    popupAnchor: [0, -30],
  })
const normalPin = pin(false),
  selectedPin = pin(true)
function Bounds({ points }: { points: MapPoint[] }) {
  const map = useMap()
  // Filtering changes the bounds; pointer highlights never move the map under the user.
  const signature = points
    .map((p) => p.id + ":" + p.latitude + "," + p.longitude)
    .join(";")
  useEffect(() => {
    if (!points.length) return
    if (points.length === 1)
      map.setView([points[0].latitude, points[0].longitude], 15)
    else
      map.fitBounds(
        L.latLngBounds(points.map((p) => [p.latitude, p.longitude])),
        { padding: [24, 24], maxZoom: 15 }
      )
    // Leaflet may first mount inside a newly visible mobile map tab.
    map.invalidateSize()
    // signature captures every input used by the bounds; highlights are intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, signature])
  return null
}
export default function StreetMap({
  points,
  highlight,
  onHover,
  onTileError,
}: {
  points: MapPoint[]
  highlight?: string | null
  onHover?: (id: string | null) => void
  onTileError: () => void
}) {
  const center: [number, number] = [points[0].latitude, points[0].longitude]
  const markers = useMemo(
    () =>
      points.filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i),
    [points]
  )
  return (
    <MapContainer
      className="care-street-map h-80 w-full"
      center={center}
      zoom={13}
      scrollWheelZoom={false}
      attributionControl
      zoomControl
    >
      <TileLayer
        url={env.osmTileUrl}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>'
        eventHandlers={{ tileerror: onTileError }}
      />
      <Bounds points={points} />
      {markers.map((p) => (
        <Marker
          key={p.id}
          position={[p.latitude, p.longitude]}
          title={p.label}
          alt={p.label}
          icon={p.id === highlight ? selectedPin : normalPin}
          eventHandlers={{
            mouseover: () => onHover?.(p.id),
            mouseout: () => onHover?.(null),
          }}
        >
          <Tooltip>{p.label}</Tooltip>
          <Popup minWidth={200} maxWidth={280}>
            <p className="text-title-m text-ink-900">{p.label}</p>
            {p.detail && (
              <p className="mt-1 text-body-m text-ink-600">{p.detail}</p>
            )}
            {p.href && (
              <Link
                to={p.href}
                className="mt-2 inline-flex min-h-10 items-center text-label-l text-brand-700 underline"
              >
                View facility
              </Link>
            )}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
