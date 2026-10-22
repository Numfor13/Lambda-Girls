import { CreditCard, MessagesSquare, Stethoscope, WifiOff } from "lucide-react"
import { ButtonLink } from "@/design/components/Button"
import { Reveal, StaggerContainer, StaggerItem } from "@/design/motion"
import { AdvisoryNote, Eyebrow } from "@/design/components/primitives"
import { formatXaf } from "@/lib/format"
import { env } from "@/config/env"

const STEPS = [
  {
    icon: Stethoscope,
    title: "Check your symptoms",
    body: "Answer a few simple questions. You get a clear result — emergency, see a doctor today, or care at home — and the reasons behind it.",
  },
  {
    icon: MessagesSquare,
    title: "Find care or message a doctor",
    body: "See the nearest facilities that can help and call them in one tap, or send a doctor a text or voice note.",
  },
  {
    icon: CreditCard,
    title: "Pay and get a reply",
    body: `Pay ${formatXaf(env.consultationFeeXaf)} with Mobile Money. Your case joins the doctor's queue, most urgent first.`,
  },
]

const PROMISES = [
  "This is guidance, not a diagnosis. In an emergency, go to a hospital or call one now.",
  "Facility details, symptom checks and your messages work without a connection.",
  "A consultation you make for someone else is kept separate from your own record.",
  "You only pay for a doctor consultation. Finding facilities and checking symptoms is free.",
]

export default function HowItWorks() {
  return (
    <div className="container-page section-y">
      <Reveal>
        <Eyebrow>How it works</Eyebrow>
        <h1 className="mt-4 max-w-2xl text-[36px] leading-[1.08] font-extrabold tracking-[-0.02em] lg:text-[48px]">
          Three steps to the right care.
        </h1>
      </Reveal>

      <StaggerContainer as="ol" className="mt-12 grid gap-5 md:grid-cols-3" stagger={0.12}>
        {STEPS.map((s, i) => (
          <StaggerItem as="li" key={s.title} className="rounded-xl bg-white shadow-[var(--shadow-elev-1)] p-6">
            <span className="flex size-12 items-center justify-center rounded-full bg-mint">
              <s.icon className="size-6 text-brand-700" aria-hidden />
            </span>
            <p className="mt-5 text-body-m font-semibold text-brand-700">Step {i + 1}</p>
            <h2 className="mt-1 text-headline-s">{s.title}</h2>
            <p className="mt-2 text-body-l text-ink-600">{s.body}</p>
          </StaggerItem>
        ))}
      </StaggerContainer>

      <Reveal as="section" className="mt-14 grid gap-8 rounded-xl bg-mint p-6 sm:p-10 lg:grid-cols-[auto_1fr]">
        <WifiOff className="size-12 text-brand-700" strokeWidth={1.5} aria-hidden />
        <div>
          <h2 className="text-[24px] font-bold">Works when the network doesn't</h2>
          <p className="mt-2 max-w-2xl text-body-l text-ink-600">
            Install CareBridge from your browser — no app store needed. The facility list and the
            symptom check open with no connection. Anything you send while offline waits safely on
            your phone and goes out as soon as you're back online.
          </p>
        </div>
      </Reveal>

      <section id="help" className="mt-14 scroll-mt-24">
        <Reveal>
          <h2 className="text-[24px] font-bold">Four things we say before anyone asks</h2>
        </Reveal>
        <StaggerContainer as="ul" className="mt-5 grid gap-3 md:grid-cols-2" stagger={0.08}>
          {PROMISES.map((p) => (
            <StaggerItem as="li" key={p} className="rounded-md border border-line bg-white p-4 text-body-l">
              {p}
            </StaggerItem>
          ))}
        </StaggerContainer>
        <AdvisoryNote className="mt-6" />
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink to="/app/triage" trailing="arrow">
            Check symptoms
          </ButtonLink>
          <ButtonLink to="/app/facilities" variant="secondary" trailing="external">
            Find care near me
          </ButtonLink>
        </div>
      </section>
    </div>
  )
}
