import { useState } from "react"
import { useParams } from "react-router-dom"
import { useLiveQuery } from "dexie-react-hooks"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Check, Clock, Share2, Smartphone, TriangleAlert, WifiOff } from "lucide-react"
import { consultApi, paymentApi } from "@/api/endpoints"
import { friendlyError } from "@/api/errors"
import { useAuth } from "@/auth/AuthProvider"
import { env } from "@/config/env"
import { flags } from "@/config/flags"
import { Button, ButtonLink } from "@/design/components/Button"
import { ChoiceCard, Field, Input } from "@/design/components/Field"
import { Card, Notice, PageHeader, PageSpinner, StatusMark } from "@/design/components/primitives"
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

  if (status === "confirmed") {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <StatusMark state="done" icon={Check} />
        <h1 className="text-headline-l lg:text-display-m">Payment received</h1>
        <p className="max-w-sm text-body-l text-ink-600">You're in the queue. A doctor will reply soon.</p>
        <p className="text-body-m text-ink-600">Reference: {payment.data?.fapshi_ref}</p>
        <ButtonLink to={`/app/consult/${consultRef}`} trailing="arrow" size="lg">
          Go to conversation
        </ButtonLink>
      </div>
    )
  }

  if (status === "failed") {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <StatusMark state="error" icon={TriangleAlert} />
        <h1 className="text-headline-l">The payment didn't go through</h1>
        <p className="max-w-sm text-body-l text-ink-600">No money was taken. You can try again.</p>
        <Button onClick={onRetry}>Try again</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <StatusMark state={timedOut ? "info" : "waiting"} icon={Clock} />
      <h1 className="text-headline-l">
        {timedOut ? "Still waiting for confirmation" : "Confirming your payment…"}
      </h1>
      <p className="max-w-sm text-body-l text-ink-600">
        {timedOut
          ? "We'll let you know when it arrives. You can leave this page."
          : "Approve the request on the phone that is paying. This page updates by itself."}
      </p>
      {payment.isError && <Notice tone="error">{friendlyError(payment.error)}</Notice>}
      {pending.shareUrl && (
        <Button
          variant="secondary"
          icon={Share2}
          onClick={async () => {
            if (navigator.share) {
              await navigator.share({ title: "CareBridge consultation", text: "Please help pay for my doctor consultation", url: pending.shareUrl }).catch(() => undefined)
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
    </div>
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

  const c = consult.data?.consultation
  if (c && c.status !== "pending_payment") {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <StatusMark state="done" icon={Check} />
        <h1 className="text-headline-l">This consultation is already paid</h1>
        <ButtonLink to={`/app/consult/${ref}`} trailing="arrow">
          Go to conversation
        </ButtonLink>
      </div>
    )
  }

  const phoneValid = /^\+?\d{9,15}$/.test(phone.replace(/\s/g, ""))

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Pay for your consultation" subtitle="Paid once. A doctor sees your case after payment." />

      {consult.isError && <Notice tone="error">{friendlyError(consult.error)}</Notice>}

      <Card className="bg-brand-800 p-6 text-white shape-br">
        <dl className="space-y-3 text-body-l">
          <div className="flex justify-between gap-4">
            <dt className="text-white/70">Patient</dt>
            <dd className="font-medium">{local?.subject_label ?? "You"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-white/70">Request</dt>
            <dd className="line-clamp-2 max-w-[60%] text-right font-medium">{c?.complaint ?? local?.complaint}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 border-t border-white/20 pt-4">
            <dt className="text-title-m">Amount</dt>
            <dd className="text-headline-l text-white">{formatXaf(env.consultationFeeXaf)}</dd>
          </div>
        </dl>
      </Card>

      {flags.pay_for_other && (
        <section>
          <h2 className="mb-3 text-headline-s">Who is paying?</h2>
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
        icon={Smartphone}
        className="sticky bottom-[104px] z-20 lg:bottom-4"
      >
        Pay with Mobile Money (Fapshi)
      </Button>
    </div>
  )
}
