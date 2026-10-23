export type Urgency = "RED" | "AMBER" | "GREEN"
export type Sex = "male" | "female" | "other"
export type Locale = "en" | "fr" | "pid"

export type Capability =
  | "general"
  | "maternity"
  | "emergency"
  | "laboratory"
  | "pharmacy"
  | "blood_bank"
  | "x_ray"
  | "dental"
  | "eye_clinic"

export interface Facility {
  facility_id: string
  name: string
  region: string
  quarter: string
  address: string
  phone: string
  latitude: number
  longitude: number
  capabilities: Capability[]
  opening_hours: string | Record<string, string>
  has_backup_power: boolean
  accepts_csu_card: boolean
  consultation_fee_xaf: number
  is_active: boolean
}

export interface HouseholdMember {
  member_id: string
  name: string
  dob: string
  sex: Sex
  relationship: string
}

export interface Profile {
  user_id: string
  display_name?: string
  phone?: string
  date_of_birth?: string
  sex?: Sex
  locale?: Locale
  on_behalf_profiles?: HouseholdMember[]
}

export interface RuleFired {
  rule_id: string
  description: string
  urgency: Urgency
  value_that_triggered: string | number
}

export interface SymptomPayload {
  age_months: number
  is_pregnant: boolean
  symptoms: string[]
  vitals: { resp_rate?: number }
  sex?: Sex
}

export interface TriageResult {
  result_id: string
  urgency: Urgency
  recommendation: string
  facility_type_needed: string
  rules_fired: RuleFired[]
  symptom_payload: SymptomPayload
  on_behalf_member_id: string | null
  synced_from_offline: boolean
  created_at: number
}

export type ConsultationStatus = "pending_payment" | "paid" | "open" | "closed"

export interface Consultation {
  consultation_id: string
  patient_id: string
  phone_owner_id: string
  on_behalf_member_id: string | null
  triage_result_id: string | null
  complaint: string
  status: ConsultationStatus
  urgency: Urgency | null
  doctor_id: string | null
  created_at: number
  updated_at: number
}

export interface Message {
  consultation_id: string
  message_id: string
  sender_id: string
  sender_role: "patient" | "doctor"
  content_type: "text" | "voice_note"
  text_body: string | null
  voice_note_key: string | null
  duration_seconds: number | null
  client_message_id: string
  created_at: number
}

export type PaymentStatus = "initiated" | "confirmed" | "failed"

export interface Payment {
  payment_id: string
  consultation_id: string
  payer_id: string
  patient_id: string
  amount_xaf: number
  fapshi_ref: string
  status: PaymentStatus
  receipt_data?: { reference?: string; amount?: number; timestamp?: number; payer_phone?: string }
  created_at: number
  confirmed_at: number | null
}

export interface Prescription {
  code: string
  consultation_id: string
  doctor_id: string
  patient_id: string
  medication_details: string
  instructions: string
  issued_at: number
  status: "active" | "dispensed"
}

export interface Referral {
  code: string
  consultation_id: string
  doctor_id: string
  patient_id: string
  target_facility_id: string
  reason: string
  issued_at: number
  status: "active" | "used"
}

export interface CaseDetail {
  consultation: Consultation
  messages: Message[]
  triage_result: TriageResult | null
}

export const SPECIALTIES = [
  { value: "general_practice", label: "General Practice / Family Medicine" },
  { value: "internal_medicine", label: "Internal Medicine" },
  { value: "pediatrics", label: "Pediatrics" },
  { value: "surgery", label: "Surgery (General)" },
  { value: "obstetrics_gynecology", label: "Obstetrics & Gynecology" },
  { value: "cardiology", label: "Cardiology" },
  { value: "dermatology", label: "Dermatology" },
  { value: "psychiatry", label: "Psychiatry / Mental Health" },
  { value: "orthopedics", label: "Orthopedics" },
  { value: "ent", label: "ENT (Ear, Nose & Throat)" },
  { value: "ophthalmology", label: "Ophthalmology" },
  { value: "neurology", label: "Neurology" },
  { value: "emergency_medicine", label: "Emergency Medicine" },
  { value: "infectious_disease", label: "Infectious Disease" },
  { value: "urology", label: "Urology" },
  { value: "oncology", label: "Oncology" },
  { value: "radiology", label: "Radiology" },
  { value: "anesthesiology", label: "Anesthesiology" },
  { value: "endocrinology", label: "Endocrinology" },
  { value: "nephrology", label: "Nephrology" },
  { value: "pulmonology", label: "Pulmonology" },
] as const

export type Specialty = typeof SPECIALTIES[number]["value"]

export interface HospitalEntry {
  name: string
  city: string
  role: string
  from_year: number
  to_year: number | null
}

export interface RecommendingHospital {
  name: string
  contact_person: string
  phone: string
  email: string
}

export interface DoctorApplication {
  application_id: string
  full_name: string
  email: string
  phone: string
  specialty: Specialty
  medical_school: string
  graduation_year: number
  years_experience: number
  hospitals_worked: HospitalEntry[]
  recommending_hospital: RecommendingHospital
  document_s3_key: string
  status: "pending" | "under_review" | "approved" | "rejected"
  admin_notes?: string
  called_hospital?: boolean
  submitted_at: string
  reviewed_at?: string | null
  rejection_reason?: string
  document_url?: string
}

export interface PushSubscriptionJSON {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export interface SyncResponse {
  synced: boolean
  has_red_triage: boolean
  results: {
    triage_results: { result_id: string; status: "ok" | "error" }[]
    messages: { message_id: string; status: "ok" | "duplicate" | "error" }[]
  }
}
