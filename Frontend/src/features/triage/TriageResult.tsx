import { useMemo } from "react"
import { Link, useParams } from "react-router-dom"
import { useLiveQuery } from "dexie-react-hooks"
import { useQuery } from "@tanstack/react-query"
import { ChevronDown, ClipboardList, MessagesSquare, Phone, RotateCcw } from "lucide-react"
import { triageApi } from "@/api/endpoints"
import type { TriageResult } from "@/api/types"
import { useAuth } from "@/auth/AuthProvider"
import { ButtonA, ButtonLink } from "@/design/components/Button"
import { FacilityRow } from "@/design/components/FacilityRow"
import { AdvisoryNote, EmptyState, PageSpinner } from "@/design/components/primitives"
import { SyncChip } from "@/design/components/SyncChip"
import { URGENCY_META, UrgencyBadge } from "@/design/components/UrgencyBadge"
import { useGeolocation } from "@/lib/hooks"
import { rankFacilities } from "@/lib/geo"
import { formatDateTime, telHref } from "@/lib/format"
import { cn } from "@/lib/utils"
import { db, type LocalTriage } from "@/offline/db"
import { useFacilities } from "@/offline/facilities"
import { capabilityFor } from "@/triage-engine/engine"

const FACILITY_TYPE_LABEL: Record<string, string> = {
  emergency: "A hospital with an emergency unit",
  general: "A clinic or hospital",
  pharmacy: "A pharmacy, or a clinic if it gets worse",
}

const SELF_CARE = [
  "Rest and drink plenty of clean water.",
  "Watch for new danger signs, like trouble breathing or not drinking.",
  "Visit a clinic if you feel worse or are not better in 3 days.",
]

export default function TriageResultPage() {
  const { resultId = "" } = useParams()
  const { session } = useAuth()
  const local = useLiveQuery(() => db.triage_results.get(resultId), [resultId])
  const remote = useQuery({
    queryKey: ["triage", resultId],
    queryFn: () => triageApi.get(resultId),
    enabled: local === undefined ? false : !local && Boolean(session),
  })
  const facilities = useFacilities()
  const { coords } = useGeolocation()

  const result: (TriageResult & Partial<LocalTriage>) | undefined = local ?? remote.data
  const nearest = useMemo(() => {
    if (!result || !facilities) return []
    const cap = capabilityFor(result.facility_type_needed)
    return rankFacilities(
      facilities.filter((f) => f.capabilities.includes(cap)),
      coords,
    ).slice(0, 3)
  }, [result, facilities, coords])

  if (local === undefined || (remote.isLoading && !local)) return <PageSpinner />
  if (!result) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="We couldn't find this result on this phone."
        action={
          <ButtonLink to="/app/triage" size="sm">
            Start a symptom check
          </ButtonLink>
        }
      />
    )
  }

  const meta = URGENCY_META[result.urgency]
  const Icon = meta.icon
  const top = nearest[0]
  const consultHref = `/app/consult/new?triage=${result.result_id}`

  return (
    <div>
      <section className={cn("-mx-4 -mt-6 px-5 pt-8 pb-7 sm:mx-0 sm:mt-0 sm:rounded-[20px]", meta.hero)}>
        <div className="flex items-center gap-2 text-sm font-bold tracking-wide uppercase opacity-90">
          <Icon className="size-5" aria-hidden />
          {result.urgency} · {meta.label}
        </div>
        <h1 className="mt-3 text-[30px] leading-[1.1] font-extrabold text-inherit">{meta.headline}</h1>
        <p className="mt-3 text-[16px] leading-6 opacity-95">
          {result.recommendation.replace(meta.headline, "").trim() || result.recommendation}
        </p>

        <div className="mt-6 flex flex-col gap-3">
          {result.urgency === "RED" && top && (
            <ButtonA href={telHref(top.phone)} variant="light" size="lg" full className="text-urgent-red">
              <Phone className="size-5" aria-hidden />
              Call {top.name}
            </ButtonA>
          )}
          {result.urgency !== "RED" && (
            <ButtonLink to={consultHref} variant={result.urgency === "AMBER" ? "primary" : "light"} size="lg" full>
              <MessagesSquare className="size-5" aria-hidden />
              Message a doctor
            </ButtonLink>
          )}
        </div>
      </section>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-sm text-ink-600">
        <span>
          {result.subject_label ?? "Symptom check"} · {formatDateTime(result.created_at)}
        </span>
        {result.sync_state && (
          <SyncChip state={result.sync_state} refId={result.result_id} />
        )}
      </div>
      {!session && result.sync_state === "queued" && (
        <p className="mt-1 text-xs text-ink-600">
          Saved on this phone. <Link to={`/sign-in?returnTo=/app/triage/${result.result_id}`} className="font-semibold text-brand-700">Sign in</Link> to share it with a doctor.
        </p>
      )}

      {result.urgency === "GREEN" && (
        <section className="mt-6 rounded-[16px] bg-urgent-green-50 p-5">
          <h2 className="text-[18px] font-bold">Caring at home</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px]">
            {SELF_CARE.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-[18px] font-bold">Where to go</h2>
        <p className="mt-1 text-[15px] text-ink-600">
          {FACILITY_TYPE_LABEL[result.facility_type_needed] ?? "A health facility"}
          {coords ? " — nearest first" : ""}
        </p>
        <ul className="mt-3 flex flex-col gap-3">
          {nearest.map((f) => (
            <FacilityRow key={f.facility_id} facility={f} compact />
          ))}
        </ul>
        <Link
          to={`/app/facilities?capability=${capabilityFor(result.facility_type_needed)}`}
          className="mt-3 inline-block text-sm font-semibold text-brand-700"
        >
          See all matching facilities
        </Link>
      </section>

      {result.urgency === "RED" && (
        <ButtonLink to={consultHref} variant="secondary" full className="mt-6">
          <MessagesSquare className="size-5" aria-hidden />
          Also message a doctor
        </ButtonLink>
      )}

      <details className="group mt-8 rounded-[16px] border border-line">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-4 font-semibold">
          Why this result?
          <ChevronDown className="size-5 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="border-t border-line px-4 py-3">
          {result.rules_fired.length === 0 ? (
            <p className="text-[15px] text-ink-600">
              None of the danger signs we check for were found.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {result.rules_fired.map((r) => (
                <li key={r.rule_id + String(r.value_that_triggered)} className="flex items-start gap-3">
                  <UrgencyBadge urgency={r.urgency} size="sm" className="mt-0.5 shrink-0" />
                  <span className="text-[15px]">
                    {r.description}
                    <span className="block font-mono text-xs text-ink-400">{r.rule_id}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>

      <AdvisoryNote className="mt-6" />

      <ButtonLink to="/app/triage" variant="ghost" className="mt-4">
        <RotateCcw className="size-4" aria-hidden />
        Check again
      </ButtonLink>
    </div>
  )
}
