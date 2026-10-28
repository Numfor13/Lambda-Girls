import { useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { motion } from "motion/react"
import { ArrowRight, ClipboardList, ListOrdered } from "lucide-react"
import { doctorApi } from "@/api/endpoints"
import type { Consultation, Urgency } from "@/api/types"
import { useAuth } from "@/auth/AuthProvider"
import { AppPage, Panel } from "@/design/components/AppPage"
import { Button, ButtonLink } from "@/design/components/Button"
import { Skeleton } from "@/design/components/Lively"
import { ServiceError } from "@/design/components/ServicePage"
import { FilterTiles, ListSearch, PickHint, RecordList, UpdatedAt, useRecordParams } from "@/design/components/Staff"
import { toast } from "@/design/components/Toast"
import { UrgencyBadge } from "@/design/components/UrgencyBadge"
import { AdvisoryNote, EmptyState } from "@/design/components/primitives"
import { SPRING, popIn } from "@/design/motion"
import { describeAge } from "@/lib/format"
import { useNow, useOnline, useVisible } from "@/lib/hooks"
import { plural } from "@/lib/labels"
import { cn } from "@/lib/utils"
import { SYMPTOMS } from "@/triage-engine/symptoms"
import { DoctorPresence } from "./DoctorPresence"

/*
 * Doctor queue, from the patient-queue study (One Medical's clinician view, Doctolib Pro,
 * Elation and ~10 Dribbble queues): counters that add up and filter (QA K1), the next patient
 * pulled out on top, then everyone after them. Cards carry no patient name (backend gap §8).
 */

const RANK = { RED: 0, AMBER: 1, GREEN: 2 } as const
const SYMPTOM_LABEL = new Map(SYMPTOMS.map((s) => [s.code, s.label]))

export function patientLabel(c: Consultation) {
  return c.patient_id === "anonymous" || c.patient_id.startsWith("anon#") || c.patient_id.startsWith("anon:")
    ? "Anonymous"
    : c.on_behalf_member_id
      ? "Household member"
      : "Patient"
}

/** Danger signs first; no symptom check sorts with "can wait"; then the longest wait. */
export function sortQueue(items: Consultation[]) {
  return [...items].sort((a, b) => RANK[a.urgency ?? "GREEN"] - RANK[b.urgency ?? "GREEN"] || a.created_at - b.created_at)
}

export function waited(ms: number, now: number) {
  const mins = Math.max(0, Math.floor((now - ms) / 60_000))
  if (mins < 1) return "<1 min"
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  if (h < 24) return mins % 60 ? `${h} h ${mins % 60} min` : `${h} h`
  return plural(Math.floor(h / 24), "day")
}

const URGENCY_WORD: Record<Urgency, string> = { RED: "Emergency", AMBER: "See today", GREEN: "Can wait" }

function chime() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
    osc.connect(gain).connect(ctx.destination)
    osc.onended = () => void ctx.close()
    osc.start()
    osc.stop(ctx.currentTime + 0.6)
  } catch {
    /* Audio may be unavailable before the first interaction. */
  }
}

function greeting(now: number) {
  const h = new Date(now).getHours()
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"
}

function CaseRow({ c, now }: { c: Consultation; now: number }) {
  return (
    <span className="flex items-center gap-3 sm:gap-4">
      <span className="min-w-0 flex-1">
        <span className="block line-clamp-2 text-title-m text-ink-900">{c.complaint}</span>
        <span className="mt-0.5 block text-body-m text-ink-600">
          {patientLabel(c)} · {c.urgency ? URGENCY_WORD[c.urgency] : "No symptom check"}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-label-l text-ink-900 tabular">{waited(c.created_at, now)}</span>
        <span className="block text-label-m font-normal text-ink-600">{c.status === "open" ? "open" : "waiting"}</span>
      </span>
    </span>
  )
}

function NextUp({ c, now, onClaim, claiming, onPreview }: { c: Consultation; now: number; onClaim: () => void; claiming: boolean; onPreview: () => void }) {
  const online = useOnline()
  return (
    <motion.section variants={popIn} className="relative overflow-hidden rounded-2xl bg-brand-900 p-5 text-white lg:p-7 short:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <p className="eyebrow text-mint-200">Next up</p>
        {c.urgency && <UrgencyBadge urgency={c.urgency} size="sm" />}
        <span className="ml-auto text-label-l text-white/80 tabular">Waiting {waited(c.created_at, now)}</span>
      </div>
      <p className="mt-3 line-clamp-3 font-display text-[24px] leading-[1.2] font-[460] lg:text-[28px]">{c.complaint}</p>
      <p className="mt-1 text-body-m text-white/70">{patientLabel(c)}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button variant="light" icon={ArrowRight} loading={claiming} disabled={!online} onClick={onClaim}>
          Claim and open
        </Button>
        <Button variant="outline-light" onClick={onPreview}>
          Preview
        </Button>
      </div>
    </motion.section>
  )
}

