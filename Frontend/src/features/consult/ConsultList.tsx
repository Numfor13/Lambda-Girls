import { Link } from "react-router-dom"
import { useLiveQuery } from "dexie-react-hooks"
import { useQuery } from "@tanstack/react-query"
import { ChevronRight, MessagesSquare } from "lucide-react"
import { consultApi } from "@/api/endpoints"
import type { ConsultationStatus, Urgency } from "@/api/types"
import { ButtonLink } from "@/design/components/Button"
import { EmptyState, PageHeader, PageSpinner } from "@/design/components/primitives"
import { SyncChip } from "@/design/components/SyncChip"
import { UrgencyBadge } from "@/design/components/UrgencyBadge"
import { formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import { db, type SyncState } from "@/offline/db"
import { STATUS_LABEL } from "./actions"

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
  const remote = useQuery({ queryKey: ["consultations"], queryFn: consultApi.list })

  if (local === undefined || (remote.isPending && !local.length)) return <PageSpinner />

  const byServerId = new Map(local.filter((l) => l.consultation_id).map((l) => [l.consultation_id!, l]))
  const rows: Row[] = local.map((l) => {
    const server = remote.data?.consultations.find((c) => c.consultation_id === l.consultation_id)
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

  return (
    <div>
      <PageHeader
        title="My consultations"
        action={
          <ButtonLink to="/app/consult/new" size="sm">
            New
          </ButtonLink>
        }
      />
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
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.key}>
              <Link to={r.href} className="flex items-center gap-3 rounded-[16px] border border-line p-4 hover:bg-cream">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{r.complaint}</p>
                  <p className="mt-0.5 text-sm text-ink-600">
                    {r.subject} · {formatDateTime(r.created_at)}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                        r.status === "closed" ? "bg-cream text-ink-600" : "bg-mint text-brand-900",
                      )}
                    >
                      {STATUS_LABEL[r.status]}
                    </span>
                    {r.urgency && <UrgencyBadge urgency={r.urgency} size="sm" />}
                    {r.sync_state && <SyncChip state={r.sync_state} refId={r.key} />}
                  </div>
                </div>
                <ChevronRight className="size-5 shrink-0 text-ink-400" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
