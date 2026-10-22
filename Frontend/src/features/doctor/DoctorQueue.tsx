import { useEffect, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ClipboardList, Clock } from "lucide-react"
import { doctorApi } from "@/api/endpoints"
import { friendlyError } from "@/api/errors"
import type { Consultation } from "@/api/types"
import { useAuth } from "@/auth/AuthProvider"
import { Button } from "@/design/components/Button"
import { EmptyState, Notice, PageSpinner } from "@/design/components/primitives"
import { UrgencyBadge } from "@/design/components/UrgencyBadge"
import { useNow } from "@/lib/hooks"
import { timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"

const RANK = { RED: 0, AMBER: 1, GREEN: 2 } as const
const NEW_WINDOW_MS = 2 * 60_000

export function patientLabel(c: Consultation) {
  if (c.patient_id.startsWith("anon#")) return "Anonymous"
  return c.on_behalf_member_id ? "Household member (on behalf)" : "Patient"
}

function chime() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.6)
  } catch {
    /* audio blocked until the doctor interacts with the page */
  }
}

export function sortQueue(items: Consultation[]) {
  return [...items].sort(
    (a, b) => RANK[a.urgency ?? "GREEN"] - RANK[b.urgency ?? "GREEN"] || a.created_at - b.created_at,
  )
}

export default function DoctorQueue() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const now = useNow(15_000)
  const [tab, setTab] = useState<"waiting" | "mine">("waiting")
  const queue = useQuery({ queryKey: ["doctor-queue"], queryFn: doctorApi.queue, refetchInterval: 20_000 })
  const seenRed = useRef<Set<string> | null>(null)

  useEffect(() => {
    if (!queue.data) return
    const red = queue.data.queue.filter((c) => c.urgency === "RED" && c.status === "paid")
    if (seenRed.current && red.some((c) => !seenRed.current!.has(c.consultation_id))) chime()
    seenRed.current = new Set(red.map((c) => c.consultation_id))
  }, [queue.data])

  const claim = useMutation({
    mutationFn: doctorApi.claim,
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ["doctor-queue"] })
      navigate(`/doctor/case/${res.consultation_id}`)
    },
  })

  if (queue.isPending) return <PageSpinner />

  const all = sortQueue(queue.data?.queue ?? [])
  const waiting = all.filter((c) => c.status === "paid")
  const mine = all.filter((c) => c.status === "open" && c.doctor_id === session?.sub)
  const rows = tab === "waiting" ? waiting : mine

  return (
    <div className="mx-auto max-w-4xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-headline-l lg:text-display-m">Queue</h1>
          <p className="text-body-l text-ink-600">
            {waiting.length} waiting · most urgent first, then oldest
          </p>
        </div>
      </header>

      <div className="mt-6 inline-flex rounded-md bg-white p-1 ring-1 ring-line" role="tablist">
        {(
          [
            ["waiting", `Waiting (${waiting.length})`],
            ["mine", `My open cases (${mine.length})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "h-10 rounded-[9px] px-4 text-body-m font-semibold",
              tab === key ? "bg-brand-700 text-white" : "text-ink-600 hover:bg-cream",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {queue.isError && (
        <Notice tone="error" className="mt-4">
          {friendlyError(queue.error)}
        </Notice>
      )}
      {claim.isError && (
        <Notice tone="error" className="mt-4">
          {friendlyError(claim.error)}
        </Notice>
      )}

      {rows.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={ClipboardList}
            title={tab === "waiting" ? "No one is waiting right now." : "You have no open cases."}
          />
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {rows.map((c) => {
            const fresh = c.urgency === "RED" && now - c.updated_at < NEW_WINDOW_MS && c.status === "paid"
            return (
              <li
                key={c.consultation_id}
                className={cn(
                  "flex flex-col gap-3 rounded-xl border bg-white p-4 sm:flex-row sm:items-center",
                  c.urgency === "RED" ? "border-urgent-red/40" : "border-line",
                  fresh && "ring-2 ring-urgent-red",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {c.urgency ? (
                      <UrgencyBadge urgency={c.urgency} size="sm" />
                    ) : (
                      <span className="rounded-full bg-cream px-2 py-0.5 text-label-m font-bold text-ink-600 uppercase">
                        No symptom check
                      </span>
                    )}
                    <span className="text-body-m font-semibold">{patientLabel(c)}</span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-body-l">{c.complaint}</p>
                  <p className="mt-1 flex items-center gap-1 text-label-m text-ink-600">
                    <Clock className="size-3.5" aria-hidden /> Waiting {timeAgo(c.created_at, now).replace(" ago", "")}
                  </p>
                </div>
                {c.status === "paid" ? (
                  <Button
                    size="sm"
                    loading={claim.isPending && claim.variables === c.consultation_id}
                    onClick={() => claim.mutate(c.consultation_id)}
                  >
                    Claim
                  </Button>
                ) : (
                  <Link
                    to={`/doctor/case/${c.consultation_id}`}
                    className="inline-flex h-10 items-center justify-center rounded-full border-[1.5px] border-brand-700 px-4 text-body-m font-semibold text-brand-900"
                  >
                    Open case
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
