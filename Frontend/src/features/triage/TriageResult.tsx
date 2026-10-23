import { useMemo } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { useLiveQuery } from "dexie-react-hooks"
import { useQuery } from "@tanstack/react-query"
import { motion } from "motion/react"
import {
  ArrowLeft,
  ClipboardList,
  MessageCircle,
  Navigation,
  Phone,
  RotateCcw,
  WifiOff,
} from "lucide-react"
import { triageApi } from "@/api/endpoints"
import type { TriageResult } from "@/api/types"
import { useAuth } from "@/auth/AuthProvider"
import { ButtonA, ButtonLink, IconButton } from "@/design/components/Button"
import { FacilityRow } from "@/design/components/FacilityRow"
import { Backdrop } from "@/design/components/Landscape"
import { EmergencyShare } from "@/design/components/EmergencyShare"
import {
  AdvisoryNote,
  EmptyState,
  PageSpinner,
  SectionHeader,
} from "@/design/components/primitives"
import { SyncChip } from "@/design/components/SyncChip"
import {
  URGENCY_META,
  UrgencyBadge,
  UrgencyDot,
} from "@/design/components/UrgencyBadge"
import { SPRING, popIn, staggerOnMount } from "@/design/motion"
import { useGeolocation } from "@/lib/hooks"
import { rankFacilities, type RankedFacility } from "@/lib/geo"
import { formatDateTime } from "@/lib/format"
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

function directionsHref(f: RankedFacility) {
  return `https://www.google.com/maps/dir/?api=1&destination=${f.latitude},${f.longitude}`
}

/** Illustrative route card (not a live map — no tiles, works offline). */
function RouteIllustration({ urgent }: { urgent: boolean }) {
  return (
    <svg viewBox="0 0 416 180" className="h-auto w-full rounded-lg" aria-hidden>
      <rect width="416" height="180" className="fill-mint" />
      <path
        d="M-10 140C70 120 150 150 230 104S360 46 430 64"
        className="stroke-white"
        strokeWidth="14"
        fill="none"
      />
      <path
        d="M118 -10C138 54 118 124 166 190"
        className="stroke-white"
        strokeWidth="10"
        fill="none"
      />
      <path
        d="M300 -10L280 190"
        className="stroke-white"
        strokeWidth="8"
        fill="none"
      />
      <motion.path
        d="M92 130C150 102 226 92 296 70"
        className={urgent ? "stroke-urgent-red" : "stroke-brand-700"}
        strokeWidth="3.5"
        strokeDasharray="7 7"
        strokeLinecap="round"
        fill="none"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.4, ease: "easeInOut", delay: 0.4 }}
      />
      <circle
        cx="92"
        cy="130"
        r="9"
        className="fill-brand-700 stroke-white"
        strokeWidth="3"
      />
      <motion.g
        initial={{ y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ ...SPRING.bouncy, delay: 1.2 }}
      >
        <path
          d="M296 36C285 36 277 44 277 54C277 68 296 84 296 84S315 68 315 54C315 44 307 36 296 36Z"
          className={urgent ? "fill-urgent-red" : "fill-brand-700"}
        />
        <circle cx="296" cy="54" r="6" className="fill-white" />
      </motion.g>
    </svg>
  )
}

