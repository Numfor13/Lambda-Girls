import { useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { SPRING, popIn, staggerOnMount } from "@/design/motion"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { useLiveQuery } from "dexie-react-hooks"
import {
  Check,
  CloudOff,
  Mic,
  Trash2,
  User,
  UserPlus,
  Users,
} from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { extendedApi } from "@/api/endpoints"
import { flags } from "@/config/flags"
import { PulseDot } from "@/design/components/Lively"
import { humanize, plural } from "@/lib/labels"
import { cn } from "@/lib/utils"
import { useAuth } from "@/auth/AuthProvider"
import { env } from "@/config/env"
import { Button, ButtonLink } from "@/design/components/Button"
import { ChoiceCard, Field, Textarea } from "@/design/components/Field"
import { HoldToRecord } from "@/design/components/HoldToRecord"
import { Notice, PageHeader, StatusMark } from "@/design/components/primitives"
import { UrgencyBadge } from "@/design/components/UrgencyBadge"
import { useProfile } from "@/features/profile/useProfile"
import { formatDuration, formatXaf, timeAgo } from "@/lib/format"
import { useNow } from "@/lib/hooks"
import { db } from "@/offline/db"
import type { Recording } from "@/offline/voiceRecorder"
import { createConsultation } from "./actions"

export default function ConsultNew() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const profile = useProfile()
  const members = profile.data?.on_behalf_profiles ?? []

  const recent = useLiveQuery(
    () => db.triage_results.orderBy("created_at").reverse().limit(5).toArray(),
    []
  )
  const [triageId, setTriageId] = useState(params.get("triage") ?? "")
  const linked = recent?.find((r) => r.result_id === triageId)

  const [subject, setSubject] = useState<string>(() => {
    const fromTriage = params.get("member")
    return fromTriage ? `member:${fromTriage}` : "me"
  })
  const [complaint, setComplaint] = useState("")
  const [voice, setVoice] = useState<Recording | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedOffline, setSavedOffline] = useState<string | null>(null)

  const memberId = subject.startsWith("member:") ? subject.slice(7) : null
  const member = members.find((m) => m.member_id === memberId)
  const [tried, setTried] = useState(false)
  const now = useNow(60_000)
  const doctors = useQuery({
    queryKey: ["doctors-available"],
    queryFn: extendedApi.availableDoctors,
    enabled: Boolean(session) && flags.doctors_available,
    refetchInterval: 60_000,
  })
  const describeError =
    !complaint.trim() && !voice
      ? "Describe what's wrong in writing, or hold the button to record a voice note."
      : complaint.trim() && complaint.trim().length < 10 && !voice
        ? "Add a little more detail: what, since when, how bad."
        : undefined

  const submit = async () => {
    if (!session || saving) return
    if (describeError) {
      setTried(true)
      document.querySelector<HTMLElement>("[data-field=complaint]")?.focus()
      return
    }
    setSaving(true)
    const local = await createConsultation({
      complaint:
        complaint.trim() || "Voice note — please listen to my message.",
      subjectLabel: member ? member.name : "You",
      patientId: member ? `${session.sub}#${member.member_id}` : undefined,
      memberId: member?.member_id ?? null,
      triageResultId: linked?.result_id ?? null,
      urgency: linked?.urgency ?? null,
      voice,
    })
    setSaving(false)
    if (local.consultation_id) navigate(`/app/consult/${local.local_id}/pay`)
    else setSavedOffline(local.local_id)
  }

  if (savedOffline) {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <StatusMark state="info" icon={CloudOff} />
        <h1 className="text-headline-l">Saved on your phone</h1>
        <p className="max-w-sm text-body-l text-ink-600">
          We'll send it when you're back online. Payment opens as soon as it
          reaches CareBridge.
        </p>
        <ButtonLink to={`/app/consult/${savedOffline}`} trailing="arrow">
          Open conversation
        </ButtonLink>
      </div>
    )
  }

  return (
    <motion.div
      variants={staggerOnMount(0.07)}
      initial="hidden"
      animate="show"
      className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-6"
    >
      <div className="lg:col-span-2">
        <PageHeader
          eyebrow="New consultation"
          title="Message a doctor"
          subtitle="Describe what's wrong in your own words — by text or voice."
        />
      </div>

      <motion.div
        variants={staggerOnMount(0.07)}
        className="flex flex-col gap-5"
      >
        <motion.section
          variants={popIn}
          className="rounded-xl bg-white p-5 shadow-[var(--shadow-elev-1)]"
        >
          <StepTitle n={1}>Who is this for?</StepTitle>
          <div className="flex flex-col gap-3">
            <ChoiceCard
              title="Me"
              icon={<User className="size-5" />}
              selected={subject === "me"}
              onClick={() => setSubject("me")}
            />
            {members.map((m) => (
              <ChoiceCard
                key={m.member_id}
                title={m.name}
                description={humanize(m.relationship)}
                icon={<Users className="size-5" />}
                selected={subject === `member:${m.member_id}`}
                onClick={() => setSubject(`member:${m.member_id}`)}
              />
            ))}
            <Link
              to="/app/profile/household"
              className="flex min-h-12 items-center gap-3 rounded-lg px-4 text-label-l text-brand-700 transition-colors hover:bg-mint"
            >
              <UserPlus className="size-5" aria-hidden /> Someone new? Add them to
              your household first
            </Link>
          </div>
          <AnimatePresence>
            {member && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={SPRING.default}
                className="overflow-hidden"
              >
                <Notice tone="info" className="mt-3">
                  This consult is kept out of your own record.
                </Notice>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>

        <motion.section
          variants={popIn}
          className="rounded-xl bg-white p-5 shadow-[var(--shadow-elev-1)]"
        >
          <StepTitle n={2}>What's wrong?</StepTitle>
          <Field
            label="Describe it in writing"
            hint="What you feel, since when, and anything you've already taken."
            error={tried ? describeError : undefined}
            count={complaint.length}
            max={2000}
          >
            {(id) => (
              <Textarea
                id={id}
                data-field="complaint"
                value={complaint}
                maxLength={2000}
                aria-invalid={tried && describeError ? true : undefined}
                onChange={(e) => setComplaint(e.target.value)}
                placeholder="For example: my son has had a fever and cough for 3 days."
              />
            )}
          </Field>
          <div className="mt-4 flex flex-col items-center gap-3 rounded-xl bg-mint p-5">
            <AnimatePresence mode="wait" initial={false}>
              {voice ? (
                <motion.div
                  key="voice"
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.92 }}
                  transition={SPRING.default}
                  className="flex w-full items-center justify-between gap-3"
                >
                  <span className="flex items-center gap-2 text-body-l font-medium text-brand-900">
                    <Mic className="size-5 text-brand-700" aria-hidden />
                    Voice note · {formatDuration(voice.duration_seconds)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Trash2}
                    onClick={() => setVoice(null)}
                  >
                    Remove
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  key="record"
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.92 }}
                  transition={SPRING.default}
                >
                  <HoldToRecord
                    onRecorded={setVoice}
                    label="Or hold to describe it by voice"
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.section>

        <motion.section
          variants={popIn}
          className="rounded-xl bg-white p-5 shadow-[var(--shadow-elev-1)]"
        >
          <StepTitle n={3}>Link a symptom check</StepTitle>
          <p className="-mt-2 mb-4 text-body-m text-ink-600">
            Optional. It shows the doctor the danger signs you already checked.
          </p>
          {recent && recent.length > 0 ? (
            <div className="flex flex-col gap-2" role="radiogroup" aria-label="Symptom check to link">
              {[{ result_id: "" } as const, ...recent].map((r) => {
                const on = triageId === r.result_id
                const check = "urgency" in r ? r : null
                return (
                  <button
                    key={r.result_id || "none"}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setTriageId(r.result_id)}
                    className={cn(
                      "flex min-h-14 items-center gap-3 rounded-lg px-4 py-2.5 text-left transition-[background-color,box-shadow] duration-150",
                      on
                        ? "bg-mint shadow-[inset_0_0_0_2px_var(--color-brand-700)]"
                        : "bg-white shadow-[inset_0_0_0_1px_var(--color-line)] hover:shadow-[inset_0_0_0_1px_var(--color-brand-500)]"
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-full border-2",
                        on ? "border-brand-700 bg-brand-700 text-white" : "border-ink-400"
                      )}
                    >
                      {on && <Check className="size-3" aria-hidden />}
                    </span>
                    {check ? (
                      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                        <UrgencyBadge urgency={check.urgency} size="sm" />
                        <span className="text-body-m text-ink-600">
                          {check.subject_label ?? "Check"} · {timeAgo(check.created_at, now)}
                        </span>
                      </span>
                    ) : (
                      <span className="text-label-l">Don&apos;t link a check</span>
                    )}
                  </button>
                )
              })}
            </div>
          ) : (
            <Link
              to="/app/triage"
              className="inline-flex min-h-10 items-center text-label-l text-brand-700 hover:underline"
            >
              No checks on this phone yet. Run one first →
            </Link>
          )}
        </motion.section>
      </motion.div>

      <motion.aside
        variants={staggerOnMount(0.07)}
        className="contents lg:sticky lg:top-6 lg:flex lg:flex-col lg:gap-4"
      >
        <motion.section
          variants={popIn}
          className="rounded-xl bg-brand-900 p-5 text-white lg:p-6"
          aria-label="Your request"
        >
          <p className="eyebrow text-mint-200">Your request</p>
          <dl className="mt-4 flex flex-col gap-3 text-body-m">
            <div className="flex justify-between gap-4">
              <dt className="text-white/65">For</dt>
              <dd className="font-medium">{member ? member.name : "You"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-white/65">Message</dt>
              <dd className="line-clamp-2 text-right font-medium">
                {complaint.trim() || (voice ? "Voice note" : <span className="text-white/60">Not written yet</span>)}
              </dd>
            </div>
            {voice && complaint.trim() && (
              <div className="flex justify-between gap-4">
                <dt className="text-white/65">Voice note</dt>
                <dd className="font-medium tabular">{formatDuration(voice.duration_seconds)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <dt className="text-white/65">Symptom check</dt>
              <dd className="font-medium">{linked ? linked.urgency === "RED" ? "Emergency" : linked.urgency === "AMBER" ? "See a doctor today" : "Self-care" : "None"}</dd>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-white/15 pt-4">
              <dt className="text-title-m text-white">Fee</dt>
              <dd className="text-headline-m text-white">{formatXaf(env.consultationFeeXaf)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-body-m text-white/65">Paid by Mobile Money before a doctor sees your case.</p>
        </motion.section>
        {doctors.data && (
          <motion.p variants={popIn} className="flex items-center gap-2 px-1 text-body-m text-ink-600 max-lg:hidden">
            <PulseDot live={doctors.data.count > 0} tone={doctors.data.count > 0 ? "green" : "muted"} />
            {doctors.data.count > 0
              ? `${plural(doctors.data.count, "doctor")} online now`
              : "No doctor online right now. Your case waits in the queue."}
          </motion.p>
        )}

        <motion.div
          variants={popIn}
          className="sticky bottom-[104px] z-20 lg:static"
        >
          <Button
            size="lg"
            full
            trailing="arrow"
            loading={saving}
            onClick={submit}
          >
            Continue to payment
          </Button>
        </motion.div>
      </motion.aside>
    </motion.div>
  )
}

function StepTitle({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h2 className="mb-4 flex items-center gap-3 text-headline-s">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-800 text-label-l text-white">
        {n}
      </span>
      {children}
    </h2>
  )
}
