import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import { useLiveQuery } from "dexie-react-hooks"
import { motion } from "motion/react"
import { useMutation, useQuery } from "@tanstack/react-query"
import {
  Check,
  Clock,
  Copy,
  Share2,
  Smartphone,
  TriangleAlert,
  User,
  Users,
  WifiOff,
} from "lucide-react"
import { consultApi, paymentApi } from "@/api/endpoints"
import { friendlyError } from "@/api/errors"
import { useAuth } from "@/auth/AuthProvider"
import { env } from "@/config/env"
import { flags } from "@/config/flags"
import { Button, ButtonLink } from "@/design/components/Button"
import { ChoiceCard, Field, Input } from "@/design/components/Field"
import {
  Notice,
  PageHeader,
  PageSpinner,
  StatusMark,
} from "@/design/components/primitives"
import { SPRING, popIn, staggerOnMount } from "@/design/motion"
import { formatXaf } from "@/lib/format"
import { cn } from "@/lib/utils"
import { normalisePhone, rules } from "@/lib/form"
import { useNow, useOnline } from "@/lib/hooks"
import {
  findLocalConsultation,
  reconcileStatus,
} from "@/features/consult/actions"

const POLL_MS = 3_000
const TIMEOUT_MS = 120_000

interface Pending {
  paymentId: string
  startedAt: number
  simulated?: boolean
  amountXaf?: number
  shareUrl?: string
}

const storageKey = (ref: string) => `cb_pay_${ref}`

function readPending(ref: string): Pending | null {
  try {
    const raw = sessionStorage.getItem(storageKey(ref))
    return raw ? (JSON.parse(raw) as Pending) : null
  } catch {
    return null
  }
}

interface Summary {
  amountXaf?: number
  patient: string
  request?: string
}

