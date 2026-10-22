import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { ChevronLeft, Phone, FileText, CheckCircle, XCircle } from "lucide-react"
import { doctorApplicationApi } from "@/api/endpoints"
import { SPECIALTIES, type DoctorApplication } from "@/api/types"
import { Button } from "@/design/components/Button"
import { Field } from "@/design/components/Field"
import { Card, Notice, PageSpinner } from "@/design/components/primitives"

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  under_review: "bg-blue-100 text-blue-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  under_review: "Under review",
  approved: "Approved",
  rejected: "Rejected",
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  })
}

// ── Application list ────────────────────────────────────────────────────────
function ApplicationList({
  applications,
  onSelect,
}: {
  applications: DoctorApplication[]
  onSelect: (a: DoctorApplication) => void
}) {
  const [statusFilter, setStatusFilter] = useState("")

  const filtered = statusFilter
    ? applications.filter((a) => a.status === statusFilter)
    : applications

  const specialty = (v: string) =>
    SPECIALTIES.find((s) => s.value === v)?.label ?? v

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-[22px] font-extrabold text-ink-900">Doctor applications</h1>
        <select
          className="rounded-[10px] border border-line bg-white px-3 py-1.5 text-sm text-ink-900"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="mt-10 text-center text-ink-400">No applications found.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((a) => (
            <div
              key={a.application_id}
              role="button"
              tabIndex={0}
              className="cursor-pointer rounded-[16px] border border-line bg-white p-4 hover:bg-cream"
              onClick={() => onSelect(a)}
              onKeyDown={(e) => e.key === "Enter" && onSelect(a)}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink-900">{a.full_name}</p>
                  <p className="text-sm text-ink-600">{specialty(a.specialty)}</p>
                  <p className="mt-1 text-xs text-ink-400">
                    {a.application_id} · Submitted {formatDate(a.submitted_at)}
                  </p>
                  {a.called_hospital && (
                    <span className="mt-1 inline-flex items-center gap-1 text-xs text-green-700">
                      <Phone className="size-3" /> Hospital called
                    </span>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[a.status]}`}
                >
                  {STATUS_LABELS[a.status]}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Application detail + actions ───────────────────────────────────────────
function ApplicationDetail({
  applicationId,
  onBack,
}: {
  applicationId: string
  onBack: () => void
}) {
  const qc = useQueryClient()
  const [rejectReason, setRejectReason] = useState("")
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [actionError, setActionError] = useState("")

  const { data: app, isLoading } = useQuery({
    queryKey: ["admin-application", applicationId],
    queryFn: () => doctorApplicationApi.adminGet(applicationId),
  })

  const approveMut = useMutation({
    mutationFn: () => doctorApplicationApi.adminApprove(applicationId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-applications"] })
      void qc.invalidateQueries({ queryKey: ["admin-application", applicationId] })
    },
    onError: () => setActionError("Approval failed. Please try again."),
  })

  const rejectMut = useMutation({
    mutationFn: () => doctorApplicationApi.adminReject(applicationId, rejectReason),
    onSuccess: () => {
      setShowRejectForm(false)
      void qc.invalidateQueries({ queryKey: ["admin-applications"] })
      void qc.invalidateQueries({ queryKey: ["admin-application", applicationId] })
    },
    onError: () => setActionError("Rejection failed. Please try again."),
  })

  const notesMut = useMutation({
    mutationFn: (body: { admin_notes?: string; called_hospital?: boolean }) =>
      doctorApplicationApi.adminUpdateNotes(applicationId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-application", applicationId] }),
  })

  if (isLoading) return <PageSpinner />
  if (!app) return <Notice tone="error">Application not found.</Notice>

  const specialty = SPECIALTIES.find((s) => s.value === app.specialty)?.label ?? app.specialty
  const isPending = app.status === "pending" || app.status === "under_review"

  return (
    <div className="flex flex-col gap-5">
      <button
        type="button"
        className="flex items-center gap-1 text-sm font-medium text-brand-700"
        onClick={onBack}
      >
        <ChevronLeft className="size-4" /> All applications
      </button>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-ink-900">{app.full_name}</h1>
          <p className="text-sm text-ink-600">{app.application_id}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-medium ${STATUS_COLORS[app.status]}`}>
          {STATUS_LABELS[app.status]}
        </span>
      </div>

      {/* Personal & credential details */}
      <Card className="divide-y divide-line overflow-hidden p-0">
        {[
          ["Email", app.email],
          ["Phone", app.phone],
          ["Specialty", specialty],
          ["Medical school", app.medical_school],
          ["Graduated", String(app.graduation_year)],
          ["Experience", `${app.years_experience} years`],
          ["Submitted", formatDate(app.submitted_at)],
          ...(app.reviewed_at ? [["Reviewed", formatDate(app.reviewed_at)]] : []),
        ].map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-4 px-4 py-3 text-[15px]">
            <span className="text-ink-600">{label}</span>
            <span className="text-right font-medium text-ink-900">{value}</span>
          </div>
        ))}
      </Card>

      {/* Hospitals */}
      <Card className="p-4">
        <p className="mb-2 font-semibold text-ink-900">Hospitals worked at</p>
        <ul className="space-y-1 text-sm text-ink-600">
          {(app.hospitals_worked ?? []).map((h, i) => (
            <li key={i}>
              <span className="font-medium text-ink-900">{h.name}</span> — {h.role}, {h.city} (
              {h.from_year}–{h.to_year ?? "present"})
            </li>
          ))}
        </ul>
      </Card>

      {/* Recommending hospital */}
      <Card className="p-4">
        <p className="mb-2 font-semibold text-ink-900">Recommending hospital</p>
        <div className="space-y-1 text-sm text-ink-600">
          <p className="font-medium text-ink-900">{app.recommending_hospital?.name}</p>
          <p>{app.recommending_hospital?.contact_person}</p>
          <a
            href={`tel:${app.recommending_hospital?.phone}`}
            className="flex items-center gap-1 font-medium text-brand-700"
          >
            <Phone className="size-4" /> {app.recommending_hospital?.phone}
          </a>
          {app.recommending_hospital?.email && (
            <p>{app.recommending_hospital.email}</p>
          )}
        </div>
      </Card>

      {/* Recommendation letter */}
      {app.document_url && (
        <a
          href={app.document_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-[12px] border border-line bg-white px-4 py-3 text-sm font-medium text-brand-700 hover:bg-cream"
        >
          <FileText className="size-5" /> View recommendation letter
        </a>
      )}

      {/* Admin notes & called-hospital toggle */}
      <Card className="p-4">
        <p className="mb-3 font-semibold text-ink-900">Admin notes</p>
        <label className="mb-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={app.called_hospital ?? false}
            onChange={(e) =>
              notesMut.mutate({ called_hospital: e.target.checked })
            }
          />
          Hospital call completed
        </label>
        <Field label="">
          {(id) => (
            <textarea
              id={id}
              rows={3}
              defaultValue={app.admin_notes ?? ""}
              className="w-full rounded-[10px] border border-line bg-white px-3 py-2 text-sm text-ink-900 focus:border-brand-400 focus:outline-none"
              placeholder="Notes from the hospital call, verification outcome…"
              onBlur={(e) => notesMut.mutate({ admin_notes: e.target.value })}
            />
          )}
        </Field>
      </Card>

      {/* Action buttons */}
      {isPending && (
        <div className="flex flex-col gap-3">
          {actionError && <Notice tone="error">{actionError}</Notice>}

          {showRejectForm ? (
            <Card className="p-4">
              <p className="mb-2 font-semibold text-ink-900">Rejection reason</p>
              <textarea
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="mb-3 w-full rounded-[10px] border border-line bg-white px-3 py-2 text-sm text-ink-900 focus:border-red-400 focus:outline-none"
                placeholder="Explain why the application is not approved (this will be shown to the applicant)…"
              />
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowRejectForm(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="bg-red-600 hover:bg-red-700"
                  loading={rejectMut.isPending}
                  disabled={!rejectReason.trim()}
                  onClick={() => rejectMut.mutate()}
                >
                  <XCircle className="size-4" /> Confirm rejection
                </Button>
              </div>
            </Card>
          ) : (
            <div className="flex gap-3">
              <Button
                variant="secondary"
                className="flex-1 border-red-300 text-red-700 hover:bg-red-50"
                onClick={() => { setActionError(""); setShowRejectForm(true) }}
              >
                <XCircle className="size-4" /> Reject
              </Button>
              <Button
                className="flex-1 bg-green-700 hover:bg-green-800"
                loading={approveMut.isPending}
                onClick={() => { setActionError(""); approveMut.mutate() }}
              >
                <CheckCircle className="size-4" /> Approve & create account
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Page entry point ────────────────────────────────────────────────────────
export default function AdminApplications() {
  const [selected, setSelected] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-applications"],
    queryFn: () => doctorApplicationApi.adminList(),
  })

  if (isLoading) return <PageSpinner />
  if (error) return <Notice tone="error">Failed to load applications.</Notice>

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      {selected ? (
        <ApplicationDetail applicationId={selected} onBack={() => setSelected(null)} />
      ) : (
        <ApplicationList
          applications={data?.applications ?? []}
          onSelect={(a) => setSelected(a.application_id)}
        />
      )}
    </div>
  )
}
