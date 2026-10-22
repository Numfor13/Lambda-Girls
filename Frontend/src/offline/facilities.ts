import { useLiveQuery } from "dexie-react-hooks"
import { facilityApi } from "@/api/endpoints"
import type { Facility } from "@/api/types"
import seed from "@/data/facilities.seed.json"
import { db, getMeta, setMeta } from "./db"

const DAY = 24 * 3600 * 1000

/** First run (even offline): load the bundled directory so the list is never empty. */
export async function ensureFacilitiesSeeded() {
  if ((await db.facilities.count()) > 0) return
  await db.facilities.bulkPut(seed as Facility[])
  await setMeta("facilities_synced_at", null)
}

export async function refreshFacilities(): Promise<void> {
  const all: Facility[] = []
  let lastKey: string | undefined
  do {
    const page = await facilityApi.list(lastKey)
    all.push(...page.facilities)
    lastKey = page.next_key ?? undefined
  } while (lastKey)
  if (all.length === 0) return
  await db.transaction("rw", db.facilities, async () => {
    await db.facilities.clear()
    await db.facilities.bulkPut(all.filter((f) => f.is_active !== false))
  })
  await setMeta("facilities_synced_at", Date.now())
}

export async function refreshFacilitiesIfStale() {
  if (!navigator.onLine) return
  const last = await getMeta<number | null>("facilities_synced_at")
  if (last && Date.now() - last < DAY) return
  await refreshFacilities().catch(() => undefined)
}

export function useFacilities(): Facility[] | undefined {
  return useLiveQuery(() => db.facilities.toArray(), [])
}

export function useFacility(id: string | undefined): Facility | null | undefined {
  return useLiveQuery(async () => (id ? ((await db.facilities.get(id)) ?? null) : null), [id])
}

export function useFacilitiesSyncedAt(): number | null | undefined {
  return useLiveQuery(() => getMeta<number | null>("facilities_synced_at"), [])
}
