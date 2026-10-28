import type { LabStatus } from "@/api/services"

/** Human labels for values the API sends as enums. Never show a raw enum to a patient. */
export const LAB_STATUS_LABEL: Record<LabStatus, string> = {
  requested: "Requested",
  sample_collected: "Sample collected",
  results_ready: "Results ready",
  delivered: "Delivered",
}

export const SLOT_LABEL = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
} as const

export const APPOINTMENT_STATUS_LABEL = {
  requested: "Waiting for the facility",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
} as const

/** "malaria_rdt" → "Malaria rdt"; free text passes through with its first letter raised. */
export function humanize(value: string): string {
  const s = value.replace(/[_-]+/g, " ").trim()
  return s ? s[0]!.toUpperCase() + s.slice(1) : s
}

/** plural(1, "visit") → "1 visit"; plural(3, "visit") → "3 visits". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`
}