function Preview({ c, now, onClaim, claiming, error }: { c: Consultation; now: number; onClaim: () => void; claiming: boolean; error: unknown }) {
  const { session } = useAuth()
  const online = useOnline()
  const visible = useVisible()
  const detail = useQuery({
    queryKey: ["case-preview", session?.sub, c.consultation_id],
    queryFn: () => doctorApi.getCase(c.consultation_id),
    refetchInterval: visible && online ? 20_000 : false,
  })
  const t = detail.data?.triage_result
  const p = t?.symptom_payload
  return (
    <Panel>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {c.urgency ? <UrgencyBadge urgency={c.urgency} /> : <span className="text-label-l text-ink-600">No symptom check</span>}
          <span className="text-label-m text-ink-600 tabular">Waiting {waited(c.created_at, now)}</span>
        </div>
        <p className="text-headline-s break-words">{c.complaint}</p>
        <p className="text-body-m text-ink-600">
          {patientLabel(c)}
          {p && ` · ${describeAge(p.age_months)}${p.sex ? ` · ${p.sex}` : ""}${p.is_pregnant ? " · pregnant" : ""}`}
        </p>
        {detail.isPending ? (
          <Skeleton className="h-20 rounded-lg" />
        ) : t ? (
          <div className="rounded-lg bg-cream p-4">
            <p className="text-label-l text-ink-600">Signs reported</p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {p?.symptoms.length ? (
                p.symptoms.map((s) => (
                  <li key={s} className="rounded-full bg-white px-2.5 py-1 text-label-m text-ink-900">
                    {SYMPTOM_LABEL.get(s) ?? s}
                  </li>
                ))
              ) : (
                <li className="text-body-m text-ink-600">None</li>
              )}
            </ul>
            <p className="mt-3 text-body-m">{t.recommendation}</p>
          </div>
        ) : (
          <p className="text-body-m text-ink-600">The patient didn&apos;t link a symptom check.</p>
        )}
        <ServiceError error={error || detail.error} />
        {c.status === "paid" ? (
          <Button icon={ArrowRight} disabled={!online} loading={claiming} onClick={onClaim}>
            Claim and open
          </Button>
        ) : (
          <ButtonLink icon={ArrowRight} to={`/doctor/case/${c.consultation_id}`}>
            Continue case
          </ButtonLink>
        )}
        {t && <AdvisoryNote />}
      </div>
    </Panel>
  )
}

