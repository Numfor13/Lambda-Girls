import { describe, expect, it } from "vitest"
import type { SymptomPayload } from "@/api/types"
import { evaluate } from "./engine"

const payload = (p: Partial<SymptomPayload>): SymptomPayload => ({
  age_months: 360,
  is_pregnant: false,
  symptoms: [],
  vitals: {},
  ...p,
})

describe("child under 5 — fast breathing thresholds", () => {
  it.each([
    [2, 60, true],
    [2, 59, false],
    [3, 50, true],
    [12, 50, true],
    [12, 49, false],
    [13, 40, true],
    [60, 40, true],
    [60, 39, false],
  ])("age %i months, %i bpm → fires: %s", (age, rr, fires) => {
    const r = evaluate(payload({ age_months: age, vitals: { resp_rate: rr } }))
    expect(r.rules_fired.some((x) => x.rule_id === "child_fast_breathing")).toBe(fires)
  })

  it("does not apply child rules over 5 years", () => {
    const r = evaluate(payload({ age_months: 61, vitals: { resp_rate: 70 }, symptoms: ["convulsions"] }))
    expect(r.rules_fired).toHaveLength(0)
    expect(r.urgency).toBe("GREEN")
  })

  it("14-month-old at 52 bpm is AMBER with the 1–5 year rule in the audit", () => {
    const r = evaluate(payload({ age_months: 14, vitals: { resp_rate: 52 } }))
    expect(r.urgency).toBe("AMBER")
    expect(r.rules_fired[0]?.description).toContain("≥40 for age 1–5 years")
    expect(r.rules_fired[0]?.value_that_triggered).toBe(52)
  })

  it("a child danger sign is RED", () => {
    expect(evaluate(payload({ age_months: 8, symptoms: ["unable_feed"] })).urgency).toBe("RED")
  })
})

describe("obstetric", () => {
  it("only applies when pregnant", () => {
    expect(evaluate(payload({ symptoms: ["ob_haemorrhage"] })).urgency).toBe("GREEN")
    expect(evaluate(payload({ is_pregnant: true, symptoms: ["ob_haemorrhage"] })).urgency).toBe("RED")
  })

  it("swelling is AMBER", () => {
    const r = evaluate(payload({ is_pregnant: true, symptoms: ["ob_swollen_face_hands"] }))
    expect(r.urgency).toBe("AMBER")
  })
})

describe("adult red flags and routing", () => {
  it("highest urgency wins", () => {
    const r = evaluate(payload({ symptoms: ["cough_mild", "jaundice", "chest_pain"] }))
    expect(r.urgency).toBe("RED")
    expect(r.facility_type_needed).toBe("emergency")
    expect(r.rules_fired).toHaveLength(3)
  })

  it("mild symptoms are GREEN and routed to a pharmacy", () => {
    const r = evaluate(payload({ symptoms: ["cold_flu"] }))
    expect(r.urgency).toBe("GREEN")
    expect(r.facility_type_needed).toBe("pharmacy")
  })

  it("no symptoms is GREEN with an empty audit", () => {
    const r = evaluate(payload({}))
    expect(r.urgency).toBe("GREEN")
    expect(r.rules_fired).toEqual([])
  })
})
