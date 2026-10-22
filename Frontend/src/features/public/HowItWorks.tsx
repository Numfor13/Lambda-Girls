import {
  Activity,
  CreditCard,
  MapPin,
  MessageCircle,
  WifiOff,
} from "lucide-react"
import { ButtonLink } from "@/design/components/Button"
import { Landscape } from "@/design/components/Landscape"
import { AdvisoryNote } from "@/design/components/primitives"
import { Reveal, StaggerContainer, StaggerItem } from "@/design/motion"
import { formatXaf } from "@/lib/format"
import { env } from "@/config/env"

const STEPS = [
  {
    icon: Activity,
    title: "Check danger signs",
    body: "Answer questions for yourself or someone in your household. See the urgency and the reasons behind the result. If it says emergency, call 15 and seek emergency care now.",
  },
  {
    icon: MessageCircle,
    title: "Choose your next step",
    body: "Find and call a facility, or start a consultation. Describe what is happening with a text message or voice note.",
  },
  {
    icon: CreditCard,
    title: "Pay, then hear from a doctor",
    body: `A doctor consultation costs ${formatXaf(env.consultationFeeXaf)}, paid by mobile money. After payment is confirmed, your case joins the doctor's queue, most urgent first. Replies appear in your consultation.`,
  },
]
const HELP = [
  {
    title: "Do I need an account?",
    body: "You can browse facilities and check symptoms without signing in. Sign in to message a doctor and keep your care history.",
  },
  {
    title: "What happens offline?",
    body: "After the first visit, saved facilities and the symptom check remain available. Consultation messages wait on your phone and sync when you reconnect. Payment needs a connection.",
  },
  {
    title: "Can I ask for someone else?",
    body: "Add a household member in Profile, with their permission or as their parent or carer. Select their name before checking symptoms or starting a consultation.",
  },
  {
    title: "Do I pay for everything?",
    body: "Finding facilities and checking symptoms are free. Payment is for a doctor consultation. Check any treatment or facility fees with the facility directly.",
  },
]
export default function HowItWorks() {
  return (
    <>
    <section className="relative isolate overflow-hidden py-14">
        <Landscape className="-z-10" preserve="xMidYMid slice" />
        <Reveal className="container-page">
          <div className="max-w-3xl shape-bl p-6 glass-strong sm:p-10">
            <p className="eyebrow">How it works</p>
            <h1 className="mt-4 text-display-m">
              A clear next step for your care.
            </h1>
            <p className="mt-5 text-body-l text-ink-900">
              Start with a danger-sign check. Find a facility or talk to a
              doctor when you need advice.
            </p>
            <ButtonLink to="/app/triage" icon={Activity} className="mt-6">
              Check symptoms
            </ButtonLink>
          </div>
        </Reveal>
      </section>
      <section className="container-page section-y">
        <StaggerContainer
          as="ol"
          className="grid grid-cols-1 gap-5 lg:grid-cols-3"
        >
          {STEPS.map((s, i) => (
            <StaggerItem
              as="li"
              key={s.title}
              className={`flex flex-col gap-5 p-6 ${i === 1 ? "shape-br bg-mint" : "shape-bl bg-white shadow-[var(--shadow-elev-1)]"}`}
            >
              <div className="flex items-center justify-between">
                <span className="flex size-14 items-center justify-center rounded-full bg-mint-200">
                  <s.icon className="size-6 text-brand-700" aria-hidden />
                </span>
                <span className="text-display-m text-brand-700/25">
                  0{i + 1}
                </span>
              </div>
              <h2 className="text-headline-s">{s.title}</h2>
              <p className="text-body-l text-ink-600">{s.body}</p>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </section>
      <section className="bg-ground text-white">
      <Reveal className="container-page flex flex-col items-start gap-5 py-14">
          <WifiOff className="size-10" aria-hidden />
          <p className="text-label-l text-white/80">
            Made for an unreliable connection
          </p>
          <h2 className="max-w-3xl text-display-m text-white">
            Your next step should not depend on a strong signal.
          </h2>
          <p className="max-w-2xl text-body-l text-white/85">
            Open CareBridge while connected to save the app and facility
            directory. Offline entries show their sync state so you can see what
            still needs to send.
          </p>
        </Reveal>
      </section>
      <section id="help" className="container-page scroll-mt-24 section-y">
        <Reveal>
          <p className="eyebrow">Help</p>
          <h2 className="mt-4 text-headline-l">Before you get started</h2>
        </Reveal>
        <StaggerContainer className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {HELP.map((item) => (
            <StaggerItem
              key={item.title}
              className="rounded-xl bg-white p-6 shadow-[var(--shadow-elev-1)]"
            >
              <h3 className="text-title-l">{item.title}</h3>
              <p className="mt-3 text-body-l text-ink-600">{item.body}</p>
            </StaggerItem>
          ))}
        </StaggerContainer>
        <AdvisoryNote long className="mt-6" />
        <ButtonLink
          to="/app/facilities"
          icon={MapPin}
          variant="secondary"
          className="mt-6"
        >
          Find a facility
        </ButtonLink>
      </section>
    </>
  )
}
