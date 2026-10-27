import { useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { AnimatePresence, motion } from "motion/react"
import { Activity, ChevronRight, History as HistoryIcon, MessageCircle, Printer, Receipt, Search, Share2, X, type LucideIcon } from "lucide-react"
import { consultApi, paymentApi, triageApi } from "@/api/endpoints"
import type { Payment, Urgency } from "@/api/types"
import { useAuth } from "@/auth/AuthProvider"
import { flags } from "@/config/flags"
import { AppPage, Panel } from "@/design/components/AppPage"
import { Button, ButtonLink } from "@/design/components/Button"
import { Feedback } from "@/design/components/Feedback"
import { NumberTicker, Skeleton } from "@/design/components/Lively"
import { ServiceError } from "@/design/components/ServicePage"
import { EmptyState } from "@/design/components/primitives"
import { UrgencyBadge } from "@/design/components/UrgencyBadge"
import { toast } from "@/design/components/Toast"
import { SPRING, popIn, staggerOnMount } from "@/design/motion"
import { STATUS_LABEL } from "@/features/consult/actions"
import { formatDate, formatDateTime, formatTime, formatXaf, timeAgo } from "@/lib/format"
import { todayIso } from "@/lib/form"
import { useNow, useOnline, useVisible } from "@/lib/hooks"
import { plural } from "@/lib/labels"
import { printReceipt, receiptText } from "@/lib/receipt"
import { cn } from "@/lib/utils"

type Kind = "checks" | "consults" | "payments"

interface Row {
  id: string
  kind: Kind
  time: number
  title: string
  status: string
  icon: LucideIcon
  urgency: Urgency | null
  to: string
  payment: Payment | null
}

const PAYMENT_STATUS: Record<Payment["status"], string> = {
  initiated: "Waiting for confirmation",
  confirmed: "Paid",
  failed: "Didn't go through",
}

function dayLabel(iso: string, now: number) {
  const today = todayIso(new Date(now))
  const y = new Date(now)
  y.setDate(y.getDate() - 1)
  return iso === today ? "Today" : iso === todayIso(y) ? "Yesterday" : formatDate(iso)
}

/** A receipt drawn as a ticket: the paid amount first, then the facts, then print/share. */
function ReceiptCard({ p, close }: { p: Payment; close: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const r = p.receipt_data
  const ref = r?.reference || p.fapshi_ref
  return (
    <motion.section
      variants={popIn}
      initial="hidden"
      animate="show"
      className="overflow-hidden rounded-xl bg-white shadow-[var(--shadow-elev-2)]"
      aria-label="Payment receipt"
    >
      <div className="flex items-start justify-between gap-3 bg-brand-900 p-5 text-white">
        <div>
          <p className="eyebrow text-mint-200">Receipt</p>
          <p className="mt-2 font-display text-[34px] leading-none font-[460] tabular">{formatXaf(r?.amount ?? p.amount_xaf)}</p>
          <p className="mt-2 text-body-m text-white/70">{PAYMENT_STATUS[p.status]}</p>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Close receipt"
          className="-mt-1 -mr-1 flex size-10 items-center justify-center rounded-full text-white/80 hover:bg-white/10"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>
      {/* Perforation between the stub and the body. */}
      <div className="relative h-4" aria-hidden>
        <span className="absolute top-1/2 -left-2 size-4 -translate-y-1/2 rounded-full bg-cream" />
        <span className="absolute top-1/2 -right-2 size-4 -translate-y-1/2 rounded-full bg-cream" />
        <span className="absolute inset-x-4 top-1/2 border-t-2 border-dotted border-line" />
      </div>
      <div className="flex flex-col gap-4 p-5 pt-2">
        {p.status !== "confirmed" ? (
          <Feedback>The receipt appears once the payment is confirmed.</Feedback>
        ) : (
          <>
            <dl className="flex flex-col gap-2.5 text-body-m">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-600">Date</dt>
                <dd>{formatDateTime(r?.timestamp ?? p.confirmed_at ?? p.created_at)}</dd>
              </div>
              {r?.payer_phone && (
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-600">Paid from</dt>
                  <dd className="tabular">{r.payer_phone}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-ink-600">For</dt>
                <dd>Doctor consultation</dd>
              </div>
              <div className="flex flex-col gap-1 pt-1">
                <dt className="text-ink-600">Reference</dt>
                <dd className="text-code break-all text-ink-900">{ref}</dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="tonal"
                size="sm"
                icon={Printer}
                onClick={() => {
                  try {
                    printReceipt(p)
                    setError(null)
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Could not open print preview.")
                  }
                }}
              >
                Print or save
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={Share2}
                onClick={async () => {
                  try {
                    if (navigator.share) await navigator.share({ title: "CareBridge payment receipt", text: receiptText(p) })
                    else {
                      await navigator.clipboard.writeText(receiptText(p))
                      toast("Receipt copied")
                    }
                  } catch {
                    /* the person closed the share sheet */
                  }
                }}
              >
                Share
              </Button>
            </div>
          </>
        )}
        {error && <Feedback error>{error}</Feedback>}
      </div>
    </motion.section>
  )
}

export default function History() {
  const { session } = useAuth()
  const online = useOnline()
  const visible = useVisible()
  const now = useNow()
  const [params, setParams] = useSearchParams()
  const kind = (params.get("type") ?? "") as Kind | ""
  const search = params.get("q") ?? ""
  const receipt = params.get("receipt")
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const options = { refetchInterval: online && visible ? 20_000 : (false as const) }
  const triage = useQuery({ queryKey: ["history-triage", session?.sub], queryFn: triageApi.list, enabled: flags.consult_history, ...options })
  const consults = useQuery({ queryKey: ["history-consults", session?.sub], queryFn: consultApi.list, enabled: flags.consult_history, ...options })
  const payments = useQuery({ queryKey: ["history-payments", session?.sub], queryFn: paymentApi.list, enabled: flags.receipts, ...options })

  const all: Row[] = [
    ...(triage.data?.results ?? []).map((t) => ({
      id: `triage-${t.result_id}`,
      kind: "checks" as const,
      time: t.created_at,
      title: "Symptom check",
      status: "Advice, not a diagnosis",
      icon: Activity,
      urgency: t.urgency,
      to: `/app/triage/${t.result_id}`,
      payment: null,
    })),
    ...(consults.data?.consultations ?? []).map((c) => ({
      id: `consult-${c.consultation_id}`,
      kind: "consults" as const,
      time: c.created_at,
      title: c.complaint,
      status: STATUS_LABEL[c.status],
      icon: MessageCircle,
      urgency: c.urgency,
      to: `/app/consult/${c.consultation_id}`,
      payment: null,
    })),
    ...(payments.data?.payments ?? []).map((p) => ({
      id: `payment-${p.payment_id}`,
      kind: "payments" as const,
      time: p.created_at,
      title: "Consultation fee",
      status: PAYMENT_STATUS[p.status],
      icon: Receipt,
      urgency: null,
      to: "",
      payment: p,
    })),
  ]
  const tools = all.length > 8
  const rows = all
    .filter((r) => (!kind || r.kind === kind) && (!tools || `${r.title} ${r.status}`.toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => b.time - a.time)
  const groups = new Map<string, Row[]>()
  for (const row of rows) {
    const day = todayIso(new Date(row.time))
    groups.set(day, [...(groups.get(day) ?? []), row])
  }
  const loading = (flags.consult_history && (triage.isPending || consults.isPending)) || (flags.receipts && payments.isPending)
  const error = triage.error || consults.error || payments.error
  const updated = Math.max(triage.dataUpdatedAt, consults.dataUpdatedAt, payments.dataUpdatedAt)
  const paid = (payments.data?.payments ?? []).filter((p) => p.status === "confirmed").reduce((n, p) => n + p.amount_xaf, 0)
  const open = payments.data?.payments.find((p) => p.payment_id === receipt)
  const count = (k: Kind) => all.filter((r) => r.kind === k).length

  const tabs = (
    [
      ["", "All", all.length, true],
      ["checks", "Checks", count("checks"), flags.consult_history],
      ["consults", "Consults", count("consults"), flags.consult_history],
      ["payments", "Payments", count("payments"), flags.receipts],
    ] as const
  ).filter(([, , , on]) => on)

  return (
    <AppPage
      eyebrow="Your records"
      title="History"
      subtitle="Every check, consultation and payment, newest first."
      aside={open ? <ReceiptCard key={open.payment_id} p={open} close={() => update("receipt", "")} /> : undefined}
      asideFirst={Boolean(open)}
    >
      {/* Summary strip: real totals from your records. */}
      <motion.dl variants={popIn} className="grid grid-cols-3 gap-2 sm:gap-3">
        {[
          { n: count("checks"), l: "Checks" },
          { n: count("consults"), l: "Consults" },
          { n: paid, l: "Paid", xaf: true },
        ].map((s) => (
          <div key={s.l} className="flex flex-col-reverse rounded-xl bg-white p-4 shadow-[var(--shadow-elev-1)]">
            <dt className="text-label-m text-ink-600">{s.l}</dt>
            <dd className="font-display text-[22px] leading-none font-[460] whitespace-nowrap sm:text-[26px] xl:text-[30px]">
              {s.xaf ? <NumberTicker value={s.n} format={(n) => formatXaf(Math.round(n))} /> : <NumberTicker value={s.n} />}
            </dd>
          </div>
        ))}
      </motion.dl>

      <motion.div variants={popIn} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="inline-flex rounded-full bg-white p-1 shadow-[var(--shadow-elev-1)]" role="tablist" aria-label="Show">
            {tabs.map(([key, label, n]) => (
              <button
                key={key || "all"}
                type="button"
                role="tab"
                aria-selected={kind === key}
                onClick={() => update("type", key)}
                className={cn("relative h-10 shrink-0 rounded-full px-4 text-label-l", kind === key ? "text-white" : "text-ink-600 hover:text-ink-900")}
              >
                {kind === key && <motion.span layoutId="history-tab" className="absolute inset-0 rounded-full bg-brand-900" transition={SPRING.default} />}
                <span className="relative whitespace-nowrap">
                  {label} <span className="tabular opacity-70">{n}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
        {updated > 0 && <span className="text-label-m text-ink-600">Updated {timeAgo(updated, now)}</span>}
      </motion.div>

      {tools && (
        <label className="relative">
          <span className="sr-only">Search history</span>
          <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-400" aria-hidden />
          <input
            type="search"
            value={search}
            maxLength={100}
            onChange={(e) => update("q", e.target.value)}
            placeholder="Search by symptom or status"
            className="h-12 w-full rounded-full border border-ink-900/15 bg-white pr-4 pl-12 text-body-l focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 focus:outline-none"
          />
        </label>
      )}

      <ServiceError error={error} />
      {receipt && payments.isSuccess && !open && (
        <Feedback error>This receipt isn&apos;t in your payment history.</Feedback>
      )}

      {loading ? (
        <Panel>
          <div className="flex flex-col gap-4" role="status" aria-label="Loading history">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-11 rounded-lg" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      ) : !rows.length ? (
        <EmptyState
          icon={HistoryIcon}
          title={all.length ? "Nothing here yet." : "No history yet. Your checks, consultations and payments will appear here."}
          action={
            !all.length && (
              <ButtonLink variant="tonal" size="sm" to="/app/triage">
                Check symptoms
              </ButtonLink>
            )
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {Array.from(groups, ([day, items]) => (
            <section key={day} aria-label={dayLabel(day, now)}>
              <h2 className="mb-2 px-1 text-label-l text-ink-600">{dayLabel(day, now)}</h2>
              <motion.ul className="overflow-hidden rounded-xl bg-white shadow-[var(--shadow-elev-1)]" variants={staggerOnMount(0.04)}>
                <AnimatePresence initial={false}>
                  {items.map((r) => {
                    const inner = (
                      <>
                        <span
                          className={cn(
                            "flex size-11 shrink-0 items-center justify-center rounded-lg",
                            r.kind === "payments" ? "bg-brand-900 text-white" : "bg-mint text-brand-700",
                          )}
                        >
                          <r.icon className="size-5" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-label-l text-ink-900">{r.title}</span>
                          <span className="block truncate text-body-m text-ink-600">
                            {formatTime(r.time)} · {r.status}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          {r.urgency && <UrgencyBadge urgency={r.urgency} size="sm" short className="max-sm:hidden" />}
                          {r.payment && (
                            <span className={cn("text-label-l tabular", r.payment.status === "confirmed" ? "text-ink-900" : "text-ink-600")}>
                              {formatXaf(r.payment.amount_xaf)}
                            </span>
                          )}
                          <ChevronRight className="size-4 text-ink-400 transition-transform group-hover:translate-x-0.5" aria-hidden />
                        </span>
                      </>
                    )
                    const rowClass = cn(
                      "group flex w-full min-h-16 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-cream",
                      r.payment && receipt === r.payment.payment_id && "bg-mint hover:bg-mint",
                    )
                    return (
                      <motion.li key={r.id} variants={popIn} layout className="border-b border-line last:border-0">
                        {r.payment ? (
                          <button
                            type="button"
                            aria-pressed={receipt === r.payment.payment_id}
                            onClick={() => {
                              update("receipt", r.payment!.payment_id)
                              if (window.innerWidth < 1024) window.scrollTo({ top: 0, behavior: "smooth" })
                            }}
                            className={rowClass}
                          >
                            {inner}
                          </button>
                        ) : (
                          <Link to={r.to} className={rowClass}>
                            {inner}
                          </Link>
                        )}
                      </motion.li>
                    )
                  })}
                </AnimatePresence>
              </motion.ul>
            </section>
          ))}
          <p className="px-1 text-body-m text-ink-600">{plural(rows.length, "record")}</p>
        </div>
      )}
      {error && (
        <Button
          variant="tonal"
          size="sm"
          className="self-start"
          onClick={() => {
            void triage.refetch()
            void consults.refetch()
            void payments.refetch()
          }}
        >
          Try again
        </Button>
      )}
    </AppPage>
  )
}
