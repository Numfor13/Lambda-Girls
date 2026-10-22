import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { motion } from "motion/react"
import { ulid } from "ulid"
import {
  ArrowLeft,
  ClipboardCheck,
  FileCheck2,
  MessageCircle,
  Pill,
  SendHorizontal,
} from "lucide-react"
import { consultApi, doctorApi } from "@/api/endpoints"
import { friendlyError } from "@/api/errors"
import type { CaseDetail } from "@/api/types"
import { useAuth } from "@/auth/AuthProvider"
import { flags } from "@/config/flags"
import { Button, IconButton, IconRouterLink } from "@/design/components/Button"
import { ChatBubble, type ChatItem } from "@/design/components/ChatBubble"
import { CodeCard, ConfirmAction, Feedback } from "@/design/components/Feedback"
import { Field, Input, Select, Textarea } from "@/design/components/Field"
import { HoldToRecord } from "@/design/components/HoldToRecord"
import {
  AdvisoryNote,
  Card,
  PageHeader,
  PageSpinner,
} from "@/design/components/primitives"
import { UrgencyBadge, UrgencyDot } from "@/design/components/UrgencyBadge"
import { popIn, staggerOnMount } from "@/design/motion"
import { describeAge, formatDateTime, timeAgo } from "@/lib/format"
import { useNow, useOnline, useVisible } from "@/lib/hooks"
import { useFacilities } from "@/offline/facilities"
import { uploadVoiceBlob } from "@/offline/sync"
import type { Recording } from "@/offline/voiceRecorder"
import { SYMPTOMS } from "@/triage-engine/symptoms"
import { patientLabel } from "./DoctorQueue"

const SYMPTOM_LABEL = new Map(SYMPTOMS.map((s) => [s.code, s.label]))

