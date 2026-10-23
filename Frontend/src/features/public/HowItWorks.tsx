import { motion } from "motion/react"
import {
  Activity,
  ChevronDown,
  LogIn,
  MapPin,
  MessageCircle,
  Phone,
  Play,
  WifiOff,
  type LucideIcon,
} from "lucide-react"
import { Link } from "react-router-dom"
import { ButtonA, ButtonLink } from "@/design/components/Button"
import {
  FeatureCard,
  PublicHero,
  StatementBand,
} from "@/design/components/PublicHero"
import { AdvisoryNote } from "@/design/components/primitives"
import { UrgencyBadge } from "@/design/components/UrgencyBadge"
import { Reveal, SPRING, StaggerContainer, StaggerItem } from "@/design/motion"
import { formatXaf } from "@/lib/format"
import { env } from "@/config/env"
import { cn } from "@/lib/utils"

/*
 * Reference implementation of the public-page composition (docs/REDESIGN_BUILD.md §0):
 * PublicHero (scene + headline + white FeatureCard with a breakout object) → StatementBand
 * on the same scene → full-width content sections on solid surfaces.
 */

const STEPS: {
  icon: LucideIcon
  title: string
  body: string
  cta: { to: string; label: string }
  shape: string
}[] = [
  {
    icon: Activity,
    title: "Check danger signs",
    body: "Answer a few questions for yourself or someone in your household. You see the urgency and the reasons behind it. If it says emergency, call 15 and go now.",
    cta: { to: "/app/triage", label: "Check symptoms" },
    shape: "shape-bl bg-white shadow-[var(--shadow-elev-1)]",
  },
  {
    icon: MapPin,
    title: "Choose your next step",
    body: "Find and call the nearest facility that can help, or start a consultation. Describe what's happening by text or a voice note.",
    cta: { to: "/app/facilities", label: "Find a facility" },
    shape: "shape-br bg-mint",
  },
  {
    icon: MessageCircle,
    title: "Hear from a doctor",
    body: `A consultation costs ${formatXaf(env.consultationFeeXaf)}, paid by Mobile Money. Once paid, your case joins the queue, most urgent first, and the reply appears in your conversation.`,
    cta: { to: "/app/consult/new", label: "Message a doctor" },
    shape: "shape-tr bg-white shadow-[var(--shadow-elev-1)]",
  },
]

const HELP = [
  {
    q: "Do I need an account?",
    a: "No for browsing facilities and checking symptoms. Sign in to message a doctor and keep your care history.",
  },
  {
    q: "What works without a network?",
    a: "After your first visit, saved facilities and the symptom check work offline. Consultation messages wait on your phone and send when you reconnect. Payment needs a connection.",
  },
  {
    q: "Can I ask for someone else?",
    a: "Yes. Add a household member in Profile, with their permission or as their parent or carer, then choose their name before checking symptoms or starting a consultation.",
  },
  {
    q: "What do I pay for?",
    a: `Finding facilities and checking symptoms are free. You pay ${formatXaf(env.consultationFeeXaf)} for a doctor consultation. Ask the facility about treatment fees directly.`,
  },
  {
    q: "Is the symptom check a diagnosis?",
    a: "No. It is advisory and looks for danger signs so you know how urgently to act. A doctor or facility makes the diagnosis.",
  },
]

/** Breakout object for the hero card: an example flow, clearly labelled as an example. */
function FlowVignette() {
  const row =
    "flex items-center gap-3 rounded-lg bg-white p-3 shadow-[var(--shadow-elev-1)]"
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-cream/95 p-3 shadow-[var(--shadow-elev-2)] ring-1 ring-line">
      <div className="flex items-center justify-between px-1">
        <span className="eyebrow">Example</span>
        <span className="text-label-m text-ink-400">about 1 minute</span>
      </div>
      <motion.div
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ ...SPRING.default, delay: 0.7 }}
        className={row}
      >
        <UrgencyBadge urgency="AMBER" size="sm" />
        <span className="text-label-l text-ink-600">Result for you</span>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ ...SPRING.default, delay: 0.85 }}
        className={row}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-mint">
          <MapPin className="size-4 text-brand-700" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 truncate text-label-l text-ink-900">
          Nearest clinic for this
        </span>
        <span className="flex size-9 items-center justify-center rounded-full bg-mint">
          <Phone className="size-4 text-brand-700" aria-hidden />
        </span>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ ...SPRING.default, delay: 1 }}
        className="flex items-center gap-3 rounded-lg rounded-bl-sm bg-brand-700 p-3 text-white"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15">
          <Play className="size-4" aria-hidden />
        </span>
        <span className="flex h-6 flex-1 items-center gap-0.5" aria-hidden>
          {[6, 12, 18, 10, 22, 14, 8, 16, 20, 9, 13, 6].map((h, i) => (
            <span
              key={i}
              className="w-1 rounded-full bg-white/70"
              style={{ height: h }}
            />
          ))}
        </span>
        <span className="text-label-m text-white/85">Doctor · 0:42</span>
      </motion.div>
    </div>
  )
}

