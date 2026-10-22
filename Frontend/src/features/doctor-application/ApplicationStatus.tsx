import { useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { CheckCircle, Clock, XCircle, Search } from "lucide-react"
import { doctorApplicationApi } from "@/api/endpoints"
import { SPECIALTIES } from "@/api/types"
import { Button } from "@/design/components/Button"
import { Field, Input } from "@/design/components/Field"
import { Card, Notice, PageSpinner } from "@/design/components/primitives"

type StatusRecord = {
  application_id: string
  full_name: string
  specialty: string
  status: "pending" | "under_review" | "approved" | "rejected"
  submitted_at: string
  reviewed_at?: string | null
  rejection_reason?: string
}

const STATUS_META = {
  pending: {
    icon: Clock,
    color: "text-amber-600",
    bg: "bg-amber-50",
    label: "Pending review",
    message: "Your application has been received. Our team will review your credentials shortly.",
  },
  under_review: {
    icon: Search,
    color: "text-blue-600",
    bg: "bg-blue-50",
    label: "Under review",
    message: "We are currently verifying your credentials. We may contact the hospital you listed for a reference check.",
  },
  approved: {
    icon: CheckCircle,
    color: "text-green-600",
    bg: "bg-green-50",
    label: "Approved",
    message: "Congratulations! Your application has been approved. Check your email for sign-in instructions.",
  },
  rejected: {
    icon: XCircle,
    color: "text-red-600",
    bg: "bg-red-50",
    label: "Not approved",
    message: "Your application was not approved.",
  },
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  })
}

export default function ApplicationStatus() {
  const [params, setParams] = useSearchParams()
  const [refInput, setRefInput] = useState(params.get("ref") ?? "")
  const [loading, setLoading] = useState(false)
  const [record, setRecord] = useState<StatusRecord | null>(null)
  const [error, setError] = useState("")

  const lookup = async (ref: string) => {
    if (!ref.trim()) return
    setLoading(true)
    setError("")
    setRecord(null)
    try {
      const data = await doctorApplicationApi.getStatus(ref.trim().toUpperCase())
      setRecord(data as unknown as StatusRecord)
      setParams({ ref: ref.trim().toUpperCase() })
    } catch {
      setError("Application not found. Double-check your reference number.")
    } finally {
      setLoading(false)
    }
  }

  // Auto-lookup if ref is in URL
  useEffect(() => {
    const ref = params.get("ref")
    if (ref) void lookup(ref)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const specialty = record
    ? (SPECIALTIES.find((s) => s.value === record.specialty)?.label ?? record.specialty)
    : ""

  const meta = record ? STATUS_META[record.status] : null

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="mb-1 text-[24px] font-extrabold text-ink-900">Check application status</h1>
      <p className="mb-6 text-[15px] text-ink-600">
        Enter the reference number you received after submitting your application.
      </p>

      <div className="flex gap-2">
        <div className="flex-1">
        <Field label="">
          {(id) => (
            <Input
              id={id}
              value={refInput}
              onChange={(e) => setRefInput(e.target.value.toUpperCase())}
              placeholder="APP-XXXXXXXX"
              onKeyDown={(e) => e.key === "Enter" && void lookup(refInput)}
            />
          )}
        </Field>
        </div>
        <Button
          className="mt-6 shrink-0"
          loading={loading}
          onClick={() => void lookup(refInput)}
        >
          Look up
        </Button>
      </div>

      {loading && <PageSpinner />}
      {error && <Notice tone="error" className="mt-4">{error}</Notice>}

      {record && meta && (
        <Card className="mt-6 overflow-hidden p-0">
          <div className={`flex items-center gap-3 p-4 ${meta.bg}`}>
            <meta.icon className={`size-6 ${meta.color}`} />
            <div>
              <p className={`font-semibold ${meta.color}`}>{meta.label}</p>
              <p className="text-sm text-ink-600">{meta.message}</p>
            </div>
          </div>
          <div className="divide-y divide-line">
            {[
              ["Reference", record.application_id],
              ["Name", record.full_name],
              ["Specialty", specialty],
              ["Submitted", formatDate(record.submitted_at)],
              ...(record.reviewed_at ? [["Reviewed", formatDate(record.reviewed_at)]] : []),
            ].map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-4 px-4 py-3 text-[15px]">
                <span className="text-ink-600">{label}</span>
                <span className="text-right font-medium text-ink-900">{value}</span>
              </div>
            ))}
            {record.status === "rejected" && record.rejection_reason && (
              <div className="px-4 py-3">
                <p className="text-sm text-ink-600">Reason</p>
                <p className="mt-1 text-[15px] text-ink-900">{record.rejection_reason}</p>
              </div>
            )}
          </div>
        </Card>
      )}

      <p className="mt-8 text-center text-sm text-ink-600">
        Haven&apos;t applied yet?{" "}
        <Link to="/apply/doctor" className="font-semibold text-brand-700 hover:underline">
          Submit an application
        </Link>
      </p>
    </div>
  )
}