function PaymentStatus({
  consultRef,
  pending,
  summary,
  onRetry,
}: {
  consultRef: string
  pending: Pending
  summary: Summary
  onRetry: () => void
}) {
  const now = useNow(1_000)
  const elapsed = Math.max(0, now - pending.startedAt)
  const timedOut = elapsed > TIMEOUT_MS
  const payment = useQuery({
    queryKey: ["payment", pending.paymentId],
    queryFn: () => paymentApi.get(pending.paymentId),
    refetchInterval: (q) =>
      q.state.data?.status === "initiated" && !timedOut ? POLL_MS : false,
  })
  const status = payment.data?.status
  const paidConsultation =
    status === "confirmed" ? payment.data?.consultation_id : undefined
  useEffect(() => {
    if (paidConsultation) void reconcileStatus(paidConsultation, "paid")
  }, [paidConsultation])
  const reference = payment.data?.fapshi_ref || pending.paymentId

  if (status === "confirmed") {
    return (
      <Outcome>
        <StatusMark state="done" icon={Check} />
        <h1 className="text-headline-l lg:text-display-m">Payment received</h1>
        <p className="max-w-sm text-body-l text-ink-600">
          You're in the queue. A doctor will reply soon.
        </p>
        <CopyRef value={reference} />
        <ButtonLink
          to={`/app/consult/${consultRef}`}
          trailing="arrow"
          size="lg"
        >
          Go to conversation
        </ButtonLink>
      </Outcome>
    )
  }

  if (status === "failed") {
    return (
      <Outcome>
        <StatusMark state="error" icon={TriangleAlert} />
        <h1 className="text-headline-l">The payment didn't go through</h1>
        <p className="max-w-sm text-body-l text-ink-600">
          No money was taken. You can try again.
        </p>
        <Button onClick={onRetry}>Try again</Button>
      </Outcome>
    )
  }

  const steps: {
    label: string
    hint?: string
    state: "done" | "current" | "next"
  }[] = [
    {
      label: pending.simulated
        ? "Demo payment created"
        : "Request sent to Mobile Money",
      state: "done",
    },
    {
      label: pending.simulated
        ? "Administrator confirms the demo"
        : timedOut
          ? "Taking longer than usual"
          : "Approve it on the paying phone",
      hint: pending.simulated
        ? "No money is charged."
        : timedOut
          ? "If the phone showed no prompt, start a new payment."
          : "Enter the Mobile Money PIN when the prompt appears.",
      state: "current",
    },
    { label: "Your case joins the doctor queue", state: "next" },
  ]

  return (
    <motion.div
      variants={staggerOnMount(0.07)}
      initial="hidden"
      animate="show"
      className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-6"
    >
      <motion.section
        variants={popIn}
        className="flex flex-col gap-6 rounded-xl bg-white p-5 shadow-[var(--shadow-elev-1)] sm:p-7"
        aria-live="polite"
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <StatusMark state={timedOut ? "info" : "waiting"} icon={Clock} />
          <div className="min-w-0">
            <p className="eyebrow">Payment</p>
            <h1 className="mt-2 text-headline-l">
              {pending.simulated
                ? "Waiting for demo confirmation"
                : timedOut
                  ? "Still waiting for confirmation"
                  : "Confirming your payment…"}
            </h1>
            <p className="mt-2 max-w-[52ch] text-body-l text-ink-600">
              {pending.simulated
                ? "This demo waits for administrator confirmation. Keep the payment ID shown below."
                : timedOut
                  ? "You can leave this page. If the money left the account, your case still reaches a doctor."
                  : "This page updates by itself. Most payments confirm in under a minute."}
            </p>
          </div>
        </div>

        {/* Elapsed time against the 2-minute window, so the wait has a visible shape. */}
        <div>
          <div className="h-1.5 overflow-hidden rounded-full bg-ink-900/10">
            <motion.div
              className="h-full rounded-full bg-brand-700"
              initial={false}
              animate={{
                width: `${Math.min(100, (elapsed / TIMEOUT_MS) * 100)}%`,
              }}
              transition={SPRING.slow}
            />
          </div>
          <p className="mt-2 flex justify-between text-label-m text-ink-600">
            <span>
              {timedOut ? "Checks paused" : "Checking every few seconds"}
            </span>
            <span className="tabular">{formatElapsed(elapsed)}</span>
          </p>
        </div>

        <ol className="flex flex-col">
          {steps.map((st, i) => (
            <li key={st.label} className="relative flex gap-3 pb-4 last:pb-0">
              {i < steps.length - 1 && (
                <span
                  className={cn(
                    "absolute top-7 bottom-1 left-[11px] w-px",
                    st.state === "done" ? "bg-brand-700" : "bg-ink-900/10"
                  )}
                  aria-hidden
                />
              )}
              <span
                className={cn(
                  "relative flex size-6 shrink-0 items-center justify-center rounded-full text-label-m",
                  st.state === "done" && "bg-brand-700 text-white",
                  st.state === "current" &&
                    "bg-white text-brand-700 ring-2 ring-brand-700",
                  st.state === "next" &&
                    "bg-cream text-ink-400 ring-1 ring-ink-900/10"
                )}
              >
                {st.state === "done" ? (
                  <Check className="size-3.5" aria-hidden />
                ) : (
                  i + 1
                )}
              </span>
              <span className="min-w-0 pt-0.5">
                <span
                  className={cn(
                    "block text-label-l",
                    st.state === "next" && "text-ink-400"
                  )}
                >
                  {st.label}
                </span>
                {st.hint && (
                  <span className="mt-0.5 block text-body-m text-ink-600">
                    {st.hint}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>

        {pending.simulated && (
          <Notice tone="info">
            <p className="font-semibold">Demo payment · no money is charged</p>
            <p className="mt-2">
              An administrator can confirm this payment in Demo payments. No
              Mobile Money prompt is sent.
            </p>
            <p className="mt-3">Payment ID</p>
            <CopyRef value={pending.paymentId} className="mt-2" />
          </Notice>
        )}

        {payment.isError && (
          <Notice tone="error">{friendlyError(payment.error)}</Notice>
        )}

        <div className="flex flex-col gap-3 border-t border-ink-900/8 pt-5 sm:flex-row sm:flex-wrap">
          {pending.shareUrl && (
            <Button
              variant="secondary"
              icon={Share2}
              onClick={async () => {
                if (navigator.share) {
                  await navigator
                    .share({
                      title: "CareBridge consultation",
                      text: "Please help pay for my doctor consultation",
                      url: pending.shareUrl,
                    })
                    .catch(() => undefined)
                } else {
                  await navigator.clipboard.writeText(pending.shareUrl!)
                }
              }}
            >
              Share payment link
            </Button>
          )}
          {timedOut && !pending.simulated && (
            <Button variant="secondary" onClick={onRetry}>
              Start a new payment
            </Button>
          )}
          {(pending.simulated || timedOut) && (
            <Button
              variant="secondary"
              onClick={() => void payment.refetch()}
              loading={payment.isFetching}
            >
              Check confirmation
            </Button>
          )}
          <ButtonLink to={`/app/consult/${consultRef}`} variant="ghost">
            Back to conversation
          </ButtonLink>
        </div>
      </motion.section>

      <motion.aside
        variants={staggerOnMount(0.07)}
        className="flex flex-col gap-4 lg:sticky lg:top-6"
      >
        <OrderSummary {...summary} />
        <motion.section
          variants={popIn}
          className="rounded-xl bg-white p-5 shadow-[var(--shadow-elev-1)]"
        >
          <p className="text-label-l text-ink-600">Payment reference</p>
          <CopyRef value={reference} className="mt-2" />
          <p className="mt-3 text-body-m text-ink-600">
            Keep it in case you need to ask about this payment.
          </p>
        </motion.section>
      </motion.aside>
    </motion.div>
  )
}

function formatElapsed(ms: number) {
  const total = Math.floor(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`
}

/** A reference people may read out or paste: monospace, with a copy button that confirms. */
function CopyRef({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(false), 2_000)
    return () => window.clearTimeout(t)
  }, [copied])
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-lg bg-cream py-1 pr-1 pl-3",
        className
      )}
    >
      <span className="min-w-0 truncate text-code text-ink-900">{value}</span>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(
            () => setCopied(true),
            () => undefined
          )
        }}
        className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md px-3 text-label-l text-brand-700 transition-colors hover:bg-white"
      >
        {copied ? (
          <Check className="size-4" aria-hidden />
        ) : (
          <Copy className="size-4" aria-hidden />
        )}
        <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
      </button>
    </span>
  )
}

/** Who, what and how much: the same card on the pay form and while waiting. */
function OrderSummary({
  patient,
  request,
  amountXaf,
  className,
}: Summary & { className?: string }) {
  return (
    <motion.section
      variants={popIn}
      className={cn(
        "rounded-xl bg-brand-800 p-6 text-white shadow-[var(--shadow-elev-2)]",
        className
      )}
    >
      <dl className="space-y-3 text-body-l">
        <div className="flex justify-between gap-4">
          <dt className="text-white/70">Patient</dt>
          <dd className="font-medium">{patient}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="shrink-0 text-white/70">Request</dt>
          <dd className="line-clamp-3 max-w-[70%] text-right font-medium">
            {request}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 border-t border-white/20 pt-4">
          <dt className="text-title-m">Amount</dt>
          <dd className="text-headline-l text-white">
            {formatXaf(amountXaf ?? env.consultationFeeXaf)}
          </dd>
        </div>
      </dl>
    </motion.section>
  )
}

export default function Payment() {
  const { id = "" } = useParams()
  const { session } = useAuth()
  const online = useOnline()
  const local = useLiveQuery(
    async () => (await findLocalConsultation(id)) ?? null,
    [id]
  )
  const serverId =
    local === undefined ? undefined : local ? local.consultation_id : id
  const ref = local?.local_id ?? id

  const consult = useQuery({
    queryKey: ["consultation", serverId],
    queryFn: () => consultApi.get(serverId!),
    enabled: Boolean(serverId),
  })

  const [pending, setPending] = useState<Pending | null>(() => readPending(id))
  const [payer, setPayer] = useState<"me" | "other">("me")
  const [phone, setPhone] = useState(session?.phone ?? "")
  const [phoneTouched, setPhoneTouched] = useState(false)

  const initiate = useMutation({
    mutationFn: () =>
      paymentApi.initiate({
        consultation_id: serverId!,
        phone: normalisePhone(phone),
        redirect_url: `${window.location.origin}/app/consult/${ref}/pay`,
      }),
    onSuccess: (res) => {
      const next: Pending = {
        paymentId: res.payment_id,
        simulated: res.simulated,
        amountXaf: res.amount_xaf,
        startedAt: Date.now(),
        shareUrl: payer === "other" ? res.payment_url : undefined,
      }
      sessionStorage.setItem(storageKey(ref), JSON.stringify(next))
      setPending(next)
      const external =
        new URL(res.payment_url, window.location.origin).origin !==
        window.location.origin
      if (!res.simulated && payer === "me" && external)
        window.location.assign(res.payment_url)
    },
  })

  const retry = () => {
    sessionStorage.removeItem(storageKey(ref))
    setPending(null)
    initiate.reset()
  }

  if (local === undefined || (serverId && consult.isPending))
    return <PageSpinner />

  const c = consult.data?.consultation
  const summary: Summary = {
    patient: local?.subject_label ?? "You",
    request: c?.complaint ?? local?.complaint,
  }

  if (pending)
    return (
      <PaymentStatus
        consultRef={ref}
        pending={pending}
        summary={{ ...summary, amountXaf: pending.amountXaf }}
        onRetry={retry}
      />
    )

  if (!serverId) {
    return (
      <Notice tone="info" className="flex items-start gap-3">
        <WifiOff className="mt-0.5 size-5 shrink-0" aria-hidden />
        Your consultation hasn't reached CareBridge yet. Payment opens as soon
        as you're back online.
      </Notice>
    )
  }

  if (c && c.status !== "pending_payment") {
    return (
      <Outcome>
        <StatusMark state="done" icon={Check} />
        <h1 className="text-headline-l">This consultation is already paid</h1>
        <ButtonLink to={`/app/consult/${ref}`} trailing="arrow">
          Go to conversation
        </ButtonLink>
      </Outcome>
    )
  }

  const phoneError =
    rules.required(
      payer === "me"
        ? "Enter the number that will pay."
        : "Enter their Mobile Money number."
    )(phone) ?? rules.phone()(phone)
  const shownPhoneError = phoneTouched ? phoneError : undefined
  const pay = () => {
    if (phoneError) {
      setPhoneTouched(true)
      document.querySelector<HTMLElement>("[data-field=pay-phone]")?.focus()
      return
    }
    initiate.mutate()
  }

  return (
    <motion.div
      variants={staggerOnMount(0.07)}
      initial="hidden"
      animate="show"
      className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-6"
    >
      <div className="-order-2 lg:order-none lg:col-span-2">
        <PageHeader
          eyebrow="Payment"
          title="Pay for your consultation"
          subtitle="Paid once. A doctor sees your case after payment."
        />
        {consult.isError && (
          <Notice tone="error">{friendlyError(consult.error)}</Notice>
        )}
      </div>

      <motion.section
        variants={popIn}
        className="flex flex-col gap-5 rounded-xl bg-white p-5 shadow-[var(--shadow-elev-1)]"
      >
        {flags.pay_for_other && (
          <div>
            <h2 className="mb-3 text-headline-s">Who is paying?</h2>
            <div className="flex flex-col gap-3">
              <ChoiceCard
                title="Me"
                icon={<User className="size-5" />}
                selected={payer === "me"}
                onClick={() => setPayer("me")}
              />
              <ChoiceCard
                title="Someone else"
                description="A relative or friend, even abroad. We'll give you a link to share."
                icon={<Users className="size-5" />}
                selected={payer === "other"}
                onClick={() => {
                  setPayer("other")
                  setPhone("")
                  setPhoneTouched(false)
                }}
              />
            </div>
          </div>
        )}

        <Field
          label={
            payer === "me"
              ? "Your Mobile Money number"
              : "Their Mobile Money number"
          }
          hint="MTN Mobile Money or Orange Money, for example 677 000 000"
          error={shownPhoneError}
          required
        >
          {(id) => (
            <Input
              id={id}
              data-field="pay-phone"
              type="tel"
              inputMode="tel"
              autoComplete={payer === "me" ? "tel" : "off"}
              placeholder="677 000 000"
              value={phone}
              aria-invalid={shownPhoneError ? true : undefined}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={() => setPhoneTouched(true)}
              onKeyDown={(e) => e.key === "Enter" && pay()}
            />
          )}
        </Field>

        {!online && <Notice tone="info">Payment needs a connection.</Notice>}
        {initiate.isError && (
          <Notice tone="error">{friendlyError(initiate.error)}</Notice>
        )}
      </motion.section>

      <motion.aside
        variants={staggerOnMount(0.07)}
        className="contents lg:sticky lg:top-6 lg:flex lg:flex-col lg:gap-4"
      >
        <OrderSummary {...summary} className="-order-1 lg:order-none" />

        <motion.div
          variants={popIn}
          className="sticky bottom-[104px] z-20 lg:static"
        >
          <Button
            size="lg"
            full
            disabled={!online}
            loading={initiate.isPending}
            onClick={pay}
            icon={Smartphone}
          >
            Pay with Mobile Money (Fapshi)
          </Button>
        </motion.div>
      </motion.aside>
    </motion.div>
  )
}

/** Centered outcome layout (waiting / done / error); children stagger in. */
function Outcome({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      variants={staggerOnMount(0.08, 0.1)}
      initial="hidden"
      animate="show"
      className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 rounded-xl bg-white px-5 py-10 text-center shadow-[var(--shadow-elev-1)] lg:mt-6"
    >
      {Array.isArray(children)
        ? children.map(
            (child, i) =>
              child && (
                <motion.div
                  key={i}
                  variants={popIn}
                  className="flex flex-col items-center"
                >
                  {child}
                </motion.div>
              )
          )
        : children}
    </motion.div>
  )
}