export default function DoctorQueue() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const online = useOnline()
  const visible = useVisible()
  const now = useNow()
  const view = useRecordParams()
  const tab = view.params.get("tab") === "mine" ? "mine" : "waiting"

  const query = useQuery({ queryKey: ["doctor-queue"], queryFn: doctorApi.queue, refetchInterval: visible && online ? 20_000 : false })

  // A short sound when a new emergency case arrives.
  const seen = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (!query.data) return
    const red = query.data.queue.filter((c) => c.urgency === "RED" && c.status === "paid")
    if (seen.current && red.some((c) => !seen.current!.has(c.consultation_id))) chime()
    seen.current = new Set(red.map((c) => c.consultation_id))
  }, [query.data])

  const all = sortQueue(query.data?.queue ?? [])
  const waiting = all.filter((c) => c.status === "paid")
  const mine = all.filter((c) => c.status === "open" && c.doctor_id === session?.sub)
  const base = tab === "mine" ? mine : waiting
  const needle = view.q.trim().toLowerCase()
  const rows = base.filter(
    (c) =>
      (!view.filter || (view.filter === "none" ? !c.urgency : c.urgency === view.filter)) &&
      (!needle || `${c.complaint} ${patientLabel(c)}`.toLowerCase().includes(needle)),
  )
  const selected = [...waiting, ...mine].find((c) => c.consultation_id === view.selected)
  const showNext = tab === "waiting" && !view.filter && !needle && waiting.length > 0
  const next = showNext ? waiting[0] : undefined
  const listed = next ? rows.slice(1) : rows

  const claim = useMutation({
    mutationFn: doctorApi.claim,
    onSuccess: async (c) => {
      await qc.invalidateQueries({ queryKey: ["doctor-queue"] })
      toast("Case claimed")
      navigate(`/doctor/case/${c.consultation_id}`)
    },
    onError: () => void query.refetch(),
  })

  const red = waiting.filter((c) => c.urgency === "RED").length
  const first = session?.name.split(" ").find((w) => !/^(dr\.?|demo)$/i.test(w)) ?? ""
  const tiles = [
    { key: "RED", label: "Emergency", tone: "RED" as const, count: base.filter((c) => c.urgency === "RED").length },
    { key: "AMBER", label: "See today", tone: "AMBER" as const, count: base.filter((c) => c.urgency === "AMBER").length },
    { key: "GREEN", label: "Can wait", tone: "GREEN" as const, count: base.filter((c) => c.urgency === "GREEN").length },
    { key: "none", label: "No check", tone: "none" as const, count: base.filter((c) => !c.urgency).length },
  ]

  return (
    <AppPage
      eyebrow="Doctor"
      title="Care queue"
      subtitle={
        query.data
          ? `${greeting(now)}${first ? `, ${first}` : ""}. ${waiting.length ? `${plural(waiting.length, "patient")} waiting${red ? `, ${red} with danger signs` : ""}.` : "No one is waiting right now."}`
          : `${greeting(now)}.`
      }
      actions={
        <>
          <DoctorPresence />
          <UpdatedAt updated={query.dataUpdatedAt} refresh={() => void query.refetch()} loading={query.isFetching} />
        </>
      }
      aside={
        selected ? (
          <Preview
            key={selected.consultation_id}
            c={selected}
            now={now}
            claiming={claim.isPending && claim.variables === selected.consultation_id}
            onClaim={() => claim.mutate(selected.consultation_id)}
            error={claim.error}
          />
        ) : (
          <PickHint icon={ListOrdered} title="How the queue is ordered">
            Danger signs first, then whoever has waited longest. Cases without a symptom check sit with &ldquo;can wait&rdquo;. A new emergency
            plays a short sound.
          </PickHint>
        )
      }
      asideFirst={Boolean(selected)}
    >
      <div role="tablist" aria-label="Queue" className="inline-flex self-start rounded-full bg-white p-1 shadow-[var(--shadow-elev-1)]">
        {(
          [
            ["waiting", "Waiting", waiting.length],
            ["mine", "My open cases", mine.length],
          ] as const
        ).map(([key, label, n]) => {
          const on = tab === key
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => view.setMany({ tab: key === "mine" ? "mine" : "", filter: "", selected: "" })}
              className={cn("relative h-10 rounded-full px-4 text-label-l transition-colors", on ? "text-white" : "text-ink-600 hover:text-ink-900")}
            >
              {on && <motion.span layoutId="queue-tab" className="absolute inset-0 rounded-full bg-brand-900" transition={SPRING.default} />}
              <span className="relative">
                {label} · {n}
              </span>
            </button>
          )
        })}
      </div>

      <FilterTiles label="Filter by urgency" tiles={tiles} value={view.filter} onChange={(k) => view.set("filter", k)} />
      <ServiceError error={query.error} />

      {query.isPending ? (
        <div className="flex flex-col gap-2" role="status" aria-label="Loading the queue">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
      ) : (
        <>
          {next && (
            <NextUp
              c={next}
              now={now}
              claiming={claim.isPending && claim.variables === next.consultation_id}
              onClaim={() => claim.mutate(next.consultation_id)}
              onPreview={() => view.set("selected", next.consultation_id)}
            />
          )}
          <ListSearch value={view.q} onChange={(v) => view.set("q", v)} placeholder="Search complaints" total={base.length} />
          {listed.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-label-l text-ink-600">{next ? "After that" : tab === "mine" ? "Your open cases" : "Waiting"}</h2>
              <RecordList
                rows={listed}
                id={(c) => c.consultation_id}
                selected={view.selected}
                onSelect={(c) => view.set("selected", c.consultation_id)}
                label={tab === "mine" ? "Your open cases" : "Waiting cases"}
                urgency={(c) => c.urgency}
                render={(c) => <CaseRow c={c} now={now} />}
              />
            </section>
          )}
          {!rows.length &&
            (view.filter || needle ? (
              <EmptyState
                icon={ClipboardList}
                title="No cases match."
                action={
                  <Button
                    variant="tonal"
                    onClick={() => view.setMany({ filter: "", q: "" })}
                  >
                    Show all
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={ClipboardList}
                title={tab === "mine" ? "You have no open cases." : "No one is waiting."}
                body={tab === "mine" ? "Cases you claim stay here until you close them." : "New paid cases appear here by themselves."}
              />
            ))}
        </>
      )}
    </AppPage>
  )
}
