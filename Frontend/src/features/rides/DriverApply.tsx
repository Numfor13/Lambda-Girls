import { useState } from "react"
import { Car, CheckCircle, FileText, Phone, Shield, Star } from "lucide-react"
import { Button } from "@/design/components/Button"
import { Field, Input, Select } from "@/design/components/Field"
import { Notice, PageHeader } from "@/design/components/primitives"
import { Reveal, StaggerContainer, StaggerItem } from "@/design/motion"

type AppStep = "intro" | "form" | "submitted"

const VEHICLE_TYPES = [
  { value: "sedan", label: "Sedan / Saloon" },
  { value: "suv", label: "SUV / 4x4" },
  { value: "minibus", label: "Minibus / Taxi" },
  { value: "motorcycle", label: "Motorcycle / Moto-taxi" },
]

const REQUIREMENTS = [
  { icon: Car, text: "Road-worthy vehicle with valid road worthiness sticker" },
  { icon: FileText, text: "Valid driver's license (at least 2 years old)" },
  { icon: Shield, text: "Vehicle insurance covering passengers" },
  { icon: Star, text: "Commitment to prompt, respectful service" },
]

export default function DriverApply() {
  const [step, setStep] = useState<AppStep>("intro")
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    vehicle_type: "sedan",
    plate: "",
    license_number: "",
    years_experience: "",
    quarter: "",
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const canSubmit =
    form.full_name.trim() &&
    form.phone.trim() &&
    form.plate.trim() &&
    form.license_number.trim() &&
    form.years_experience.trim() &&
    form.quarter.trim()

  const submit = async () => {
    setSaving(true)
    setError(null)
    try {
      // In production this POSTs to /rides/driver-apply
      await new Promise((r) => setTimeout(r, 1200))
      setStep("submitted")
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  if (step === "submitted") {
    return (
      <div className="flex flex-col items-center gap-6 py-10 text-center">
        <span className="flex size-20 items-center justify-center rounded-full bg-mint">
          <CheckCircle className="size-10 text-brand-700" strokeWidth={1.5} />
        </span>
        <div>
          <h1 className="text-[26px] font-extrabold">Application submitted!</h1>
          <p className="mt-2 max-w-sm text-[15px] text-ink-600">
            We'll review your details and call you on <strong>{form.phone}</strong> within 48 hours to complete the process.
          </p>
        </div>
        <div className="w-full rounded-[14px] border border-line bg-white p-4 text-left text-[15px]">
          <p className="font-semibold">What happens next?</p>
          <ol className="mt-2 list-decimal list-inside space-y-1 text-ink-600">
            <li>CareBridge calls to verify your documents</li>
            <li>Your vehicle is briefly inspected by a local agent</li>
            <li>You receive your driver activation code</li>
            <li>The CareBridge Driver app is unlocked on your phone</li>
          </ol>
        </div>
      </div>
    )
  }

  if (step === "form") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Driver application" subtitle="Fill in your details. We'll verify and activate you within 48 hours." />

        <div className="flex flex-col gap-5">
          <Field label="Full name">
            {(id) => <Input id={id} value={form.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder="As on your ID card" />}
          </Field>
          <Field label="Phone number" hint="We'll call this number to verify your application">
            {(id) => <Input id={id} type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+237 6XX XXX XXX" />}
          </Field>
          <Field label="Vehicle type">
            {(id) => (
              <Select id={id} value={form.vehicle_type} onChange={(e) => set("vehicle_type", e.target.value)}>
                {VEHICLE_TYPES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Number plate">
            {(id) => <Input id={id} value={form.plate} onChange={(e) => set("plate", e.target.value)} placeholder="e.g. LT 1234 SW" />}
          </Field>
          <Field label="Driver's license number">
            {(id) => <Input id={id} value={form.license_number} onChange={(e) => set("license_number", e.target.value)} />}
          </Field>
          <Field label="Years of driving experience">
            {(id) => <Input id={id} type="number" min="0" value={form.years_experience} onChange={(e) => set("years_experience", e.target.value)} />}
          </Field>
          <Field label="Your base quarter / area in Buea">
            {(id) => <Input id={id} value={form.quarter} onChange={(e) => set("quarter", e.target.value)} placeholder="e.g. Molyko, Bonduma" />}
          </Field>

          {error && <Notice tone="error">{error}</Notice>}

          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setStep("intro")}>Back</Button>
            <Button full disabled={!canSubmit} loading={saving} onClick={submit}>Submit application</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Become a CareBridge driver"
        subtitle="Help patients reach health facilities quickly and earn extra income."
      />

      <Reveal variant="up">
        <div className="flex flex-col items-center gap-3 rounded-[20px] bg-brand-700 py-8 px-6 text-center text-white">
          <Car className="size-14" strokeWidth={1.25} />
          <h2 className="text-[22px] font-extrabold">Drive for CareBridge</h2>
          <p className="max-w-xs text-[15px] opacity-85">
            Earn money connecting patients to health facilities during medical emergencies.
            You set your own schedule.
          </p>
        </div>
      </Reveal>

      <section>
        <h2 className="mb-3 text-[16px] font-bold">Requirements</h2>
        <StaggerContainer as="ul" className="flex flex-col gap-3" stagger={0.06}>
          {REQUIREMENTS.map((r) => (
            <StaggerItem key={r.text} as="li" variant="up">
              <div className="flex items-start gap-3 rounded-[14px] border border-line bg-white p-4">
                <r.icon className="mt-0.5 size-5 shrink-0 text-brand-700" aria-hidden />
                <p className="text-[15px]">{r.text}</p>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </section>

      <section>
        <h2 className="mb-3 text-[16px] font-bold">How earnings work</h2>
        <div className="rounded-[14px] bg-mint p-4 text-[15px] text-brand-900">
          <p>Fares are calculated by distance from the patient's location to the facility.</p>
          <p className="mt-2 font-semibold">Base rate: 200 XAF / km</p>
          <p className="text-sm text-brand-700 mt-1">You receive 85% of each fare. CareBridge retains 15% for platform maintenance.</p>
        </div>
      </section>

      <div className="flex flex-col gap-3">
        <Button size="lg" full onClick={() => setStep("form")}>Apply to drive</Button>
        <a
          href="tel:673107072"
          className="flex items-center justify-center gap-2 rounded-[12px] border border-line py-3 text-sm font-semibold text-ink-700"
        >
          <Phone className="size-4" /> Call us with questions
        </a>
      </div>
    </div>
  )
}
