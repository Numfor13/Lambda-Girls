import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { useLiveQuery } from "dexie-react-hooks"
import { useQuery } from "@tanstack/react-query"
import { AnimatePresence, motion } from "motion/react"
import { ArrowLeft, CreditCard, FileCheck2, MessagesSquare, Pill, SendHorizontal, Stethoscope } from "lucide-react"
import { consultApi } from "@/api/endpoints"
import { friendlyError } from "@/api/errors"
import { flags } from "@/config/flags"
import { ButtonLink, IconRouterLink } from "@/design/components/Button"
import { SPRING } from "@/design/motion"
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
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={SPRING.bouncy}
      className="flex items-center gap-4 border-[1.5px] border-brand-700 bg-mint p-4 shape-bl"
    >
      <Icon className="size-8 shrink-0 text-brand-700" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-label-m font-bold tracking-wide text-brand-700 uppercase">
          {kind === "rx" ? "Prescription" : "Referral"}
        </p>
        <p className="font-mono text-headline-m tracking-[0.15em]">{code}</p>
        <p className="text-body-m text-ink-600">
          {kind === "rx" ? "Show this at the pharmacy." : "Show this at the facility you were referred to."}
        </p>
      </div>
      <Link to={`/${kind}/${code}`} className="shrink-0 text-body-m font-semibold text-brand-700">
        Details
      </Link>
    </motion.div>
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
    <div className="flex min-h-[calc(100svh-12rem)] flex-col">
      <header className="glass-strong sticky top-[84px] z-10 rounded-full py-1.5 pr-3 pl-1.5 lg:top-4">
        <div className="flex items-center gap-3">
          <IconRouterLink to="/app/consults" icon={ArrowLeft} label="Back to consultations" variant="plain" />
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-mint">
            <Stethoscope className="size-5 text-brand-700" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-title-m">
              {consultation?.doctor_id ? "Your doctor" : "Doctor consultation"}
            </p>
            <p className="flex items-center gap-1.5 text-label-m text-ink-600">
              <motion.span
                animate={status === "open" ? { scale: [1, 1.4, 1] } : { scale: 1 }}
                transition={{ duration: 1.6, repeat: status === "open" ? Infinity : 0 }}
                className={cn(
                  "size-2 rounded-full",
                  status === "open" ? "bg-brand-500" : status === "closed" ? "bg-ink-400" : "bg-urgent-amber",
                )}
              ></motion.span>
              {STATUS_LABEL[status]}
              {local?.subject_label && local.subject_label !== "You" && ` · for ${local.subject_label}`}
            </p>
          </div>
          {urgency && <UrgencyBadge urgency={urgency} size="sm" />}
        </div>
      </header>

      <div className="flex flex-col gap-3 pt-4">
        {local && !local.consultation_id && (
          <Notice tone="warn" className="flex items-center justify-between gap-3">
            <span>Not sent yet — this conversation will reach CareBridge when you're online.</span>
            <SyncChip state={local.sync_state} refId={local.local_id} />
          </Notice>
        )}
        {status === "pending_payment" && serverId && (
          <div className="flex flex-col gap-3 rounded-xl bg-white shadow-[var(--shadow-elev-1)] p-4 sm:flex-row sm:items-center">
            <CreditCard className="size-6 shrink-0 text-brand-700" aria-hidden />
            <p className="flex-1 text-body-l">Pay the consultation fee so a doctor can see your case.</p>
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
          <p className="rounded-lg bg-white/80 px-4 py-3 text-body-m text-ink-600 shadow-[var(--shadow-elev-1)]">
            <span className="font-semibold text-ink-900">Your request: </span>
            {complaint}
          </p>
        )}
      </div>

      <ol className="flex flex-1 flex-col gap-2 py-4" aria-label="Messages" aria-live="polite">
        {items.map((item) => (
          <ChatBubble key={item.key} item={item} />
        ))}
      </ol>
      <div ref={bottom} />

      {closed ? (
        <p className="glass rounded-full px-4 py-4 text-center text-body-m text-ink-600">
          This consultation is closed.
        </p>
      ) : (
        <form
          className="glass-strong sticky bottom-[104px] z-10 flex items-end gap-2 rounded-xl p-2 lg:bottom-4"
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
            className="max-h-32 min-h-12 flex-1 resize-none rounded-lg border-[1.5px] border-transparent bg-white/90 px-4 py-3 text-body-l transition-colors focus:border-brand-500 focus:outline-none"
          />
          <AnimatePresence mode="popLayout" initial={false}>
            {text.trim() ? (
              <motion.button
                key="send"
                type="submit"
                aria-label="Send message"
                initial={{ scale: 0, rotate: -45 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0, rotate: 45 }}
                whileTap={{ scale: 0.85 }}
                transition={SPRING.bouncy}
                className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-700 text-white"
              >
                <SendHorizontal className="size-5" aria-hidden />
              </motion.button>
            ) : (
              <motion.div key="mic" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={SPRING.bouncy}>
                <HoldToRecord size="md" label="Hold to record a voice note" onRecorded={(r) => void sendVoice(ref, r)} />
              </motion.div>
            )}
          </AnimatePresence>
        </form>
      )}
    </div>
  )
}
