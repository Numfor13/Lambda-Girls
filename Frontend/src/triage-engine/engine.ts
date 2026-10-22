import type { Capability, RuleFired, SymptomPayload, Urgency } from "@/api/types"
import { evaluateAdultRedFlags } from "./rules/adultRedFlags"
import { evaluateChildUnder5 } from "./rules/childUnder5"
import { evaluateObstetric } from "./rules/obstetric"

// Mirrors Backend/health_track/lambdas/triage/rules/rule_engine.py — keep both in step.
export const RULES_VERSION = "1.0.0"

const RANK: Record<Urgency, number> = { RED: 2, AMBER: 1, GREEN: 0 }

export const RECOMMENDATIONS: Record<Urgency, string> = {
  RED: "Seek emergency care immediately. Go to the nearest hospital with an emergency unit.",
  AMBER: "See a doctor today. Visit your nearest clinic or hospital.",
  GREEN:
    "Non-urgent. Rest and monitor. Visit a clinic if symptoms worsen or persist beyond 3 days.",
}

export const FACILITY_NEEDED: Record<Urgency, string> = {
  RED: "emergency",
  AMBER: "general",
  GREEN: "pharmacy",
}

export interface EngineResult {
  urgency: Urgency
  rules_fired: RuleFired[]
  recommendation: string
  facility_type_needed: string
}

export function evaluate(payload: SymptomPayload): EngineResult {
  const age = payload.age_months ?? 999
  const fired: RuleFired[] = []
  if (age <= 60) fired.push(...evaluateChildUnder5(payload))
  fired.push(...evaluateObstetric(payload))
  fired.push(...evaluateAdultRedFlags(payload))

  const urgency = fired.reduce<Urgency>(
    (top, r) => (RANK[r.urgency] > RANK[top] ? r.urgency : top),
    "GREEN",
  )
  return {
    urgency,
    rules_fired: fired,
    recommendation: RECOMMENDATIONS[urgency],
    facility_type_needed: FACILITY_NEEDED[urgency],
  }
}

/** Which facility capability satisfies a `facility_type_needed` value. */
export function capabilityFor(facilityType: string): Capability {
  if (facilityType === "emergency") return "emergency"
  if (facilityType === "pharmacy") return "pharmacy"
  return "general"
}
