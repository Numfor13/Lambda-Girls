import { useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { motion } from "motion/react"
import { Check, FileCheck2, Pill, RefreshCw } from "lucide-react"
import { doctorApi } from "@/api/endpoints"
import { friendlyError } from "@/api/errors"
import type { Prescription, Referral } from "@/api/types"
import { Button, ButtonLink } from "@/design/components/Button"
import { Feedback } from "@/design/components/Feedback"
import { Landscape } from "@/design/components/Landscape"
import { Card, PageSpinner } from "@/design/components/primitives"
import { popIn, staggerOnMount } from "@/design/motion"
import { formatDate } from "@/lib/format"
import { useFacility } from "@/offline/facilities"

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="grid min-w-0 gap-2 border-b border-line py-4 last:border-0 sm:grid-cols-[1fr_2fr]">
      <dt className="text-label-l text-ink-600">{label}</dt>
      <dd className="min-w-0 text-body-l break-words whitespace-pre-wrap">
        {children}
      </dd>
    </div>
  )
}
function ReferralTarget({ id }: { id: string }) {
  const facility = useFacility(id)
  return (
    <>
      {facility?.name ??
        "Facility details unavailable. Ask the referring doctor to confirm the destination."}
    </>
  )
}
export default function CodeLookup({ kind }: { kind: "rx" | "ref" }) {
  const { code = "" } = useParams()
  const valid = /^[a-zA-Z0-9]{8}$/.test(code)
  const query = useQuery({
    queryKey: ["code-lookup", kind, code],
    enabled: valid,
    queryFn: (): Promise<Prescription | Referral> =>
      kind === "rx" ? doctorApi.prescription(code) : doctorApi.referral(code),
    retry: false,
  })
  const Icon = kind === "rx" ? Pill : FileCheck2
  const data = query.data
  return (
    <motion.div
      variants={staggerOnMount()}
      initial="hidden"
      animate="show"
      className="container-page flex max-w-3xl flex-col gap-5 py-14"
    >
      <motion.header
        variants={popIn}
        className="relative isolate overflow-hidden rounded-xl p-5 lg:p-8"
      >
        <Landscape className="-z-10" preserve="xMidYMid slice" />
        <div className="flex flex-col items-start gap-4 shape-bl p-5 glass-strong">
          <Icon className="size-8 text-brand-700" aria-hidden />
          <p className="eyebrow">
            {kind === "rx" ? "Prescription check" : "Referral check"}
          </p>
          <h1 className="text-headline-l">
            {kind === "rx" ? "Prescription details" : "Referral details"}
          </h1>
          <p
            className="max-w-full rounded-md bg-mint px-4 py-3 text-headline-m font-mono break-all text-brand-900"
            aria-label={`Code ${code}`}
          >
            {code}
          </p>
        </div>
      </motion.header>
      {!valid ? (
        <Feedback error>
          This code must contain 8 letters or numbers. Check the code you were
          given.
        </Feedback>
      ) : query.isPending ? (
        <PageSpinner />
      ) : query.isError ? (
        <Feedback error>
          <p>{friendlyError(query.error)}</p>
          <Button
            className="mt-3"
            variant="secondary"
            icon={RefreshCw}
            size="sm"
            onClick={() => void query.refetch()}
          >
            Try again
          </Button>
        </Feedback>
      ) : null}
      {data && (
        <motion.section variants={popIn}>
          <Card className="rounded-xl p-5 sm:p-8">
            <h2 className="mb-2 text-title-l">
              {kind === "rx"
                ? "For the pharmacy"
                : "For the receiving facility"}
            </h2>
            <dl>
              <Row label="Status">
                <span className="inline-flex items-center gap-2 rounded-full bg-mint px-4 py-2 text-label-l text-brand-900">
                  <Check className="size-4" aria-hidden />
                  {data.status === "active"
                    ? "Active"
                    : data.status === "dispensed"
                      ? "Dispensed"
                      : "Used"}
                </span>
              </Row>
              {"medication_details" in data ? (
                <>
                  <Row label="Medication and dose">
                    {data.medication_details}
                  </Row>
                  <Row label="Instructions">
                    {data.instructions ||
                      "No additional instructions recorded."}
                  </Row>
                </>
              ) : (
                <>
                  <Row label="Referred to">
                    <ReferralTarget id={data.target_facility_id} />
                  </Row>
                  <Row label="Reason">
                    {data.reason || "No reason recorded."}
                  </Row>
                </>
              )}
              <Row label="Issued">{formatDate(data.issued_at)}</Row>
            </dl>
          </Card>
        </motion.section>
      )}
      <p className="text-body-m text-ink-600">
        Show this code to the pharmacy or facility. Contact the issuing doctor
        if the details need clarification.
      </p>
      <ButtonLink
        to="/app/facilities"
        variant="secondary"
        className="self-start"
        trailing="arrow"
      >
        Find a facility
      </ButtonLink>
    </motion.div>
  )
}
