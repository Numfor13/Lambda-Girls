import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { motion } from "motion/react"
import { AnimatePresence } from "motion/react"
import { SPRING, popIn, staggerOnMount } from "@/design/motion"
import { useLiveQuery } from "dexie-react-hooks"
import { useQuery } from "@tanstack/react-query"
import {
  ChevronRight,
  MessagesSquare,
  Phone,
  Plus,
  Search,
  Stethoscope,
} from "lucide-react"
import { consultApi } from "@/api/endpoints"
import type { ConsultationStatus, Urgency } from "@/api/types"
import { ButtonA, ButtonLink } from "@/design/components/Button"
import { AppPage, Panel } from "@/design/components/AppPage"
import { Chip } from "@/design/components/Field"
import { EmptyState, PageSpinner } from "@/design/components/primitives"
import { SyncChip } from "@/design/components/SyncChip"
import { UrgencyBadge } from "@/design/components/UrgencyBadge"
import { formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import { db, type SyncState } from "@/offline/db"
import { STATUS_LABEL, reconcileStatus } from "./actions"

interface Row {
  key: string
  href: string
  complaint: string
  subject: string
  status: ConsultationStatus
  urgency: Urgency | null
  created_at: number
  sync_state?: SyncState
}

export default function ConsultList() {
  const local = useLiveQuery(() => db.consultations.toArray(), [])
  const remote = useQuery({
    queryKey: ["consultations"],
    queryFn: consultApi.list,
  })
  useEffect(() => {
    for (const c of remote.data?.consultations ?? []) void reconcileStatus(c.consultation_id, c.status)
  }, [remote.data])
  const [show, setShow] = useState<"active" | "closed">("active")
  const [q, setQ] = useState("")

  if (local === undefined || (remote.isPending && !local.length))
    return <PageSpinner />

  const byServerId = new Map(
    local.filter((l) => l.consultation_id).map((l) => [l.consultation_id!, l])
  )
  const rows: Row[] = local.map((l) => {
    const server = remote.data?.consultations.find(
      (c) => c.consultation_id === l.consultation_id
    )
    return {
      key: l.local_id,
      href: `/app/consult/${l.local_id}`,
      complaint: l.complaint,
      subject: l.subject_label,
      status: server?.status ?? l.status,
      urgency: server?.urgency ?? l.urgency,
      created_at: l.created_at,
      sync_state: l.consultation_id ? undefined : l.sync_state,
    }
  })
  for (const c of remote.data?.consultations ?? []) {
    if (byServerId.has(c.consultation_id)) continue
    rows.push({
      key: c.consultation_id,
      href: `/app/consult/${c.consultation_id}`,
      complaint: c.complaint,
      subject: c.on_behalf_member_id ? "Household member" : "You",
      status: c.status,
      urgency: c.urgency,
      created_at: c.created_at,
    })
  }
  rows.sort((a, b) => b.created_at - a.created_at)

  const active = rows.filter((r) => r.status !== "closed")
  const closed = rows.filter((r) => r.status === "closed")
  const waiting = rows.filter((r) => r.status === "pending_payment").length
  const needle = q.trim().toLowerCase()
  const shown = (show === "active" ? active : closed).filter(
    (r) =>
      !needle ||
      r.complaint.toLowerCase().includes(needle) ||
      r.subject.toLowerCase().includes(needle)
  )

  return (
    <AppPage
      eyebrow="Consults"
      title="My consultations"
      subtitle="Doctors reply here by text or voice. Urgent cases are seen first."
      actions={
        <ButtonLink to="/app/consult/new" icon={Plus}>
          New consultation
        </ButtonLink>
      }
      aside={
        <>
          <Panel title="At a glance">
            <dl className="grid grid-cols-3 gap-3 text-center">
              {[
                { n: active.length, l: "Active" },
                { n: waiting, l: "Awaiting payment" },
                { n: closed.length, l: "Closed" },
              ].map((s) => (
                <div
                  key={s.l}
                  className="flex flex-col-reverse rounded-lg bg-cream px-2 py-3"
                >
                  <dt className="text-label-m text-ink-600">{s.l}</dt>
                  <dd className="text-headline-m text-ink-900">{s.n}</dd>
                </div>
              ))}
            </dl>
          </Panel>
          <Panel tone="mint" title="How it works">
            <ol className="flex flex-col gap-2 text-body-m text-brand-900">
              <li>1 · Describe what's wrong by text or a voice note.</li>
              <li>2 · Pay the fee by Mobile Money.</li>
              <li>3 · A doctor replies here. Urgent cases go first.</li>
            </ol>
          </Panel>
          <div className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-[var(--shadow-elev-1)]">
            <p className="flex-1 text-body-m text-ink-900">
              Danger signs? Don't wait for a reply.
            </p>
            <ButtonA href="tel:15" icon={Phone} variant="danger" size="sm">
              Call 15
            </ButtonA>
          </div>
        </>
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title="No consultations yet. A doctor can help by text or voice note."
          action={
            <ButtonLink to="/app/consult/new" trailing="arrow">
              Message a doctor
            </ButtonLink>
          }
        />
      ) : (
        <>
          <motion.div
            variants={popIn}
            className="flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <div className="flex gap-2" role="group" aria-label="Show">
              <Chip
                selected={show === "active"}
                onClick={() => setShow("active")}
              >
                Active · {active.length}
              </Chip>
              <Chip
                selected={show === "closed"}
                onClick={() => setShow("closed")}
              >
                Closed · {closed.length}
              </Chip>
            </div>
            <label className="relative flex-1">
              <span className="sr-only">Search consultations</span>
              <Search
                className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-400"
                aria-hidden
              />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by symptom or person"
                className="h-12 w-full rounded-full border-[1.5px] border-line bg-white pr-4 pl-12 text-body-l transition-shadow focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 focus:outline-none"
              />
            </label>
          </motion.div>
          {shown.length === 0 ? (
            <p className="rounded-xl bg-white/70 px-5 py-8 text-center text-body-m text-ink-600">
              {needle
                ? `Nothing matches “${q.trim()}”.`
                : show === "active"
                  ? "No active consultations."
                  : "No closed consultations yet."}
            </p>
          ) : (
            <motion.ul
              className="flex flex-col gap-3"
              variants={staggerOnMount(0.05)}
            >
              <AnimatePresence initial={false}>
                {shown.map((r) => (
                  <motion.li
                    key={r.key}
                    variants={popIn}
                    layout
                    exit={{ opacity: 0, scale: 0.96 }}
                    whileHover={{ y: -2 }}
                    transition={SPRING.fast}
                  >
                    <Link
                      to={r.href}
                      className="group flex items-center gap-4 rounded-xl bg-white p-4 shadow-[var(--shadow-elev-1)] transition-shadow hover:shadow-[var(--shadow-elev-2)]"
                    >
                      <span
                        className={cn(
                          "flex size-12 shrink-0 items-center justify-center shape-bl transition-[border-radius] group-hover:rounded-full",
                          r.status === "closed"
                            ? "bg-cream text-ink-400"
                            : "bg-mint text-brand-700"
                        )}
                      >
                        <Stethoscope className="size-5" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-title-m">{r.complaint}</p>
                        <p className="mt-0.5 text-body-m text-ink-600">
                          {r.subject} · {formatDateTime(r.created_at)}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "rounded-full px-2.5 py-0.5 text-label-m font-semibold",
                              r.status === "closed"
                                ? "bg-cream text-ink-600"
                                : "bg-mint text-brand-900"
                            )}
                          >
                            {STATUS_LABEL[r.status]}
                          </span>
                          {r.urgency && (
                            <UrgencyBadge urgency={r.urgency} size="sm" />
                          )}
                          {r.sync_state && (
                            <SyncChip state={r.sync_state} refId={r.key} />
                          )}
                        </div>
                      </div>
                      <ChevronRight
                        className="size-5 shrink-0 text-ink-400 transition-transform group-hover:translate-x-0.5"
                        aria-hidden
                      />
                    </Link>
                  </motion.li>
                ))}
              </AnimatePresence>
            </motion.ul>
          )}
        </>
      )}
    </AppPage>
  )
}
