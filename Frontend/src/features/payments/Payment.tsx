import { useState } from "react"
import { useParams } from "react-router-dom"
import { AnimatePresence, motion } from "motion/react"
import { useLiveQuery } from "dexie-react-hooks"
import { useMutation, useQuery } from "@tanstack/react-query"
import { CircleCheck, Clock, Share2, Smartphone, TriangleAlert, WifiOff } from "lucide-react"
import { consultApi, paymentApi } from "@/api/endpoints"
import { friendlyError } from "@/api/errors"
import { useAuth } from "@/auth/AuthProvider"
import { env } from "@/config/env"
import { flags } from "@/config/flags"
import { Button, ButtonLink } from "@/design/components/Button"
import { ChoiceCard, Field, Input } from "@/design/components/Field"
import { Card, Notice, PageHeader, PageSpinner } from "@/design/components/primitives"
import { EASE_OUT } from "@/design/motion"
import { formatXaf } from "@/lib/format"
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

function PaymentStatus({ consultRef, pending, onRetry }: { consultRef: string; pending: Pending; onRetry: () => void }) {
  const now = useNow(1_000)
  const timedOut = now - pending.startedAt > TIMEOUT_MS
  const payment = useQuery({
    queryKey: ["payment", pending.paymentId],
    queryFn: () => paymentApi.get(pending.paymentId),
    refetchInterval: (q) => (q.state.data?.status === "initiated" && !timedOut ? POLL_MS : false),
  })
  const status = payment.data?.status

  const fadeProps = {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -12 },
    transition: { duration: 0.3, ease: EASE_OUT },
  }

  if (status === "confirmed") {
    return (
      <AnimatePresence mode="wait">
        <motion.div key="confirmed" className="flex flex-col items-center gap-4 py-8 text-center" {...fadeProps}>
          <CircleCheck className="size-16 text-urgent-green" strokeWidth={1.5} aria-hidden />
          <h1 className="text-[26px] font-extrabold">Payment received</h1>
          <p className="max-w-sm text-[15px] text-ink-600">You're in the queue. A doctor will reply soon.</p>
          <p className="text-sm text-ink-600">Reference: {payment.data?.fapshi_ref}</p>
          <ButtonLink to={`/app/consult/${consultRef}`} trailing="arrow" size="lg">
            Go to conversation
          </ButtonLink>
        </motion.div>
      </AnimatePresence>
    )
  }

  if (status === "failed") {
    return (
      <AnimatePresence mode="wait">
        <motion.div key="failed" className="flex flex-col items-center gap-4 py-8 text-center" {...fadeProps}>
          <TriangleAlert className="size-14 text-urgent-red" strokeWidth={1.5} aria-hidden />
          <h1 className="text-[24px] font-extrabold">The payment didn't go through</h1>
          <p className="max-w-sm text-[15px] text-ink-600">No money was taken. You can try again.</p>
          <Button onClick={onRetry}>Try again</Button>
        </motion.div>
      </AnimatePresence>
    )
  }

  return (
    <AnimatePresence mode="wait">
    <motion.div key="waiting" className="flex flex-col items-center gap-4 py-8 text-center" {...fadeProps}>
      <Clock className="size-14 animate-pulse text-brand-700" strokeWidth={1.5} aria-hidden />
      <h1 className="text-[24px] font-extrabold">
        {timedOut ? "Still waiting for confirmation" : "Confirming your payment…"}
      </h1>
      <p className="max-w-sm text-[15px] text-ink-600">
        {timedOut
          ? "We'll let you know when it arrives. You can leave this page."
          : "Approve the request on the phone that is paying. This page updates by itself."}
      </p>
      {payment.isError && <Notice tone="error">{friendlyError(payment.error)}</Notice>}
      {pending.shareUrl && (
        <Button
          variant="secondary"
          onClick={async () => {
            if (navigator.share) {
              await navigator.share({ title: "CareBridge consultation", text: "Please help pay for my doctor consultation", url: pending.shareUrl }).catch(() => undefined)
            } else {
              await navigator.clipboard.writeText(pending.shareUrl!)
            }
          }}
        >
          <Share2 className="size-5" aria-hidden /> Share payment link
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
    </motion.div>
    </AnimatePresence>
  )
}

export default function Payment() {
  const { id = "" } = useParams()
  const { session } = useAuth()
  const online = useOnline()
  const local = useLiveQuery(async () => (await findLocalConsultation(id)) ?? null, [id])
  const serverId = local === undefined ? undefined : local ? local.consultation_id : id
  const ref = local?.local_id ?? id

  const consult = useQuery({
    queryKey: ["consultation", serverId],
    queryFn: () => consultApi.get(serverId!),
    enabled: Boolean(serverId),
  })

  const [pending, setPending] = useState<Pending | null>(() => readPending(id))
  const [payer, setPayer] = useState<"me" | "other">("me")
  const [phone, setPhone] = useState(session?.phone ?? "")
  const consultTypeName = consultType === "lab" ? "Lab Test" : consultType === "specialist" ? "Specialist" : "General"

  const initiate = useMutation({
    mutationFn: () =>
      paymentApi.initiate({
        consultation_id: serverId!,
        phone: phone.replace(/\s/g, ""),
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
      const external = new URL(res.payment_url, window.location.origin).origin !== window.location.origin
      if (payer === "me" && external) window.location.assign(res.payment_url)
    },
  })

  const retry = () => {
    sessionStorage.removeItem(storageKey(ref))
    setPending(null)
    initiate.reset()
  }

  if (local === undefined || (serverId && consult.isPending)) return <PageSpinner />

  if (pending) return <PaymentStatus consultRef={ref} pending={pending} onRetry={retry} />

  if (!serverId) {
    return (
      <Notice tone="warn" className="flex items-start gap-3">
        <WifiOff className="mt-0.5 size-5 shrink-0" aria-hidden />
        Your consultation hasn't reached CareBridge yet. Payment opens as soon as you're back online.
      </Notice>
    )
  }

  const consultType = local?.consult_type ?? "general"
  const fee = env.consultationFees[consultType]

  const c = consult.data?.consultation
  if (c && c.status !== "pending_payment") {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <CircleCheck className="size-14 text-urgent-green" strokeWidth={1.5} aria-hidden />
        <h1 className="text-[24px] font-extrabold">This consultation is already paid</h1>
        <ButtonLink to={`/app/consult/${ref}`} trailing="arrow">
          Go to conversation
        </ButtonLink>
      </div>
    )
  }

  const phoneValid = /^\+?\d{9,15}$/.test(phone.replace(/\s/g, ""))

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Pay for your consultation" subtitle={`${consultTypeName} consultation · Paid once. A doctor sees your case after payment.`} />

      {consult.isError && <Notice tone="error">{friendlyError(consult.error)}</Notice>}

      <Card className="p-5">
        <dl className="space-y-3 text-[15px]">
          <div className="flex justify-between gap-4">
            <dt className="text-ink-600">Patient</dt>
            <dd className="font-medium">{local?.subject_label ?? "You"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-600">Request</dt>
            <dd className="line-clamp-2 max-w-[60%] text-right font-medium">{c?.complaint ?? local?.complaint}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-600">Type</dt>
            <dd className="font-medium capitalize">{consultType === "lab" ? "Lab Test" : consultType === "specialist" ? "Specialist" : "General"}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-line pt-3">
            <dt className="font-semibold">Amount</dt>
            <dd className="font-display text-[20px] font-extrabold">{formatXaf(fee)}</dd>
          </div>
        </dl>
      </Card>

      {flags.pay_for_other && (
        <section>
          <h2 className="mb-3 text-[16px] font-bold">Who is paying?</h2>
          <div className="flex flex-col gap-3">
            <ChoiceCard title="Me" selected={payer === "me"} onClick={() => setPayer("me")} />
            <ChoiceCard
              title="Someone else"
              description="A relative or friend, even abroad. We'll give you a link to share."
              selected={payer === "other"}
              onClick={() => {
                setPayer("other")
                setPhone("")
              }}
            />
          </div>
        </section>
      )}

      <Field
        label={payer === "me" ? "Your Mobile Money number" : "Their Mobile Money number"}
        hint="MTN Mobile Money or Orange Money, for example +237 677 000 000"
      >
        {(fid) => (
          <Input id={fid} type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        )}
      </Field>

      {!online && <Notice tone="warn">Payment needs a connection.</Notice>}
      {initiate.isError && <Notice tone="error">{friendlyError(initiate.error)}</Notice>}

      <Button
        size="lg"
        full
        disabled={!online || !phoneValid}
        loading={initiate.isPending}
        onClick={() => initiate.mutate()}
      >
        <Smartphone className="size-5" aria-hidden />
        Pay with Mobile Money (Fapshi)
      </Button>
    </div>
  )
}
