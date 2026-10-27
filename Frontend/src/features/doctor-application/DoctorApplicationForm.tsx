import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { ChevronLeft, ChevronRight, Plus, Trash2, Upload } from "lucide-react"
import { doctorApplicationApi, type NewDoctorApplication } from "@/api/endpoints"
import { SPECIALTIES, type HospitalEntry } from "@/api/types"
import { Button } from "@/design/components/Button"
import { Field, Input, Select } from "@/design/components/Field"
import { Card, Notice } from "@/design/components/primitives"

const CURRENT_YEAR = new Date().getFullYear()
const MIN_GRAD_YEAR = 1960
const MAX_GRAD_YEAR = CURRENT_YEAR - 7

// ── Step indicators ────────────────────────────────────────────────────────
const STEPS = ["Personal info", "Credentials", "Hospitals", "Recommendation", "Review"]

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {STEPS.map((label, i) => (
        <div key={i} className="flex shrink-0 items-center gap-1">
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
              i < current
                ? "bg-brand-700 text-white"
                : i === current
                  ? "border-2 border-brand-700 text-brand-700"
                  : "border border-line text-ink-400"
            }`}
          >
            {i < current ? "✓" : i + 1}
          </div>
          <span
            className={`hidden text-xs sm:block ${i === current ? "font-medium text-ink-900" : "text-ink-400"}`}
          >
            {label}
          </span>
          {i < STEPS.length - 1 && <div className="h-px w-4 bg-line" />}
        </div>
      ))}
    </div>
  )
}

// ── Step 1: Personal info ──────────────────────────────────────────────────
interface Step1Data {
  full_name: string
  email: string
  phone: string
  specialty: string
}

function Step1({ data, onChange }: { data: Step1Data; onChange: (d: Step1Data) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <Field label="Full name">
        {(id) => (
          <Input
            id={id}
            value={data.full_name}
            onChange={(e) => onChange({ ...data, full_name: e.target.value })}
            placeholder="Dr. Ambe Thierry"
          />
        )}
      </Field>
      <Field label="Email address">
        {(id) => (
          <Input
            id={id}
            type="email"
            value={data.email}
            onChange={(e) => onChange({ ...data, email: e.target.value })}
            placeholder="dr.ambe@example.com"
          />
        )}
      </Field>
      <Field label="Phone number">
        {(id) => (
          <Input
            id={id}
            type="tel"
            value={data.phone}
            onChange={(e) => onChange({ ...data, phone: e.target.value })}
            placeholder="+237 6XX XXX XXX"
          />
        )}
      </Field>
      <Field label="Specialty">
        {(id) => (
          <Select
            id={id}
            value={data.specialty}
            onChange={(e) => onChange({ ...data, specialty: e.target.value })}
          >
            <option value="">Select a specialty…</option>
            {SPECIALTIES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        )}
      </Field>
    </div>
  )
}

// ── Step 2: Credentials ───────────────────────────────────────────────────
interface Step2Data {
  medical_school: string
  graduation_year: string
  years_experience: string
}

function Step2({ data, onChange }: { data: Step2Data; onChange: (d: Step2Data) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <Notice tone="info">
        CareBridge requires a minimum of 7 years of medical school and 3 years of hospital
        experience before joining as a doctor.
      </Notice>
      <Field label="Medical school / university">
        {(id) => (
          <Input
            id={id}
            value={data.medical_school}
            onChange={(e) => onChange({ ...data, medical_school: e.target.value })}
            placeholder="University of Yaoundé I"
          />
        )}
      </Field>
      <Field label="Year you completed medical school" hint={`Must be ${MAX_GRAD_YEAR} or earlier.`}>
        {(id) => (
          <Input
            id={id}
            type="number"
            min={MIN_GRAD_YEAR}
            max={MAX_GRAD_YEAR}
            value={data.graduation_year}
            onChange={(e) => onChange({ ...data, graduation_year: e.target.value })}
            placeholder={String(MAX_GRAD_YEAR)}
          />
        )}
      </Field>
      <Field label="Years of hospital experience" hint="Minimum 3 years required.">
        {(id) => (
          <Input
            id={id}
            type="number"
            min={3}
            max={60}
            value={data.years_experience}
            onChange={(e) => onChange({ ...data, years_experience: e.target.value })}
            placeholder="5"
          />
        )}
      </Field>
    </div>
  )
}

// ── Step 3: Hospitals worked ───────────────────────────────────────────────
function Step3({
  hospitals,
  onChange,
}: {
  hospitals: HospitalEntry[]
  onChange: (h: HospitalEntry[]) => void
}) {
  const add = () =>
    onChange([
      ...hospitals,
      { name: "", city: "", role: "", from_year: CURRENT_YEAR - 3, to_year: null },
    ])

  const remove = (i: number) => onChange(hospitals.filter((_, idx) => idx !== i))

  const update = (i: number, patch: Partial<HospitalEntry>) =>
    onChange(hospitals.map((h, idx) => (idx === i ? { ...h, ...patch } : h)))

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[15px] text-ink-600">
        List every hospital you have worked at. At least one is required.
      </p>
      {hospitals.map((h, i) => (
        <Card key={i} className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[15px] font-semibold text-ink-900">Hospital {i + 1}</span>
            {hospitals.length > 1 && (
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-sm text-red-600 hover:underline"
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
          <div className="flex flex-col gap-3">
            <Field label="Hospital name">
              {(id) => (
                <Input
                  id={id}
                  value={h.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  placeholder="Central Hospital Yaoundé"
                />
              )}
            </Field>
            <Field label="City">
              {(id) => (
                <Input
                  id={id}
                  value={h.city}
                  onChange={(e) => update(i, { city: e.target.value })}
                  placeholder="Yaoundé"
                />
              )}
            </Field>
            <Field label="Your role">
              {(id) => (
                <Input
                  id={id}
                  value={h.role}
                  onChange={(e) => update(i, { role: e.target.value })}
                  placeholder="Resident Physician"
                />
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="From year">
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    min={1960}
                    max={CURRENT_YEAR}
                    value={h.from_year}
                    onChange={(e) => update(i, { from_year: Number(e.target.value) })}
                  />
                )}
              </Field>
              <Field label="To year (blank = current)">
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    min={1960}
                    max={CURRENT_YEAR}
                    value={h.to_year ?? ""}
                    onChange={(e) =>
                      update(i, { to_year: e.target.value ? Number(e.target.value) : null })
                    }
                  />
                )}
              </Field>
            </div>
          </div>
        </Card>
      ))}
      <Button type="button" variant="secondary" size="sm" className="self-start" onClick={add}>
        <Plus className="size-4" /> Add hospital
      </Button>
    </div>
  )
}

// ── Step 4: Recommendation & document upload ──────────────────────────────
interface Step4Data {
  rec_name: string
  rec_contact_person: string
  rec_phone: string
  rec_email: string
  document_s3_key: string
  uploading: boolean
  uploadError: string
}

function Step4({ data, onChange }: { data: Step4Data; onChange: (d: Step4Data) => void }) {
  const handleFile = async (file: File) => {
    onChange({ ...data, uploading: true, uploadError: "" })
    try {
      const { upload_url, key } = await doctorApplicationApi.getUploadUrl(file.type)
      await fetch(upload_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      })
      onChange({ ...data, document_s3_key: key, uploading: false, uploadError: "" })
    } catch {
      onChange({ ...data, uploading: false, uploadError: "Upload failed. Please try again." })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[15px] text-ink-600">
        Provide contact details for one of the hospitals you worked at. We will call them directly
        to verify your experience. Then upload their official recommendation letter (PDF, JPG, or
        PNG, max 10 MB).
      </p>
      <Card className="p-4">
        <p className="mb-3 text-[15px] font-semibold">Recommending hospital contact</p>
        <div className="flex flex-col gap-3">
          <Field label="Hospital name">
            {(id) => (
              <Input
                id={id}
                value={data.rec_name}
                onChange={(e) => onChange({ ...data, rec_name: e.target.value })}
                placeholder="Central Hospital Yaoundé"
              />
            )}
          </Field>
          <Field label="Contact person (name & title)">
            {(id) => (
              <Input
                id={id}
                value={data.rec_contact_person}
                onChange={(e) => onChange({ ...data, rec_contact_person: e.target.value })}
                placeholder="Dr. Biya Jean, Medical Director"
              />
            )}
          </Field>
          <Field label="Contact phone">
            {(id) => (
              <Input
                id={id}
                type="tel"
                value={data.rec_phone}
                onChange={(e) => onChange({ ...data, rec_phone: e.target.value })}
                placeholder="+237 6XX XXX XXX"
              />
            )}
          </Field>
          <Field label="Contact email (optional)">
            {(id) => (
              <Input
                id={id}
                type="email"
                value={data.rec_email}
                onChange={(e) => onChange({ ...data, rec_email: e.target.value })}
                placeholder="director@hospital.cm"
              />
            )}
          </Field>
        </div>
      </Card>

      <Card className="p-4">
        <p className="mb-2 text-[15px] font-semibold">Recommendation letter</p>
        <p className="mb-3 text-sm text-ink-600">PDF, JPG, or PNG · max 10 MB</p>
        {data.document_s3_key ? (
          <div className="flex items-center gap-2 rounded-[10px] bg-green-50 px-3 py-2 text-sm text-green-800">
            ✓ Document uploaded successfully
            <button
              type="button"
              className="ml-auto text-xs underline"
              onClick={() => onChange({ ...data, document_s3_key: "" })}
            >
              Remove
            </button>
          </div>
        ) : (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-[12px] border-2 border-dashed border-line p-6 hover:border-brand-400">
            <Upload className="size-6 text-ink-400" />
            <span className="text-sm text-ink-600">
              {data.uploading ? "Uploading…" : "Tap to select file"}
            </span>
            <input
              type="file"
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png"
              disabled={data.uploading}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleFile(file)
              }}
            />
          </label>
        )}
        {data.uploadError && <Notice tone="error" className="mt-2">{data.uploadError}</Notice>}
      </Card>
    </div>
  )
}

// ── Step 5: Review ─────────────────────────────────────────────────────────
function Review({
  step1,
  step2,
  step3,
  step4,
}: {
  step1: Step1Data
  step2: Step2Data
  step3: HospitalEntry[]
  step4: Step4Data
}) {
  const specialty = SPECIALTIES.find((s) => s.value === step1.specialty)?.label ?? step1.specialty
  return (
    <div className="flex flex-col gap-4 text-[15px]">
      <Card className="divide-y divide-line overflow-hidden p-0">
        {[
          ["Name", step1.full_name],
          ["Email", step1.email],
          ["Phone", step1.phone],
          ["Specialty", specialty],
          ["Medical school", step2.medical_school],
          ["Graduated", step2.graduation_year],
          ["Experience", `${step2.years_experience} years`],
        ].map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-4 px-4 py-3">
            <span className="text-ink-600">{label}</span>
            <span className="text-right font-medium text-ink-900">{value}</span>
          </div>
        ))}
      </Card>
      <Card className="p-4">
        <p className="mb-2 font-semibold">Hospitals worked at</p>
        {step3.map((h, i) => (
          <p key={i} className="text-ink-600">
            {h.name} — {h.role} ({h.from_year}–{h.to_year ?? "present"})
          </p>
        ))}
      </Card>
      <Card className="p-4">
        <p className="mb-2 font-semibold">Recommending hospital</p>
        <p className="text-ink-600">{step4.rec_name}</p>
        <p className="text-ink-600">{step4.rec_contact_person}</p>
        <p className="text-ink-600">{step4.rec_phone}</p>
      </Card>
    </div>
  )
}

// ── Main form ──────────────────────────────────────────────────────────────
export default function DoctorApplicationForm() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const [step1, setStep1] = useState<Step1Data>({
    full_name: "", email: "", phone: "", specialty: "",
  })
  const [step2, setStep2] = useState<Step2Data>({
    medical_school: "", graduation_year: "", years_experience: "",
  })
  const [step3, setStep3] = useState<HospitalEntry[]>([
    { name: "", city: "", role: "", from_year: CURRENT_YEAR - 3, to_year: null },
  ])
  const [step4, setStep4] = useState<Step4Data>({
    rec_name: "", rec_contact_person: "", rec_phone: "", rec_email: "",
    document_s3_key: "", uploading: false, uploadError: "",
  })

  const validateStep = (): string => {
    if (step === 0) {
      if (!step1.full_name.trim()) return "Full name is required"
      if (!step1.email.trim()) return "Email is required"
      if (!step1.phone.trim()) return "Phone is required"
      if (!step1.specialty) return "Please select a specialty"
    }
    if (step === 1) {
      if (!step2.medical_school.trim()) return "Medical school is required"
      const gradYear = Number(step2.graduation_year)
      if (!gradYear || gradYear > MAX_GRAD_YEAR) return `Graduation year must be ${MAX_GRAD_YEAR} or earlier (7+ years of training)`
      const exp = Number(step2.years_experience)
      if (!exp || exp < 3) return "Minimum 3 years of hospital experience required"
    }
    if (step === 2) {
      for (const h of step3) {
        if (!h.name.trim() || !h.city.trim() || !h.role.trim()) return "Please complete all hospital entries"
      }
    }
    if (step === 3) {
      if (!step4.rec_name.trim()) return "Recommending hospital name is required"
      if (!step4.rec_contact_person.trim()) return "Contact person is required"
      if (!step4.rec_phone.trim()) return "Contact phone is required"
      if (!step4.document_s3_key) return "Please upload your recommendation letter"
    }
    return ""
  }

  const next = () => {
    const err = validateStep()
    if (err) { setError(err); return }
    setError("")
    setStep((s) => s + 1)
  }

  const submit = async () => {
    setSubmitting(true)
    setError("")
    try {
      const body: NewDoctorApplication = {
        full_name: step1.full_name.trim(),
        email: step1.email.trim().toLowerCase(),
        phone: step1.phone.trim(),
        specialty: step1.specialty as NewDoctorApplication["specialty"],
        medical_school: step2.medical_school.trim(),
        graduation_year: Number(step2.graduation_year),
        years_experience: Number(step2.years_experience),
        hospitals_worked: step3,
        recommending_hospital: {
          name: step4.rec_name.trim(),
          contact_person: step4.rec_contact_person.trim(),
          phone: step4.rec_phone.trim(),
          email: step4.rec_email.trim(),
        },
        document_s3_key: step4.document_s3_key,
      }
      const { application_id } = await doctorApplicationApi.submit(body)
      navigate(`/apply/doctor/status?ref=${application_id}`)
    } catch {
      setError("Submission failed. Please check your connection and try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="mb-1 text-[24px] font-extrabold text-ink-900">Apply to join as a doctor</h1>
      <p className="mb-6 text-[15px] text-ink-600">
        Complete all steps. Our team will verify your credentials before activating your account.
      </p>

      <StepBar current={step} />

      <div className="mt-6">
        {step === 0 && <Step1 data={step1} onChange={setStep1} />}
        {step === 1 && <Step2 data={step2} onChange={setStep2} />}
        {step === 2 && <Step3 hospitals={step3} onChange={setStep3} />}
        {step === 3 && <Step4 data={step4} onChange={setStep4} />}
        {step === 4 && <Review step1={step1} step2={step2} step3={step3} step4={step4} />}
      </div>

      {error && <Notice tone="error" className="mt-4">{error}</Notice>}

      <div className="mt-6 flex items-center justify-between gap-3">
        {step > 0 ? (
          <Button variant="ghost" onClick={() => { setError(""); setStep((s) => s - 1) }}>
            <ChevronLeft className="size-4" /> Back
          </Button>
        ) : (
          <div />
        )}
        {step < STEPS.length - 1 ? (
          <Button onClick={next}>
            Next <ChevronRight className="size-4" />
          </Button>
        ) : (
          <Button loading={submitting} onClick={() => void submit()}>
            Submit application
          </Button>
        )}
      </div>
    </div>
  )
}
