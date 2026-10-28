import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { motion } from "motion/react"
import { ulid } from "ulid"
import { ArrowLeft, ChevronDown, ClipboardCheck, FileCheck2, Pill, SendHorizontal } from "lucide-react"
import { consultApi, doctorApi } from "@/api/endpoints"
import { friendlyError } from "@/api/errors"
import type { CaseDetail } from "@/api/types"
import { useAuth } from "@/auth/AuthProvider"
import { flags } from "@/config/flags"
import { AppPage, Panel } from "@/design/components/AppPage"
import { Button, IconButton } from "@/design/components/Button"
import { ChatBubble, type ChatItem } from "@/design/components/ChatBubble"
import { FacilityPicker } from "@/design/components/FacilityPicker"
import { CodeCard, ConfirmAction, Feedback } from "@/design/components/Feedback"
import { Field, Input, Textarea } from "@/design/components/Field"
import { HoldToRecord } from "@/design/components/HoldToRecord"
import { PulseDot, Skeleton } from "@/design/components/Lively"
import { UpdatedAt } from "@/design/components/Staff"
import { toast } from "@/design/components/Toast"
import { UrgencyBadge, UrgencyDot } from "@/design/components/UrgencyBadge"
import { AdvisoryNote } from "@/design/components/primitives"
import { SPRING } from "@/design/motion"
import { describeAge, formatDateTime, formatTime } from "@/lib/format"
import { rules, useForm } from "@/lib/form"
import { useNow, useOnline, useVisible } from "@/lib/hooks"
import { cn } from "@/lib/utils"
import { useFacilities } from "@/offline/facilities"
import { uploadVoiceBlob } from "@/offline/sync"
import type { Recording } from "@/offline/voiceRecorder"
import { SYMPTOMS } from "@/triage-engine/symptoms"
import { patientLabel, waited } from "./DoctorQueue"

/*
 * Consultation, from the clinical-notes study (Elation, Heidi, Doctolib Pro and ~10 Dribbble
 * clinician views): who and why on one card, the conversation as the work surface, and the
 * three things a doctor can do (prescribe, refer, close) as tabs beside it.
 */

const SYMPTOM_LABEL = new Map(SYMPTOMS.map((s) => [s.code, s.label]))

