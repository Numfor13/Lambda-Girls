import { useRef, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { ClipboardCheck, FileCheck2, ShieldCheck } from "lucide-react"
import {
  doctorApplicationApi as api,
  DOCUMENTS,
  documentError,
  type DocumentType,
  type UploadReservation,
  type ApplicationFields,
} from "@/api/doctor-applications"
import { SPECIALTIES } from "@/api/types"
import { env } from "@/config/env"
import { AppPage, Panel } from "@/design/components/AppPage"
import { Button, ButtonLink } from "@/design/components/Button"
import { Field, Input, Select } from "@/design/components/Field"
import { Feedback } from "@/design/components/Feedback"
import { FormGuard } from "@/design/components/FormGuard"
import { CopyReference } from "@/design/components/CopyReference"
import { StepTrack } from "@/design/components/Lively"
import { ServiceError } from "@/design/components/ServicePage"
import { normalisePhone, rules, useForm } from "@/lib/form"
import { useOnline } from "@/lib/hooks"

const initial = {
  full_name: "",
  email: "",
  phone: "",
  specialty: "",
  medical_school: "",
  graduation_year: "",
  onmc_number: "",
  identity_document_type: "",
  identity_document_number: "",
}
type Values = typeof initial
const YEAR = new Date().getFullYear()
function onmcError(v: unknown) {
  const m = String(v)
    .trim()
    .toUpperCase()
    .match(/^[A-Z0-9]{1,8}\/(\d{4})$/)
  return m && +m[1] >= 1950 && +m[1] <= YEAR
    ? undefined
    : "Use registration number / year of inscription, for example 12345/2019."
}
export default function DoctorApplicationForm() {
  const online = useOnline()
  const [step, setStep] = useState(0)
  const [files, setFiles] = useState<Partial<Record<DocumentType, File>>>({})
  const [fileErrors, setFileErrors] = useState<
    Partial<Record<DocumentType, string>>
  >({})
  const [progress, setProgress] = useState("")
  const [submittedId, setSubmittedId] = useState("")
  const [reserved, setReserved] = useState<{
    reservation: UploadReservation
    until: number
  } | null>(null)
  const uploaded = useRef(new Set<DocumentType>())
  const fileRefs = useRef<
    Partial<Record<DocumentType, HTMLInputElement | null>>
  >({})
  const form = useForm(initial, {
    full_name: [rules.required(), rules.maxLength(120)],
    email: [
      rules.required(),
      rules.maxLength(254),
      (v) =>
        /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(v).trim())
          ? undefined
          : "Enter a valid email address.",
    ],
    phone: [
      rules.required(),
      (v) =>
        /^\+\d{8,15}$/.test(normalisePhone(String(v)))
          ? undefined
          : "Use an international phone number, for example +237677000000.",
    ],
    specialty: [
      (v) =>
        SPECIALTIES.some((x) => x.value === v)
          ? undefined
          : "Choose a specialty.",
    ],
    medical_school: [rules.required(), rules.maxLength(200)],
    graduation_year: [rules.required(), rules.intRange(1950, YEAR)],
    onmc_number: [rules.required(), onmcError],
    identity_document_type: [
      (v) =>
        ["cni", "passport"].includes(String(v))
          ? undefined
          : "Choose national identity card or passport.",
    ],
    identity_document_number: [rules.required(), rules.maxLength(40)],
  })
  const fields: {
    key: keyof Values
    label: string
    type?: string
    max?: number
    hint?: string
  }[] = [
    { key: "full_name", label: "Full name", max: 120 },
    {
      key: "email",
      label: "Email address",
      type: "email",
      max: 254,
      hint: "Your staff invitation goes to this address if approved.",
    },
    { key: "phone", label: "Phone number", type: "tel", max: 24 },
    { key: "specialty", label: "Specialty" },
    { key: "medical_school", label: "Medical school", max: 200 },
    { key: "graduation_year", label: "Graduation year", type: "number" },
    {
      key: "onmc_number",
      label: "ONMC registration number",
      max: 13,
      hint: "Your permanent registration number and year of first inscription.",
    },
    { key: "identity_document_type", label: "Identity document type" },
    {
      key: "identity_document_number",
      label: "Identity document number",
      max: 40,
    },
  ]
  const checkFiles = () => {
    const errors: Partial<Record<DocumentType, string>> = {}
    for (const d of DOCUMENTS)
      errors[d.key] = files[d.key]
        ? documentError(files[d.key]!, d.key)
        : "Choose this required document."
    setFileErrors(errors)
    const first = DOCUMENTS.find((d) => errors[d.key])
    if (first) fileRefs.current[first.key]?.focus()
    return !first
  }
  const send = useMutation({
    mutationFn: async () => {
      let reservation =
        reserved && reserved.until > Date.now() ? reserved.reservation : null
      if (!reservation) {
        setProgress("Preparing secure uploads…")
        reservation = await api.reserve(
          Object.fromEntries(
            DOCUMENTS.map((d) => [d.key, files[d.key]!.type])
          ) as Record<DocumentType, string>
        )
        uploaded.current.clear()
        setReserved({
          reservation,
          until: Date.now() + reservation.expires_in * 1000,
        })
      }
      for (const d of DOCUMENTS) {
        if (uploaded.current.has(d.key)) continue
        setProgress("Uploading: " + d.label)
        const { uploadApplicationDocument } =
          await import("@/api/doctor-applications")
        await uploadApplicationDocument(reservation, d.key, files[d.key]!)
        uploaded.current.add(d.key)
      }
      setProgress("Submitting application…")
      const v = form.values
      const body: ApplicationFields & { application_id: string } = {
        ...v,
        full_name: v.full_name.trim(),
        email: v.email.trim().toLowerCase(),
        phone: normalisePhone(v.phone),
        specialty: v.specialty as ApplicationFields["specialty"],
        graduation_year: Number(v.graduation_year),
        onmc_number: v.onmc_number.trim().toUpperCase(),
        identity_document_type: v.identity_document_type as "cni" | "passport",
        application_id: reservation.application_id,
      }
      try {
        return await api.submit(body)
      } catch (error) {
        // A lost response must not start a second application with a fresh ID.
        const found = await api
          .getStatus(reservation.application_id)
          .catch(() => null)
        if (found) return found
        throw error
      }
    },
    onSuccess: (result) => {
      setSubmittedId(result.application_id)
      setFiles({})
      uploaded.current.clear()
      setProgress("")
    },
    onSettled: () => setProgress(""),
    retry: false,
  })
  const next = () => {
    if (step === 0 && !form.check()) return
    if (step === 1 && !checkFiles()) return
    setStep((s) => s + 1)
  }
  const aside = (
    <>
      <Panel tone="mint" title="Before you apply">
        <ShieldCheck className="mb-3 size-8 text-brand-700" aria-hidden />
        <p className="text-body-l text-brand-900">
          Your credentials are reviewed before a staff account is created.
        </p>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-body-m text-ink-600">
          <li>Have all five documents ready. Each must be 5 MB or less.</li>
          <li>Use clear scans or photos with all details readable.</li>
          <li>Keep your application ID to check the outcome.</li>
        </ul>
      </Panel>
      <Panel title="Already applied?">
        <p className="mb-4 text-body-m text-ink-600">
          Check your status using the application ID you received.
        </p>
        <ButtonLink variant="secondary" to="/apply/status">
          Check status
        </ButtonLink>
        <p className="mt-4 text-body-m text-ink-600">Already approved?</p>
        <ButtonLink variant="ghost" to="/staff/sign-in">
          Staff sign in
        </ButtonLink>
      </Panel>
    </>
  )
  return (
    <section className="container-page py-6 lg:py-10 short:py-5">
      <AppPage
        eyebrow="Join the care team"
        title={submittedId ? "Application received" : "Apply as a doctor"}
        subtitle={
          submittedId
            ? "Keep this ID. You will need it to check your status."
            : "Your professional details, supporting documents, then a final review."
        }
        aside={aside}
        actions={
          !submittedId && (
            <Button
              form="doctor-application"
              type="submit"
              loading={send.isPending}
              disabled={step === 2 && !online}
            >
              {step === 2 ? "Send for review" : "Continue"}
            </Button>
          )
        }
      >
        {env.useMockApi && (
          <Feedback>
            Demo only. No documents are uploaded, no staff account is created
            and no invitation email is sent. Use fictional details.
          </Feedback>
        )}
        {submittedId ? (
          <Panel title="Your application ID">
            <ClipboardCheck
              className="mb-4 size-10 text-brand-700"
              aria-hidden
            />
            <p className="text-code break-all text-brand-900">{submittedId}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <CopyReference value={submittedId} label="Copy application ID" />
              <ButtonLink to={"/apply/status?ref=" + submittedId}>
                View status
              </ButtonLink>
            </div>
          </Panel>
        ) : (
          <>
            <FormGuard when={form.dirty || Object.keys(files).length > 0} />
            <Panel>
              <StepTrack
                steps={["Details", "Documents", "Review"]}
                at={step}
                label="Application progress"
              />
              <p className="mt-3 text-label-l text-ink-600">
                Step {step + 1} of 3
              </p>
            </Panel>
            <form
              id="doctor-application"
              noValidate
              onSubmit={(e) => {
                e.preventDefault()
                if (step < 2) next()
                else if (form.check() && checkFiles()) send.mutate()
              }}
              className="flex flex-col gap-5"
            >
              <fieldset disabled={send.isPending} className="min-w-0">
                {step === 0 && (
                  <Panel title="Professional details">
                    <div className="grid gap-5 sm:grid-cols-2">
                      {fields.map((f) => (
                        <Field
                          key={f.key}
                          label={f.label}
                          hint={f.hint}
                          required
                          error={form.error(f.key)}
                          count={f.max ? form.values[f.key].length : undefined}
                          max={f.max}
                        >
                          {(id) =>
                            f.key === "specialty" ||
                            f.key === "identity_document_type" ? (
                              <Select id={id} required {...form.bind(f.key)}>
                                <option value="">Choose…</option>
                                {f.key === "specialty" ? (
                                  SPECIALTIES.map((s) => (
                                    <option key={s.value} value={s.value}>
                                      {s.label}
                                    </option>
                                  ))
                                ) : (
                                  <>
                                    <option value="cni">
                                      National identity card
                                    </option>
                                    <option value="passport">Passport</option>
                                  </>
                                )}
                              </Select>
                            ) : (
                              <Input
                                id={id}
                                type={f.type ?? "text"}
                                maxLength={f.max}
                                min={f.type === "number" ? 1950 : undefined}
                                max={f.type === "number" ? YEAR : undefined}
                                required
                                autoComplete={
                                  f.key === "full_name"
                                    ? "name"
                                    : f.key === "email"
                                      ? "email"
                                      : f.key === "phone"
                                        ? "tel"
                                        : "off"
                                }
                                {...form.bind(f.key)}
                              />
                            )
                          }
                        </Field>
                      ))}
                    </div>
                  </Panel>
                )}
                {step === 1 && (
                  <Panel title="Supporting documents">
                    <p className="mb-5 text-body-m text-ink-600">
                      PDF, JPG or PNG, up to 5 MB each. The photo of you holding
                      your documents must be JPG or PNG. Files stay selected on
                      this page only; leaving clears your work.
                    </p>
                    <div className="flex flex-col gap-5">
                      {DOCUMENTS.map((d) => (
                        <Field
                          key={d.key}
                          label={d.label}
                          required
                          error={fileErrors[d.key]}
                          hint={
                            files[d.key]
                              ? files[d.key]!.name +
                                " · " +
                                Math.ceil(files[d.key]!.size / 1024) +
                                " KB"
                              : undefined
                          }
                        >
                          {(id) => (
                            <Input
                              id={id}
                              type="file"
                              required
                              {...{
                                ref: (el: HTMLInputElement | null) => {
                                  fileRefs.current[d.key] = el
                                },
                              }}
                              accept={
                                d.key === "selfie_with_ids"
                                  ? "image/jpeg,image/png"
                                  : "application/pdf,image/jpeg,image/png"
                              }
                              aria-invalid={!!fileErrors[d.key] || undefined}
                              onChange={(e) => {
                                const file = e.target.files?.[0]
                                setFiles((prev) => ({ ...prev, [d.key]: file }))
                                setFileErrors((prev) => ({
                                  ...prev,
                                  [d.key]: file
                                    ? documentError(file, d.key)
                                    : "Choose this required document.",
                                }))
                                setReserved(null)
                                uploaded.current.clear()
                                send.reset()
                              }}
                            />
                          )}
                        </Field>
                      ))}
                    </div>
                  </Panel>
                )}
                {step === 2 && (
                  <>
                    <Panel title="Check your details">
                      <dl className="divide-y divide-line">
                        {fields.map((f) => (
                          <div
                            key={f.key}
                            className="grid gap-1 py-3 sm:grid-cols-2"
                          >
                            <dt className="text-body-m text-ink-600">
                              {f.label}
                            </dt>
                            <dd className="text-body-l break-words text-ink-900">
                              {f.key === "specialty"
                                ? SPECIALTIES.find(
                                    (s) => s.value === form.values.specialty
                                  )?.label
                                : f.key === "phone"
                                  ? normalisePhone(form.values.phone)
                                  : f.key === "identity_document_type"
                                    ? form.values[f.key] === "cni"
                                      ? "National identity card"
                                      : "Passport"
                                    : form.values[f.key]}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </Panel>
                    <Panel title="Documents ready">
                      <ul className="space-y-3">
                        {DOCUMENTS.map((d) => (
                          <li key={d.key} className="flex gap-3 text-body-m">
                            <FileCheck2
                              className="size-5 shrink-0 text-brand-700"
                              aria-hidden
                            />
                            <span className="min-w-0 break-words">
                              {d.label}
                              <span className="block text-ink-600">
                                {files[d.key]?.name}
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-5 text-body-m text-ink-600">
                        Submitting sends your identity and professional
                        documents to CareBridge for credential review. Rejected
                        application documents are scheduled for deletion after
                        90 days. Review the details before sending.
                      </p>
                    </Panel>
                  </>
                )}
              </fieldset>
              {send.isError && <ServiceError error={send.error} />}
              {reserved && send.isError && (
                <ButtonLink
                  variant="secondary"
                  to={
                    "/apply/status?ref=" + reserved.reservation.application_id
                  }
                >
                  Check whether submission arrived
                </ButtonLink>
              )}
              {progress && (
                <p role="status" className="text-body-m text-brand-900">
                  {progress}
                </p>
              )}
              {!online && (
                <Feedback>
                  Reconnect to upload documents and submit. Keep this page open
                  to retain your entries.
                </Feedback>
              )}
              <div className="flex flex-wrap justify-between gap-3">
                {step > 0 ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={send.isPending}
                    onClick={() => {
                      send.reset()
                      setStep((s) => s - 1)
                    }}
                  >
                    Back
                  </Button>
                ) : (
                  <span />
                )}
                <Button
                  type="submit"
                  loading={send.isPending}
                  disabled={step === 2 && !online}
                >
                  {step === 2
                    ? "Submit application"
                    : step === 0
                      ? "Next: documents"
                      : "Next: review"}
                </Button>
              </div>
            </form>
          </>
        )}
      </AppPage>
    </section>
  )
}
