import type { RuleFired, SymptomPayload, Urgency } from "@/api/types"

// Mirrors Backend/health_track/lambdas/triage/rules/obstetric.py
const DANGER_SIGNS: [code: string, description: string, urgency: Urgency][] = [
  ["ob_haemorrhage", "Vaginal haemorrhage", "RED"],
  ["ob_convulsion", "Convulsions during pregnancy", "RED"],
  ["ob_prolonged_labour", "Prolonged / obstructed labour", "RED"],
  ["ob_no_fetal_movement", "Absent fetal movement >12h", "RED"],
  ["ob_fever_pregnancy", "Fever during pregnancy", "AMBER"],
  ["ob_severe_headache", "Severe headache with vision change", "AMBER"],
  ["ob_swollen_face_hands", "Swollen face/hands (preeclampsia sign)", "AMBER"],
  ["ob_difficulty_breathing", "Difficulty breathing during pregnancy", "AMBER"],
]

export function evaluateObstetric(payload: SymptomPayload): RuleFired[] {
  if (!payload.is_pregnant) return []
  const symptoms = new Set(payload.symptoms)
  return DANGER_SIGNS.filter(([code]) => symptoms.has(code)).map(
    ([code, description, urgency]) => ({
      rule_id: code,
      description,
      urgency,
      value_that_triggered: code,
    }),
  )
}