function PatientCard({ data }: { data: CaseDetail }) {
  const { consultation: c, triage_result: t } = data
  const p = t?.symptom_payload
  return (
    <section className="rounded-xl bg-brand-900 p-5 text-white lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="eyebrow text-mint-200">{patientLabel(c)}</p>
        {t && <UrgencyBadge urgency={t.urgency} size="sm" />}
      </div>
      <p className="mt-2 font-display text-[24px] leading-tight font-[460]">
        {p ? describeAge(p.age_months) : "Age not given"}
        {p?.sex ? ` · ${p.sex}` : ""}
        {p?.is_pregnant ? " · pregnant" : ""}
      </p>
      <p className="mt-3 text-label-m text-white/60">Their words</p>
      <p className="mt-1 text-body-l break-words text-white/90">{c.complaint}</p>
      {t ? (
        <>
          <p className="mt-4 text-label-m text-white/60">Signs ticked</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {p?.symptoms.length ? (
              p.symptoms.map((s) => (
                <li key={s} className="rounded-full bg-white/12 px-2.5 py-1 text-label-m">
                  {SYMPTOM_LABEL.get(s) ?? s}
                </li>
              ))
            ) : (
              <li className="text-body-m text-white/75">None</li>
            )}
            {p?.vitals?.resp_rate != null && (
              <li className="rounded-full bg-white/12 px-2.5 py-1 text-label-m">Breathing {p.vitals.resp_rate}/min</li>
            )}
          </ul>
          <details className="group mt-4 rounded-lg bg-white/[0.06] ring-1 ring-white/12 ring-inset">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3.5 text-label-l [&::-webkit-details-marker]:hidden">
              Why the check said this
              <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="flex flex-col gap-3 px-3.5 pb-3.5">
              <p className="text-body-m text-white/85">{t.recommendation}</p>
              {t.rules_fired.length ? (
                <ul className="flex flex-col gap-2">
                  {t.rules_fired.map((r) => (
                    <li key={r.rule_id + String(r.value_that_triggered)} className="flex items-start gap-2.5 text-body-m text-white/85">
                      <UrgencyDot urgency={r.urgency} className="mt-2" />
                      <span>
                        {r.description} <span className="text-white/60">({String(r.value_that_triggered)})</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-body-m text-white/75">No danger signs were found.</p>
              )}
              <p className="text-label-m text-white/60">
                Checked {formatDateTime(t.created_at)}
                {t.synced_from_offline ? " · done offline" : ""}
              </p>
            </div>
          </details>
        </>
      ) : (
        <p className="mt-4 rounded-lg bg-white/[0.06] p-3 text-body-m text-white/75">No symptom check is linked to this consultation.</p>
      )}
    </section>
  )
}

type Issued = { code: string; text: string; clientId: string; shared: boolean }
type ShareMessage = (text: string, clientId?: string) => Promise<void>

function IssuedCode({ kind, issued, share }: { kind: "rx" | "ref"; issued: Issued; share: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  return (
    <CodeCard kind={kind} code={issued.code}>
      <p>{issued.shared ? "Sent to the patient's chat." : "Issued, but not yet in the chat. Keep this code."}</p>
      {!issued.shared && (
        <Button
          variant="tonal"
          size="sm"
          className="mt-3"
          loading={busy}
          onClick={async () => {
            setBusy(true)
            setError(false)
            try {
              await share()
            } catch {
              setError(true)
            } finally {
              setBusy(false)
            }
          }}
        >
          Send to chat again
        </Button>
      )}
      {error && <p className="mt-3">Couldn&apos;t send yet. Reconnect and try again; the code is still valid.</p>}
    </CodeCard>
  )
}

type Tab = "rx" | "ref" | "close"

function Actions({ data, onMessage, canWrite }: { data: CaseDetail; onMessage: ShareMessage; canWrite: boolean }) {
  const id = data.consultation.consultation_id
  const navigate = useNavigate()
  const qc = useQueryClient()
  const facilities = useFacilities()
  const tabs = [
    ...(flags.prescriptions ? [{ key: "rx" as Tab, label: "Prescribe", icon: Pill }] : []),
    ...(flags.referrals ? [{ key: "ref" as Tab, label: "Refer", icon: FileCheck2 }] : []),
    { key: "close" as Tab, label: "Close", icon: ClipboardCheck },
  ]
  const [tab, setTab] = useState<Tab>(tabs[0].key)
  const [rxIssued, setRxIssued] = useState<Issued | null>(null)
  const [refIssued, setRefIssued] = useState<Issued | null>(null)
  const [confirmClose, setConfirmClose] = useState(false)

  const rx = useForm(
    { medication_details: "", instructions: "" },
    { medication_details: [rules.required("Write the medicine and dose."), rules.maxLength(2000)], instructions: [rules.maxLength(2000)] },
  )
  const ref = useForm(
    { target_facility_id: "", reason: "" },
    { target_facility_id: [rules.required("Choose where to refer the patient.")], reason: [rules.required("Say why, in a few words."), rules.maxLength(1000)] },
  )

  const share = async (issued: Issued, kind: "rx" | "ref") => {
    await onMessage(issued.text, issued.clientId)
    ;(kind === "rx" ? setRxIssued : setRefIssued)((cur) => (cur?.code === issued.code ? { ...cur, shared: true } : cur))
  }
  const prescribe = useMutation({
    mutationFn: () =>
      doctorApi.prescribe(id, { medication_details: rx.values.medication_details.trim(), instructions: rx.values.instructions.trim() }),
    onSuccess: async ({ code }) => {
      const issued = {
        code,
        text: `Prescription code: ${code} — ${rx.values.medication_details.trim()}. Show this code at the pharmacy.`,
        clientId: ulid(),
        shared: false,
      }
      setRxIssued(issued)
      rx.reset()
      toast("Prescription issued")
      await share(issued, "rx").catch(() => undefined)
    },
  })
  const referral = useMutation({
    mutationFn: () => doctorApi.refer(id, { target_facility_id: ref.values.target_facility_id, reason: ref.values.reason.trim() }),
    onSuccess: async ({ code }) => {
      const name = facilities?.find((f) => f.facility_id === ref.values.target_facility_id)?.name ?? "the facility"
      const issued = { code, text: `Referral code: ${code} — please go to ${name}. Show this code when you arrive.`, clientId: ulid(), shared: false }
      setRefIssued(issued)
      ref.reset()
      toast("Referral issued")
      await share(issued, "ref").catch(() => undefined)
    },
  })
  const close = useMutation({
    mutationFn: () => doctorApi.close(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["doctor-queue"] })
      toast("Case closed")
      navigate("/doctor")
    },
  })
  const closed = data.consultation.status === "closed"

  return (
    <Panel>
      <div role="tablist" aria-label="Case actions" className="grid grid-cols-3 gap-1 rounded-full bg-cream p-1">
        {tabs.map((t) => {
          const on = t.key === tab
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(t.key)}
              className={cn("relative flex h-10 items-center justify-center gap-1.5 rounded-full text-label-l transition-colors", on ? "text-white" : "text-ink-600 hover:text-ink-900")}
            >
              {on && <motion.span layoutId="case-tab" className="absolute inset-0 rounded-full bg-brand-900" transition={SPRING.default} />}
              <t.icon className="relative size-4" aria-hidden />
              <span className="relative">{t.label}</span>
            </button>
          )
        })}
      </div>

      <div className="mt-5" role="tabpanel">
        {tab === "rx" && (
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (rx.check() && canWrite && !prescribe.isPending) prescribe.mutate()
            }}
          >
            <Field label="Medicine and dose" required error={rx.error("medication_details")} hint="For example: Paracetamol 500 mg, 12 tablets">
              {(fid) => <Textarea id={fid} rows={3} maxLength={2000} disabled={!canWrite} {...rx.bind("medication_details")} />}
            </Field>
            <Field label="How to take it" error={rx.error("instructions")} hint="For example: 1 tablet every 6 hours for 3 days">
              {(fid) => <Input id={fid} maxLength={2000} disabled={!canWrite} {...rx.bind("instructions")} />}
            </Field>
            {prescribe.isError && <Feedback error>{friendlyError(prescribe.error)}</Feedback>}
            {rxIssued && <IssuedCode kind="rx" issued={rxIssued} share={() => share(rxIssued, "rx")} />}
            <Button type="submit" icon={Pill} disabled={!canWrite} loading={prescribe.isPending} className="self-start">
              Issue prescription
            </Button>
            <p className="text-label-m text-ink-600">The code is sent to the patient&apos;s chat. They show it at any pharmacy.</p>
          </form>
        )}

        {tab === "ref" && (
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (ref.check() && canWrite && !referral.isPending) referral.mutate()
            }}
          >
            <FacilityPicker
              id="referral-facility"
              label="Refer to"
              value={ref.values.target_facility_id}
              onChange={(v) => ref.set("target_facility_id", v)}
              error={ref.error("target_facility_id")}
            />
            <Field label="Reason" required error={ref.error("reason")} hint="For example: chest X-ray, suspected pneumonia">
              {(fid) => <Input id={fid} maxLength={1000} disabled={!canWrite} {...ref.bind("reason")} />}
            </Field>
            {referral.isError && <Feedback error>{friendlyError(referral.error)}</Feedback>}
            {refIssued && <IssuedCode kind="ref" issued={refIssued} share={() => share(refIssued, "ref")} />}
            <Button type="submit" icon={FileCheck2} disabled={!canWrite} loading={referral.isPending} className="self-start">
              Issue referral
            </Button>
          </form>
        )}

        {tab === "close" && (
          <div className="flex flex-col gap-4">
            <p className="text-body-m text-ink-600">
              Closing ends the conversation: the patient can&apos;t send more messages. Send any prescription or referral first.
            </p>
            {close.isError && <Feedback error>{friendlyError(close.error)}</Feedback>}
            {closed ? (
              <Feedback>This case is closed.</Feedback>
            ) : confirmClose ? (
              <ConfirmAction
                title="Close this case?"
                confirmLabel="Close case"
                onCancel={() => setConfirmClose(false)}
                onConfirm={() => canWrite && close.mutate()}
                loading={close.isPending}
              >
                The patient will see that the consultation has ended.
              </ConfirmAction>
            ) : (
              <Button variant="secondary" icon={ClipboardCheck} disabled={!canWrite} onClick={() => setConfirmClose(true)} className="self-start">
                Close case
              </Button>
            )}
          </div>
        )}
        {!canWrite && !closed && <p className="mt-4 text-label-m text-ink-600">Claim the case and connect to use these.</p>}
      </div>
    </Panel>
  )
}

