import type { Urgency } from "@/api/types"

export type SymptomGroup =
  | "breathing"
  | "fever"
  | "pain"
  | "bleeding"
  | "consciousness"
  | "skin"
  | "digestion"
  | "pregnancy"
  | "other"

/** child: under-5 only · pregnancy: pregnant only · adult: 5 years and over · all: everyone */
export type Audience = "child" | "pregnancy" | "adult" | "all"

export interface Symptom {
  code: string
  label: string
  hint?: string
  group: SymptomGroup
  audience: Audience
  urgency: Urgency
}

export const GROUP_LABELS: Record<SymptomGroup, string> = {
  breathing: "Breathing",
  fever: "Fever",
  pain: "Pain",
  bleeding: "Bleeding",
  consciousness: "Awake & alert",
  skin: "Skin & eyes",
  digestion: "Eating & stomach",
  pregnancy: "Pregnancy",
  other: "Other",
}

export const SYMPTOMS: Symptom[] = [
  // Child under 5
  { code: "convulsions", label: "Fits or shaking (convulsions)", group: "consciousness", audience: "child", urgency: "RED" },
  { code: "unconscious", label: "Will not wake up or respond", group: "consciousness", audience: "child", urgency: "RED" },
  { code: "unable_feed", label: "Cannot feed, breastfeed or drink", group: "digestion", audience: "child", urgency: "RED" },
  { code: "severe_wasting", label: "Very thin, bones showing", group: "digestion", audience: "child", urgency: "RED" },
  { code: "chest_indraw", label: "Chest pulls in when breathing", group: "breathing", audience: "child", urgency: "AMBER" },
  { code: "fast_breathing", label: "Breathing fast", hint: "We'll help you count breaths next", group: "breathing", audience: "child", urgency: "AMBER" },
  { code: "fever_child", label: "Hot body (fever)", group: "fever", audience: "child", urgency: "AMBER" },
  { code: "ear_discharge", label: "Liquid from the ear for 2+ weeks", group: "other", audience: "child", urgency: "AMBER" },
  { code: "palmar_pallor", label: "Very pale palms", group: "skin", audience: "child", urgency: "AMBER" },

  // Pregnancy
  { code: "ob_haemorrhage", label: "Bleeding from the vagina", group: "bleeding", audience: "pregnancy", urgency: "RED" },
  { code: "ob_convulsion", label: "Fits during pregnancy", group: "consciousness", audience: "pregnancy", urgency: "RED" },
  { code: "ob_prolonged_labour", label: "Labour for more than 12 hours", group: "pregnancy", audience: "pregnancy", urgency: "RED" },
  { code: "ob_no_fetal_movement", label: "Baby has not moved for 12+ hours", group: "pregnancy", audience: "pregnancy", urgency: "RED" },
  { code: "ob_fever_pregnancy", label: "Fever during pregnancy", group: "fever", audience: "pregnancy", urgency: "AMBER" },
  { code: "ob_severe_headache", label: "Bad headache with blurry eyes", group: "pain", audience: "pregnancy", urgency: "AMBER" },
  { code: "ob_swollen_face_hands", label: "Swollen face or hands", group: "pregnancy", audience: "pregnancy", urgency: "AMBER" },
  { code: "ob_difficulty_breathing", label: "Hard to breathe during pregnancy", group: "breathing", audience: "pregnancy", urgency: "AMBER" },

  // Everyone
  { code: "chest_pain", label: "Chest pain or pressure", group: "pain", audience: "all", urgency: "RED" },
  { code: "stroke_symptoms", label: "Face drooping, arm weak or speech changed suddenly", group: "consciousness", audience: "all", urgency: "RED" },
  { code: "difficulty_breathing", label: "Very hard to breathe", group: "breathing", audience: "all", urgency: "RED" },
  { code: "coughing_blood", label: "Coughing up blood", group: "bleeding", audience: "all", urgency: "RED" },
  { code: "vomiting_blood", label: "Vomiting blood", group: "bleeding", audience: "all", urgency: "RED" },
  { code: "loss_consciousness", label: "Fainted or passed out", group: "consciousness", audience: "all", urgency: "RED" },
  { code: "severe_bleeding", label: "Heavy bleeding that won't stop", group: "bleeding", audience: "all", urgency: "RED" },
  { code: "seizure", label: "Having a fit right now", group: "consciousness", audience: "all", urgency: "RED" },
  { code: "high_fever_adult", label: "High fever (38.5°C or more)", group: "fever", audience: "adult", urgency: "AMBER" },
  { code: "persistent_vomiting", label: "Vomiting for more than 2 days", group: "digestion", audience: "all", urgency: "AMBER" },
  { code: "severe_abdominal_pain", label: "Strong pain in the belly", group: "pain", audience: "all", urgency: "AMBER" },
  { code: "dehydration", label: "Very thirsty, dry mouth, little urine", group: "digestion", audience: "all", urgency: "AMBER" },
  { code: "altered_mental_state", label: "Confused or not making sense", group: "consciousness", audience: "all", urgency: "AMBER" },
  { code: "weakness_one_side", label: "Weak or numb on one side of the body", group: "consciousness", audience: "all", urgency: "AMBER" },
  { code: "jaundice", label: "Yellow eyes or skin", group: "skin", audience: "all", urgency: "AMBER" },
  { code: "unable_walk", label: "Cannot walk or stand alone", group: "other", audience: "all", urgency: "AMBER" },
  { code: "cough_mild", label: "Mild cough (less than 2 weeks)", group: "breathing", audience: "all", urgency: "GREEN" },
  { code: "cold_flu", label: "Cold or mild flu", group: "fever", audience: "all", urgency: "GREEN" },
  { code: "headache_mild", label: "Mild headache", group: "pain", audience: "all", urgency: "GREEN" },
  { code: "skin_rash_mild", label: "Mild skin rash", group: "skin", audience: "all", urgency: "GREEN" },
  { code: "back_pain_mild", label: "Mild back pain", group: "pain", audience: "all", urgency: "GREEN" },
]

export function symptomsFor({ ageMonths, isPregnant }: { ageMonths: number; isPregnant: boolean }) {
  const isChild = ageMonths <= 60
  return SYMPTOMS.filter(
    (s) =>
      s.audience === "all" ||
      (s.audience === "child" && isChild) ||
      (s.audience === "adult" && !isChild) ||
      (s.audience === "pregnancy" && isPregnant),
  )
}
