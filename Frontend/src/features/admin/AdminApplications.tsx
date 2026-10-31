import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useSearchParams } from "react-router-dom"
import {
  ClipboardCheck,
  ExternalLink,
  FileText,
  ShieldCheck,
} from "lucide-react"
import {
  doctorApplicationApi as api,
  APPLICATION_STATUSES,
  CHECKS,
  DOCUMENTS,
  STATUS_LABELS,
  specialtyLabel,
  type ApplicationDetail,
  type ApplicationStatus,
} from "@/api/doctor-applications"
import { env } from "@/config/env"
import { AppPage, Panel } from "@/design/components/AppPage"
import { Button, ButtonA } from "@/design/components/Button"
import { Field, Select, Textarea } from "@/design/components/Field"
import { Feedback, ConfirmAction } from "@/design/components/Feedback"
import { FormGuard } from "@/design/components/FormGuard"
import { CopyReference } from "@/design/components/CopyReference"
import { Skeleton } from "@/design/components/Lively"
import { ServiceError, ServiceStatus } from "@/design/components/ServicePage"
import {
  ListSearch,
  PickHint,
  RecordList,
  UpdatedAt,
} from "@/design/components/Staff"
import { toast } from "@/design/components/Toast"
import { EmptyState } from "@/design/components/primitives"
import { rules, useForm } from "@/lib/form"
import { formatDate } from "@/lib/format"
import { useOnline, useVisible } from "@/lib/hooks"

