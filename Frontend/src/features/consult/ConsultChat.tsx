import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { useLiveQuery } from "dexie-react-hooks"
import { useQuery } from "@tanstack/react-query"
import { ChevronLeft, CreditCard, FileCheck2, MessagesSquare, Pill, SendHorizontal, Stethoscope } from "lucide-react"
import { consultApi } from "@/api/endpoints"
import { friendlyError } from "@/api/errors"
import { flags } from "@/config/flags"
import { ButtonLink } from "@/design/components/Button"
import { ChatBubble, type ChatItem } from "@/design/components/ChatBubble"
import { HoldToRecord } from "@/design/components/HoldToRecord"
import { EmptyState, Notice, PageSpinner } from "@/design/components/primitives"
import { SyncChip } from "@/design/components/SyncChip"
import { UrgencyBadge } from "@/design/components/UrgencyBadge"
import { useVisible } from "@/lib/hooks"
import { cn } from "@/lib/utils"
import { db } from "@/offline/db"
import { extractCodes, findLocalConsultation, sendText, sendVoice, STATUS_LABEL } from "./actions"

function CodeCard({ kind, code }: { kind: "rx" | "ref"; code: string }) {
  const Icon = kind === "rx" ? Pill : FileCheck2
  return (
    <div className="flex items-center gap-4 rounded-[16px] border-[1.5px] border-brand-700 bg-mint p-4">
      <Icon className="size-8 shrink-0 text-brand-700" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold tracking-wide text-brand-700 uppercase">
          {kind === "rx" ? "Prescription" : "Referral"}
        </p>
        <p className="font-mono text-[24px] font-bold tracking-[0.15em]">{code}</p>
        <p className="text-sm text-ink-600">
          {kind === "rx" ? "Show this at the pharmacy." : "Show this at the facility you were referred to."}
        </p>
      </div>
      <Link to={`/${kind}/${code}`} className="shrink-0 text-sm font-semibold text-brand-700">
        Details
      </Link>
    </div>
  )
}

