import { useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { motion, useReducedMotion } from "motion/react"
import {
  ArrowLeft,
  ChevronRight,
  EyeOff,
  Lock,
  MessageCircle,
  Phone,
  Send,
  Smartphone,
  Timer,
  Type,
  type LucideIcon,
} from "lucide-react"
import {
  anonymousApi,
  forgetAnonymousSession,
  readAnonymousSession,
  storeAnonymousSession,
  type AnonymousSession,
} from "@/api/anonymous"
import type { Consultation, ConsultationStatus } from "@/api/types"
import { env } from "@/config/env"
import { AppPage, Panel } from "@/design/components/AppPage"
import { Button, ButtonA } from "@/design/components/Button"
import { ChatBubble } from "@/design/components/ChatBubble"
import { Field, Input, Textarea } from "@/design/components/Field"
import { ConfirmAction, Feedback } from "@/design/components/Feedback"
import { PulseDot, Skeleton, StepTrack } from "@/design/components/Lively"
import { DraftNote, ServiceError, useServiceDraft } from "@/design/components/ServicePage"
import { EmptyState } from "@/design/components/primitives"
import { formatDateTime, formatXaf, timeAgo } from "@/lib/format"
import { rules } from "@/lib/form"
import { useNow, useOnline, useVisible } from "@/lib/hooks"
import { plural } from "@/lib/labels"
import { useAnonymousOutbox } from "./useAnonymousOutbox"

/*
 * Ask anonymously, from the "anonymous chat app" study (Whisper, Hey Anonymous, Telegram
 * secret chats and ~10 Dribbble concepts): say plainly what stays private and for how long,
 * then get out of the way. Rebuilt on AppPage (QA P5): the fee is shown before anything is
 * created, and the buttons stay enabled and explain themselves.
 */

const FEE = formatXaf(env.consultationFeeXaf)
const DAY = 86_400_000

const STATUS: Record<ConsultationStatus, { label: string; at: number; live: boolean }> = {
  pending_payment: { label: "Waiting for payment", at: 0, live: false },
  paid: { label: "Paid · waiting for a doctor", at: 1, live: true },
  open: { label: "With a doctor", at: 2, live: true },
  closed: { label: "Closed", at: 3, live: false },
}
const STEPS = ["Paid", "Doctor", "Replied", "Closed"]

const PRIVATE: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: EyeOff, title: "No name, no account", text: "The doctor sees your question, not who you are." },
  { icon: Timer, title: "Kept for 7 days", text: "Your questions stay on this phone for 7 days, then the session ends." },
  { icon: Type, title: "Text only", text: "Voice notes and household members need an account." },
  { icon: Smartphone, title: "Mobile Money can see your number", text: "The payment provider may know who paid. The doctor doesn't." },
]

function SessionCard({ session, onForget }: { session: AnonymousSession; onForget: () => void }) {
  const now = useNow()
  const [confirm, setConfirm] = useState(false)
  const left = Math.max(0, session.expires_at * 1000 - now)
  const days = Math.ceil(left / DAY)
  return (
    <section className="rounded-xl bg-brand-900 p-5 text-white lg:p-6">
      <p className="flex items-center gap-2 eyebrow text-mint-200">
        <PulseDot tone="light" live={left > 0} /> Private session
      </p>
      <p className="mt-2 font-display text-[26px] leading-tight font-[460]">
        {left > 0 ? (left < DAY ? "Ends today" : `${plural(days, "day")} left`) : "Ended"}
      </p>
      <p className="mt-1 text-body-m text-white/70">Until {formatDateTime(session.expires_at * 1000)}, on this phone only.</p>
      {confirm ? (
        <div className="mt-4 text-ink-900">
          <ConfirmAction
            title="Forget this session?"
            confirmLabel="Forget session"
            onCancel={() => setConfirm(false)}
            onConfirm={onForget}
          >
            You won&apos;t be able to reopen these questions on this phone, and unsent messages are lost. The doctor&apos;s copy isn&apos;t deleted.
          </ConfirmAction>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirm(true)}
          className="mt-4 inline-flex h-10 items-center rounded-full px-4 text-label-l text-white ring-1 ring-white/40 ring-inset hover:bg-white/10"
        >
          Forget on this phone
        </button>
      )}
    </section>
  )
}

