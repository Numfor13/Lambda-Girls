import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { useLiveQuery } from "dexie-react-hooks"
import { useQuery } from "@tanstack/react-query"
import { AnimatePresence, motion } from "motion/react"
import {
  Check,
  Clock,
  ArrowLeft,
  Phone,
  CreditCard,
  FileCheck2,
  MessagesSquare,
  Pill,
  SendHorizontal,
  Stethoscope,
} from "lucide-react"
import { consultApi } from "@/api/endpoints"
import { friendlyError } from "@/api/errors"
import { flags } from "@/config/flags"
import { ButtonA, ButtonLink, IconRouterLink } from "@/design/components/Button"
import { SPRING } from "@/design/motion"
import { ChatBubble, type ChatItem } from "@/design/components/ChatBubble"
import { HoldToRecord } from "@/design/components/HoldToRecord"
import { EmptyState, Notice, PageSpinner } from "@/design/components/primitives"
import { SyncChip } from "@/design/components/SyncChip"
import { UrgencyBadge } from "@/design/components/UrgencyBadge"
import { useVisible } from "@/lib/hooks"
import { cn } from "@/lib/utils"
import { db } from "@/offline/db"
import {
  extractCodes,
  findLocalConsultation,
  sendText,
  sendVoice,
  STATUS_LABEL,
} from "./actions"

function CodeCard({ kind, code }: { kind: "rx" | "ref"; code: string }) {
  const Icon = kind === "rx" ? Pill : FileCheck2
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={SPRING.bouncy}
      className="flex items-center gap-4 shape-bl border-[1.5px] border-brand-700 bg-mint p-4"
    >
      <Icon className="size-8 shrink-0 text-brand-700" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-label-m font-bold tracking-wide text-brand-700 uppercase">
          {kind === "rx" ? "Prescription" : "Referral"}
        </p>
        <p className="text-headline-m font-mono tracking-[0.15em]">{code}</p>
        <p className="text-body-m text-ink-600">
          {kind === "rx"
            ? "Show this at the pharmacy."
            : "Show this at the facility you were referred to."}
        </p>
      </div>
      <Link
        to={`/${kind}/${code}`}
        className="shrink-0 text-body-m font-semibold text-brand-700"
      >
        Details
      </Link>
    </motion.div>
  )
}