function PatientPanel({ data }: { data: CaseDetail }) {
  const { consultation: c, triage_result: t } = data
  const payload = t?.symptom_payload
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card className="rounded-xl p-5">
        <p className="eyebrow">Patient context</p>
        <h2 className="mt-3 text-title-l">{patientLabel(c)}</h2>
        {payload && (
          <p className="mt-2 text-body-m text-ink-600">
            {describeAge(payload.age_months)}
            {payload.sex ? ` · ${payload.sex}` : ""}
            {payload.is_pregnant ? " · pregnant" : ""}
          </p>
        )}
        <p className="mt-4 text-label-l text-ink-600">Complaint</p>
        <p className="mt-2 text-body-l break-words">{c.complaint}</p>
      </Card>
      {t ? (
        <>
          <Card className="flex flex-col gap-4 rounded-xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-title-l">Triage audit</h2>
              <UrgencyBadge urgency={t.urgency} size="sm" />
            </div>
            <p className="text-body-l">{t.recommendation}</p>
            <p className="text-label-m text-ink-600">
              Checked {formatDateTime(t.created_at)}
              {t.synced_from_offline ? " · synced from offline" : ""}
            </p>
            <h3 className="text-title-m">Why this result</h3>
            {t.rules_fired.length ? (
              <ul className="flex flex-col gap-4">
                {t.rules_fired.map((r) => (
                  <li
                    key={r.rule_id + String(r.value_that_triggered)}
                    className="flex min-w-0 items-start gap-3"
                  >
                    <UrgencyDot urgency={r.urgency} className="mt-2" />
                    <div className="min-w-0 text-body-m">
                      <p>{r.description}</p>
                      <p className="mt-1 text-label-m break-all text-ink-600">
                        Rule {r.rule_id}
                      </p>
                      <p className="mt-1 text-label-m text-ink-600">
                        Recorded value: {String(r.value_that_triggered)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-body-m text-ink-600">
                None of the checked danger signs were found.
              </p>
            )}
            <AdvisoryNote long />
          </Card>
          {payload && (
            <Card className="rounded-xl p-5">
              <h3 className="text-title-l">Reported signs</h3>
              <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-body-m">
                {payload.symptoms.length ? (
                  payload.symptoms.map((s) => (
                    <li key={s}>{SYMPTOM_LABEL.get(s) ?? s}</li>
                  ))
                ) : (
                  <li>None recorded</li>
                )}
              </ul>
              {payload.vitals?.resp_rate != null && (
                <p className="mt-3 text-body-m">
                  Breathing rate: {payload.vitals.resp_rate}/min
                </p>
              )}
            </Card>
          )}
        </>
      ) : (
        <Feedback>No symptom check was linked to this consultation.</Feedback>
      )}
    </div>
  )
}

type Issued = { code: string; text: string; clientId: string; shared: boolean }
type ShareMessage = (text: string, clientId?: string) => Promise<void>
function IssuedCode({
  kind,
  issued,
  share,
}: {
  kind: "rx" | "ref"
  issued: Issued
  share: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  return (
    <CodeCard kind={kind} code={issued.code}>
      <p>
        {issued.shared
          ? "Sent to the patient's chat."
          : "Code issued. The chat message has not been confirmed; keep this code."}
      </p>
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
          Retry sharing code
        </Button>
      )}
      {error && (
        <p className="mt-3">
          Could not share yet. Reconnect and retry; the issued code is still
          valid.
        </p>
      )}
    </CodeCard>
  )
}

function ActionsPanel({
  data,
  onMessage,
  canWrite,
}: {
  data: CaseDetail
  onMessage: ShareMessage
  canWrite: boolean
}) {
  const id = data.consultation.consultation_id
  const navigate = useNavigate(),
    queryClient = useQueryClient()
  const facilities = useFacilities()
  const [rx, setRx] = useState({ medication_details: "", instructions: "" })
  const [refer, setRefer] = useState({ target_facility_id: "", reason: "" })
  const [rxIssued, setRxIssued] = useState<Issued | null>(null)
  const [refIssued, setRefIssued] = useState<Issued | null>(null)
  const [confirmClose, setConfirmClose] = useState(false)
  const share = async (issued: Issued, kind: "rx" | "ref") => {
    await onMessage(issued.text, issued.clientId)
    const update = kind === "rx" ? setRxIssued : setRefIssued
    update((current) =>
      current?.code === issued.code ? { ...current, shared: true } : current
    )
  }
  const prescribe = useMutation({
    mutationFn: () =>
      doctorApi.prescribe(id, {
        medication_details: rx.medication_details.trim(),
        instructions: rx.instructions.trim(),
      }),
    onSuccess: async ({ code }) => {
      const issued = {
        code,
        text: `Prescription code: ${code} — ${rx.medication_details}. Show this code at the pharmacy.`,
        clientId: ulid(),
        shared: false,
      }
      setRxIssued(issued)
      setRx({ medication_details: "", instructions: "" })
      await share(issued, "rx").catch(() => undefined)
    },
  })
  const referral = useMutation({
    mutationFn: () => doctorApi.refer(id, refer),
    onSuccess: async ({ code }) => {
      const name =
        facilities?.find((f) => f.facility_id === refer.target_facility_id)
          ?.name ?? "the facility"
      const issued = {
        code,
        text: `Referral code: ${code} — please go to ${name}. Show this code when you arrive.`,
        clientId: ulid(),
        shared: false,
      }
      setRefIssued(issued)
      setRefer({ target_facility_id: "", reason: "" })
      await share(issued, "ref").catch(() => undefined)
    },
  })
  const close = useMutation({
    mutationFn: () => doctorApi.close(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["doctor-queue"] })
      navigate("/doctor")
    },
  })
  const sortedFacilities = useMemo(
    () => [...(facilities ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [facilities]
  )
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {flags.prescriptions && (
        <Card className="rounded-xl p-5">
          <h2 className="flex items-center gap-3 text-title-l">
            <Pill className="size-5 text-brand-700" aria-hidden />
            Issue prescription
          </h2>
          <form
            className="mt-4 flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (canWrite && rx.medication_details.trim()) prescribe.mutate()
            }}
          >
            <Field label="Medication and dose">
              {(fid) => (
                <Textarea
                  id={fid}
                  required
                  disabled={!canWrite}
                  value={rx.medication_details}
                  onChange={(e) =>
                    setRx({ ...rx, medication_details: e.target.value })
                  }
                />
              )}
            </Field>
            <Field label="Instructions">
              {(fid) => (
                <Input
                  id={fid}
                  disabled={!canWrite}
                  value={rx.instructions}
                  onChange={(e) =>
                    setRx({ ...rx, instructions: e.target.value })
                  }
                />
              )}
            </Field>
            {prescribe.isError && (
              <Feedback error>{friendlyError(prescribe.error)}</Feedback>
            )}
            {rxIssued && (
              <IssuedCode
                kind="rx"
                issued={rxIssued}
                share={() => share(rxIssued, "rx")}
              />
            )}
            <Button
              type="submit"
              variant="tonal"
              icon={Pill}
              disabled={!canWrite || !rx.medication_details.trim()}
              loading={prescribe.isPending}
            >
              Issue prescription
            </Button>
          </form>
        </Card>
      )}
      {flags.referrals && (
        <Card className="rounded-xl p-5">
          <h2 className="flex items-center gap-3 text-title-l">
            <FileCheck2 className="size-5 text-brand-700" aria-hidden />
            Refer to a facility
          </h2>
          <form
            className="mt-4 flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (canWrite && refer.target_facility_id) referral.mutate()
            }}
          >
            <Field label="Facility">
              {(fid) => (
                <Select
                  id={fid}
                  disabled={!canWrite}
                  required
                  value={refer.target_facility_id}
                  onChange={(e) =>
                    setRefer({ ...refer, target_facility_id: e.target.value })
                  }
                >
                  <option value="" disabled>
                    Choose a facility…
                  </option>
                  {sortedFacilities.map((f) => (
                    <option key={f.facility_id} value={f.facility_id}>
                      {f.name} — {f.quarter}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Reason">
              {(fid) => (
                <Input
                  id={fid}
                  disabled={!canWrite}
                  value={refer.reason}
                  onChange={(e) =>
                    setRefer({ ...refer, reason: e.target.value })
                  }
                />
              )}
            </Field>
            {referral.isError && (
              <Feedback error>{friendlyError(referral.error)}</Feedback>
            )}
            {refIssued && (
              <IssuedCode
                kind="ref"
                issued={refIssued}
                share={() => share(refIssued, "ref")}
              />
            )}
            <Button
              type="submit"
              variant="tonal"
              icon={FileCheck2}
              disabled={!canWrite || !refer.target_facility_id}
              loading={referral.isPending}
            >
              Issue referral
            </Button>
          </form>
        </Card>
      )}
      <Card className="flex flex-col gap-4 rounded-xl p-5">
        <h2 className="text-title-l">Finish this consultation</h2>
        <p className="text-body-m text-ink-600">
          Closing the case ends this conversation. Share any prescription or
          referral code first.
        </p>
        {close.isError && (
          <Feedback error>{friendlyError(close.error)}</Feedback>
        )}
        {confirmClose ? (
          <ConfirmAction
            title="Close this case?"
            confirmLabel="Close case"
            onCancel={() => setConfirmClose(false)}
            onConfirm={() => {
              if (canWrite) close.mutate()
            }}
            loading={close.isPending}
          >
            The patient will no longer be able to send messages in this
            consultation.
          </ConfirmAction>
        ) : (
          <Button
            variant="secondary"
            icon={ClipboardCheck}
            disabled={!canWrite}
            onClick={() => setConfirmClose(true)}
          >
            {data.consultation.status === "closed"
              ? "Case closed"
              : "Close case"}
          </Button>
        )}
      </Card>
    </div>
  )
}

export default function DoctorCase() {
  const { id = "" } = useParams()
  const { session } = useAuth()
  const visible = useVisible(),
    online = useOnline(),
    now = useNow(30_000)
  const queryClient = useQueryClient()
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const busy = useRef(false),
    bottom = useRef<HTMLLIElement>(null)
  const draftId = useRef<{ body: string; id: string } | null>(null)
  const query = useQuery({
    queryKey: ["case", id],
    queryFn: () => doctorApi.getCase(id),
    refetchInterval: visible && online ? 15_000 : false,
  })
  const claim = useMutation({
    mutationFn: () => doctorApi.claim(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["case", id] })
      await queryClient.invalidateQueries({ queryKey: ["doctor-queue"] })
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
        voice:
          m.content_type === "voice_note"
            ? {
                kind: "remote" as const,
                consultationId: m.consultation_id,
                messageId: m.message_id,
              }
            : undefined,
      })),
    [query.data]
  )
  useEffect(() => {
    if (items.length) bottom.current?.scrollIntoView({ block: "nearest" })
  }, [items.length])
  if (query.isPending) return <PageSpinner />
  if (!query.data)
    return <Feedback error>{friendlyError(query.error)}</Feedback>
  const data = query.data,
    c = data.consultation
  const canWrite = online && c.status === "open" && c.doctor_id === session?.sub
  const postText: ShareMessage = async (body, clientId = ulid()) => {
    if (!canWrite)
      throw new Error("Claim this case and connect before replying.")
    await consultApi.postMessage(id, {
      client_message_id: clientId,
      content_type: "text",
      text_body: body,
    })
    await queryClient.invalidateQueries({ queryKey: ["case", id] })
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
      setText((current) => (current.trim() === body ? "" : current))
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
      await queryClient.invalidateQueries({ queryKey: ["case", id] })
    } catch (error) {
      setSendError(friendlyError(error))
    } finally {
      busy.current = false
      setSending(false)
    }
  }
  return (
    <motion.div
      variants={staggerOnMount()}
      initial="hidden"
      animate="show"
      className="mx-auto flex max-w-6xl min-w-0 flex-col gap-5"
    >
      <PageHeader
        eyebrow="Doctor workspace"
        title="Consultation"
        subtitle={`Created ${formatDateTime(c.created_at)}`}
        back={
          <IconRouterLink
            to="/doctor"
            icon={ArrowLeft}
            label="Back to queue"
            variant="glass"
            className="mb-4"
          />
        }
        action={
          c.urgency ? <UrgencyBadge urgency={c.urgency} size="sm" /> : undefined
        }
      />
      <p className="text-body-m text-ink-600">
        Updated {timeAgo(query.dataUpdatedAt, now)} ·{" "}
        {online ? "Checks for replies every 15 seconds" : "Offline"}
      </p>
      {query.isError && (
        <Feedback error>
          {friendlyError(query.error)} The last loaded case remains visible.
        </Feedback>
      )}
      {c.status === "paid" && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-mint p-5">
          <p className="text-body-m">
            Claim this case before replying or issuing a code.
          </p>
          <Button
            disabled={!online}
            loading={claim.isPending}
            onClick={() => claim.mutate()}
          >
            Claim case
          </Button>
        </div>
      )}
      {claim.isError && <Feedback error>{friendlyError(claim.error)}</Feedback>}
      {!online && (
        <Feedback>Connect to reply, issue a code or close the case.</Feedback>
      )}
      {c.status === "open" && c.doctor_id !== session?.sub && (
        <Feedback>
          This case is assigned to another doctor. You can review the details.
        </Feedback>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <motion.section
          variants={popIn}
          className="flex min-w-0 flex-col gap-4"
          aria-label="Conversation"
        >
          <Card className="overflow-hidden rounded-xl">
            <h2 className="flex items-center gap-3 border-b border-line p-5 text-title-l">
              <MessageCircle className="size-5 text-brand-700" aria-hidden />
              Conversation
            </h2>
            <ol
              className="flex max-h-96 min-h-64 flex-col gap-3 overflow-y-auto p-4"
              aria-live="polite"
              aria-label="Messages"
            >
              {!items.length && (
                <li className="m-auto text-body-m text-ink-600">
                  No messages yet.
                </li>
              )}
              {items.map((item) => (
                <ChatBubble key={item.key} item={item} />
              ))}
              <li ref={bottom} aria-hidden />
            </ol>
          </Card>
          {sendError && <Feedback error>{sendError}</Feedback>}
          {c.status === "closed" ? (
            <Feedback>This case is closed.</Feedback>
          ) : (
            <form
              className="flex min-w-0 flex-col gap-3 shape-bl p-4 glass-strong"
              onSubmit={(e) => {
                e.preventDefault()
                void submit()
              }}
            >
              <label htmlFor="doctor-reply" className="text-label-l">
                Reply to the patient
              </label>
              <div className="flex min-w-0 items-end gap-3">
                <Textarea
                  id="doctor-reply"
                  rows={2}
                  disabled={!canWrite || sending}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing
                    ) {
                      e.preventDefault()
                      void submit()
                    }
                  }}
                  placeholder="Type a reply…"
                  className="min-w-0 flex-1 resize-none"
                />
                {text.trim() ? (
                  <IconButton
                    type="submit"
                    icon={SendHorizontal}
                    label="Send reply"
                    variant="filled"
                    disabled={!canWrite || sending}
                  />
                ) : canWrite && !sending ? (
                  <HoldToRecord
                    size="md"
                    label="Hold to record a voice reply"
                    onRecorded={(r) => void postVoice(r)}
                  />
                ) : null}
              </div>
              <p className="text-label-m text-ink-600" role="status">
                {sending
                  ? "Sending…"
                  : canWrite
                    ? "Connected · ready to send"
                    : "Replying is unavailable until this case is claimed and connected."}
              </p>
            </form>
          )}
        </motion.section>
        <motion.aside
          variants={popIn}
          className="flex min-w-0 flex-col gap-4"
          aria-label="Triage and case actions"
        >
          <PatientPanel data={data} />
          <ActionsPanel
            key={id}
            data={data}
            onMessage={postText}
            canWrite={canWrite}
          />
        </motion.aside>
      </div>
    </motion.div>
  )
}