export default function ConsultChat() {
  const { id = "" } = useParams()
  const visible = useVisible()
  const local = useLiveQuery(async () => (await findLocalConsultation(id)) ?? null, [id])
  const serverId = local === undefined ? undefined : local ? local.consultation_id : id

  const query = useQuery({
    queryKey: ["consultation", serverId],
    queryFn: () => consultApi.get(serverId!),
    enabled: Boolean(serverId),
    refetchInterval: visible ? 15_000 : false,
  })

  const refs = useMemo(
    () => [id, local?.local_id, serverId].filter((x): x is string => Boolean(x)),
    [id, local, serverId],
  )
  const localMessages = useLiveQuery(
    () => db.messages.where("consultation_ref").anyOf(refs).toArray(),
    [refs.join("|")],
  )

  const [text, setText] = useState("")
  const bottom = useRef<HTMLDivElement>(null)

  const consultation = query.data?.consultation
  const status = consultation?.status ?? local?.status ?? "pending_payment"
  const urgency = consultation?.urgency ?? local?.urgency ?? null
  const complaint = consultation?.complaint ?? local?.complaint

  const items: ChatItem[] = useMemo(() => {
    const server = query.data?.messages ?? []
    const byClientId = new Map(server.map((m) => [m.client_message_id, m]))
    const out: ChatItem[] = server.map((m) => {
      const mine = m.sender_role === "patient"
      const hasLocalVoice = localMessages?.some((l) => l.client_message_id === m.client_message_id)
      return {
        key: m.client_message_id,
        mine,
        content_type: m.content_type,
        text_body: m.text_body,
        duration_seconds: m.duration_seconds,
        created_at: m.created_at,
        sync_state: mine ? "sent" : undefined,
        voice:
          m.content_type === "voice_note"
            ? hasLocalVoice
              ? { kind: "local", clientMessageId: m.client_message_id }
              : { kind: "remote", consultationId: m.consultation_id, messageId: m.message_id }
            : undefined,
      }
    })
    for (const l of localMessages ?? []) {
      if (byClientId.has(l.client_message_id)) continue
      out.push({
        key: l.client_message_id,
        mine: true,
        content_type: l.content_type,
        text_body: l.text_body,
        duration_seconds: l.duration_seconds,
        created_at: l.created_at,
        sync_state: l.sync_state,
        voice: l.content_type === "voice_note" ? { kind: "local", clientMessageId: l.client_message_id } : undefined,
      })
    }
    return out.sort((a, b) => a.created_at - b.created_at)
  }, [query.data, localMessages])

  const codes = useMemo(() => {
    const rx = new Set<string>()
    const ref = new Set<string>()
    for (const i of items) {
      if (i.mine) continue
      const c = extractCodes(i.text_body)
      if (c.rx) rx.add(c.rx)
      if (c.ref) ref.add(c.ref)
    }
    return { rx: [...rx], ref: [...ref] }
  }, [items])

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" })
  }, [items.length])

  if (local === undefined || (serverId && query.isPending && !local)) return <PageSpinner />
  if (!local && query.isError) {
    return (
      <EmptyState
        icon={MessagesSquare}
        title={friendlyError(query.error)}
        action={<ButtonLink to="/app/consults" size="sm">My consultations</ButtonLink>}
      />
    )
  }

  const ref = local?.local_id ?? id
  const closed = status === "closed"

  const submitText = async () => {
    const value = text.trim()
    if (!value) return
    setText("")
    await sendText(ref, value)
  }

  return (
    <div className="-mx-4 -mt-6 flex min-h-[calc(100svh-8rem)] flex-col sm:mx-0 sm:mt-0">
      <header className="sticky top-16 z-10 border-b border-line bg-white px-4 py-3 sm:rounded-t-[16px] sm:border">
        <div className="flex items-center gap-3">
          <Link to="/app/consults" aria-label="Back to consultations" className="-ml-2 flex size-11 items-center justify-center">
            <ChevronLeft className="size-6 text-brand-700" />
          </Link>
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-mint">
            <Stethoscope className="size-5 text-brand-700" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">
              {consultation?.doctor_id ? "Your doctor" : "Doctor consultation"}
            </p>
            <p className="flex items-center gap-1.5 text-xs text-ink-600">
              <span
                className={cn(
                  "size-2 rounded-full",
                  status === "open" ? "bg-brand-500" : status === "closed" ? "bg-ink-400" : "bg-urgent-amber",
                )}
              />
              {STATUS_LABEL[status]}
              {local?.subject_label && local.subject_label !== "You" && ` · for ${local.subject_label}`}
            </p>
          </div>
          {urgency && <UrgencyBadge urgency={urgency} size="sm" />}
        </div>
      </header>

      <div className="flex flex-col gap-3 px-4 pt-4">
        {local && !local.consultation_id && (
          <Notice tone="warn" className="flex items-center justify-between gap-3">
            <span>Not sent yet — this conversation will reach CareBridge when you're online.</span>
            <SyncChip state={local.sync_state} refId={local.local_id} />
          </Notice>
        )}
        {status === "pending_payment" && serverId && (
          <div className="flex flex-col gap-3 rounded-[16px] bg-cream p-4 sm:flex-row sm:items-center">
            <CreditCard className="size-6 shrink-0 text-brand-700" aria-hidden />
            <p className="flex-1 text-[15px]">Pay the consultation fee so a doctor can see your case.</p>
            <ButtonLink to={`/app/consult/${ref}/pay`} size="sm" trailing="arrow">
              Pay now
            </ButtonLink>
          </div>
        )}
        {status === "paid" && (
          <Notice tone="success">You're in the queue. A doctor will reply soon — urgent cases are seen first.</Notice>
        )}
        {flags.prescriptions && codes.rx.map((c) => <CodeCard key={c} kind="rx" code={c} />)}
        {flags.referrals && codes.ref.map((c) => <CodeCard key={c} kind="ref" code={c} />)}
        {complaint && (
          <p className="rounded-[12px] border border-line px-4 py-3 text-sm text-ink-600">
            <span className="font-semibold text-ink-900">Your request: </span>
            {complaint}
          </p>
        )}
      </div>

      <ol className="flex flex-1 flex-col gap-2 px-4 py-4" aria-label="Messages" aria-live="polite">
        {items.map((item) => (
          <ChatBubble key={item.key} item={item} />
        ))}
      </ol>
      <div ref={bottom} />

      {closed ? (
        <p className="border-t border-line bg-cream px-4 py-4 text-center text-sm text-ink-600">
          This consultation is closed.
        </p>
      ) : (
        <form
          className="sticky bottom-16 flex items-end gap-2 border-t border-line bg-white px-3 py-3 lg:bottom-0"
          onSubmit={(e) => {
            e.preventDefault()
            void submitText()
          }}
        >
          <label className="sr-only" htmlFor="composer">
            Type a message
          </label>
          <textarea
            id="composer"
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                void submitText()
              }
            }}
            placeholder="Type a message…"
            className="max-h-32 min-h-12 flex-1 resize-none rounded-[24px] border border-line bg-cream px-4 py-3 text-[16px] focus:border-brand-500 focus:bg-white focus:outline-none"
          />
          <HoldToRecord size="md" label="Hold to record a voice note" onRecorded={(r) => void sendVoice(ref, r)} />
          <button
            type="submit"
            aria-label="Send message"
            disabled={!text.trim()}
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-700 text-white disabled:opacity-40"
          >
            <SendHorizontal className="size-5" aria-hidden />
          </button>
        </form>
      )}
    </div>
  )
}
