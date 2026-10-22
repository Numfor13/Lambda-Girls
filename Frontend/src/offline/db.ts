import Dexie, { type Table } from "dexie"
import type { ConsultationStatus, Facility, TriageResult, Urgency } from "@/api/types"

export type SyncState = "queued" | "syncing" | "sent" | "failed"

export interface LocalTriage extends TriageResult {
  sync_state: SyncState
  subject_label: string
}

export interface LocalConsultation {
  local_id: string
  consultation_id?: string
  complaint: string
  status: ConsultationStatus
  urgency: Urgency | null
  on_behalf_member_id: string | null
  patient_id?: string
  triage_result_id: string | null
  subject_label: string
  created_at: number
  sync_state: SyncState
}

export interface LocalMessage {
  client_message_id: string
  consultation_ref: string
  content_type: "text" | "voice_note"
  text_body: string | null
  duration_seconds: number | null
  created_at: number
  sync_state: SyncState
}

export interface VoiceBlob {
  client_message_id: string
  blob: Blob
  duration_seconds: number
  mime: string
}

export type OutboxKind = "triage" | "consultation" | "message"

export interface OutboxItem {
  id: string
  kind: OutboxKind
  ref: string
  attempts: number
  last_error: string | null
  next_attempt_at: number
  failed: 0 | 1
  created_at: number
}

export interface MetaRow {
  key: string
  value: unknown
}

export interface MockFile {
  key: string
  blob: Blob
}

class CareBridgeDB extends Dexie {
  facilities!: Table<Facility, string>
  triage_results!: Table<LocalTriage, string>
  consultations!: Table<LocalConsultation, string>
  messages!: Table<LocalMessage, string>
  voice_blobs!: Table<VoiceBlob, string>
  outbox!: Table<OutboxItem, string>
  meta!: Table<MetaRow, string>
  mock_files!: Table<MockFile, string>

  constructor() {
    super("carebridge")
    this.version(1).stores({
      facilities: "facility_id, name, quarter, *capabilities",
      triage_results: "result_id, created_at, sync_state",
      consultations: "local_id, consultation_id, status, created_at, sync_state",
      messages: "client_message_id, consultation_ref, created_at, sync_state",
      voice_blobs: "client_message_id",
      outbox: "id, kind, ref, created_at",
      meta: "key",
      mock_files: "key",
    })
  }
}

export const db = new CareBridgeDB()

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined
}

export async function setMeta(key: string, value: unknown) {
  await db.meta.put({ key, value })
}

/** Logging out wipes clinical data so the next person on a shared phone can't read it. */
export async function clearClinicalData() {
  await db.transaction(
    "rw",
    [db.triage_results, db.consultations, db.messages, db.voice_blobs, db.outbox, db.meta],
    async () => {
      await Promise.all([
        db.triage_results.clear(),
        db.consultations.clear(),
        db.messages.clear(),
        db.voice_blobs.clear(),
        db.outbox.clear(),
        db.meta.delete("profile"),
      ])
    },
  )
}
