import { ApiError } from "@/api/client"
import { consultApi, triageApi, type SyncBody } from "@/api/endpoints"
import { currentSession } from "@/auth/session"
import { db, type OutboxItem } from "./db"
import { backoffMs, MAX_ATTEMPTS, setRecordState } from "./outbox"

const BATCH_SIZE = 25
let current: Promise<void> | null = null

class OfflineAbort extends Error {}

/** A consultation created offline has no server id until it syncs. */
export async function resolveConsultationId(ref: string): Promise<string | undefined> {
  const local =
    (await db.consultations.get(ref)) ??
    (await db.consultations.where("consultation_id").equals(ref).first())
  if (!local) return ref
  return local.consultation_id
}

async function fail(item: OutboxItem, error: unknown) {
  if (error instanceof ApiError && error.isOffline) throw new OfflineAbort()
  const attempts = item.attempts + 1
  const failed = attempts >= MAX_ATTEMPTS
  await db.outbox.update(item.id, {
    attempts,
    failed: failed ? 1 : 0,
    last_error: error instanceof Error ? error.message : String(error),
    next_attempt_at: Date.now() + backoffMs(attempts),
  })
  await setRecordState(item.kind, item.ref, failed ? "failed" : "queued")
}

async function done(item: OutboxItem) {
  await db.outbox.delete(item.id)
  await setRecordState(item.kind, item.ref, "sent")
}

/** The backend is the source of truth for triage: once a result has synced, take its answer. */
async function adoptServerTriage(resultId: string) {
  try {
    const r = await triageApi.get(resultId)
    await db.triage_results.update(resultId, {
      urgency: r.urgency,
      recommendation: r.recommendation,
      facility_type_needed: r.facility_type_needed,
      rules_fired: r.rules_fired,
    })
  } catch {
    // The local result (same rules) stays until the next look-up.
  }
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

async function syncTriage(items: OutboxItem[]) {
  for (const batch of chunk(items, BATCH_SIZE)) {
    const records = await db.triage_results.bulkGet(batch.map((i) => i.ref))
    const body: SyncBody = { triage_results: [], messages: [] }
    for (const r of records) {
      if (!r) continue
      body.triage_results.push({
        result_id: r.result_id,
        symptom_payload: r.symptom_payload,
        on_behalf_member_id: r.on_behalf_member_id,
        queued_at: r.created_at,
      })
    }
    await Promise.all(batch.map((i) => setRecordState("triage", i.ref, "syncing")))
    try {
      const res = await consultApi.sync(body)
      const status = new Map(res.results.triage_results.map((r) => [r.result_id, r.status]))
      for (const item of batch) {
        if (status.get(item.ref) === "error") await fail(item, new Error("Server rejected item"))
        else {
          await done(item)
          await adoptServerTriage(item.ref)
        }
      }
    } catch (e) {
      for (const item of batch) await fail(item, e)
    }
  }
}

async function syncConsultation(item: OutboxItem) {
  const rec = await db.consultations.get(item.ref)
  if (!rec) return db.outbox.delete(item.id)
  if (rec.consultation_id) return done(item)
  await setRecordState("consultation", item.ref, "syncing")
  try {
    const created = await consultApi.create({
      complaint: rec.complaint,
      patient_id: rec.patient_id,
      on_behalf_member_id: rec.on_behalf_member_id,
      triage_result_id: rec.triage_result_id,
      urgency: rec.urgency,
    })
    await db.consultations.update(rec.local_id, {
      consultation_id: created.consultation_id,
      status: created.status,
    })
    await done(item)
  } catch (e) {
    await fail(item, e)
  }
}

/** Uploads a recording through a presigned URL and returns its storage key. */
export async function uploadVoiceBlob(consultationId: string, blob: Blob): Promise<string> {
  const { upload_url, voice_note_key } = await consultApi.voiceUploadUrl(consultationId)
  if (upload_url.startsWith("mock://")) {
    await db.mock_files.put({ key: voice_note_key, blob })
    return voice_note_key
  }
  let res: Response
  try {
    res = await fetch(upload_url, {
      method: "PUT",
      headers: { "Content-Type": "audio/opus" },
      body: blob,
    })
  } catch {
    throw new ApiError(0, "Network unavailable")
  }
  if (!res.ok) throw new ApiError(res.status, "Voice note upload failed")
  return voice_note_key
}

async function uploadVoice(consultationId: string, clientMessageId: string) {
  const voice = await db.voice_blobs.get(clientMessageId)
  if (!voice) throw new Error("Voice recording is missing on this device")
  const voice_note_key = await uploadVoiceBlob(consultationId, voice.blob)
  await consultApi.postMessage(consultationId, {
    client_message_id: clientMessageId,
    content_type: "voice_note",
    voice_note_key,
    duration_seconds: voice.duration_seconds,
  })
}

async function syncMessages(items: OutboxItem[]) {
  const textBatch: { item: OutboxItem; msg: SyncBody["messages"][number] }[] = []
  for (const item of items) {
    const msg = await db.messages.get(item.ref)
    if (!msg) {
      await db.outbox.delete(item.id)
      continue
    }
    const consultationId = await resolveConsultationId(msg.consultation_ref)
    if (!consultationId) continue
    if (msg.content_type === "voice_note") {
      await setRecordState("message", item.ref, "syncing")
      try {
        await uploadVoice(consultationId, msg.client_message_id)
        await done(item)
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) await done(item)
        else await fail(item, e)
      }
      continue
    }
    textBatch.push({
      item,
      msg: {
        consultation_id: consultationId,
        message_id: msg.client_message_id,
        client_message_id: msg.client_message_id,
        sender_role: "patient",
        content_type: "text",
        text_body: msg.text_body,
        voice_note_key: null,
        duration_seconds: null,
        created_at: msg.created_at,
      },
    })
  }

  for (const batch of chunk(textBatch, BATCH_SIZE)) {
    await Promise.all(batch.map((b) => setRecordState("message", b.item.ref, "syncing")))
    try {
      const res = await consultApi.sync({ triage_results: [], messages: batch.map((b) => b.msg) })
      const status = new Map(res.results.messages.map((r) => [r.message_id, r.status]))
      for (const { item } of batch) {
        if (status.get(item.ref) === "error") await fail(item, new Error("Server rejected message"))
        else await done(item)
      }
    } catch (e) {
      for (const { item } of batch) await fail(item, e)
    }
  }
}

/** Callers wait for any in-flight run, then run again so their own new items are included. */
export async function syncOutbox(): Promise<void> {
  while (current) await current
  current = runSync()
  try {
    await current
  } finally {
    current = null
  }
}

/** Order matters: triage first so RED escalation fires server-side, then consultations, then messages. */
async function runSync(): Promise<void> {
  if (!navigator.onLine) return
  if (!(await currentSession())) return
  const now = Date.now()
  const due = (await db.outbox.orderBy("created_at").toArray()).filter(
    (i) => i.failed === 0 && i.next_attempt_at <= now,
  )
  if (due.length === 0) return
  try {
    await syncTriage(due.filter((i) => i.kind === "triage"))
    for (const item of due.filter((i) => i.kind === "consultation")) await syncConsultation(item)
    await syncMessages(due.filter((i) => i.kind === "message"))
  } catch (e) {
    if (!(e instanceof OfflineAbort)) console.error("Sync failed", e)
  } finally {
    window.dispatchEvent(new Event("carebridge:synced"))
  }
}
