import { request } from "./client"
import type { Facility, HealthTip, Locale, Urgency } from "./types"

export interface Appointment {
  appointment_id: string
  patient_id: string
  facility_id: string
  slot_date: string
  slot_label: "morning" | "afternoon" | "evening"
  note: string
  status: "requested" | "confirmed" | "cancelled"
  created_at: number
  updated_at: number
}
export const LAB_STEPS = [
  "requested",
  "sample_collected",
  "results_ready",
  "delivered",
] as const
export type LabStatus = (typeof LAB_STEPS)[number]
export interface LabRequest {
  request_id: string
  patient_id: string
  test_type: string
  facility_id: string
  collection_address: string
  status: LabStatus
  payment_id: string | null
  result_summary: string | null
  created_at: number
  updated_at: number
}
export const BLOOD_TYPES = [
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
] as const
export interface BloodRequest {
  request_id: string
  requesting_facility_id: string
  requested_by: string
  blood_type: (typeof BLOOD_TYPES)[number]
  units: number
  urgency: Urgency
  status: "pending"
  created_at: number
  updated_at: number
}
export interface Emergency {
  emergency_id: string
  user_id: string
  latitude: number
  longitude: number
  triage_result_id: string | null
  timestamp: number
  ttl: number
  alert_sent: boolean
}
export interface CallbackRequest {
  request_id: string
  phone: string
  urgency: Urgency
  status: "pending" | "handled"
  created_at: number
}
export type TipInput = Omit<HealthTip, "tip_id">
export type FacilityInput = Omit<Facility, "facility_id">
export const serviceApi = {
  tips: (
    query: {
      locale?: Locale
      tag?: string
      limit?: string
      next_token?: string
    } = {}
  ) =>
    request<{ tips: HealthTip[]; count: number; next_token?: string }>(
      "extended",
      "/health-tips",
      { auth: false, query }
    ),
  appointments: (status?: Appointment["status"]) =>
    request<{ appointments: Appointment[]; count: number }>(
      "extended",
      "/appointments",
      { query: { status } }
    ),
  requestAppointment: (
    body: Pick<Appointment, "facility_id" | "slot_date" | "slot_label" | "note">
  ) =>
    request<Appointment>("extended", "/appointments", { method: "POST", body }),
  cancelAppointment: (id: string) =>
    request<Appointment>(
      "extended",
      `/appointments/${encodeURIComponent(id)}`,
      { method: "DELETE" }
    ),
  confirmAppointment: (id: string) =>
    request<Appointment>(
      "extended",
      `/appointments/${encodeURIComponent(id)}/confirm`,
      { method: "PUT" }
    ),
  labs: () =>
    request<{ lab_requests: LabRequest[]; count: number }>(
      "extended",
      "/lab-requests"
    ),
  lab: (id: string) =>
    request<LabRequest>("extended", `/lab-requests/${encodeURIComponent(id)}`),
  requestLab: (
    body: Pick<LabRequest, "test_type" | "facility_id" | "collection_address">
  ) =>
    request<LabRequest>("extended", "/lab-requests", { method: "POST", body }),
  updateLab: (
    id: string,
    body: { status: LabStatus; result_summary?: string }
  ) =>
    request<LabRequest>(
      "extended",
      `/lab-requests/${encodeURIComponent(id)}/status`,
      { method: "PUT", body }
    ),
  requestBlood: (
    body: Pick<
      BloodRequest,
      "requesting_facility_id" | "blood_type" | "units" | "urgency"
    >
  ) =>
    request<
      BloodRequest & {
        blood_bank_facilities: Pick<
          Facility,
          "facility_id" | "name" | "phone"
        >[]
      }
    >("extended", "/blood-requests", { method: "POST", body }),
  blood: () =>
    request<{ blood_requests: BloodRequest[]; count: number }>(
      "extended",
      "/blood-requests"
    ),
  emergency: (body: {
    latitude: number
    longitude: number
    triage_result_id?: string
  }) => request<Emergency>("extended", "/emergency", { method: "POST", body }),
  emergencies: () =>
    request<{ emergencies: Emergency[]; count: number }>(
      "extended",
      "/operator/emergencies"
    ),
  callbacks: () =>
    request<{ callbacks: CallbackRequest[]; count: number }>(
      "channel",
      "/operator/callbacks"
    ),
  handleCallback: (id: string, note: string) =>
    request<{ request_id: string; status: "handled" }>(
      "channel",
      `/operator/callbacks/${encodeURIComponent(id)}/handle`,
      { method: "PUT", body: { note } }
    ),
  dispatch: (body: { facility_id: string; note: string; urgency?: Urgency }) =>
    request<{ log_id: string }>("channel", "/operator/dispatch-log", {
      method: "POST",
      body,
    }),
  createTip: (body: TipInput) =>
    request<HealthTip>("extended", "/health-tips", { method: "POST", body }),
  updateTip: (id: string, body: Partial<TipInput>) =>
    request<HealthTip>("extended", `/health-tips/${encodeURIComponent(id)}`, {
      method: "PUT",
      body,
    }),
  deleteTip: (id: string) =>
    request<{ deleted: string }>(
      "extended",
      `/health-tips/${encodeURIComponent(id)}`,
      { method: "DELETE" }
    ),
  createFacility: (body: Omit<FacilityInput, "is_active">) =>
    request<Facility>("facility", "/facilities", { method: "POST", body }),
  updateFacility: (id: string, body: Partial<FacilityInput>) =>
    request<Facility>("facility", `/facilities/${encodeURIComponent(id)}`, {
      method: "PUT",
      body,
    }),
  presence: () =>
    request<{ doctor_id: string; last_seen: number; is_online: true }>(
      "extended",
      "/doctor/presence",
      { method: "PUT", body: {} }
    ),
}
