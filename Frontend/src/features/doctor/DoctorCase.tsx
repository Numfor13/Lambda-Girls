import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ulid } from "ulid"
import { ChevronLeft, FileCheck2, Pill, SendHorizontal } from "lucide-react"
import { consultApi, doctorApi } from "@/api/endpoints"
import { friendlyError } from "@/api/errors"
import type { CaseDetail } from "@/api/types"
import { flags } from "@/config/flags"
import { Button } from "@/design/components/Button"
import { ChatBubble, type ChatItem } from "@/design/components/ChatBubble"
import { Field, Input, Select, Textarea } from "@/design/components/Field"
import { HoldToRecord } from "@/design/components/HoldToRecord"
import { Card, Notice, PageSpinner } from "@/design/components/primitives"
import { URGENCY_META, UrgencyBadge } from "@/design/components/UrgencyBadge"
import { describeAge, formatDateTime } from "@/lib/format"
import { useVisible } from "@/lib/hooks"
import { cn } from "@/lib/utils"
import { useFacilities } from "@/offline/facilities"
import { uploadVoiceBlob } from "@/offline/sync"
import type { Recording } from "@/offline/voiceRecorder"
import { SYMPTOMS } from "@/triage-engine/symptoms"
import { patientLabel } from "./DoctorQueue"

const SYMPTOM_LABEL = new Map(SYMPTOMS.map((s) => [s.code, s.label]))