export default function DoctorCase() {
  const { id = "" } = useParams()
  const { session } = useAuth()
  const visible = useVisible()
  const online = useOnline()
  const now = useNow(30_000)
  const qc = useQueryClient()
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const busy = useRef(false)
  const scroller = useRef<HTMLOListElement>(null)
  const draftId = useRef<{ body: string; id: string } | null>(null)

  const query = useQuery({ queryKey: ["case", id], queryFn: () => doctorApi.getCase(id), refetchInterval: visible && online ? 15_000 : false })
  const claim = useMutation({
    mutationFn: () => doctorApi.claim(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["case", id] })
      await qc.invalidateQueries({ queryKey: ["doctor-queue"] })
      toast("Case claimed")
    },
  })
  const items: ChatItem[] = useMemo(
    () =>
      (query.data?.messages ?? []).map((m) => ({
        key: m.client_message_id || m.message_id,
        mine: m.sender_role === "doctor",
        content_type: m.content_type,
        text_body: m.text_body,
        duration_seconds: m.duration_seconds,
        created_at: m.created_at,
        voice: m.content_type === "voice_note" ? { kind: "remote" as const, consultationId: m.consultation_id, messageId: m.message_id } : undefined,
      })),
    [query.data],
  )
  useEffect(() => {
    const el = scroller.current
    if (el && items.length) el.scrollTo({ top: el.scrollHeight })
  }, [items.length])

  const back = (
    <Link to="/doctor" className="inline-flex h-10 items-center gap-1.5 rounded-full pr-3 text-label-l text-brand-700 hover:bg-mint">
      <ArrowLeft className="size-4" aria-hidden /> Queue
    </Link>
  )

  if (query.isPending)
    return (
      <div className="flex flex-col gap-4" role="status" aria-label="Loading the case">
        {back}
        <Skeleton className="h-12 w-64 rounded-lg" />
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    )
  if (!query.data)
    return (
      <div className="flex flex-col items-start gap-4">
        {back}
        <Feedback error>{friendlyError(query.error)}</Feedback>
        <Button variant="tonal" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    )

  const data = query.data
  const c = data.consultation
  const mineCase = c.doctor_id === session?.sub
  const canWrite = online && c.status === "open" && mineCase

  const postText: ShareMessage = async (body, clientId = ulid()) => {
    if (!canWrite) throw new Error("Claim this case and connect before replying.")
    await consultApi.postMessage(id, { client_message_id: clientId, content_type: "text", text_body: body })
    await qc.invalidateQueries({ queryKey: ["case", id] })
  }
  const submit = async () => {
    const body = text.trim()
    if (!body || busy.current || !canWrite) return
    busy.current = true
    setSending(true)
    setSendError(null)
    if (draftId.current?.body !== body) draftId.current = { body, id: ulid() }
    try {
      await postText(body, draftId.current.id)
      draftId.current = null
      setText((cur) => (cur.trim() === body ? "" : cur))
    } catch (error) {
      setSendError(friendlyError(error))
    } finally {
      busy.current = false
      setSending(false)
    }
  }
  const postVoice = async (recording: Recording) => {
    if (busy.current || !canWrite) return
    busy.current = true
    setSending(true)
    setSendError(null)
    try {
      const key = await uploadVoiceBlob(id, recording.blob)
      await consultApi.postMessage(id, {
        client_message_id: ulid(),
        content_type: "voice_note",
        voice_note_key: key,
        duration_seconds: recording.duration_seconds,
      })
      await qc.invalidateQueries({ queryKey: ["case", id] })
    } catch (error) {
      setSendError(friendlyError(error))
    } finally {
      busy.current = false
      setSending(false)
    }
  }

  const statusLine =
    c.status === "paid" ? "Waiting for a doctor" : c.status === "open" ? (mineCase ? "You're on this case" : "With another doctor") : c.status === "closed" ? "Closed" : "Not paid yet"

  return (
    <AppPage
      eyebrow="Doctor"
      title="Consultation"
      back={back}
      subtitle={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <PulseDot tone={c.status === "open" ? "green" : "muted"} live={c.status !== "closed"} />
          {statusLine} · opened {formatTime(c.created_at)} · waited {waited(c.created_at, now)}
        </span>
      }
      actions={<UpdatedAt updated={query.dataUpdatedAt} refresh={() => void query.refetch()} loading={query.isFetching} />}
      aside={
        <>
          <div className="hidden lg:block">
            <PatientCard data={data} />
          </div>
          <Actions key={id} data={data} onMessage={postText} canWrite={canWrite} />
          {data.triage_result && <AdvisoryNote />}
        </>
      }
    >
      <div className="lg:hidden">
        <PatientCard data={data} />
      </div>

      {c.status === "paid" && (
        <div className="flex flex-col gap-3 rounded-xl bg-mint p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-body-m text-brand-900">
            <span className="font-semibold">Claim this case to reply.</span> Other doctors will see it&apos;s taken.
          </p>
          <Button disabled={!online} loading={claim.isPending} onClick={() => claim.mutate()} className="shrink-0">
            Claim case
          </Button>
        </div>
      )}
      {claim.isError && <Feedback error>{friendlyError(claim.error)}</Feedback>}
      {c.status === "open" && !mineCase && <Feedback>Another doctor has this case. You can read it but not reply.</Feedback>}
      {!online && <Feedback>You&apos;re offline. Reconnect to reply, issue a code or close the case.</Feedback>}
      {query.isError && <Feedback error>{friendlyError(query.error)} Showing the last loaded version.</Feedback>}

      <section aria-label="Conversation" className="flex min-w-0 flex-col overflow-hidden rounded-xl bg-white shadow-[var(--shadow-elev-1)]">
        <ol
          ref={scroller}
          className="flex h-[min(56svh,560px)] min-h-72 flex-col gap-3 overflow-y-auto p-4 sm:p-5 short:h-[44svh]"
          aria-live="polite"
          aria-label="Messages"
        >
          <li className="mx-auto text-label-m text-ink-600">{formatDateTime(c.created_at)}</li>
          <ChatBubble item={{ key: "complaint", mine: false, content_type: "text", text_body: c.complaint, duration_seconds: null, created_at: c.created_at }} />
          {items.map((item) => (
            <ChatBubble key={item.key} item={item} />
          ))}
          {!items.some((i) => i.mine) && c.status !== "closed" && (
            <li className="mt-auto text-center text-body-m text-ink-600">{canWrite ? "Your reply goes here. Text or hold the mic for a voice note." : "No replies yet."}</li>
          )}
        </ol>
        {c.status === "closed" ? (
          <p className="border-t border-line bg-cream p-4 text-body-m text-ink-600">This case is closed.</p>
        ) : (
          <form
            className="flex min-w-0 flex-col gap-2 border-t border-line bg-cream/60 p-3 sm:p-4"
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
          >
            <div className="flex min-w-0 items-end gap-2">
              <label htmlFor="doctor-reply" className="sr-only">
                Reply to the patient
              </label>
              <Textarea
                id="doctor-reply"
                rows={2}
                disabled={!canWrite || sending}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    void submit()
                  }
                }}
                placeholder={canWrite ? "Write a reply (Enter to send)" : "Claim the case to reply"}
                className="min-w-0 flex-1 resize-none"
              />
              {text.trim() ? (
                <IconButton type="submit" icon={SendHorizontal} label="Send reply" variant="filled" disabled={!canWrite || sending} />
              ) : canWrite && !sending ? (
                <HoldToRecord size="md" label="Hold to record a voice reply" onRecorded={(r) => void postVoice(r)} />
              ) : null}
            </div>
            {(sending || sendError) && (
              <p role="status" className={cn("text-label-m", sendError ? "text-urgent-red" : "text-ink-600")}>
                {sendError ?? "Sending…"}
              </p>
            )}
          </form>
        )}
      </section>
    </AppPage>
  )
}