export default function ConsultChat() {
  const { id = "" } = useParams()
  const visible = useVisible()
  const local = useLiveQuery(
    async () => (await findLocalConsultation(id)) ?? null,
    [id]
  )
  const serverId =
    local === undefined ? undefined : local ? local.consultation_id : id

  const query = useQuery({
    queryKey: ["consultation", serverId],
    queryFn: () => consultApi.get(serverId!),
    enabled: Boolean(serverId),
    refetchInterval: visible ? 15_000 : false,
  })

  const refs = useMemo(
    () =>
      [id, local?.local_id, serverId].filter((x): x is string => Boolean(x)),
    [id, local, serverId]
  )
  const localMessages = useLiveQuery(
    () => db.messages.where("consultation_ref").anyOf(refs).toArray(),
    [refs.join("|")]
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
      const hasLocalVoice = localMessages?.some(
        (l) => l.client_message_id === m.client_message_id
      )
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
              : {
                  kind: "remote",
                  consultationId: m.consultation_id,
                  messageId: m.message_id,
                }
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
        voice:
          l.content_type === "voice_note"
            ? { kind: "local", clientMessageId: l.client_message_id }
            : undefined,
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

  if (local === undefined || (serverId && query.isPending && !local))
    return <PageSpinner />
  if (!local && query.isError) {
    return (
      <EmptyState
        icon={MessagesSquare}
        title={friendlyError(query.error)}
        action={
          <ButtonLink to="/app/consults" size="sm">
            My consultations
          </ButtonLink>
        }
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

  const MAX = 4000
  const near = text.length > MAX - 400

  return (
    // Mobile: one column (header, case panel, thread, composer). Desktop: thread | sticky case panel.
    <div className="flex min-h-[calc(100svh-12rem)] flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] lg:items-start lg:gap-7">
      <div className="contents lg:flex lg:min-h-[calc(100svh-6rem)] lg:flex-col">
        <header className="sticky top-[84px] z-10 order-1 rounded-full py-1.5 pr-3 pl-1.5 glass-strong lg:top-4">
          <div className="flex items-center gap-3">
            <IconRouterLink
              to="/app/consults"
              icon={ArrowLeft}
              label="Back to consultations"
              variant="plain"
            />
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-mint">
              <Stethoscope className="size-5 text-brand-700" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-title-m">
                {consultation?.doctor_id
                  ? "Your doctor"
                  : "Doctor consultation"}
              </p>
              <p className="flex items-center gap-1.5 text-label-m text-ink-600">
                <motion.span
                  animate={closed ? { scale: 1 } : { scale: [1, 1.4, 1] }}
                  transition={{
                    duration: status === "open" ? 1.6 : 2.4,
                    repeat: closed ? 0 : Infinity,
                  }}
                  className={cn(
                    "size-2 rounded-full",
                    status === "open"
                      ? "bg-brand-500"
                      : closed
                        ? "bg-ink-400"
                        : "bg-brand-500/45"
                  )}
                />
                {STATUS_LABEL[status]}
                {local?.subject_label &&
                  local.subject_label !== "You" &&
                  ` · for ${local.subject_label}`}
              </p>
            </div>
            {urgency && <UrgencyBadge urgency={urgency} size="sm" />}
          </div>
        </header>

        <ol
          className="order-3 flex flex-1 flex-col gap-2 py-4"
          aria-label="Messages"
          aria-live="polite"
        >
          {items.length === 0 && (
            <li className="mx-auto my-8 max-w-sm text-center text-body-m text-ink-600">
              {status === "pending_payment"
                ? "Messages open once the fee is paid. You can still add details now."
                : "No messages yet. Add anything that helps the doctor: when it started, medicines taken, temperature."}
            </li>
          )}
          {items.map((item) => (
            <ChatBubble key={item.key} item={item} />
          ))}
        </ol>
        <div ref={bottom} className="order-3" />

        {closed ? (
          <p className="order-4 rounded-full px-4 py-4 text-center text-body-m text-ink-600 glass">
            This consultation is closed.
          </p>
        ) : (
          <form
            className="sticky bottom-[104px] z-10 order-4 flex flex-col gap-1 rounded-xl p-2 glass-strong lg:bottom-4"
            onSubmit={(e) => {
              e.preventDefault()
              void submitText()
            }}
          >
            <div className="flex items-end gap-2">
              <label className="sr-only" htmlFor="composer">
                Type a message
              </label>
              <textarea
                id="composer"
                rows={1}
                value={text}
                maxLength={MAX}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    void submitText()
                  }
                }}
                placeholder="Type a message…"
                aria-describedby="composer-hint"
                className="field-sizing-content max-h-40 min-h-12 flex-1 resize-none rounded-lg border-[1.5px] border-transparent bg-white/90 px-4 py-3 text-body-l transition-colors focus:border-brand-500 focus:outline-none"
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
                  <motion.div
                    key="mic"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    transition={SPRING.bouncy}
                  >
                    <HoldToRecord
                      size="md"
                      label="Hold to record a voice note"
                      onRecorded={(r) => void sendVoice(ref, r)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <p
              id="composer-hint"
              className={cn(
                "flex justify-between gap-3 px-3 text-label-m text-ink-600",
                !near && "max-lg:sr-only"
              )}
            >
              <span className="max-lg:hidden">
                Enter to send · Shift + Enter for a new line
              </span>
              {near && (
                <span
                  className={cn(
                    "tabular-nums",
                    text.length >= MAX && "text-urgent-red"
                  )}
                >
                  {text.length}/{MAX}
                </span>
              )}
            </p>
          </form>
        )}
      </div>

      <aside className="order-2 flex flex-col gap-3 pt-4 lg:sticky lg:top-4 lg:pt-0">
        {local && !local.consultation_id && (
          <Notice
            tone="info"
            className="flex items-center justify-between gap-3"
          >
            <span>
              Not sent yet — this conversation will reach CareBridge when you're
              online.
            </span>
            <SyncChip state={local.sync_state} refId={local.local_id} />
          </Notice>
        )}
        {status === "pending_payment" && serverId && (
          <div className="flex flex-col gap-3 rounded-xl bg-white p-4 shadow-[var(--shadow-elev-1)] sm:flex-row sm:items-center lg:flex-col lg:items-stretch">
            <CreditCard
              className="size-6 shrink-0 text-brand-700"
              aria-hidden
            />
            <p className="flex-1 text-body-l">
              Pay the consultation fee so a doctor can see your case.
            </p>
            <ButtonLink
              to={`/app/consult/${ref}/pay`}
              size="sm"
              trailing="arrow"
            >
              Pay now
            </ButtonLink>
          </div>
        )}
        {status === "paid" && (
          <div className="flex items-center gap-3 shape-bl bg-mint p-4">
            <StatusMarkMini />
            <p className="text-body-m text-brand-900">
              <strong className="text-title-m">You're in the queue.</strong> A
              doctor will reply soon — urgent cases are seen first.
            </p>
          </div>
        )}
        {flags.prescriptions &&
          codes.rx.map((c) => <CodeCard key={c} kind="rx" code={c} />)}
        {flags.referrals &&
          codes.ref.map((c) => <CodeCard key={c} kind="ref" code={c} />)}

        <section className="rounded-xl bg-white p-4 shadow-[var(--shadow-elev-1)] lg:p-5">
          {complaint && (
            <p className="text-body-m text-ink-600">
              <span className="font-semibold text-ink-900">Your request: </span>
              {complaint}
            </p>
          )}
          <ProgressSteps
            className="mt-4 max-lg:hidden"
            sent={Boolean(serverId)}
            status={status}
          />
        </section>

        <div className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-[var(--shadow-elev-1)] max-lg:hidden">
          <p className="flex-1 text-body-m text-ink-900">
            Getting worse, or a danger sign? Don't wait for a reply.
          </p>
          <ButtonA href="tel:15" icon={Phone} variant="danger" size="sm">
            Call 15
          </ButtonA>
        </div>
      </aside>
    </div>
  )
}

const STEPS: { key: string; label: string }[] = [
  { key: "sent", label: "Request sent" },
  { key: "paid", label: "Fee paid" },
  { key: "open", label: "With a doctor" },
  { key: "closed", label: "Closed" },
]

/** M3 vertical stepper for a consultation's progress (desktop case panel). */
function ProgressSteps({
  sent,
  status,
  className,
}: {
  sent: boolean
  status: string
  className?: string
}) {
  const reached = !sent
    ? 0
    : status === "pending_payment"
      ? 1
      : status === "paid"
        ? 2
        : status === "open"
          ? 3
          : 4
  return (
    <ol className={cn("flex flex-col", className)} aria-label="Progress">
      {STEPS.map((step, i) => {
        const done = i < reached
        const current = i === reached
        return (
          <li key={step.key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <motion.span
                initial={false}
                animate={{ scale: current ? [1, 1.15, 1] : 1 }}
                transition={{ duration: 1.8, repeat: current ? Infinity : 0 }}
                className={cn(
                  "flex size-6 items-center justify-center rounded-full",
                  done
                    ? "bg-brand-700 text-white"
                    : current
                      ? "bg-mint ring-2 ring-brand-500"
                      : "bg-cream"
                )}
              >
                {done && <Check className="size-3.5" aria-hidden />}
              </motion.span>
              {i < STEPS.length - 1 && (
                <span
                  className={cn(
                    "my-1 w-0.5 flex-1 rounded-full",
                    done ? "bg-brand-700" : "bg-line"
                  )}
                />
              )}
            </div>
            <p
              className={cn(
                "pb-4 text-label-l",
                done || current ? "text-ink-900" : "text-ink-400"
              )}
            >
              {step.label}
              <span className="sr-only">
                {done ? " (done)" : current ? " (current)" : ""}
              </span>
            </p>
          </li>
        )
      })}
    </ol>
  )
}

/** Small morphing "waiting" shape, the same M3 loading language as StatusMark at chip size. */
function StatusMarkMini() {
  return (
    <motion.span
      className="flex size-10 shrink-0 items-center justify-center bg-white"
      animate={{
        rotate: [0, 180, 360],
        borderRadius: ["40% 60% 40% 60%", "50%", "40% 60% 40% 60%"],
      }}
      transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
      aria-hidden
    >
      <Clock className="size-5 text-brand-700" />
    </motion.span>
  )
}
