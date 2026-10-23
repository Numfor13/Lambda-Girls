import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Activity,
  History as HistoryIcon,
  MessageCircle,
  Printer,
  Receipt,
} from "lucide-react"
import { motion } from "motion/react"
import { consultApi, paymentApi, triageApi } from "@/api/endpoints"
import { useAuth } from "@/auth/AuthProvider"
import { flags } from "@/config/flags"
import { Button, ButtonLink } from "@/design/components/Button"
import { Feedback } from "@/design/components/Feedback"
import {
  ServiceCard,
  ServiceError,
  ServicePage,
  ServiceStatus,
} from "@/design/components/ServicePage"
import { EmptyState, PageSpinner } from "@/design/components/primitives"
import { UrgencyBadge } from "@/design/components/UrgencyBadge"
import { popIn } from "@/design/motion"
import { formatDateTime, formatXaf } from "@/lib/format"
import { useOnline, useVisible } from "@/lib/hooks"

function ReceiptDetail({ id }: { id: string }) {
  const { session } = useAuth(),
    online = useOnline(),
    visible = useVisible()
  const payment = useQuery({
    queryKey: ["receipt", session?.sub, id],
    queryFn: () => paymentApi.get(id),
    refetchInterval: (q) =>
      q.state.data?.status === "initiated" && online && visible
        ? 20_000
        : false,
  })
  const p = payment.data
  return (
    <ServiceCard title="Payment receipt">
      <ServiceError error={payment.error} />
      {payment.isPending ? (
        <PageSpinner />
      ) : (
        p && (
          <>
            <ServiceStatus>{p.status}</ServiceStatus>
            <p className="text-headline-m">{formatXaf(p.amount_xaf)}</p>
            {p.status !== "confirmed" ? (
              <Feedback>
                A receipt is available after payment is confirmed.
              </Feedback>
            ) : !p.receipt_data ? (
              <Feedback>
                Payment confirmed. Receipt details are not available yet.
              </Feedback>
            ) : (
              <>
                <dl className="grid min-w-0 gap-4 text-body-m">
                  <div>
                    <dt className="text-ink-600">Reference</dt>
                    <dd className="break-all">
                      {p.receipt_data.reference || p.fapshi_ref}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-600">Paid</dt>
                    <dd>{formatXaf(p.receipt_data.amount ?? p.amount_xaf)}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-600">Date</dt>
                    <dd>
                      {formatDateTime(
                        p.receipt_data.timestamp ??
                          p.confirmed_at ??
                          p.created_at
                      )}
                    </dd>
                  </div>
                  {p.receipt_data.payer_phone && (
                    <div>
                      <dt className="text-ink-600">Payer phone</dt>
                      <dd>{p.receipt_data.payer_phone}</dd>
                    </div>
                  )}
                </dl>
                <Button
                  icon={Printer}
                  variant="tonal"
                  className="self-start print:hidden"
                  onClick={() => window.print()}
                >
                  Print / save receipt
                </Button>
                <p className="text-body-m text-ink-600 print:hidden">
                  Printing may include other history on this page. Check the
                  preview before sharing.
                </p>
              </>
            )}
          </>
        )
      )}
      {payment.isError && (
        <Button variant="tonal" onClick={() => void payment.refetch()}>
          Try again
        </Button>
      )}
    </ServiceCard>
  )
}
export default function History() {
  const { session } = useAuth(),
    online = useOnline(),
    visible = useVisible()
  const [receipt, setReceipt] = useState<string | null>(null)
  const options = {
    refetchInterval: online && visible ? 20_000 : (false as const),
  }
  const triage = useQuery({
    queryKey: ["history-triage", session?.sub],
    queryFn: triageApi.list,
    enabled: flags.consult_history,
    ...options,
  })
  const consults = useQuery({
    queryKey: ["history-consults", session?.sub],
    queryFn: consultApi.list,
    enabled: flags.consult_history,
    ...options,
  })
  const payments = useQuery({
    queryKey: ["history-payments", session?.sub],
    queryFn: paymentApi.list,
    enabled: flags.receipts,
    ...options,
  })
  const rows = [
    ...(triage.data?.results ?? []).map((t) => ({
      id: `triage-${t.result_id}`,
      time: t.created_at,
      title: "Symptom check",
      status: "Advisory, not a diagnosis",
      icon: Activity,
      urgency: t.urgency,
      to: `/app/triage/${t.result_id}`,
      payment: null as string | null,
    })),
    ...(consults.data?.consultations ?? []).map((c) => ({
      id: `consult-${c.consultation_id}`,
      time: c.created_at,
      title: c.complaint,
      status: c.status.replaceAll("_", " "),
      icon: MessageCircle,
      urgency: null,
      to: `/app/consult/${c.consultation_id}`,
      payment: null as string | null,
    })),
    ...(payments.data?.payments ?? []).map((p) => ({
      id: `payment-${p.payment_id}`,
      time: p.created_at,
      title: `Payment · ${formatXaf(p.amount_xaf)}`,
      status: p.status,
      icon: Receipt,
      urgency: null,
      to: "",
      payment: p.payment_id as string | null,
    })),
  ].sort((a, b) => b.time - a.time)
  const loading =
    (flags.consult_history && (triage.isPending || consults.isPending)) ||
    (flags.receipts && payments.isPending)
  const error = triage.error || consults.error || payments.error
  return (
    <ServicePage
      title="History & receipts"
      subtitle="Your symptom checks, consultations and payments, newest first."
    >
      <ServiceError error={error} />
      {error && (
        <Button
          variant="tonal"
          onClick={() => {
            if (flags.consult_history) {
              void triage.refetch()
              void consults.refetch()
            }
            if (flags.receipts) void payments.refetch()
          }}
        >
          Refresh history
        </Button>
      )}
      {receipt && (
        <div id="receipt" className="scroll-mt-24">
          <ReceiptDetail key={receipt} id={receipt} />
          <Button
            className="mt-3 print:hidden"
            variant="secondary"
            onClick={() => setReceipt(null)}
          >
            Close receipt
          </Button>
        </div>
      )}
      <ServiceCard title="Your timeline">
        {loading ? (
          <PageSpinner />
        ) : !rows.length ? (
          <EmptyState icon={HistoryIcon} title="No history to show yet." />
        ) : (
          <motion.ul className="flex flex-col gap-4">
            {rows.map((r) => (
              <motion.li
                variants={popIn}
                layout
                key={r.id}
                className="flex min-w-0 flex-col items-start gap-3 rounded-lg border border-line p-4"
              >
                <r.icon className="size-5 text-brand-700" aria-hidden />
                <p className="text-label-m text-ink-600">
                  {formatDateTime(r.time)}
                </p>
                <h3 className="text-title-l break-words">{r.title}</h3>
                {r.urgency && <UrgencyBadge urgency={r.urgency} />}
                <ServiceStatus>{r.status}</ServiceStatus>
                {r.payment ? (
                  <Button
                    variant="tonal"
                    onClick={() => {
                      setReceipt(r.payment)
                      requestAnimationFrame(() =>
                        document.getElementById("receipt")?.scrollIntoView({
                          behavior: "instant",
                          block: "start",
                        })
                      )
                    }}
                  >
                    View payment
                  </Button>
                ) : (
                  <ButtonLink to={r.to} variant="tonal">
                    View details
                  </ButtonLink>
                )}
              </motion.li>
            ))}
          </motion.ul>
        )}
        <p className="text-body-m text-ink-600">
          Payments include those you paid for someone else. Symptom-check
          history contains the most recent results returned by the service.
        </p>
      </ServiceCard>
    </ServicePage>
  )
}
