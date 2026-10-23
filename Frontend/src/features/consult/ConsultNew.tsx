import { useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { SPRING, popIn, staggerOnMount } from "@/design/motion"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { useLiveQuery } from "dexie-react-hooks"
import {
  CloudOff,
  Mic,
  Trash2,
  User,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react"
import { useAuth } from "@/auth/AuthProvider"
import { env } from "@/config/env"
import { Button, ButtonLink } from "@/design/components/Button"
import { ChoiceCard, Field, Select, Textarea } from "@/design/components/Field"
import { HoldToRecord } from "@/design/components/HoldToRecord"
import { Notice, PageHeader, StatusMark } from "@/design/components/primitives"
import { UrgencyBadge } from "@/design/components/UrgencyBadge"
import { useProfile } from "@/features/profile/useProfile"
import { formatDateTime, formatDuration, formatXaf } from "@/lib/format"
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
                description={m.relationship}
                icon={<Users className="size-5" />}
                selected={subject === `member:${m.member_id}`}
                onClick={() => setSubject(`member:${m.member_id}`)}
              />
            ))}
            <Link
              to="/app/profile/household"
              className="flex min-h-14 items-center gap-3 rounded-lg border-[1.5px] border-dashed border-brand-500/40 px-4 text-label-l text-brand-700 transition-colors hover:bg-mint"
            >
              <UserPlus className="size-5" aria-hidden /> Someone new — add them
              first
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
          <div className="mt-4 flex flex-col items-center gap-3 shape-tr bg-mint p-5">
            <AnimatePresence mode="wait" initial={false}>
              {voice ? (
                <motion.div
                  key="voice"
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.92 }}
                  transition={SPRING.bouncy}
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
                  transition={SPRING.bouncy}
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
          <Field label="Optional — helps the doctor see your danger signs">
            {(id) => (
              <Select
                id={id}
                value={triageId}
                onChange={(e) => setTriageId(e.target.value)}
              >
                <option value="">No symptom check</option>
                {recent?.map((r) => (
                  <option key={r.result_id} value={r.result_id}>
                    {r.urgency} · {r.subject_label} ·{" "}
                    {formatDateTime(r.created_at)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {linked && <UrgencyBadge urgency={linked.urgency} className="mt-3" />}
        </motion.section>
      </motion.div>

      <motion.aside
        variants={staggerOnMount(0.07)}
        className="contents lg:sticky lg:top-6 lg:flex lg:flex-col lg:gap-4"
      >
        <motion.section
          variants={popIn}
          className="flex items-center gap-4 shape-bl bg-mint p-5"
        >
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white">
            <Wallet className="size-6 text-brand-700" aria-hidden />
          </span>
          <p className="text-body-l text-brand-900">
            Consultation fee{" "}
            <strong className="text-title-l">
              {formatXaf(env.consultationFeeXaf)}
            </strong>
            <br />
            <span className="text-body-m text-ink-600">
              Paid by Mobile Money before a doctor sees your case.
            </span>
          </p>
        </motion.section>

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