function Review({
  application: a,
  select,
}: {
  application: ApplicationDetail
  select: (id: string) => void
}) {
  const online = useOnline()
  const qc = useQueryClient()
  const [baseline, setBaseline] = useState({
    notes: a.admin_notes,
    ...a.checks,
    reason: "",
  })
  const form = useForm(baseline, {
    notes: [rules.maxLength(2000)],
    reason: [rules.maxLength(500)],
  })
  const [decision, setDecision] = useState<
    "approve" | "reject" | "resend" | null
  >(null)
  const [reasonError, setReasonError] = useState("")
  const open = a.status === "pending" || a.status === "under_review"
  const checks = Object.fromEntries(
    CHECKS.map((c) => [c.key, form.values[c.key]])
  ) as ApplicationDetail["checks"]
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin-application"] })
    void qc.invalidateQueries({ queryKey: ["admin-applications"] })
  }
  const save = useMutation({
    mutationFn: () =>
      api.adminUpdate(a.application_id, {
        admin_notes: form.values.notes,
        checks,
      }),
    onSuccess: () => {
      setBaseline(form.values)
      toast("Review saved")
      refresh()
    },
    onError: refresh,
  })
  const action = useMutation({
    mutationFn: async (
      kind: "approve" | "reject" | "resend"
    ): Promise<unknown> =>
      kind === "approve"
        ? api.adminApprove(a.application_id)
        : kind === "reject"
          ? api.adminReject(a.application_id, form.values.reason.trim())
          : api.resendInvite(a.application_id),
    onSuccess: (_, kind) => {
      setDecision(null)
      setBaseline(form.values)
      toast(
        kind === "approve"
          ? "Application approved"
          : kind === "reject"
            ? "Application rejected"
            : "Invitation resent"
      )
      refresh()
    },
    onError: refresh,
    retry: false,
  })
  const busy = save.isPending || action.isPending
  const unsavedReview =
    form.values.notes !== baseline.notes ||
    CHECKS.some((c) => form.values[c.key] !== baseline[c.key])
  const registrationInUse = a.duplicates.onmc_number.some(
    (d) => d.status === "approved" || d.status === "approving"
  )
  const canApprove =
    !registrationInUse &&
    online &&
    !busy &&
    !unsavedReview &&
    CHECKS.every((c) => a.checks[c.key]) &&
    (open || a.status === "approving")
  return (
    <>
      <FormGuard
        when={open && form.dirty}
        watchQuery={["selected", "status"]}
      />
      <Panel
        title={a.full_name}
        action={<ServiceStatus>{STATUS_LABELS[a.status]}</ServiceStatus>}
      >
        <p className="text-body-l text-ink-600">
          {specialtyLabel(a.specialty)}
        </p>
        <p className="mt-2 text-code break-all text-ink-600">
          {a.application_id}
        </p>
        <div className="mt-4">
          <CopyReference value={a.application_id} label="Copy application ID" />
        </div>
        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
          {[
            ["Email", a.email],
            ["Phone", a.phone],
            ["ONMC number", a.onmc_number],
            ["Medical school", a.medical_school],
            ["Graduation year", String(a.graduation_year)],
            [
              "Identity document",
              (a.identity_document_type === "cni"
                ? "National identity card"
                : "Passport") +
                " · " +
                a.identity_document_number,
            ],
            ["Submitted", formatDate(a.submitted_at)],
            ...(a.reviewed_at ? [["Reviewed", formatDate(a.reviewed_at)]] : []),
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-label-m text-ink-600">{label}</dt>
              <dd className="mt-1 text-body-l break-words">{value}</dd>
            </div>
          ))}
        </dl>
      </Panel>
      {(a.duplicate_onmc ||
        a.duplicates.onmc_number.length > 0 ||
        a.duplicates.email.length > 0) && (
        <Panel tone="mint" title="Check related applications">
          <p className="text-body-m text-brand-900">
            A shared registration number or email needs review. An already
            approved registration prevents another approval.
          </p>
          {(["onmc_number", "email"] as const).map((k) => (
            <div key={k} className="mt-3">
              <p className="text-label-l">
                {k === "email" ? "Same email" : "Same ONMC number"}
              </p>
              {a.duplicates[k].map((d) => (
                <Button
                  key={d.application_id}
                  variant="ghost"
                  onClick={() => select(d.application_id)}
                  className="max-w-full"
                >
                  <span className="min-w-0 truncate">
                    {d.application_id} · {STATUS_LABELS[d.status]}
                  </span>
                </Button>
              ))}
            </div>
          ))}
        </Panel>
      )}
      <Panel
        title="Credential documents"
        action={<FileText className="size-5 text-brand-700" aria-hidden />}
      >
        {env.useMockApi ? (
          <Feedback>
            Demo documents are not stored. Document viewing is available with
            the connected backend.
          </Feedback>
        ) : (
          <>
            <p className="mb-4 text-body-m text-ink-600">
              Private links expire after five minutes. Refresh the application
              for new links.
            </p>
            <ul className="grid gap-3 sm:grid-cols-2">
              {DOCUMENTS.map((d) => (
                <li key={d.key}>
                  {/^https:\/\//.test(a.document_urls[d.key] ?? "") ? (
                    <ButtonA
                      href={a.document_urls[d.key]!}
                      target="_blank"
                      rel="noopener noreferrer"
                      variant="secondary"
                      icon={ExternalLink}
                      className="h-auto min-h-12 w-full py-3 whitespace-normal"
                    >
                      {d.label}
                    </ButtonA>
                  ) : (
                    <p className="text-body-m text-ink-600">
                      {d.label}: link unavailable
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>
      <Panel title="Verification review">
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            if (form.check()) save.mutate()
          }}
          className="flex flex-col gap-4"
        >
          <fieldset
            disabled={!open || busy || !online}
            className="flex min-w-0 flex-col gap-3"
          >
            <legend className="mb-3 text-body-m text-ink-600">
              Complete each check after reviewing the evidence.
            </legend>
            {CHECKS.map((c) => (
              <label
                key={c.key}
                className="flex min-h-12 items-start gap-3 rounded-lg bg-cream p-3 text-body-m"
              >
                <input
                  type="checkbox"
                  checked={form.values[c.key]}
                  onChange={(e) => form.set(c.key, e.target.checked)}
                  className="mt-1 size-5 shrink-0 accent-brand-700"
                />
                {c.label}
              </label>
            ))}
            <Field
              label="Private review notes"
              error={form.error("notes")}
              count={form.values.notes.length}
              max={2000}
            >
              {(id) => (
                <Textarea
                  id={id}
                  rows={4}
                  maxLength={2000}
                  {...form.bind("notes")}
                />
              )}
            </Field>
          </fieldset>
          {save.isError && <ServiceError error={save.error} />}
          {open && (
            <Button
              type="submit"
              className="self-start"
              disabled={!online || busy}
              loading={save.isPending}
            >
              Save review
            </Button>
          )}
        </form>
      </Panel>
      <Panel title="Decision">
        {a.rejection_reason && <Feedback>{a.rejection_reason}</Feedback>}
        {a.status === "approving" && (
          <Feedback>
            The account is being created. If an earlier attempt was interrupted,
            retry approval to finish it.
          </Feedback>
        )}
        {open && (
          <>
            <p className="mb-4 text-body-m text-ink-600">
              {registrationInUse
                ? "This ONMC number already has an approved application or an account being created. Review the related record."
                : unsavedReview
                  ? "Save your review before approving."
                  : !CHECKS.every((c) => a.checks[c.key])
                    ? "Approval requires all three saved verification checks."
                    : "All checks are saved. Approval creates a Doctor account and emails an invitation."}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                disabled={!canApprove}
                onClick={() => {
                  action.reset()
                  setDecision("approve")
                }}
                icon={ShieldCheck}
              >
                Approve application
              </Button>
              <Button
                variant="secondary"
                disabled={!online || busy}
                onClick={() => {
                  action.reset()
                  setDecision("reject")
                }}
              >
                Reject application
              </Button>
            </div>
          </>
        )}
        {a.status === "approving" && (
          <Button
            className="mt-4"
            disabled={!canApprove}
            onClick={() => {
              action.reset()
              setDecision("approve")
            }}
          >
            Retry approval
          </Button>
        )}
        {a.status === "approved" && (
          <>
            <p className="text-body-m text-ink-600">
              The staff account is ready. You can resend the invitation if the
              doctor has not yet signed in; otherwise they should use password
              reset.
            </p>
            <Button
              className="mt-4"
              variant="secondary"
              disabled={!online || busy}
              onClick={() => {
                action.reset()
                setDecision("resend")
              }}
            >
              Resend invitation
            </Button>
          </>
        )}
        {decision === "reject" && (
          <div className="mt-4">
            <Field
              label="Reason shown to the applicant"
              required
              error={reasonError || form.error("reason")}
              count={form.values.reason.length}
              max={500}
            >
              {(id) => (
                <Textarea
                  id={id}
                  rows={3}
                  required
                  maxLength={500}
                  {...form.bind("reason")}
                  onChange={(e) => {
                    form.set("reason", e.target.value)
                    setReasonError("")
                  }}
                />
              )}
            </Field>
          </div>
        )}
        {decision && (
          <div className="mt-4">
            <ConfirmAction
              title={
                decision === "approve"
                  ? "Create the doctor’s staff account?"
                  : decision === "reject"
                    ? "Reject this application?"
                    : "Send a new invitation?"
              }
              confirmLabel={
                decision === "approve"
                  ? "Approve and invite"
                  : decision === "reject"
                    ? "Confirm rejection"
                    : "Resend invitation"
              }
              loading={action.isPending}
              onCancel={() => {
                setDecision(null)
                action.reset()
              }}
              onConfirm={() => {
                if (!online) return
                if (decision === "approve" && !canApprove) return
                if (
                  decision === "reject" &&
                  (!form.values.reason.trim() ||
                    form.values.reason.trim().length > 500)
                ) {
                  setReasonError("Enter a reason of 1–500 characters.")
                  document
                    .querySelector<HTMLTextAreaElement>('[name="reason"]')
                    ?.focus()
                  return
                }
                action.mutate(decision)
              }}
            >
              {decision === "reject"
                ? "This decision cannot be undone. The applicant can read your reason on their status page."
                : decision === "approve"
                  ? "This creates a staff account and sends the sign-in invitation to " +
                    a.email +
                    ". The decision cannot be undone here."
                  : "A new temporary password will be emailed to " +
                    a.email +
                    "."}
            </ConfirmAction>
          </div>
        )}
        {action.isError && (
          <div className="mt-4">
            <ServiceError error={action.error} />
          </div>
        )}
      </Panel>
    </>
  )
}
export default function AdminApplications() {
  const [params, setParams] = useSearchParams()
  const rawStatus = params.get("status") ?? "pending"
  const status: ApplicationStatus = APPLICATION_STATUSES.includes(
    rawStatus as ApplicationStatus
  )
    ? (rawStatus as ApplicationStatus)
    : "pending"
  const selected = params.get("selected") ?? "",
    search = params.get("q") ?? ""
  const online = useOnline(),
    visible = useVisible()
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next)
  }
  const list = useQuery({
    queryKey: ["admin-applications", status],
    queryFn: () => api.adminList(status),
    refetchInterval: online && visible ? 20_000 : false,
  })
  const detail = useQuery({
    queryKey: ["admin-application", selected],
    queryFn: () => api.adminGet(selected),
    enabled: !!selected,
    retry: false,
    refetchInterval: online && visible ? 20_000 : false,
  })
  const rows = (list.data?.applications ?? []).filter((a) =>
    (a.full_name + " " + a.email + " " + a.onmc_number)
      .toLowerCase()
      .includes(search.toLowerCase())
  )
  return (
    <AppPage
      eyebrow="Administration"
      title="Doctor applications"
      subtitle="Verify professional credentials before inviting a doctor to the care team."
      aside={
        selected ? (
          <>
            <Button variant="secondary" onClick={() => set("selected", "")}>
              Back to applications
            </Button>
            <Panel tone="mint" title="Review checklist">
              <ol className="list-decimal space-y-3 pl-5 text-body-m text-brand-900">
                <li>Compare all five documents.</li>
                <li>Verify registration against the ONMC register.</li>
                <li>Save your notes and all verification checks.</li>
                <li>Approve and invite, or reject with a reason.</li>
              </ol>
            </Panel>
          </>
        ) : (
          <PickHint icon={ClipboardCheck} title="Review an application">
            Select an applicant to inspect credentials, review related
            applications, and record a decision.
          </PickHint>
        )
      }
      actions={
        <UpdatedAt
          updated={selected ? detail.dataUpdatedAt : list.dataUpdatedAt}
          refresh={() => void (selected ? detail.refetch() : list.refetch())}
          loading={selected ? detail.isFetching : list.isFetching}
        />
      }
    >
      {env.useMockApi && (
        <Feedback>
          Demo only. Decisions update sample records; no accounts or invitation
          emails are created.
        </Feedback>
      )}
      {selected ? (
        <>
          {detail.isLoading && <Skeleton className="h-64 rounded-xl" />}
          {detail.isError && (
            <>
              <ServiceError error={detail.error} />
              <Button variant="secondary" onClick={() => void detail.refetch()}>
                Try again
              </Button>
            </>
          )}
          {detail.data && (
            <Review
              key={selected}
              application={detail.data}
              select={(id) => set("selected", id)}
            />
          )}
        </>
      ) : (
        <>
          <Panel>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <Field label="Application status">
                {(id) => (
                  <Select
                    id={id}
                    value={status}
                    onChange={(e) => set("status", e.target.value)}
                  >
                    {APPLICATION_STATUSES.map((s) => (
                      <option value={s} key={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <p className="text-body-m text-ink-600">
                {rows.length} of {list.data?.count ?? 0} applications
              </p>
            </div>
            <div className="mt-4">
              <ListSearch
                value={search}
                onChange={(v) => set("q", v)}
                total={list.data?.count ?? 0}
                placeholder="Search name, email or ONMC number"
              />
            </div>
          </Panel>
          {list.isLoading && <Skeleton className="h-64 rounded-xl" />}
          {list.isError && (
            <>
              <ServiceError error={list.error} />
              <Button variant="secondary" onClick={() => void list.refetch()}>
                Try again
              </Button>
            </>
          )}
          {list.isSuccess && rows.length === 0 && (
            <EmptyState
              icon={FileText}
              title="No applications in this view"
              body="Choose another status or clear the search to see other applications."
              action={
                search ? (
                  <Button variant="secondary" onClick={() => set("q", "")}>
                    Clear search
                  </Button>
                ) : undefined
              }
            />
          )}
          <RecordList
            rows={rows}
            id={(a) => a.application_id}
            selected=""
            onSelect={(a) => set("selected", a.application_id)}
            label="Doctor applications"
            render={(a) => (
              <>
                <span className="block text-title-m">{a.full_name}</span>
                <span className="mt-1 block text-body-m text-ink-600">
                  {specialtyLabel(a.specialty)} · {a.onmc_number}
                </span>
                <span className="mt-1 block text-label-m text-ink-600">
                  Submitted {formatDate(a.submitted_at)}
                  {a.duplicate_onmc ? " · Shared ONMC number" : ""}
                </span>
              </>
            )}
          />
        </>
      )}
    </AppPage>
  )
}