function EmergencyNote() {
  return (
    <div className="rounded-xl bg-urgent-red-50 p-5">
      <p className="text-body-m text-ink-900">
        <span className="font-semibold text-urgent-red">Not for emergencies.</span> Can&apos;t breathe, won&apos;t wake or bleeding heavily? Call
        now.
      </p>
      <a
        href="tel:15"
        className="mt-3 inline-flex h-10 items-center gap-2 rounded-full bg-urgent-red px-4 text-label-l text-white hover:brightness-110"
      >
        <Phone className="size-4" aria-hidden /> Call 15
      </a>
    </div>
  )
}

// ---------- Before a session exists ----------

function Rings() {
  const reduce = useReducedMotion()
  return (
    <div className="relative mx-auto flex size-40 items-center justify-center" aria-hidden>
      {[0, 1, 2].map((i) =>
        reduce ? (
          <span key={i} className="absolute rounded-full border border-brand-600/20" style={{ inset: `${i * 18}px` }} />
        ) : (
          <motion.span
            key={i}
            className="absolute inset-0 rounded-full border border-brand-600/30"
            initial={{ scale: 0.45, opacity: 0 }}
            animate={{ scale: [0.45, 1], opacity: [0.7, 0] }}
            transition={{ duration: 3, repeat: Infinity, delay: i, ease: "easeOut" }}
          />
        ),
      )}
      <span className="relative flex size-20 items-center justify-center rounded-full bg-brand-700 text-white shadow-[var(--shadow-elev-2)]">
        <Lock className="size-8" aria-hidden />
      </span>
    </div>
  )
}

function StartSession({ onStarted }: { onStarted: (s: AnonymousSession) => void }) {
  const online = useOnline()
  const [tried, setTried] = useState(false)
  const start = useMutation({ mutationFn: anonymousApi.start, onSuccess: onStarted })
  return (
    <Panel>
      <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_200px] md:items-center">
        <div className="flex flex-col gap-5">
          <ol className="flex flex-col gap-4">
            {[
              { title: "Start a private session", text: "No sign-in. A key is kept in this browser for 7 days." },
              { title: "Write your question", text: "Say what's worrying you. Leave out names, addresses and numbers." },
              { title: `Pay ${FEE} and wait for the reply`, text: "Pay with Mobile Money. A doctor replies here; come back to read it." },
            ].map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-mint text-label-l text-brand-900 tabular">{i + 1}</span>
                <span>
                  <span className="block text-title-m">{s.title}</span>
                  <span className="block text-body-m text-ink-600">{s.text}</span>
                </span>
              </li>
            ))}
          </ol>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              size="lg"
              icon={Lock}
              loading={start.isPending}
              onClick={() => {
                setTried(true)
                if (online && !start.isPending) start.mutate()
              }}
            >
              Start private session
            </Button>
            <p className="text-body-m text-ink-600">Free to start. You pay only when you send a question.</p>
          </div>
          {tried && !online && <Feedback error>You&apos;re offline. Connect to the internet to start a session.</Feedback>}
          <ServiceError error={start.error} />
        </div>
        <Rings />
      </div>
    </Panel>
  )
}

// ---------- Session: ask + list ----------

function AskForm({ token }: { token: string }) {
  const online = useOnline()
  const navigate = useNavigate()
  const draft = useServiceDraft(`anonymous:${token}:complaint`, { complaint: "" })
  const [submitted, setSubmitted] = useState(false)
  const text = draft.value.complaint
  const error =
    rules.required("Write your question first.")(text) ??
    rules.minLength(15, "Add a little more detail: what, since when, and how old the person is.")(text)
  const create = useMutation({
    mutationFn: () => anonymousApi.create(token, text.trim()),
    onSuccess: (c) => {
      draft.reset()
      navigate(`/ask/${c.consultation_id}`)
    },
  })
  return (
    <Panel title="Your question">
      <form
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          setSubmitted(true)
          if (error) {
            document.querySelector<HTMLElement>("[data-anon-question]")?.focus()
            return
          }
          if (online && !create.isPending) create.mutate()
        }}
      >
        <Field
          label="What would you like to ask?"
          hint="For example: “My period is two weeks late and I've had a stomach ache for three days. I'm 19.”"
          error={submitted ? error : undefined}
          required
          count={text.length}
          max={2000}
        >
          {(fid) => (
            <Textarea
              id={fid}
              data-anon-question
              value={text}
              onChange={(e) => draft.setValue({ complaint: e.target.value })}
              maxLength={2000}
              rows={6}
            />
          )}
        </Field>
        <p className="flex items-start gap-2 rounded-lg bg-cream p-3 text-body-m text-ink-600">
          <EyeOff className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden />
          Leave out names, addresses and phone numbers. The doctor doesn&apos;t need them to help.
        </p>
        <div className="flex flex-col gap-3 rounded-xl bg-cream p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-body-m text-ink-600">
            Next: pay <span className="font-semibold text-ink-900">{FEE}</span> with Mobile Money.
          </p>
          <Button type="submit" icon={Send} loading={create.isPending} className="shrink-0">
            Send question
          </Button>
        </div>
        {submitted && !online && <Feedback>You&apos;re offline. Your question is kept here; send it when you&apos;re back online.</Feedback>}
        <DraftNote saved={draft.saved} />
        <ServiceError error={create.error} />
      </form>
    </Panel>
  )
}

