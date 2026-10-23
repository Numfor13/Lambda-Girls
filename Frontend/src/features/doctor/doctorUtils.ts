import type { Consultation } from "@/api/types"

const RANK = { RED: 0, AMBER: 1, GREEN: 2 } as const

export function patientLabel(c: Consultation) {
  if (c.patient_id.startsWith("anon#")) return "Anonymous"
  return c.on_behalf_member_id ? "Household member (on behalf)" : "Patient"
}

export function sortQueue(items: Consultation[]) {
  return [...items].sort(
    (a, b) => RANK[a.urgency ?? "GREEN"] - RANK[b.urgency ?? "GREEN"] || a.created_at - b.created_at,
  )
}
