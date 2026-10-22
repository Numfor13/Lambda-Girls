import { ulid } from "ulid"
import { db, type OutboxKind, type SyncState } from "./db"

export const MAX_ATTEMPTS = 5

export async function enqueue(kind: OutboxKind, ref: string) {
  const now = Date.now()
  await db.outbox.put({
    id: ulid(),
    kind,
    ref,
    attempts: 0,
    last_error: null,
    next_attempt_at: now,
    failed: 0,
    created_at: now,
  })
  window.dispatchEvent(new Event("carebridge:outbox"))
}

export function backoffMs(attempts: number) {
  return Math.min(60_000, 2_000 * 2 ** Math.max(0, attempts - 1))
}

export async function retryFailed(ref?: string) {
  const items = await db.outbox.filter((i) => i.failed === 1 && (!ref || i.ref === ref)).toArray()
  await Promise.all(
    items.map((i) =>
      db.outbox.update(i.id, { failed: 0, attempts: 0, next_attempt_at: Date.now() }),
    ),
  )
  await Promise.all(items.map((i) => setRecordState(i.kind, i.ref, "queued")))
  window.dispatchEvent(new Event("carebridge:outbox"))
}

export async function setRecordState(kind: OutboxKind, ref: string, state: SyncState) {
  if (kind === "triage") await db.triage_results.update(ref, { sync_state: state })
  else if (kind === "consultation") await db.consultations.update(ref, { sync_state: state })
  else await db.messages.update(ref, { sync_state: state })
}
