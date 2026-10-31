import { useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { ShieldCheck } from "lucide-react"
import {
  doctorApplicationApi as api,
  applicationIdValid,
  STATUS_LABELS,
} from "@/api/doctor-applications"
import { AppPage, Panel } from "@/design/components/AppPage"
import { Button, ButtonLink } from "@/design/components/Button"
import { Field, Input } from "@/design/components/Field"
import { CopyReference } from "@/design/components/CopyReference"
import { Feedback } from "@/design/components/Feedback"
import { Skeleton, StepTrack } from "@/design/components/Lively"
import { ServiceError } from "@/design/components/ServicePage"
import { UpdatedAt } from "@/design/components/Staff"
import { rules, useForm } from "@/lib/form"
import { formatDate } from "@/lib/format"
import { useOnline, useVisible } from "@/lib/hooks"

export default function ApplicationStatus() {
  const [params, setParams] = useSearchParams()
  const reference = params.get("ref")?.trim().toLowerCase() ?? ""
  const form = useForm(
    { reference },
    {
      reference: [
        rules.required(),
        (v) =>
          applicationIdValid(String(v).trim())
            ? undefined
            : "Enter the full application ID, including hyphens.",
      ],
    }
  )
  const online = useOnline(),
    visible = useVisible()
  const [copiedLink, setCopiedLink] = useState(false)
  const query = useQuery({
    queryKey: ["public-application-status", reference],
    queryFn: () => api.getStatus(reference),
    enabled: applicationIdValid(reference),
    retry: false,
    refetchInterval: (q) =>
      visible &&
      online &&
      ["pending", "under_review", "approving"].includes(
        q.state.data?.status ?? ""
      )
        ? 20_000
        : false,
  })
  const a = query.data
  const steps = ["Received", "Review", "Staff account"]
  const at =
    a?.status === "pending"
      ? 0
      : a?.status === "under_review" || a?.status === "rejected"
        ? 1
        : 2
  return (
    <section className="container-page py-6 lg:py-10 short:py-5">
      <AppPage
        eyebrow="Doctor applications"
        title="Check your application"
        subtitle="Use the application ID from your submission. No sign-in needed."
        aside={
          <>
            <Panel tone="mint" title="Keep your ID private">
              <ShieldCheck className="mb-3 size-8 text-brand-700" aria-hidden />
              <p className="text-body-m text-brand-900">
                Anyone with this ID can view your status and any rejection
                reason. Your identity documents and personal details are visible
                only to administrators.
              </p>
            </Panel>
            <Panel title="Joining CareBridge">
              <div className="flex flex-col items-start gap-3">
                <ButtonLink to="/apply/doctor" variant="secondary">
                  Start an application
                </ButtonLink>
                <ButtonLink to="/staff/sign-in" variant="ghost">
                  Staff sign in
                </ButtonLink>
              </div>
            </Panel>
          </>
        }
      >
        <Panel title="Application ID">
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (form.check()) {
                const next = form.values.reference.trim().toLowerCase()
                if (next === reference) void query.refetch()
                else setParams({ ref: next })
                setCopiedLink(false)
              }
            }}
          >
            <Field
              label="Application ID"
              required
              error={form.error("reference")}
              hint="A full ID such as 12345678-1234-1234-1234-123456789abc."
            >
              {(id) => (
                <Input
                  id={id}
                  required
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={36}
                  {...form.bind("reference")}
                />
              )}
            </Field>
            <Button
              type="submit"
              className="self-start"
              loading={query.isFetching}
              disabled={!online}
            >
              Check status
            </Button>
          </form>
        </Panel>
        {reference && !applicationIdValid(reference) && (
          <Feedback error>
            The link has an incomplete application ID. Enter the full ID above.
          </Feedback>
        )}
        {query.isLoading && <Skeleton className="h-52 rounded-xl" />}
        {query.isError && (
          <>
            <ServiceError error={query.error} />
            <Button variant="secondary" onClick={() => void query.refetch()}>
              Try again
            </Button>
          </>
        )}
        {a && (
          <Panel
            title={STATUS_LABELS[a.status]}
            action={
              <UpdatedAt
                updated={query.dataUpdatedAt}
                refresh={() => void query.refetch()}
                loading={query.isFetching}
              />
            }
          >
            <StepTrack steps={steps} at={at} label="Application progress" />
            <p className="mt-5 text-body-l text-ink-900">
              {
                {
                  pending:
                    "Your application has been received and is waiting for review.",
                  under_review:
                    "Your professional registration and documents are being checked.",
                  approving:
                    "Your review is complete and your staff account is being created. Check back shortly.",
                  approved:
                    "Your application is approved. Check your email for the staff invitation. At first sign-in, change your temporary password and set up an authenticator app.",
                  rejected:
                    "Your application was not approved. The reviewer’s reason is shown below.",
                }[a.status]
              }
            </p>
            {a.rejection_reason && (
              <Feedback className="mt-4">{a.rejection_reason}</Feedback>
            )}
            <dl className="mt-5 space-y-3 text-body-m">
              <div>
                <dt className="text-ink-600">Application ID</dt>
                <dd className="mt-1 text-code break-all">{a.application_id}</dd>
              </div>
              <div>
                <dt className="text-ink-600">Submitted</dt>
                <dd>{formatDate(a.submitted_at)}</dd>
              </div>
              {a.reviewed_at && (
                <div>
                  <dt className="text-ink-600">Reviewed</dt>
                  <dd>{formatDate(a.reviewed_at)}</dd>
                </div>
              )}
            </dl>
            <div className="mt-5 flex flex-wrap gap-3">
              <CopyReference
                value={a.application_id}
                label="Copy application ID"
              />
              <Button
                variant="secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(window.location.href)
                    setCopiedLink(true)
                  } catch {
                    setCopiedLink(false)
                  }
                }}
              >
                {copiedLink ? "Link copied" : "Copy status link"}
              </Button>
              {a.status === "approved" && (
                <ButtonLink to="/staff/sign-in">Staff sign in</ButtonLink>
              )}
            </div>
          </Panel>
        )}
        {!online && (
          <Feedback>
            You are offline. Reconnect to check for a review update.
          </Feedback>
        )}
      </AppPage>
    </section>
  )
}
