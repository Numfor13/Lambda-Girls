import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, motion } from "motion/react"
import {
  ArrowRight,
  ClipboardList,
  Clock,
  RefreshCw,
  Stethoscope,
} from "lucide-react"
import { doctorApi } from "@/api/endpoints"
import { friendlyError } from "@/api/errors"
import type { Consultation } from "@/api/types"
import { useAuth } from "@/auth/AuthProvider"
import { Button, ButtonLink } from "@/design/components/Button"
import { Chip } from "@/design/components/Field"
import { Feedback } from "@/design/components/Feedback"
import {
  EmptyState,
  PageHeader,
  PageSpinner,
} from "@/design/components/primitives"
import { UrgencyBadge, UrgencyDot } from "@/design/components/UrgencyBadge"
import { popIn, SPRING, staggerOnMount } from "@/design/motion"
import { useNow, useOnline, useVisible } from "@/lib/hooks"
import { timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"
import { DoctorPresence } from "./DoctorPresence"

const RANK = { RED: 0, AMBER: 1, GREEN: 2 } as const
const NEW_WINDOW_MS = 2 * 60_000
export function patientLabel(c: Consultation) {
  if (c.patient_id === "anonymous" || c.patient_id.startsWith("anon#"))
    return "Anonymous"
  if (c.patient_id.startsWith("anon:")) return "Anonymous"
  return c.on_behalf_member_id ? "Household member" : "Patient"
}
function chime() {
  try {
    const ctx = new AudioContext(),
      osc = ctx.createOscillator(),
      gain = ctx.createGain()
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
    osc.connect(gain).connect(ctx.destination)
    osc.onended = () => {
      void ctx.close()
    }
    osc.start()
    osc.stop(ctx.currentTime + 0.6)
  } catch {
    /* Audio is unavailable until the doctor interacts with the page. */
  }
}
export function sortQueue(items: Consultation[]) {
  return [...items].sort(
    (a, b) =>
      RANK[a.urgency ?? "GREEN"] - RANK[b.urgency ?? "GREEN"] ||
      a.created_at - b.created_at
  )
}
export default function DoctorQueue() {
  const { session } = useAuth()
  const navigate = useNavigate(),
    queryClient = useQueryClient()
  const now = useNow(15_000),
    visible = useVisible(),
    online = useOnline()
  const [tab, setTab] = useState<"waiting" | "mine">("waiting")
  const queue = useQuery({
    queryKey: ["doctor-queue"],
    queryFn: doctorApi.queue,
    refetchInterval: visible && online ? 20_000 : false,
  })
  const seenRed = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (!queue.data) return
    const red = queue.data.queue.filter(
      (c) => c.urgency === "RED" && c.status === "paid"
    )
    if (
      seenRed.current &&
      red.some((c) => !seenRed.current!.has(c.consultation_id))
    )
      chime()
    seenRed.current = new Set(red.map((c) => c.consultation_id))
  }, [queue.data])
  const claim = useMutation({
    mutationFn: doctorApi.claim,
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ["doctor-queue"] })
      navigate(`/doctor/case/${res.consultation_id}`)
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: ["doctor-queue"] })
    },
  })
  if (queue.isPending) return <PageSpinner />
  const all = sortQueue(queue.data?.queue ?? [])
  const waiting = all.filter((c) => c.status === "paid")
  const mine = all.filter(
    (c) => c.status === "open" && c.doctor_id === session?.sub
  )
  const rows = tab === "waiting" ? waiting : mine
  return (
    <motion.div
      variants={staggerOnMount()}
      initial="hidden"
      animate="show"
      className="mx-auto flex max-w-6xl min-w-0 flex-col gap-5"
    >
      <PageHeader
        eyebrow="Doctor workspace"
        title="Care queue"
        subtitle="Most urgent first, then longest waiting."
        action={
          <Button
            variant="glass"
            icon={RefreshCw}
            size="sm"
            disabled={!online}
            loading={queue.isFetching}
            onClick={() => void queue.refetch()}
          >
            Refresh
          </Button>
        }
      />
      <DoctorPresence />
      <motion.div
        variants={popIn}
        className="flex flex-wrap gap-3"
        aria-label="Waiting cases by urgency"
      >
        {(["RED", "AMBER", "GREEN"] as const).map((level) => (
          <div
            key={level}
            className="inline-flex items-center gap-3 rounded-full px-4 py-3 glass"
          >
            <UrgencyDot urgency={level} />
            <span className="text-label-l">
              {level}{" "}
              <span className="ml-2 text-title-m">
                {waiting.filter((c) => c.urgency === level).length}
              </span>
            </span>
          </div>
        ))}
      </motion.div>
      <p className="flex items-center gap-2 text-body-m text-ink-600">
        <Clock className="size-4" aria-hidden />
        {queue.data
          ? `Updated ${timeAgo(queue.dataUpdatedAt, now)}`
          : "Queue not loaded"}{" "}
        ·{" "}
        {online
          ? "Refreshes every 20 seconds while visible"
          : "Offline · showing the last loaded queue"}
      </p>
      <div className="flex flex-wrap gap-3" aria-label="Queue filter">
        <Chip selected={tab === "waiting"} onClick={() => setTab("waiting")}>
          Waiting ({waiting.length})
        </Chip>
        <Chip selected={tab === "mine"} onClick={() => setTab("mine")}>
          My open cases ({mine.length})
        </Chip>
      </div>
      {queue.isError && <Feedback error>{friendlyError(queue.error)}</Feedback>}
      {claim.isError && (
        <Feedback error>
          Could not claim this case. The queue has been refreshed; it may
          already be assigned.
        </Feedback>
      )}
      {!online && (
        <Feedback>Connect before claiming or updating a case.</Feedback>
      )}
      {rows.length === 0 ? (
        !queue.isError && (
          <EmptyState
            icon={ClipboardList}
            title={
              tab === "waiting"
                ? "No one is waiting right now."
                : "You have no open cases."
            }
          />
        )
      ) : (
        <motion.ul
          variants={staggerOnMount(0.05)}
          className="flex flex-col gap-4"
        >
          <AnimatePresence initial={false}>
            {rows.map((c) => {
              const fresh =
                c.urgency === "RED" &&
                now - c.updated_at < NEW_WINDOW_MS &&
                c.status === "paid"
              return (
                <motion.li
                  layout
                  key={c.consultation_id}
                  variants={popIn}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={SPRING.default}
                  className={cn(
                    "flex min-w-0 flex-col gap-4 rounded-xl border border-line bg-white p-5 shadow-[var(--shadow-elev-1)] sm:flex-row sm:items-center",
                    fresh && "border-urgent-red"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="mb-3 flex flex-wrap items-center gap-3">
                      {c.urgency ? (
                        <UrgencyBadge urgency={c.urgency} size="sm" />
                      ) : (
                        <span className="rounded-full bg-cream px-3 py-2 text-label-m text-ink-600">
                          No symptom check
                        </span>
                      )}
                      <span className="text-label-l text-ink-600">
                        {patientLabel(c)}
                      </span>
                    </div>
                    <h2 className="text-title-l break-words">{c.complaint}</h2>
                    <p className="mt-3 flex flex-wrap items-center gap-2 text-body-m text-ink-600">
                      <Clock className="size-4" aria-hidden />
                      {c.status === "paid" ? "Waiting since " : "Created "}
                      {timeAgo(c.created_at, now)}
                      {c.triage_result_id && (
                        <span>· Triage details in case</span>
                      )}
                    </p>
                  </div>
                  {c.status === "paid" ? (
                    <Button
                      icon={Stethoscope}
                      disabled={!online || claim.isPending}
                      loading={
                        claim.isPending && claim.variables === c.consultation_id
                      }
                      onClick={() => claim.mutate(c.consultation_id)}
                    >
                      Claim case
                    </Button>
                  ) : (
                    <ButtonLink
                      to={`/doctor/case/${c.consultation_id}`}
                      variant="secondary"
                      icon={ArrowRight}
                    >
                      Continue
                    </ButtonLink>
                  )}
                </motion.li>
              )
            })}
          </AnimatePresence>
        </motion.ul>
      )}
    </motion.div>
  )
}