function PatientPanel({ data }: { data: CaseDetail }) {
  const { consultation: c, triage_result: t } = data
  const p = t?.symptom_payload
  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <p className="text-xs font-bold tracking-wide text-ink-600 uppercase">Patient</p>
        <p className="mt-1 font-semibold">{patientLabel(c)}</p>
        {p && (
          <p className="text-sm text-ink-600">
            {describeAge(p.age_months)}
            {p.sex ? ` · ${p.sex}` : ""}
            {p.is_pregnant ? " · pregnant" : ""}
          </p>
        )}
        <p className="mt-3 text-xs font-bold tracking-wide text-ink-600 uppercase">Complaint</p>
        <p className="mt-1 text-[15px]">{c.complaint}</p>
      </Card>

      {t ? (
        <>
          <div className={cn("rounded-[16px] p-4", URGENCY_META[t.urgency].hero)}>
            <p className="text-sm font-bold uppercase">
              {t.urgency} · {URGENCY_META[t.urgency].label}
            </p>
            <p className="mt-1 text-sm opacity-95">{t.recommendation}</p>
            <p className="mt-2 text-xs opacity-80">
              Checked {formatDateTime(t.created_at)}
              {t.synced_from_offline && " · synced from offline"}
            </p>
          </div>
          <Card className="overflow-hidden">
            <p className="border-b border-line px-4 py-3 text-sm font-bold">Rules fired</p>
            {t.rules_fired.length === 0 ? (
              <p className="px-4 py-3 text-sm text-ink-600">No danger signs found.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-cream text-xs text-ink-600">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Rule</th>
                    <th className="px-4 py-2 font-semibold">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {t.rules_fired.map((r) => (
                    <tr key={r.rule_id + String(r.value_that_triggered)} className="border-t border-line align-top">
                      <td className="px-4 py-2">
                        <UrgencyBadge urgency={r.urgency} size="sm" />
                        <p className="mt-1">{r.description}</p>
                        <p className="font-mono text-[11px] text-ink-400">{r.rule_id}</p>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">{String(r.value_that_triggered)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
          {p && (
            <Card className="p-4 text-sm">
              <p className="font-bold">Reported signs</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {p.symptoms.length ? p.symptoms.map((s) => <li key={s}>{SYMPTOM_LABEL.get(s) ?? s}</li>) : <li>None</li>}
              </ul>
              {p.vitals?.resp_rate && <p className="mt-2">Breathing rate: {p.vitals.resp_rate}/min</p>}
            </Card>
          )}
        </>
      ) : (
        <Notice tone="info">No symptom check was linked to this consultation.</Notice>
      )}
    </div>
  )
}

function CodeIssued({ kind, code }: { kind: "rx" | "ref"; code: string }) {
  return (
    <Notice tone="success">
      {kind === "rx" ? "Prescription" : "Referral"} code{" "}
      <Link to={`/${kind}/${code}`} className="font-mono text-[16px] font-bold tracking-wider underline">
        {code}
      </Link>{" "}
      — also sent to the patient's chat.
    </Notice>
  )
}

function ActionsPanel({ data, onMessage }: { data: CaseDetail; onMessage: (text: string) => Promise<void> }) {
  const id = data.consultation.consultation_id
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const facilities = useFacilities()
  const [rx, setRx] = useState({ medication_details: "", instructions: "" })
  const [refer, setRefer] = useState({ target_facility_id: "", reason: "" })
  const [rxCode, setRxCode] = useState<string | null>(null)
  const [refCode, setRefCode] = useState<string | null>(null)
  const closed = data.consultation.status === "closed"

  const prescribe = useMutation({
    mutationFn: () => doctorApi.prescribe(id, rx),
    onSuccess: async ({ code }) => {
      setRxCode(code)
      await onMessage(`Prescription code: ${code} — ${rx.medication_details}. Show this code at the pharmacy.`)
      setRx({ medication_details: "", instructions: "" })
    },
  })
  const referral = useMutation({
    mutationFn: () => doctorApi.refer(id, refer),
    onSuccess: async ({ code }) => {
      setRefCode(code)
      const name = facilities?.find((f) => f.facility_id === refer.target_facility_id)?.name ?? "the facility"
      await onMessage(`Referral code: ${code} — please go to ${name}. Show this code when you arrive.`)
      setRefer({ target_facility_id: "", reason: "" })
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
    [facilities],
  )

  return (
    <div className="flex flex-col gap-4">
      {flags.prescriptions && (
        <Card className="p-4">
          <h3 className="flex items-center gap-2 font-bold">
            <Pill className="size-5 text-brand-700" aria-hidden /> Issue prescription
          </h3>
          <form
            className="mt-3 flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              prescribe.mutate()
            }}
          >
            <Field label="Medication and dose">
              {(fid) => (
                <Textarea
                  id={fid}
                  className="min-h-20"
                  value={rx.medication_details}
                  onChange={(e) => setRx({ ...rx, medication_details: e.target.value })}
                />
              )}
            </Field>
            <Field label="Instructions">
              {(fid) => (
                <Input id={fid} value={rx.instructions} onChange={(e) => setRx({ ...rx, instructions: e.target.value })} />
              )}
            </Field>
            {prescribe.isError && <Notice tone="error">{friendlyError(prescribe.error)}</Notice>}
            {rxCode && <CodeIssued kind="rx" code={rxCode} />}
            <Button type="submit" size="sm" disabled={closed || !rx.medication_details.trim()} loading={prescribe.isPending}>
              Issue prescription
            </Button>
          </form>
        </Card>
      )}

      {flags.referrals && (
        <Card className="p-4">
          <h3 className="flex items-center gap-2 font-bold">
            <FileCheck2 className="size-5 text-brand-700" aria-hidden /> Refer
          </h3>
          <form
            className="mt-3 flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              referral.mutate()
            }}
          >
            <Field label="Facility">
              {(fid) => (
                <Select
                  id={fid}
                  value={refer.target_facility_id}
                  onChange={(e) => setRefer({ ...refer, target_facility_id: e.target.value })}
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
                <Input id={fid} value={refer.reason} onChange={(e) => setRefer({ ...refer, reason: e.target.value })} />
              )}
            </Field>
            {referral.isError && <Notice tone="error">{friendlyError(referral.error)}</Notice>}
            {refCode && <CodeIssued kind="ref" code={refCode} />}
            <Button type="submit" size="sm" disabled={closed || !refer.target_facility_id} loading={referral.isPending}>
              Issue referral
            </Button>
          </form>
        </Card>
      )}

      <Card className="p-4">
        <h3 className="font-bold">Close case</h3>
        <p className="mt-1 text-sm text-ink-600">The patient can no longer send messages after this.</p>
        {close.isError && (
          <Notice tone="error" className="mt-3">
            {friendlyError(close.error)}
          </Notice>
        )}
        <Button
          variant="secondary"
          size="sm"
          className="mt-3"
          disabled={closed}
          loading={close.isPending}
          onClick={() => {
            if (window.confirm("Close this consultation?")) close.mutate()
          }}
        >
          {closed ? "Closed" : "Close case"}
        </Button>
      </Card>
    </div>
  )
}

export default function DoctorCase() {
  const { id = "" } = useParams()
  const visible = useVisible()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<"patient" | "chat" | "actions">("chat")
  const [text, setText] = useState("")
  const [sendError, setSendError] = useState<string | null>(null)
  const bottom = useRef<HTMLDivElement>(null)

  const query = useQuery({
    queryKey: ["case", id],
    queryFn: () => doctorApi.getCase(id),
    refetchInterval: visible ? 15_000 : false,
  })
  const claim = useMutation({
    mutationFn: () => doctorApi.claim(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["case", id] }),
  })

  const items: ChatItem[] = useMemo(
    () =>
      (query.data?.messages ?? []).map((m) => ({
        key: m.client_message_id,
        mine: m.sender_role === "doctor",
        content_type: m.content_type,
        text_body: m.text_body,
        duration_seconds: m.duration_seconds,
        created_at: m.created_at,
        voice:
          m.content_type === "voice_note"
            ? { kind: "remote" as const, consultationId: m.consultation_id, messageId: m.message_id }
            : undefined,
      })),
    [query.data],
  )

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" })
  }, [items.length])

  if (query.isPending) return <PageSpinner />
  if (query.isError) return <Notice tone="error">{friendlyError(query.error)}</Notice>

  const data = query.data
  const c = data.consultation
  const closed = c.status === "closed"

  const postText = async (body: string) => {
    setSendError(null)
    try {
      await consultApi.postMessage(id, { client_message_id: ulid(), content_type: "text", text_body: body })
      await queryClient.invalidateQueries({ queryKey: ["case", id] })
    } catch (e) {
      setSendError(friendlyError(e))
      throw e
    }
  }

  const postVoice = async (r: Recording) => {
    setSendError(null)
    try {
      const key = await uploadVoiceBlob(id, r.blob)
      await consultApi.postMessage(id, {
        client_message_id: ulid(),
        content_type: "voice_note",
        voice_note_key: key,
        duration_seconds: r.duration_seconds,
      })
      await queryClient.invalidateQueries({ queryKey: ["case", id] })
    } catch (e) {
      setSendError(friendlyError(e))
    }
  }

  const submit = async () => {
    const body = text.trim()
    if (!body) return
    setText("")
    await postText(body).catch(() => setText(body))
  }

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <Link to="/doctor" className="flex h-11 items-center gap-1 font-semibold text-brand-700">
          <ChevronLeft className="size-5" aria-hidden /> Queue
        </Link>
        <h1 className="text-[22px] font-extrabold">Case</h1>
        {c.urgency && <UrgencyBadge urgency={c.urgency} />}
        <span className="text-sm text-ink-600">Opened {formatDateTime(c.created_at)}</span>
        {c.status === "paid" && (
          <Button size="sm" className="ml-auto" loading={claim.isPending} onClick={() => claim.mutate()}>
            Claim case
          </Button>
        )}
      </header>

      <div className="mb-4 grid grid-cols-3 rounded-[12px] bg-white p-1 ring-1 ring-line lg:hidden" role="tablist">
        {(["patient", "chat", "actions"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn("h-10 rounded-[9px] text-sm font-semibold capitalize", tab === t ? "bg-brand-700 text-white" : "text-ink-600")}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[300px_1fr_300px]">
        <section className={cn(tab !== "patient" && "hidden lg:block")} aria-label="Patient and triage">
          <PatientPanel data={data} />
        </section>

        <section
          className={cn("flex min-h-[60vh] flex-col rounded-[16px] border border-line bg-white", tab !== "chat" && "hidden lg:flex")}
          aria-label="Conversation"
        >
          <ol className="flex flex-1 flex-col gap-2 overflow-y-auto p-4" aria-live="polite">
            {items.length === 0 && <li className="m-auto text-sm text-ink-600">No messages yet.</li>}
            {items.map((item) => (
              <ChatBubble key={item.key} item={item} />
            ))}
            <div ref={bottom} />
          </ol>
          {sendError && <Notice tone="error" className="mx-3 mb-2">{sendError}</Notice>}
          {closed ? (
            <p className="border-t border-line px-4 py-3 text-center text-sm text-ink-600">This case is closed.</p>
          ) : (
            <form
              className="flex items-end gap-2 border-t border-line p-3"
              onSubmit={(e) => {
                e.preventDefault()
                void submit()
              }}
            >
              <label htmlFor="doctor-reply" className="sr-only">
                Reply
              </label>
              <textarea
                id="doctor-reply"
                rows={1}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    void submit()
                  }
                }}
                placeholder="Type a reply…"
                className="max-h-32 min-h-12 flex-1 resize-none rounded-[24px] border border-line bg-cream px-4 py-3 text-[16px] focus:border-brand-500 focus:bg-white focus:outline-none"
              />
              {text.trim() ? (
                <button type="submit" aria-label="Send reply" className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-700 text-white">
                  <SendHorizontal className="size-5" aria-hidden />
                </button>
              ) : (
                <HoldToRecord size="md" label="Hold to record a voice reply" onRecorded={(r) => void postVoice(r)} />
              )}
            </form>
          )}
        </section>

        <section className={cn(tab !== "actions" && "hidden lg:block")} aria-label="Actions">
          <ActionsPanel data={data} onMessage={postText} />
        </section>
      </div>
    </div>
  )
}