export default function HowItWorks() {
  return (
    <>
      <PublicHero
        eyebrow="How it works"
        title={"Three steps\nto care."}
        lede="Check. Choose. Hear from a doctor."
        body="Start with a danger-sign check. Then find the right facility or message a doctor, for you or someone in your household, on any phone."
        actions={
          <>
            <ButtonLink to="/app/triage" icon={Activity} size="lg">
              Check symptoms
            </ButtonLink>
            <ButtonA
              href="#help"
              icon={MessageCircle}
              variant="glass"
              size="lg"
            >
              Questions first
            </ButtonA>
          </>
        }
        card={
          <FeatureCard
            chips={["Check", "Choose", "Consult"]}
            title="From first sign to a doctor's reply"
            line="Urgent cases are always seen first."
          />
        }
        breakout={<FlowVignette />}
      >
        <StatementBand
          panel={{
            icon: WifiOff,
            title: "Made for an unreliable connection",
            body: "Open CareBridge once while connected. Facilities and the symptom check then work offline, and anything waiting to send shows its status.",
          }}
          stat={{
            value: formatXaf(env.consultationFeeXaf),
            label: "per consultation, by Mobile Money",
          }}
          statement="Your next step shouldn't depend on a strong signal."
          link={{ to: "/app/facilities", label: "Browse facilities" }}
        />
      </PublicHero>

      {/* Journey: three connected steps across the full width. */}
      <section
        className="container-page section-y"
        aria-labelledby="steps-title"
      >
        <Reveal className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="eyebrow">The journey</p>
            <h2 id="steps-title" className="mt-3 text-display-m">
              What happens, step by step
            </h2>
          </div>
          <p className="max-w-md text-body-l text-ink-600">
            Each step works on its own. Use only what you need: many people just
            check and go.
          </p>
        </Reveal>
        <StaggerContainer
          as="ol"
          className="relative mt-10 grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-3 lg:gap-6"
        >
          <span
            className="absolute top-12 right-[16%] left-[16%] hidden h-0.5 rounded-full bg-brand-500/25 lg:block"
            aria-hidden
          />
          {STEPS.map((s, i) => (
            <StaggerItem
              as="li"
              key={s.title}
              className={cn("relative flex flex-col gap-5 p-6 lg:p-8", s.shape)}
            >
              <div className="flex items-center justify-between">
                <motion.span
                  whileHover={{ rotate: -8, scale: 1.06 }}
                  transition={SPRING.bouncy}
                  className="flex size-16 items-center justify-center rounded-full bg-brand-700 text-white shadow-[var(--shadow-elev-1)]"
                >
                  <s.icon className="size-7" aria-hidden />
                </motion.span>
                <span className="text-display-m font-display text-brand-700/25">
                  0{i + 1}
                </span>
              </div>
              <h3 className="text-headline-m">{s.title}</h3>
              <p className="flex-1 text-body-l text-ink-600">{s.body}</p>
              <Link
                to={s.cta.to}
                className="group inline-flex h-11 items-center gap-1 self-start rounded-full text-label-l text-brand-700 underline-offset-4 hover:underline"
              >
                {s.cta.label}
                <span
                  className="transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                >
                  →
                </span>
              </Link>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </section>

      {/* Help: sticky heading on the left, expandable answers on the right. */}
      <section
        id="help"
        className="container-page grid scroll-mt-24 grid-cols-[minmax(0,1fr)] gap-8 pb-20 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-14 lg:pb-28"
      >
        <Reveal className="flex flex-col gap-5 lg:sticky lg:top-28 lg:self-start">
          <p className="eyebrow">Help</p>
          <h2 className="text-display-m">Before you get started</h2>
          <p className="text-body-l text-ink-600">
            Short answers to what people ask most. In an emergency, don't read
            on: call 15.
          </p>
          <AdvisoryNote long />
          <div className="flex flex-wrap gap-3">
            <ButtonLink to="/app/facilities" icon={MapPin} variant="secondary">
              Find a facility
            </ButtonLink>
            <ButtonLink to="/sign-in" icon={LogIn} variant="ghost">
              Sign in
            </ButtonLink>
          </div>
        </Reveal>
        <StaggerContainer className="flex flex-col gap-3">
          {HELP.map((item, i) => (
            <StaggerItem key={item.q}>
              <details
                className="group rounded-xl bg-white shadow-[var(--shadow-elev-1)] open:shadow-[var(--shadow-elev-2)]"
                open={i === 0}
              >
                <summary className="flex min-h-16 cursor-pointer list-none items-center gap-4 px-6 py-4 [&::-webkit-details-marker]:hidden">
                  <span className="flex-1 text-title-l">{item.q}</span>
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-mint transition-transform duration-300 group-open:rotate-180">
                    <ChevronDown
                      className="size-5 text-brand-700"
                      aria-hidden
                    />
                  </span>
                </summary>
                <p className="px-6 pb-6 text-body-l text-ink-600">{item.a}</p>
              </details>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </section>
    </>
  )
}