function QuestionList({ token }: { token: string }) {
  const online = useOnline()
  const visible = useVisible()
  const now = useNow()
  const list = useQuery({
    queryKey: ["anonymous-list", token],
    queryFn: () => anonymousApi.list(token),
    refetchInterval: online && visible ? 20_000 : false,
  })
  const items = [...(list.data?.consultations ?? [])].sort((a, b) => b.updated_at - a.updated_at)
  return (
    <Panel title="Your questions">
      <ServiceError error={list.error} />
      {list.isPending ? (
        <div className="flex flex-col gap-2" role="status" aria-label="Loading">
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
        </div>
      ) : !items.length ? (
        <p className="text-body-m text-ink-600">Nothing yet. Questions you send in this session appear here.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((c) => {
            const s = STATUS[c.status]
            return (
              <li key={c.consultation_id}>
                <Link
                  to={`/ask/${c.consultation_id}`}
                  className="group flex items-center gap-3 rounded-lg bg-cream p-3 transition-colors hover:bg-mint"
                >
                  <PulseDot tone={c.status === "pending_payment" ? "muted" : "green"} live={s.live} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-label-l">{c.complaint}</span>
                    <span className="block text-label-m font-normal text-ink-600">
                      {s.label} · {timeAgo(c.updated_at, now)}
                    </span>
                  </span>
                  <ChevronRight className="size-4 text-ink-400 group-hover:text-brand-700" aria-hidden />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      {list.isError && (
        <Button variant="tonal" size="sm" className="mt-3" onClick={() => void list.refetch()}>
          Try again
        </Button>
      )}
    </Panel>
  )
}

// ---------- One question ----------

function PayCard({ token, id, onCheck }: { token: string; id: string; onCheck: () => void }) {
  const online = useOnline()
  const [phone, setPhone] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const phoneError = rules.phone()(phone)
  const pay = useMutation({ mutationFn: () => anonymousApi.pay(token, id, phone.trim()) })
  const url = pay.data?.payment_url
  const safe = url && (/^https:\/\//.test(url) || url.startsWith(window.location.origin + "/")) ? url : null

  if (pay.data)
    return (
      <Panel>
        <div className="flex flex-col items-start gap-4" aria-live="polite">
          <p className="flex items-center gap-2 text-title-l">
            <PulseDot tone="brand" /> Waiting for your payment
          </p>
          <p className="text-body-l text-ink-600">
            {env.useMockApi
              ? "Demo: the payment confirms by itself in a few seconds. No money is charged."
              : "Approve the prompt on your phone, or open the payment page. This page updates once it's confirmed."}
          </p>
          <div className="flex flex-wrap gap-3">
            {safe && (
              <ButtonA href={safe} icon={Smartphone}>
                Open payment page
              </ButtonA>
            )}
            <Button variant="secondary" onClick={onCheck}>
              Check again
            </Button>
            <Button variant="ghost" onClick={() => pay.reset()}>
              Use another number
            </Button>
          </div>
        </div>
      </Panel>
    )

  return (
    <Panel>
      <form
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          setSubmitted(true)
          if (phoneError || !online || pay.isPending) return
          pay.mutate()
        }}
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Last step</p>
            <p className="mt-1 text-headline-s">Pay to send your question</p>
          </div>
          <p className="font-display text-[30px] leading-none font-[460] whitespace-nowrap tabular">{FEE}</p>
        </div>
        <Field
          label="Mobile Money number"
          hint="Optional. Leave it empty to enter it on the payment page. The payment provider sees this number; the doctor doesn't."
          error={submitted ? phoneError : undefined}
        >
          {(fid) => (
            <Input id={fid} type="tel" inputMode="tel" autoComplete="off" placeholder="677 000 000" value={phone} onChange={(e) => setPhone(e.target.value)} />
          )}
        </Field>
        <Button type="submit" icon={Smartphone} loading={pay.isPending} className="self-start">
          Pay {FEE}
        </Button>
        {submitted && !online && <Feedback>You&apos;re offline. Connect to pay.</Feedback>}
        <ServiceError error={pay.error} />
      </form>
    </Panel>
  )
}

function Conversation({ session, id }: { session: AnonymousSession; id: string }) {
  const token = session.session_token
  const online = useOnline()
  const visible = useVisible()
  const query = useQuery({
    queryKey: ["anonymous-case", token, id],
    queryFn: () => anonymousApi.get(token, id),
    refetchInterval: online && visible ? 20_000 : false,
  })
  const queue = useAnonymousOutbox(token, session.expires_at)
  const [text, setText] = useState("")
  const [localError, setLocalError] = useState<string | null>(null)
  const c: Consultation | undefined = query.data?.consultation
  // Keep the "Your questions" list in step with what this page has just learned.
  const qc = useQueryClient()
  const status = c?.status
  useEffect(() => {
    if (status) void qc.invalidateQueries({ queryKey: ["anonymous-list", token] })
  }, [status, qc, token])
  const messages = query.data?.messages ?? []
  const pending = queue.items.filter((m) => m.consultation_id === id)
  const fromDoctor = messages.some((m) => m.sender_role !== "patient")

  if (query.isPending)
    return (
      <div className="flex flex-col gap-3" role="status" aria-label="Loading">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  if (!c)
    return (
      <>
        <ServiceError error={query.error} />
        <Button variant="tonal" className="self-start" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </>
    )

  const s = STATUS[c.status]
  const at = c.status === "open" && fromDoctor ? 3 : s.at
  return (
    <>
      <Panel>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-label-l">
              <PulseDot tone={c.status === "pending_payment" ? "muted" : "green"} live={s.live} />
              {c.status === "open" && fromDoctor ? "The doctor replied" : s.label}
            </p>
            <p className="text-label-m text-ink-600">
              {query.dataUpdatedAt ? `Updated ${formatDateTime(query.dataUpdatedAt)}` : ""}
            </p>
          </div>
          {c.status !== "pending_payment" && <StepTrack steps={STEPS} at={at} label="Progress of your question" />}
        </div>
      </Panel>

      {c.status === "pending_payment" && <PayCard token={token} id={id} onCheck={() => void query.refetch()} />}

      <Panel title="Conversation">
        <ul className="flex flex-col gap-3">
          <li className="mx-auto mb-1 text-label-m text-ink-600">{formatDateTime(c.created_at)}</li>
          <ChatBubble
            item={{ key: "question", mine: true, content_type: "text", text_body: c.complaint, duration_seconds: null, created_at: c.created_at }}
          />
          {messages.map((m) => (
            <ChatBubble
              key={m.message_id}
              item={{
                key: m.message_id,
                mine: m.sender_role === "patient",
                content_type: m.content_type,
                text_body: m.text_body,
                duration_seconds: m.duration_seconds,
                created_at: m.created_at,
              }}
            />
          ))}
          {pending.map((m) => (
            <li key={m.client_message_id} className="flex justify-end">
              <div className="max-w-[85%] rounded-lg rounded-br-sm bg-brand-700/80 px-4 py-2.5 text-white sm:max-w-[70%]">
                <p className="text-body-l whitespace-pre-wrap">{m.text_body}</p>
                <p className="mt-1 text-label-m text-white/80">{m.blocked ? "Couldn't send · needs attention" : "Saved · sends when online"}</p>
              </div>
            </li>
          ))}
          {c.status !== "pending_payment" && c.status !== "closed" && !fromDoctor && (
            <li className="flex items-center gap-2 text-body-m text-ink-600">
              <PulseDot tone="muted" /> Waiting for a doctor. Urgent questions are answered first.
            </li>
          )}
        </ul>

        {c.status === "closed" ? (
          <p className="mt-5 rounded-lg bg-cream p-3 text-body-m text-ink-600">The doctor closed this question. Ask a new one if you need to.</p>
        ) : c.status === "pending_payment" ? (
          <p className="mt-5 rounded-lg bg-cream p-3 text-body-m text-ink-600">You can add messages once the payment is confirmed.</p>
        ) : (
          <form
            className="mt-5 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault()
              if (!text.trim()) {
                setLocalError("Write a message first.")
                return
              }
              try {
                queue.enqueue(id, text.trim())
                setText("")
                setLocalError(null)
              } catch {
                setLocalError("Couldn't save this message on the phone. Keep your text and try again.")
              }
            }}
          >
            <label className="min-w-0 flex-1">
              <span className="sr-only">Message the doctor</span>
              <Textarea
                rows={2}
                maxLength={4000}
                value={text}
                placeholder="Add a message"
                onChange={(e) => {
                  setText(e.target.value)
                  if (localError) setLocalError(null)
                }}
              />
            </label>
            <Button type="submit" icon={Send} className="shrink-0">
              {online ? "Send" : "Save to send"}
            </Button>
          </form>
        )}
        {localError && <p role="alert" className="mt-2 text-label-m text-urgent-red">{localError}</p>}
        {queue.error && <Feedback error>{queue.error} Unsent text stays on this phone.</Feedback>}
      </Panel>
    </>
  )
}

export default function AnonymousAsk() {
  const { id } = useParams()
  const navigate = useNavigate()
  const now = useNow()
  const [session, setSession] = useState(readAnonymousSession)
  const expired = session ? now >= session.expires_at * 1000 : false

  const forget = () => {
    forgetAnonymousSession()
    setSession(null)
    navigate("/ask", { replace: true })
  }

  const privacy = (
    <Panel title="What stays private">
      <ul className="flex flex-col gap-4">
        {PRIVATE.map((p) => (
          <li key={p.title} className="flex gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-mint text-brand-700">
              <p.icon className="size-5" aria-hidden />
            </span>
            <span>
              <span className="block text-label-l">{p.title}</span>
              <span className="block text-body-m text-ink-600">{p.text}</span>
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  )

  const aside = (
    <>
      {session && <SessionCard session={session} onForget={forget} />}
      {session && !expired && id && <QuestionList token={session.session_token} />}
      {!session || !id ? privacy : null}
      <EmergencyNote />
    </>
  )

  return (
    <div className="container-page pt-4 pb-14 lg:pt-8 lg:pb-20 short:pt-4">
      <AppPage
        eyebrow="Ask anonymously"
        title={id ? "Your question" : "Ask a doctor, privately."}
        subtitle={
          id
            ? undefined
            : `No account and no name. Write your question, pay ${FEE} with Mobile Money, and read the doctor's reply here.`
        }
        back={
          id ? (
            <Link to="/ask" className="inline-flex h-10 items-center gap-1.5 rounded-full pr-3 text-label-l text-brand-700 hover:bg-mint">
              <ArrowLeft className="size-4" aria-hidden /> All questions
            </Link>
          ) : undefined
        }
        aside={aside}
      >
        {!session ? (
          <StartSession
            onStarted={(s) => {
              storeAnonymousSession(s)
              setSession(s)
              navigate("/ask", { replace: true })
            }}
          />
        ) : expired ? (
          <EmptyState
            icon={Timer}
            title="This session has ended."
            action={
              <Button variant="tonal" onClick={forget}>
                Start a new session
              </Button>
            }
          />
        ) : id ? (
          <Conversation key={id} session={session} id={id} />
        ) : (
          <>
            <AskForm token={session.session_token} />
            <QuestionList token={session.session_token} />
          </>
        )}
        {!session && (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-m text-ink-600">
            <MessageCircle className="size-4 text-brand-600" aria-hidden />
            Want voice notes or to ask for a family member?{" "}
            <Link to="/sign-in?returnTo=/app/consult/new" className="font-semibold text-brand-700 hover:underline">
              Sign in instead
            </Link>
          </p>
        )}
      </AppPage>
    </div>
  )
}
