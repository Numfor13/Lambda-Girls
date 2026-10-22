import { useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { useLiveQuery } from "dexie-react-hooks"
import { CloudOff, Trash2, User, UserPlus, Users } from "lucide-react"
import { useAuth } from "@/auth/AuthProvider"
import { env } from "@/config/env"
import { Button, ButtonLink } from "@/design/components/Button"
import { ChoiceCard, Field, Select, Textarea } from "@/design/components/Field"
import { HoldToRecord } from "@/design/components/HoldToRecord"
import { Notice, PageHeader } from "@/design/components/primitives"
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

  const recent = useLiveQuery(() => db.triage_results.orderBy("created_at").reverse().limit(5).toArray(), [])
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
  const canSubmit = (complaint.trim().length > 0 || voice) && !saving

  const submit = async () => {
    if (!session) return
    setSaving(true)
    const local = await createConsultation({
      complaint: complaint.trim() || "Voice note — please listen to my message.",
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
        <span className="flex size-16 items-center justify-center rounded-full bg-mint">
          <CloudOff className="size-8 text-brand-700" aria-hidden />
        </span>
        <h1 className="text-[24px] font-extrabold">Saved on your phone</h1>
        <p className="max-w-sm text-[15px] text-ink-600">
          We'll send it when you're back online. Payment opens as soon as it reaches CareBridge.
        </p>
        <ButtonLink to={`/app/consult/${savedOffline}`} trailing="arrow">
          Open conversation
        </ButtonLink>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-7">
      <PageHeader title="Message a doctor" subtitle="Describe what's wrong in your own words — by text or voice." />

      <section>
        <h2 className="mb-3 text-[16px] font-bold">Who is this for?</h2>
        <div className="flex flex-col gap-3">
          <ChoiceCard title="Me" icon={<User className="size-5" />} selected={subject === "me"} onClick={() => setSubject("me")} />
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
            className="flex min-h-14 items-center gap-3 rounded-[14px] border-[1.5px] border-dashed border-line px-4 text-[15px] font-semibold text-brand-700 hover:bg-cream"
          >
            <UserPlus className="size-5" aria-hidden /> Someone new — add them first
          </Link>
        </div>
        {member && (
          <Notice tone="info" className="mt-3">
            This consult is kept out of your own record.
          </Notice>
        )}
      </section>

      <section>
        <Field label="Link a symptom check (optional)">
          {(id) => (
            <Select id={id} value={triageId} onChange={(e) => setTriageId(e.target.value)}>
              <option value="">No symptom check</option>
              {recent?.map((r) => (
                <option key={r.result_id} value={r.result_id}>
                  {r.urgency} · {r.subject_label} · {formatDateTime(r.created_at)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {linked && <UrgencyBadge urgency={linked.urgency} className="mt-3" />}
      </section>

      <section>
        <Field label="What's wrong?">
          {(id) => (
            <Textarea
              id={id}
              value={complaint}
              maxLength={2000}
              onChange={(e) => setComplaint(e.target.value)}
              placeholder="For example: my son has had a fever and cough for 3 days."
            />
          )}
        </Field>
        <div className="mt-5 flex flex-col items-center gap-3 rounded-[16px] bg-cream p-5">
          {voice ? (
            <div className="flex w-full items-center justify-between gap-3">
              <span className="text-[15px] font-medium">
                Voice note recorded · {formatDuration(voice.duration_seconds)}
              </span>
              <button
                type="button"
                className="flex h-11 items-center gap-1.5 rounded-[10px] px-3 text-sm font-semibold text-urgent-red"
                onClick={() => setVoice(null)}
              >
                <Trash2 className="size-4" aria-hidden /> Remove
              </button>
            </div>
          ) : (
            <HoldToRecord onRecorded={setVoice} label="Hold to describe in your own words" />
          )}
        </div>
      </section>

      <section className="rounded-[16px] border border-line p-5">
        <p className="text-[15px]">
          Consultation fee: <strong>{formatXaf(env.consultationFeeXaf)}</strong> — paid before a
          doctor sees your case.
        </p>
      </section>

      <Button size="lg" full trailing="arrow" disabled={!canSubmit} loading={saving} onClick={submit}>
        Continue to payment
      </Button>
    </div>
  )
}
