import { describe, expect, it } from "vitest"
import { googleDirections, googleEmbed, validCoordinates } from "./maps"
describe("free map URLs", () => {
  const point = { latitude: 4.1537, longitude: 9.2317 }
  it("uses the free Embed endpoint and only the provided public position", () => {
    const url = new URL(googleEmbed(point, "restricted-browser-key")!)
    expect(url.pathname).toBe("/maps/embed/v1/place")
    expect(url.searchParams.get("q")).toBe("4.1537,9.2317")
    expect(url.searchParams.get("key")).toBe("restricted-browser-key")
    expect(googleEmbed(point, "")).toBeNull()
  })
  it("rejects invalid and non-finite coordinates instead of mapping a made-up position", () => {
    for (const c of [
      { latitude: NaN, longitude: 9 },
      { latitude: 4, longitude: Infinity },
      { latitude: 91, longitude: 9 },
      { latitude: 4, longitude: -181 },
    ]) {
      expect(validCoordinates(c)).toBe(false)
      expect(googleEmbed(c, "key")).toBeNull()
      expect(googleDirections(c)).toBeNull()
    }
  })
  it("uses Google Maps URLs for directions without requiring an API key or sending the user's origin", () => {
    const url = new URL(googleDirections(point)!)
    expect(url.searchParams.get("api")).toBe("1")
    expect(url.searchParams.get("destination")).toBe("4.1537,9.2317")
    expect(url.searchParams.has("origin")).toBe(false)
    expect(url.searchParams.has("key")).toBe(false)
  })
})