export default function TriageResultPage() {
  const { resultId = "" } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const local = useLiveQuery(() => db.triage_results.get(resultId), [resultId])
  const remote = useQuery({
    queryKey: ["triage", resultId],
    queryFn: () => triageApi.get(resultId),
    enabled: local === undefined ? false : !local && Boolean(session),
  })
  const facilities = useFacilities()
  const { coords } = useGeolocation()

  const result: (TriageResult & Partial<LocalTriage>) | undefined =
    local ?? remote.data
  const nearest = useMemo(() => {
    if (!result || !facilities) return []
    const cap = capabilityFor(result.facility_type_needed)
    return rankFacilities(
      facilities.filter((f) => f.capabilities.includes(cap)),
      coords
    ).slice(0, 3)
  }, [result, facilities, coords])

  if (local === undefined || (remote.isLoading && !local))
    return <PageSpinner />
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
  const cap = capabilityFor(result.facility_type_needed)
  const consultHref = `/app/consult/new?triage=${result.result_id}`
  const red = result.urgency === "RED"
  const detail =
    result.recommendation.replace(meta.headline, "").trim() ||
    result.recommendation

  return (
    <motion.div
      variants={staggerOnMount(0.07)}
      initial="hidden"
      animate="show"
      className="flex flex-col gap-5"
    >
      <Backdrop tone={meta.backdrop} />

      <motion.div variants={popIn} className="flex items-center gap-3">
        <IconButton
          icon={ArrowLeft}
          label="Back"
          variant="plain"
          onClick={() => navigate("/app")}
        />
        <h1 className="min-w-0 flex-1 text-title-l lg:text-headline-m">
          Triage result
        </h1>
        {result.sync_state && result.sync_state !== "sent" ? (
          <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3 text-label-m text-brand-900 ring-1 ring-ink-900/10">
            <WifiOff className="size-3.5" aria-hidden />
            <SyncChip state={result.sync_state} refId={result.result_id} />
          </span>
        ) : (
          <span className="hidden h-9 items-center rounded-full px-3 text-label-m text-ink-600 sm:inline-flex">
            Saved · {formatDateTime(result.created_at)}
          </span>
        )}
      </motion.div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-8">
        {/* Left: verdict + primary actions */}
        <div className="flex flex-col gap-4">
          <motion.section
            variants={popIn}
            className={cn(
              "relative overflow-hidden shape-bl p-6 sm:p-8 lg:p-10",
              meta.hero
            )}
            aria-labelledby="verdict"
          >
            <motion.span
              className="pointer-events-none absolute -top-16 -right-16 size-56 rounded-full bg-white/10"
              animate={{ scale: [1, 1.15, 1] }}
              transition={{
                duration: red ? 1.6 : 4,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              aria-hidden
            />
            <div className="relative flex items-center justify-between gap-3">
              <UrgencyBadge urgency={result.urgency} className="bg-white" />
              <motion.span
                initial={{ scale: 0, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ ...SPRING.bouncy, delay: 0.25 }}
              >
                <Icon className="size-9" aria-hidden />
              </motion.span>
            </div>
            <p className="relative mt-5 text-label-m tracking-[0.14em] uppercase opacity-85">
              For {result.subject_label ?? "this check"}
            </p>
            <h2
              id="verdict"
              className="relative mt-2 text-display-m text-inherit lg:text-display-l"
            >
              {meta.headline}
            </h2>
            <p className="relative mt-4 max-w-[560px] text-body-l opacity-95">
              {detail}
            </p>
          </motion.section>

          <motion.div
            variants={popIn}
            className="flex flex-col gap-3 sm:flex-row"
          >
            {red ? (
              <>
                <ButtonA
                  href="tel:15"
                  icon={Phone}
                  variant="danger"
                  size="lg"
                  className="sm:flex-1"
                >
                  Call 15 — Emergency
                </ButtonA>
                {top && (
                  <ButtonA
                    href={directionsHref(top)}
                    target="_blank"
                    rel="noreferrer"
                    icon={Navigation}
                    variant="secondary"
                    size="lg"
                    className="sm:flex-1"
                  >
                    Get directions
                  </ButtonA>
                )}
              </>
            ) : (
              <>
                <ButtonLink
                  to={consultHref}
                  icon={MessageCircle}
                  size="lg"
                  className="sm:flex-1"
                >
                  Message a doctor
                </ButtonLink>
                {top && (
                  <ButtonA
                    href={directionsHref(top)}
                    target="_blank"
                    rel="noreferrer"
                    icon={Navigation}
                    variant="secondary"
                    size="lg"
                    className="sm:flex-1"
                  >
                    Directions to nearest
                  </ButtonA>
                )}
              </>
            )}
          </motion.div>

          {red && (
            <motion.div variants={popIn}>
              {/* Link the server copy only once it has synced; otherwise share location alone. */}
              <EmergencyShare
                triageResultId={
                  !result.sync_state || result.sync_state === "sent"
                    ? result.result_id
                    : undefined
                }
              />
            </motion.div>
          )}

          {result.urgency === "GREEN" && (
            <motion.section
              variants={popIn}
              className="rounded-xl bg-white p-5 shadow-[var(--shadow-elev-1)]"
            >
              <h2 className="text-title-l">Caring at home</h2>
              <ul className="mt-3 flex flex-col gap-2">
                {SELF_CARE.map((t) => (
                  <li key={t} className="flex items-start gap-3 text-body-l">
                    <UrgencyDot urgency="GREEN" className="mt-2" />
                    {t}
                  </li>
                ))}
              </ul>
            </motion.section>
          )}

          <motion.div variants={popIn} className="hidden lg:block">
            <AdvisoryNote long />
          </motion.div>
        </div>

        {/* Right: where to go + why */}
        <div className="flex flex-col gap-4">
          <motion.section
            variants={popIn}
            className="flex flex-col gap-3 rounded-xl bg-white p-3 shadow-[var(--shadow-elev-1)]"
          >
            <RouteIllustration urgent={red} />
            <div className="px-2">
              <p className={cn("eyebrow", red && "text-urgent-red")}>
                {red ? "Nearest emergency care" : "Where to go"}
              </p>
              <p className="mt-1 text-body-m text-ink-600">
                {FACILITY_TYPE_LABEL[result.facility_type_needed] ??
                  "A health facility"}
                {coords ? " — nearest first" : ""}
              </p>
            </div>
            <motion.ul
              className="flex flex-col gap-2"
              variants={staggerOnMount(0.06, 0.2)}
            >
              {nearest.map((f) => (
                <FacilityRow
                  key={f.facility_id}
                  facility={f}
                  compact
                  focus={cap}
                />
              ))}
            </motion.ul>
            <Link
              to={`/app/facilities?capability=${cap}`}
              className="inline-flex h-11 items-center justify-center rounded-full text-label-l text-brand-700 hover:bg-mint"
            >
              See all matching facilities
            </Link>
          </motion.section>

          <motion.section
            variants={popIn}
            className="rounded-xl bg-white p-5 shadow-[var(--shadow-elev-1)]"
          >
            <SectionHeader title="Why this result" className="mb-2" />
            {result.rules_fired.length === 0 ? (
              <p className="text-body-l text-ink-600">
                None of the danger signs we check for were found.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {result.rules_fired.map((r, i) => (
                  <motion.li
                    key={r.rule_id + String(r.value_that_triggered)}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ ...SPRING.default, delay: 0.3 + i * 0.07 }}
                    className="flex items-start gap-3"
                  >
                    <UrgencyDot urgency={r.urgency} className="mt-1.5" />
                    <span className="text-body-m">
                      {r.description}
                      <span className="block text-label-m text-ink-400">
                        Rule {r.rule_id}
                      </span>
                    </span>
                  </motion.li>
                ))}
              </ul>
            )}
          </motion.section>

          <motion.div variants={popIn} className="lg:hidden">
            <AdvisoryNote long />
          </motion.div>

          <motion.div variants={popIn} className="flex flex-col gap-2">
            {red && (
              <ButtonLink
                to={consultHref}
                icon={MessageCircle}
                variant="secondary"
                size="lg"
                full
              >
                Also ask a doctor
              </ButtonLink>
            )}
            <ButtonLink to="/app/triage" icon={RotateCcw} variant="ghost" full>
              Check again
            </ButtonLink>
          </motion.div>
          {!session && result.sync_state === "queued" && (
            <p className="text-center text-body-m text-ink-600">
              Saved on this phone.{" "}
              <Link
                to={`/sign-in?returnTo=/app/triage/${result.result_id}`}
                className="text-label-l text-brand-700"
              >
                Sign in
              </Link>{" "}
              to share it with a doctor.
            </p>
          )}
        </div>
      </div>
    </motion.div>
  )
}
