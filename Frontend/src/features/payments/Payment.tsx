import { useState } from "react"
import { useParams } from "react-router-dom"
import { useLiveQuery } from "dexie-react-hooks"
import { motion } from "motion/react"
import { useMutation, useQuery } from "@tanstack/react-query"
import {
  Check,
  Clock,
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
import { popIn, staggerOnMount } from "@/design/motion"
import { formatXaf } from "@/lib/format"
import { normalisePhone, rules } from "@/lib/form"
import { useNow, useOnline } from "@/lib/hooks"
import { findLocalConsultation } from "@/features/consult/actions"

const POLL_MS = 3_000
const TIMEOUT_MS = 120_000

interface Pending {
  paymentId: string
  startedAt: number
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

function PaymentStatus({
  consultRef,
  pending,
  onRetry,
}: {
  consultRef: string
  pending: Pending
  onRetry: () => void
}) {
  const now = useNow(1_000)
  const timedOut = now - pending.startedAt > TIMEOUT_MS
  const payment = useQuery({
    queryKey: ["payment", pending.paymentId],
    queryFn: () => paymentApi.get(pending.paymentId),
    refetchInterval: (q) =>
      q.state.data?.status === "initiated" && !timedOut ? POLL_MS : false,
  })
  const status = payment.data?.status

  if (status === "confirmed") {
    return (
      <Outcome>
        <StatusMark state="done" icon={Check} />
        <h1 className="text-headline-l lg:text-display-m">Payment received</h1>
        <p className="max-w-sm text-body-l text-ink-600">
          You're in the queue. A doctor will reply soon.
        </p>
        <p className="text-body-m text-ink-600">
          Reference: {payment.data?.fapshi_ref}
        </p>
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

  return (
    <Outcome>
      <StatusMark state={timedOut ? "info" : "waiting"} icon={Clock} />
      <h1 className="text-headline-l">
        {timedOut
          ? "Still waiting for confirmation"
          : "Confirming your payment…"}
      </h1>
      <p className="max-w-sm text-body-l text-ink-600">
        {timedOut
          ? "We'll let you know when it arrives. You can leave this page."
          : "Approve the request on the phone that is paying. This page updates by itself."}
      </p>
      {payment.isError && (
        <Notice tone="error">{friendlyError(payment.error)}</Notice>
      )}
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
      <ButtonLink to={`/app/consult/${consultRef}`} variant="ghost">
        Back to conversation
      </ButtonLink>
      {timedOut && (
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Start a new payment
        </Button>
      )}
    </Outcome>
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
        startedAt: Date.now(),
        shareUrl: payer === "other" ? res.payment_url : undefined,
      }
      sessionStorage.setItem(storageKey(ref), JSON.stringify(next))
      setPending(next)
      const external =
        new URL(res.payment_url, window.location.origin).origin !==
        window.location.origin
      if (payer === "me" && external) window.location.assign(res.payment_url)
    },
  })

  const retry = () => {
    sessionStorage.removeItem(storageKey(ref))
    setPending(null)
    initiate.reset()
  }

  if (local === undefined || (serverId && consult.isPending))
    return <PageSpinner />

  if (pending)
    return <PaymentStatus consultRef={ref} pending={pending} onRetry={retry} />

  if (!serverId) {
    return (
      <Notice tone="info" className="flex items-start gap-3">
        <WifiOff className="mt-0.5 size-5 shrink-0" aria-hidden />
        Your consultation hasn't reached CareBridge yet. Payment opens as soon
        as you're back online.
      </Notice>
    )
  }

  const c = consult.data?.consultation
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
      document.getElementById("pay-phone")?.focus()
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
          {() => (
            <Input
              id="pay-phone"
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
        <motion.section
          variants={popIn}
          className="-order-1 shape-br bg-brand-800 p-6 text-white shadow-[var(--shadow-elev-2)] lg:order-none"
        >
          <dl className="space-y-3 text-body-l">
            <div className="flex justify-between gap-4">
              <dt className="text-white/70">Patient</dt>
              <dd className="font-medium">{local?.subject_label ?? "You"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-white/70">Request</dt>
              <dd className="line-clamp-3 max-w-[70%] text-right font-medium">
                {c?.complaint ?? local?.complaint}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-t border-white/20 pt-4">
              <dt className="text-title-m">Amount</dt>
              <dd className="text-headline-l text-white">
                {formatXaf(env.consultationFeeXaf)}
              </dd>
            </div>
          </dl>
        </motion.section>

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
