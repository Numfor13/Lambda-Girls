import { request } from "./client"
import { env } from "@/config/env"
import { SPECIALTIES, type Specialty } from "./types"

export const DOCUMENTS = [
  { key: "onmc_certificate", label: "ONMC registration certificate" },
  { key: "onmc_card", label: "Current ONMC card" },
  { key: "medical_degree", label: "Medical degree" },
  { key: "identity_document", label: "National identity card or passport" },
  {
    key: "selfie_with_ids",
    label: "Photo of you holding your ID and ONMC card",
  },
] as const
export type DocumentType = (typeof DOCUMENTS)[number]["key"]
export const APPLICATION_STATUSES = [
  "pending",
  "under_review",
  "approving",
  "approved",
  "rejected",
] as const
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]
export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  pending: "Pending review",
  under_review: "Under review",
  approving: "Creating staff account",
  approved: "Approved",
  rejected: "Not approved",
}
export const CHECKS = [
  {
    key: "onmc_register_verified",
    label: "ONMC registration verified against the register",
  },
  {
    key: "documents_consistent",
    label: "Names and credentials match across all documents",
  },
  {
    key: "selfie_matches",
    label: "Photo matches the identity document and ONMC card",
  },
] as const
export type Checks = Record<(typeof CHECKS)[number]["key"], boolean>
export interface ApplicationFields {
  full_name: string
  email: string
  phone: string
  specialty: Specialty
  medical_school: string
  graduation_year: number
  onmc_number: string
  identity_document_type: "cni" | "passport"
  identity_document_number: string
}
export interface PublicApplicationStatus {
  application_id: string
  status: ApplicationStatus
  submitted_at: number
  reviewed_at: number | null
  rejection_reason: string | null
}
export interface DoctorApplication extends ApplicationFields {
  application_id: string
  status: ApplicationStatus
  checks: Checks
  admin_notes: string
  duplicate_onmc: boolean
  submitted_at: number
  updated_at: number
  reviewed_at?: number
  rejection_reason?: string
  doctor_user_id?: string
}
export interface ApplicationDetail extends DoctorApplication {
  document_urls: Partial<Record<DocumentType, string>>
  duplicates: {
    onmc_number: { application_id: string; status: ApplicationStatus }[]
    email: { application_id: string; status: ApplicationStatus }[]
  }
}
export interface UploadReservation {
  application_id: string
  expires_in: number
  uploads: Record<DocumentType, { url: string; fields: Record<string, string> }>
}
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024
export function documentError(
  file: Pick<File, "type" | "size">,
  kind: DocumentType
) {
  const allowed =
    kind === "selfie_with_ids"
      ? ["image/jpeg", "image/png"]
      : ["application/pdf", "image/jpeg", "image/png"]
  if (!allowed.includes(file.type))
    return kind === "selfie_with_ids"
      ? "Choose a JPG or PNG photo."
      : "Choose a PDF, JPG or PNG."
  if (!file.size || file.size > MAX_DOCUMENT_BYTES)
    return "Choose a file between 1 byte and 5 MB."
}
export const applicationIdValid = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
export const specialtyLabel = (s: string) =>
  SPECIALTIES.find((x) => x.value === s)?.label ?? s
const base = "/doctor-applications"
const admin = "/admin/doctor-applications"
export const doctorApplicationApi = {
  reserve: (documents: Record<DocumentType, string>) =>
    request<UploadReservation>("doctorApplication", base + "/uploads", {
      method: "POST",
      body: { documents },
      auth: false,
    }),
  submit: (body: ApplicationFields & { application_id: string }) =>
    request<{ application_id: string; status: "pending" }>(
      "doctorApplication",
      base,
      { method: "POST", body, auth: false }
    ),
  getStatus: (id: string) =>
    request<PublicApplicationStatus>(
      "doctorApplication",
      base + "/" + encodeURIComponent(id),
      { auth: false }
    ),
  adminList: (status: ApplicationStatus = "pending") =>
    request<{ applications: DoctorApplication[]; count: number }>(
      "doctorApplication",
      admin,
      { query: { status } }
    ),
  adminGet: (id: string) =>
    request<ApplicationDetail>(
      "doctorApplication",
      admin + "/" + encodeURIComponent(id)
    ),
  adminUpdate: (id: string, body: { admin_notes: string; checks: Checks }) =>
    request<{ updated: string; status: "under_review"; checks: Checks }>(
      "doctorApplication",
      admin + "/" + encodeURIComponent(id),
      { method: "PUT", body }
    ),
  adminApprove: (id: string) =>
    request<{ approved: string; email: string }>(
      "doctorApplication",
      admin + "/" + encodeURIComponent(id) + "/approve",
      { method: "POST", body: {} }
    ),
  adminReject: (id: string, reason: string) =>
    request<{ rejected: string }>(
      "doctorApplication",
      admin + "/" + encodeURIComponent(id) + "/reject",
      { method: "POST", body: { reason } }
    ),
  resendInvite: (id: string) =>
    request<{ resent: string }>(
      "doctorApplication",
      admin + "/" + encodeURIComponent(id) + "/resend-invite",
      { method: "POST", body: {} }
    ),
}
export async function uploadApplicationDocument(
  reservation: UploadReservation,
  kind: DocumentType,
  file: File
) {
  const invalid = documentError(file, kind)
  if (invalid) throw new Error(invalid)
  if (env.useMockApi) return // Demo files stay in memory; nothing is uploaded or persisted.
  const { url, fields } = reservation.uploads[kind]
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.append(key, value)
  data.append("file", file) // S3 requires file last; let the browser set the multipart boundary.
  const response = await fetch(url, {
    method: "POST",
    body: data,
    credentials: "omit",
  })
  if (!response.ok)
    throw new Error("Document upload failed. Check your connection and retry.")
}
