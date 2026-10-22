import { useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { FileCheck2, Pill } from "lucide-react"
import { doctorApi } from "@/api/endpoints"
import { friendlyError } from "@/api/errors"
import type { Prescription, Referral } from "@/api/types"
import { Card, Notice, PageSpinner } from "@/design/components/primitives"
import { formatDate } from "@/lib/format"
import { useFacility } from "@/offline/facilities"

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-line py-3 last:border-0 sm:flex-row sm:gap-6">
      <dt className="w-40 shrink-0 text-sm text-ink-600">{label}</dt>
      <dd className="text-[15px] font-medium text-ink-900">{children}</dd>
    </div>
  )
}

function StatusPill({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={
        active
          ? "rounded-full bg-urgent-green-50 px-3 py-1 text-xs font-bold text-urgent-green"
          : "rounded-full bg-cream px-3 py-1 text-xs font-bold text-ink-600"
      }
    >
      {label}
    </span>
  )
}

function ReferralTarget({ id }: { id: string }) {
  const facility = useFacility(id)
  return <>{facility?.name ?? id}</>
}

export default function CodeLookup({ kind }: { kind: "rx" | "ref" }) {
  const { code = "" } = useParams()
  const query = useQuery({
    queryKey: ["code-lookup", kind, code],
    queryFn: (): Promise<Prescription | Referral> =>
      kind === "rx" ? doctorApi.prescription(code) : doctorApi.referral(code),
  })

  const Icon = kind === "rx" ? Pill : FileCheck2
  return (
    <div className="container-page max-w-2xl py-12">
      <p className="eyebrow">{kind === "rx" ? "Prescription check" : "Referral check"}</p>
      <h1 className="mt-3 flex items-center gap-3 text-[30px] font-extrabold">
        <Icon className="size-8 text-brand-700" aria-hidden />
        <span className="font-mono tracking-wider">{code}</span>
      </h1>

      {query.isPending && <PageSpinner />}
      {query.isError && (
        <Notice tone="error" className="mt-6">
          {friendlyError(query.error)}
        </Notice>
      )}
      {query.data && (
        <Card className="mt-6 p-5">
          <dl>
            {"medication_details" in query.data ? (
              <>
                <Row label="Status">
                  <StatusPill
                    active={query.data.status === "active"}
                    label={query.data.status === "active" ? "Active" : "Dispensed"}
                  />
                </Row>
                <Row label="Medication">{query.data.medication_details}</Row>
                <Row label="Instructions">{query.data.instructions || "—"}</Row>
                <Row label="Issued">{formatDate(query.data.issued_at)}</Row>
              </>
            ) : (
              <>
                <Row label="Status">
                  <StatusPill
                    active={query.data.status === "active"}
                    label={query.data.status === "active" ? "Active" : "Used"}
                  />
                </Row>
                <Row label="Referred to">
                  <ReferralTarget id={query.data.target_facility_id} />
                </Row>
                <Row label="Reason">{query.data.reason || "—"}</Row>
                <Row label="Issued">{formatDate(query.data.issued_at)}</Row>
              </>
            )}
          </dl>
        </Card>
      )}
    </div>
  )
}
