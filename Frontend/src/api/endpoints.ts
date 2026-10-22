import { request } from "./client"
import type {
  CaseDetail,
  Consultation,
  Facility,
  HouseholdMember,
  Message,
  Payment,
  Prescription,
  Profile,
  Referral,
  SyncResponse,
  TriageResult,
  Urgency,
} from "./types"

export const profileApi = {
  get: () => request<Profile>("profile", "/profile"),
  update: (body: Pick<Profile, "display_name" | "locale">) =>
    request<{ updated: string[] }>("profile", "/profile", { method: "PUT", body }),
  addMember: (body: Omit<HouseholdMember, "member_id">) =>
    request<HouseholdMember>("profile", "/profile/household", { method: "POST", body }),
  removeMember: (memberId: string) =>
    request<{ deleted: string }>("profile", `/profile/household/${memberId}`, {
      method: "DELETE",
    }),
}

export const facilityApi = {
  list: (lastKey?: string) =>
    request<{ facilities: Facility[]; next_key: string | null }>("facility", "/facilities", {
      auth: false,
      query: { last_key: lastKey },
    }),
  get: (id: string) => request<Facility>("facility", `/facilities/${id}`, { auth: false }),
}

export const triageApi = {
  list: () => request<{ results: TriageResult[]; count: number }>("triage", "/triage"),
  get: (id: string) => request<TriageResult>("triage", `/triage/${id}`),
}

export interface NewConsultation {
  complaint: string
  patient_id?: string
  on_behalf_member_id?: string | null
  triage_result_id?: string | null
  urgency?: Urgency | null
}

export interface SyncBody {
  triage_results: (Omit<TriageResult, "synced_from_offline" | "created_at"> & {
    queued_at: number
  })[]
  messages: (Pick<
    Message,
    | "consultation_id"
    | "client_message_id"
    | "content_type"
    | "text_body"
    | "voice_note_key"
    | "duration_seconds"
    | "created_at"
  > & { message_id: string; sender_role: "patient" })[]
}

export const consultApi = {
  list: () =>
    request<{ consultations: Consultation[]; count: number }>("consultation", "/consultations"),
  get: (id: string) =>
    request<{ consultation: Consultation; messages: Message[] }>(
      "consultation",
      `/consultations/${id}`,
    ),
  create: (body: NewConsultation) =>
    request<Consultation>("consultation", "/consultations", { method: "POST", body }),
  postMessage: (
    id: string,
    body: Pick<Message, "client_message_id" | "content_type"> &
      Partial<Pick<Message, "text_body" | "voice_note_key" | "duration_seconds">>,
  ) => request<Message>("consultation", `/consultations/${id}/messages`, { method: "POST", body }),
  voiceUploadUrl: (id: string) =>
    request<{ upload_url: string; voice_note_key: string }>(
      "consultation",
      `/consultations/${id}/voice-note-upload-url`,
      { method: "POST", body: {} },
    ),
  voiceDownloadUrl: (id: string, messageId: string) =>
    request<{ download_url: string; expires_in: number }>(
      "consultation",
      `/consultations/${id}/voice-note/${messageId}`,
    ),
  sync: (body: SyncBody) =>
    request<SyncResponse>("consultation", "/sync", { method: "POST", body }),
}

export const paymentApi = {
  initiate: (body: { consultation_id: string; phone: string; redirect_url: string }) =>
    request<{ payment_id: string; payment_url: string; fapshi_ref: string }>(
      "payment",
      "/payments/initiate",
      { method: "POST", body },
    ),
  get: (id: string) => request<Payment>("payment", `/payments/${id}`),
  list: () => request<{ payments: Payment[]; count: number }>("payment", "/payments"),
}

export const doctorApi = {
  queue: () => request<{ queue: Consultation[]; count: number }>("doctor", "/doctor/queue"),
  getCase: (id: string) => request<CaseDetail>("doctor", `/doctor/queue/${id}`),
  claim: (id: string) =>
    request<{ consultation_id: string; doctor_id: string; status: "open" }>(
      "doctor",
      `/doctor/queue/${id}/claim`,
      { method: "PUT" },
    ),
  close: (id: string) =>
    request<{ consultation_id: string; status: "closed" }>(
      "doctor",
      `/consultations/${id}/close`,
      { method: "PUT" },
    ),
  prescribe: (id: string, body: { medication_details: string; instructions: string }) =>
    request<{ code: string }>("doctor", `/consultations/${id}/prescription`, {
      method: "POST",
      body,
    }),
  refer: (id: string, body: { target_facility_id: string; reason: string }) =>
    request<{ code: string }>("doctor", `/consultations/${id}/referral`, {
      method: "POST",
      body,
    }),
  prescription: (code: string) =>
    request<Prescription>("doctor", `/prescriptions/${code}`, { auth: false }),
  referral: (code: string) => request<Referral>("doctor", `/referrals/${code}`, { auth: false }),
}
