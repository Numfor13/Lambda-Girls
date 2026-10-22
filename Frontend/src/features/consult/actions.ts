import { ulid } from "ulid"
import type { ConsultationStatus, Urgency } from "@/api/types"
import { db, type LocalConsultation } from "@/offline/db"
import { enqueue } from "@/offline/outbox"
import { syncOutbox } from "@/offline/sync"
import type { Recording } from "@/offline/voiceRecorder"

export const STATUS_LABEL: Record<ConsultationStatus, string> = {
  pending_payment: "Waiting for payment",
  paid: "Waiting for a doctor",
  open: "Open",
  closed: "Closed",
}

export async function findLocalConsultation(ref: string): Promise<LocalConsultation | undefined> {
  return (
    (await db.consultations.get(ref)) ??
    (await db.consultations.where("consultation_id").equals(ref).first())
  )
}

export async function createConsultation(input: {
  complaint: string
  subjectLabel: string
  patientId?: string
  memberId: string | null
  triageResultId: string | null
  urgency: Urgency | null
  voice: Recording | null
}): Promise<LocalConsultation> {
  const localId = ulid()
  const now = Date.now()
  await db.consultations.put({
    local_id: localId,
    complaint: input.complaint,
    status: "pending_payment",
    urgency: input.urgency,
    on_behalf_member_id: input.memberId,
    patient_id: input.patientId,
    triage_result_id: input.triageResultId,
    subject_label: input.subjectLabel,
    created_at: now,
    sync_state: "queued",
  })
  await enqueue("consultation", localId)
  if (input.voice) await sendVoice(localId, input.voice, false)
  await syncOutbox()
  return (await db.consultations.get(localId))!
}

export async function sendText(consultationRef: string, text: string) {
  const id = ulid()
  await db.messages.put({
    client_message_id: id,
    consultation_ref: consultationRef,
    content_type: "text",
    text_body: text,
    duration_seconds: null,
    created_at: Date.now(),
    sync_state: "queued",
  })
  await enqueue("message", id)
  void syncOutbox()
}

export async function sendVoice(consultationRef: string, voice: Recording, sync = true) {
  const id = ulid()
  await db.voice_blobs.put({
    client_message_id: id,
    blob: voice.blob,
    duration_seconds: voice.duration_seconds,
    mime: voice.mime,
  })
  await db.messages.put({
    client_message_id: id,
    consultation_ref: consultationRef,
    content_type: "voice_note",
    text_body: null,
    duration_seconds: voice.duration_seconds,
    created_at: Date.now(),
    sync_state: "queued",
  })
  await enqueue("message", id)
  if (sync) void syncOutbox()
}

const RX = /Prescription code:\s*([0-9A-Za-z]{8})/
const REF = /Referral code:\s*([0-9A-Za-z]{8})/

/** Doctors post issued codes into the chat so patients see them; these pull them back out. */
export function extractCodes(text: string | null) {
  return {
    rx: text?.match(RX)?.[1] ?? null,
    ref: text?.match(REF)?.[1] ?? null,
  }
}
