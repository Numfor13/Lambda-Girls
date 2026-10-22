import type { RuleFired, SymptomPayload, Urgency } from "@/api/types"

// Mirrors Backend/health_track/lambdas/triage/rules/adult_red_flags.py
const RED_FLAGS: [code: string, description: string, urgency: Urgency][] = [
  ["chest_pain", "Chest pain / pressure", "RED"],
  ["stroke_symptoms", "Sudden face/arm/speech change (stroke)", "RED"],
  ["difficulty_breathing", "Severe difficulty breathing", "RED"],
  ["coughing_blood", "Coughing up blood", "RED"],
  ["vomiting_blood", "Vomiting blood", "RED"],
  ["loss_consciousness", "Loss of consciousness", "RED"],
  ["severe_bleeding", "Uncontrolled severe bleeding", "RED"],
  ["seizure", "Active seizure", "RED"],
  ["high_fever_adult", "High fever (adult) ≥38.5°C", "AMBER"],
  ["persistent_vomiting", "Persistent vomiting > 2 days", "AMBER"],
  ["severe_abdominal_pain", "Severe abdominal pain", "AMBER"],
  ["dehydration", "Signs of dehydration", "AMBER"],
  ["altered_mental_state", "Confusion / altered mental state", "AMBER"],
  ["weakness_one_side", "Weakness / numbness one side of body", "AMBER"],
  ["jaundice", "Yellowing of eyes/skin (jaundice)", "AMBER"],
  ["unable_walk", "Unable to walk / stand unaided", "AMBER"],
  ["cough_mild", "Mild cough < 2 weeks", "GREEN"],
  ["cold_flu", "Common cold / mild flu", "GREEN"],
  ["headache_mild", "Mild headache", "GREEN"],
  ["skin_rash_mild", "Mild skin rash", "GREEN"],
  ["back_pain_mild", "Mild back pain", "GREEN"],
]

export function evaluateAdultRedFlags(payload: SymptomPayload): RuleFired[] {
  const symptoms = new Set(payload.symptoms)
  return RED_FLAGS.filter(([code]) => symptoms.has(code)).map(([code, description, urgency]) => ({
    rule_id: code,
    description,
    urgency,
    value_that_triggered: code,
  }))
}
