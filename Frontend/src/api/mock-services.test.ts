import { describe, expect, it, vi } from "vitest"
vi.mock("./client", () => ({ request: vi.fn() }))
import { serviceMockRoutes } from "./mock-services"
import type { Appointment, LabRequest } from "./services"
import type { Consultation, HealthTip, Message } from "./types"

function harness() {
  const routes = serviceMockRoutes([], [])
  type Context = Parameters<(typeof routes)[number][2]>[0]
  const data: Context["data"] = { consultations: [], messages: [], payments: [] }
  return {
    data,
    call<T>(method: string, url: string, sub = "demo-patient-1", body: Record<string, unknown> = {}): T {
      const [path, query = ""] = url.split("?")
      const route = routes.find(([m, re]) => m === method && re.test(path))!
      return route[2]({ params: path.match(route[1])!.slice(1), body, query: new URLSearchParams(query), user: sub ? { sub, isDoctor: sub === "demo-doctor-1" } : null, data }) as T
    },
  }
}
describe("service mock contracts and access boundaries", () => {
  it("keeps appointments private and exposes requested visits to admins only", () => {
    const h = harness(), date = new Date(Date.now()+86_400_000).toISOString().slice(0,10)
    const a = h.call<Appointment>("POST", "/appointments", "demo-patient-1", { facility_id: "facility", slot_date: date, slot_label: "morning" })
    expect(h.call<{ count: number }>("GET", "/appointments", "another-patient").count).toBe(0)
    expect(h.call<{ count: number }>("GET", "/appointments?status=requested", "demo-admin-1").count).toBe(1)
    expect(() => h.call("DELETE", `/appointments/${a.appointment_id}`, "another-patient")).toThrow("Request not found")
    h.call("PUT", `/appointments/${a.appointment_id}/confirm`, "demo-admin-1")
    expect(() => h.call("PUT", `/appointments/${a.appointment_id}/confirm`, "demo-admin-1")).toThrow("no longer requested")
    expect(h.call<Appointment>("DELETE", `/appointments/${a.appointment_id}`).status).toBe("cancelled")
  })
  it("enforces the lab transition chain and the summary-only-at-results rule", () => {
    const h = harness(), l = h.call<LabRequest>("POST", "/lab-requests", "demo-patient-1", { test_type: "DEMO", facility_id: "facility" })
    expect(() => h.call("GET", `/lab-requests/${l.request_id}`, "another-patient")).toThrow("Request not found")
    expect(() => h.call("PUT", `/lab-requests/${l.request_id}/status`, "demo-patient-1", { status: "sample_collected" })).toThrow("group required")
    expect(() => h.call("PUT", `/lab-requests/${l.request_id}/status`, "demo-operator-1", { status: "delivered" })).toThrow("Lab status changed")
    h.call("PUT", `/lab-requests/${l.request_id}/status`, "demo-operator-1", { status: "sample_collected" })
    expect(() => h.call("PUT", `/lab-requests/${l.request_id}/status`, "demo-operator-1", { status: "results_ready", result_summary: 12 })).toThrow()
    h.call("PUT", `/lab-requests/${l.request_id}/status`, "demo-operator-1", { status: "results_ready", result_summary: "DEMO ONLY" })
    expect(() => h.call("PUT", `/lab-requests/${l.request_id}/status`, "demo-operator-1", { status: "delivered", result_summary: "bad stage" })).toThrow("only accepted")
    expect(h.call<LabRequest>("PUT", `/lab-requests/${l.request_id}/status`, "demo-operator-1", { status: "delivered" }).result_summary).toBe("DEMO ONLY")
  })
  it("rejects fractional blood units and unauthorized operator reads", () => {
    const h = harness()
    expect(() => h.call("POST", "/blood-requests", "demo-patient-1", { requesting_facility_id: "f", blood_type: "O+", urgency: "RED", units: 1.5 })).toThrow("Invalid blood request")
    expect(() => h.call("GET", "/blood-requests")).toThrow("group required")
  })
  it("expires anonymous sessions and keeps message retries scoped to the sender and case", () => {
    const h = harness(), s = h.call<{ session_token: string; expires_at: number }>("POST", "/anonymous/session", "")
    const anon = `anon:${s.session_token}`
    const c = h.call<Consultation>("POST", "/anonymous/consultations", anon, { complaint: "Demo interface check" })
    const message = { text_body: "Demo text", client_message_id: "stable-id" }
    const m = h.call<Message>("POST", `/anonymous/consultations/${c.consultation_id}/messages`, anon, message)
    expect(h.call<Message>("POST", `/anonymous/consultations/${c.consultation_id}/messages`, anon, message).message_id).toBe(m.message_id)
    expect(h.data.messages).toHaveLength(1)
    const c2 = h.call<Consultation>("POST", "/anonymous/consultations", anon, { complaint: "Another demo" })
    expect(() => h.call("POST", `/anonymous/consultations/${c2.consultation_id}/messages`, anon, message)).toThrow("already used")
    h.data.services!.sessions[s.session_token] = 0
    expect(() => h.call("GET", `/anonymous/consultations/${c.consultation_id}`, anon)).toThrow("expired")
  })
  it("paginates active tips and preserves tag and locale filters", () => {
    const h = harness()
    for (let i=0;i<3;i++) h.call("POST", "/health-tips", "demo-admin-1", { title: `Demo ${i}`, body: "Interface fixture", source_name: "Demo", published_date: "2026-10-23", locale: "en", tags: ["demo"] })
    const p1 = h.call<{ tips: HealthTip[]; next_token: string }>("GET", "/health-tips?locale=en&tag=demo&limit=2", "")
    const p2 = h.call<{ tips: HealthTip[]; next_token?: string }>("GET", `/health-tips?locale=en&tag=demo&limit=2&next_token=${p1.next_token}`, "")
    expect(new Set([...p1.tips,...p2.tips].map(t => t.tip_id)).size).toBe(3)
    expect(p2.next_token).toBeUndefined()
    expect(h.call<{ count: number }>("GET", "/health-tips?locale=fr", "").count).toBe(0)
  })
})
