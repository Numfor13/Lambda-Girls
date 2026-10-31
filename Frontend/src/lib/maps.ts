import type { Coords } from "./geo"

export interface MapPoint extends Coords {
  id: string
  label: string
  href?: string
  detail?: string
}
export function validCoordinates(c: Coords) {
  return (
    Number.isFinite(c.latitude) &&
    Number.isFinite(c.longitude) &&
    Math.abs(c.latitude) <= 90 &&
    Math.abs(c.longitude) <= 180
  )
}
export function googleDirections(c: Coords) {
  return validCoordinates(c)
    ? "https://www.google.com/maps/dir/?api=1&destination=" +
        encodeURIComponent(c.latitude + "," + c.longitude)
    : null
}
export function googleEmbed(c: Coords, key: string) {
  if (!key.trim() || !validCoordinates(c)) return null
  return (
    "https://www.google.com/maps/embed/v1/place?" +
    new URLSearchParams({ key, q: c.latitude + "," + c.longitude, zoom: "15" })
  )
}
