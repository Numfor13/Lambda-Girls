import { Phone, CheckCircle, Clock, CreditCard, Stethoscope, FlaskConical, UserCog } from "lucide-react"
import { PageHeader } from "@/design/components/primitives"
import { Reveal, StaggerContainer, StaggerItem } from "@/design/motion"
import { env } from "@/config/env"
import { formatXaf } from "@/lib/format"

const STEPS = [
  {
    icon: Phone,
    title: "Call the CareBridge operator",
    detail: `Dial ${env.operatorPhone}. Our operator is available Mon–Sat, 7am–9pm.`,
  },
  {
    icon: CreditCard,
    title: "Pay the consultation fee",
    detail: "The operator will tell you which Mobile Money number to transfer your fee to and confirm receipt.",
  },
  {
    icon: Stethoscope,
    title: "A doctor calls you back",
    detail: "Once your fee is confirmed, the right doctor is notified and calls you directly — usually within 15 minutes.",
  },
  {
    icon: CheckCircle,
    title: "Get advice and a prescription",
    detail: "The doctor advises you over the phone. A prescription or referral can be sent to your CareBridge account.",
  },
]

const FEES = [
  { label: "General consultation", fee: env.consultationFees.general, icon: Stethoscope },
  { label: "Specialist consultation", fee: env.consultationFees.specialist, icon: UserCog },
  { label: "Lab test request", fee: env.consultationFees.lab, icon: FlaskConical },
]

export default function DirectCall() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Call a doctor"
        subtitle="Speak directly with a CareBridge doctor via phone. No internet needed for the call itself."
      />

      {/* Big call button */}
      <Reveal variant="up">
        <a
          href={`tel:${env.operatorPhone}`}
          className="flex flex-col items-center gap-4 rounded-[20px] bg-brand-700 py-10 px-6 text-center text-white transition-transform active:scale-[0.98]"
        >
          <span className="flex size-20 items-center justify-center rounded-full bg-white/20">
            <Phone className="size-10" strokeWidth={1.5} aria-hidden />
          </span>
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-widest opacity-80">CareBridge Operator</p>
            <p className="font-display text-[36px] font-extrabold tracking-tight">{env.operatorPhone}</p>
            <p className="mt-1 text-[15px] opacity-80">Tap to call now</p>
          </div>
        </a>
      </Reveal>

      {/* Fees */}
      <section>
        <h2 className="mb-3 text-[16px] font-bold">Consultation fees</h2>
        <div className="flex flex-col gap-2">
          {FEES.map((f) => (
            <div key={f.label} className="flex items-center gap-3 rounded-[14px] border border-line bg-white px-4 py-3">
              <f.icon className="size-5 shrink-0 text-brand-700" aria-hidden />
              <span className="flex-1 text-[15px]">{f.label}</span>
              <span className="font-display text-[17px] font-extrabold text-brand-700">{formatXaf(f.fee)}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-600">Fees are collected by the operator via Mobile Money before the doctor calls.</p>
      </section>

      {/* How it works */}
      <section>
        <h2 className="mb-3 text-[16px] font-bold">How it works</h2>
        <StaggerContainer as="ol" className="flex flex-col gap-3" stagger={0.07}>
          {STEPS.map((s, i) => (
            <StaggerItem key={s.title} as="li" variant="up">
              <div className="flex gap-4 rounded-[16px] border border-line bg-white p-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-mint font-extrabold text-brand-700">
                  {i + 1}
                </span>
                <div>
                  <p className="font-bold">{s.title}</p>
                  <p className="mt-0.5 text-[15px] text-ink-600">{s.detail}</p>
                </div>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </section>

      {/* Hours notice */}
      <Reveal delay={0.1}>
        <div className="flex items-start gap-3 rounded-[14px] border border-line bg-cream px-4 py-4">
          <Clock className="mt-0.5 size-5 shrink-0 text-brand-700" aria-hidden />
          <div className="text-sm text-ink-600">
            <p className="font-semibold text-ink-900">Operator hours</p>
            <p>Monday – Saturday · 7:00 am – 9:00 pm</p>
            <p className="mt-1">For emergencies outside these hours, go to your nearest emergency facility or call 15 (SAMU).</p>
          </div>
        </div>
      </Reveal>

      <p className="text-center text-sm text-ink-600">
        Your personal data is never shared with the doctor — only your complaint and fee confirmation.
      </p>
    </div>
  )
}
