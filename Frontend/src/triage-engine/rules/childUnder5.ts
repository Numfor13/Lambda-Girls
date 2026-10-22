import type { RuleFired, SymptomPayload, Urgency } from "@/api/types"

// Mirrors Backend/health_track/lambdas/triage/rules/child_under_5.py
const DANGER_SIGNS: [code: string, description: string, urgency: Urgency][] = [
  ["convulsions", "Convulsions / fits", "RED"],
  ["unconscious", "Unconscious or unresponsive", "RED"],
  ["unable_feed", "Unable to feed / drink", "RED"],
  ["severe_wasting", "Severe wasting", "RED"],
  ["chest_indraw", "Chest in-drawing", "AMBER"],
  ["fast_breathing", "Fast breathing (see threshold)", "AMBER"],
  ["fever_child", "Fever (child under 5)", "AMBER"],
  ["ear_discharge", "Ear discharge > 2 weeks", "AMBER"],
  ["palmar_pallor", "Palmar pallor (anaemia sign)", "AMBER"],
]

export function evaluateChildUnder5(payload: SymptomPayload): RuleFired[] {
  const age = payload.age_months ?? 999
  const symptoms = new Set(payload.symptoms)
  const rr = payload.vitals?.resp_rate
  const fired: RuleFired[] = []

  for (const [code, description, urgency] of DANGER_SIGNS) {
    if (code === "fast_breathing") {
      if (rr === undefined || rr === null) continue
      const rule_id = `child_${code}`
      if (age <= 2 && rr >= 60) {
        fired.push({
          rule_id,
          description: `Fast breathing: ${rr} bpm (threshold ≥60 for age ≤2 months)`,
          urgency,
          value_that_triggered: rr,
        })
      } else if (age > 2 && age <= 12 && rr >= 50) {
        fired.push({
          rule_id,
          description: `Fast breathing: ${rr} bpm (threshold ≥50 for age 2–12 months)`,
          urgency,
          value_that_triggered: rr,
        })
      } else if (age > 12 && age <= 60 && rr >= 40) {
        fired.push({
          rule_id,
          description: `Fast breathing: ${rr} bpm (threshold ≥40 for age 1–5 years)`,
          urgency,
          value_that_triggered: rr,
        })
      }
    } else if (symptoms.has(code)) {
      fired.push({ rule_id: `child_${code}`, description, urgency, value_that_triggered: code })
    }
  }
  return fired
}
