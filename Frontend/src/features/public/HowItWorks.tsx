import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import {
  Activity,
  ArrowRight,
  Check,
  ChevronDown,
  FileText,
  MapPin,
  MessageCircle,
  Phone,
  Smartphone,
  Stethoscope,
  type LucideIcon,
} from "lucide-react"
import seed from "@/data/facilities.seed.json"
import { env } from "@/config/env"
import { ButtonA, ButtonLink } from "@/design/components/Button"
import { ExampleTag, PublicIntro, PublicSection } from "@/design/components/PublicPage"
import { UrgencyBadge } from "@/design/components/UrgencyBadge"
import { AdvisoryNote } from "@/design/components/primitives"
import { Reveal, SPRING, StaggerContainer, StaggerItem } from "@/design/motion"
import { formatXaf } from "@/lib/format"
import { cn } from "@/lib/utils"

/*
 * How it works, from the "how it works section" study (Linear, Deel, Framer and ~10 Dribbble
 * step sections): numbered steps that each *show* a small piece of the product, then a dark
 * band for what happens after you write, then honest answers. No filler stats (QA P3).
 */

const FEE = formatXaf(env.consultationFeeXaf)
const FACILITY_COUNT = seed.length

// ---------- Intro: the three steps playing through ----------

const JOURNEY: { icon: LucideIcon; title: string; detail: React.ReactNode }[] = [
  {
    icon: Activity,
    title: "Check the danger signs",
    detail: (
      <span className="flex items-center gap-2">
        <UrgencyBadge urgency="AMBER" size="sm" /> Fever, 4 years
      </span>
    ),
  },
  { icon: MapPin, title: "Find the nearest place", detail: "Clinic that treats this · 1.2 km · open now" },
  { icon: MessageCircle, title: "Ask a doctor", detail: "Reply: “Bring her in this afternoon.”" },
]

function JourneyCard() {
  const reduce = useReducedMotion()
  const [at, setAt] = useState(0)
  useEffect(() => {
    if (reduce) return
    const t = window.setInterval(() => setAt((x) => (x + 1) % JOURNEY.length), 2600)
    return () => window.clearInterval(t)
  }, [reduce])
  const shown = reduce ? JOURNEY.length - 1 : at

  return (
    <div className="rounded-2xl bg-white p-5 shadow-[var(--shadow-float)] sm:p-7">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow">One worry, start to finish</p>
        <ExampleTag />
      </div>
      <ol className="mt-5 flex flex-col">
        {JOURNEY.map((s, i) => {
          const done = i < shown
          const now = i === shown
          return (
            <li key={s.title} className="relative flex gap-4 pb-5 last:pb-0">
              {i < JOURNEY.length - 1 && (
                <span className="absolute top-11 bottom-1 left-[21px] w-0.5 overflow-hidden rounded-full bg-line" aria-hidden>
                  <motion.span
                    className="block h-full w-full origin-top bg-brand-600"
                    initial={false}
                    animate={{ scaleY: done ? 1 : 0 }}
                    transition={{ duration: reduce ? 0 : 0.5, ease: "easeOut" }}
                  />
                </span>
              )}
              <span
                className={cn(
                  "relative flex size-11 shrink-0 items-center justify-center rounded-full transition-colors duration-300",
                  done ? "bg-brand-700 text-white" : now ? "bg-mint text-brand-700 ring-2 ring-brand-600" : "bg-cream text-ink-400",
                )}
              >
                {done ? <Check className="size-5" aria-hidden /> : <s.icon className="size-5" aria-hidden />}
              </span>
              <div className="min-w-0 flex-1 pt-1">
                <p className={cn("text-title-m transition-colors", now || done ? "text-ink-900" : "text-ink-600")}>
                  <span className="mr-1.5 text-ink-600 tabular">{i + 1}.</span>
                  {s.title}
                </p>
                <AnimatePresence initial={false}>
                  {(now || done) && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={SPRING.default}
                      className="overflow-hidden"
                    >
                      <div className="mt-2 rounded-lg bg-cream px-3 py-2.5 text-body-m text-ink-900">{s.detail}</div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

// ---------- Step cards, each with a small working preview ----------

function CheckPreview() {
  const items = ["Hot body (fever)", "Breathing fast", "Not drinking"]
  return (
    <ul className="flex flex-col gap-2">
      {items.map((t, i) => (
        <li
          key={t}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-label-l",
            i === 0 ? "bg-mint shadow-[inset_0_0_0_2px_var(--color-brand-700)]" : "bg-white shadow-[inset_0_0_0_1px_var(--color-line)]",
          )}
        >
          <span
            className={cn(
              "flex size-5 items-center justify-center rounded-[6px] border-2",
              i === 0 ? "border-brand-700 bg-brand-700 text-white" : "border-ink-400",
            )}
          >
            {i === 0 && <Check className="size-3" aria-hidden />}
          </span>
          {t}
        </li>
      ))}
    </ul>
  )
}

function FindPreview() {
  return (
    <ul className="flex flex-col gap-2">
      {[
        { name: "Health centre", meta: "Open 24/7", km: "1.2 km" },
        { name: "District hospital", meta: "Emergency care", km: "3.4 km" },
      ].map((f) => (
        <li key={f.name} className="flex items-center gap-3 rounded-lg bg-white px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--color-line)]">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-mint text-brand-700">
            <MapPin className="size-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-label-l">{f.name}</span>
            <span className="block text-label-m font-normal text-ink-600">
              {f.meta} · <span className="font-semibold text-brand-700">{f.km}</span>
            </span>
          </span>
          <span className="flex size-8 items-center justify-center rounded-full bg-brand-700 text-white">
            <Phone className="size-3.5" aria-hidden />
          </span>
        </li>
      ))}
    </ul>
  )
}

function AskPreview() {
  return (
    <div className="flex flex-col gap-2">
      <p className="ml-auto max-w-[85%] rounded-lg rounded-br-sm bg-brand-700 px-3 py-2 text-body-m text-white">
        My son has had a fever since yesterday.
      </p>
      <p className="mr-auto max-w-[85%] rounded-lg rounded-bl-sm bg-white px-3 py-2 text-body-m shadow-[inset_0_0_0_1px_var(--color-line)]">
        Is he drinking? Any fast breathing?
      </p>
      <span className="mt-1 inline-flex h-7 items-center gap-1.5 self-start rounded-full bg-white px-2.5 text-label-m text-ink-600 shadow-[inset_0_0_0_1px_var(--color-line)]">
        <Smartphone className="size-3.5" aria-hidden /> {FEE} · Mobile Money
      </span>
    </div>
  )
}

const STEPS = [
  {
    title: "Check the danger signs",
    body: "Tick what you notice. In about a minute you'll know whether it's an emergency, a visit today, or something to watch at home. Free, and it works without a connection.",
    preview: <CheckPreview />,
    to: "/app/triage",
    action: "Check symptoms",
  },
  {
    title: "Find the right place",
    body: `${FACILITY_COUNT} facilities around Buea are saved on your phone, nearest first, with what they treat and their hours. Call before you travel.`,
    preview: <FindPreview />,
    to: "/app/facilities",
    action: "Find a facility",
  },
  {
    title: "Ask a doctor",
    body: `Write or record a voice note, for you or someone in your household. Pay ${FEE} with Mobile Money and a doctor replies here.`,
    preview: <AskPreview />,
    to: "/app/consult/new",
    action: "Message a doctor",
  },
]

// ---------- After you write ----------

const AFTER: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Smartphone, title: `Pay ${FEE}`, body: "Approve the Mobile Money prompt on your phone. Your message waits until payment is confirmed." },
  { icon: Activity, title: "Urgent cases go first", body: "Doctors take cases with danger signs before the others, then in the order they arrived." },
  { icon: Stethoscope, title: "A doctor replies", body: "By text or voice note. Replies come later, not instantly: check Consults or wait for the message." },
  { icon: FileText, title: "Take the next step", body: "If you need medicine or a visit, you get a prescription or referral code to show at the pharmacy or facility." },
]

// ---------- Questions ----------

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "What works without a connection?",
    a: "The symptom check and the facility directory work offline. Messages to a doctor are kept on your phone and sent when the network comes back. Visit, lab and blood requests keep your draft but need a connection to send.",
  },
  {
    q: "Can I ask for my child or a parent?",
    a: (
      <>
        Yes. Add them to your household once (with their permission, or as their parent or carer), then choose them when you start a check
        or a message.{" "}
        <Link to="/app/profile/household" className="font-semibold text-brand-700 underline underline-offset-4">
          Manage household
        </Link>
      </>
    ),
  },
  {
    q: "How do I pay?",
    a: `With Mobile Money. Each consultation costs ${FEE}. You'll get a prompt on your phone to approve; the symptom check and the directory are free.`,
  },
  {
    q: "How soon will a doctor reply?",
    a: "We can't promise a time. Urgent cases are answered first. If the person gets worse while you wait, don't wait for the reply: go to a facility or call 15.",
  },
  {
    q: "Is the symptom check a diagnosis?",
    a: "No. It points you to a sensible next step using common danger signs. Only a clinician who examines the person can diagnose.",
  },
]

function Question({ q, a }: { q: string; a: React.ReactNode }) {
  return (
    <details className="group rounded-xl bg-white shadow-[var(--shadow-elev-1)] open:shadow-[var(--shadow-elev-2)]">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-title-m [&::-webkit-details-marker]:hidden">
        {q}
        <ChevronDown className="size-5 shrink-0 text-ink-600 transition-transform duration-200 group-open:rotate-180" aria-hidden />
      </summary>
      <div className="px-5 pb-5 text-body-l text-ink-600">{a}</div>
    </details>
  )
}

export default function HowItWorks() {
  return (
    <>
      <PublicIntro
        eyebrow="How it works"
        title={
          <>
            Three steps to the <em className="accent">right care.</em>
          </>
        }
        lede="Check the danger signs, find the nearest place that can help, and ask a doctor when you need one. For you or anyone in your household, even when the network drops."
        actions={
          <>
            <ButtonLink to="/app/triage" icon={Activity} size="lg">
              Check symptoms
            </ButtonLink>
            <ButtonA href="#steps" variant="secondary" size="lg" trailing="arrow">
              See each step
            </ButtonA>
          </>
        }
        aside={<JourneyCard />}
      />

      <PublicSection id="steps" eyebrow="The steps" title="Start wherever you are.">
        <StaggerContainer className="grid gap-5 lg:grid-cols-3">
          {STEPS.map((s, i) => (
            <StaggerItem key={s.title} className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-[var(--shadow-elev-1)]">
              <div className="flex min-h-44 flex-col justify-center bg-cream p-5 sm:p-6" aria-hidden>
                {s.preview}
              </div>
              <div className="flex flex-1 flex-col items-start gap-3 p-5 sm:p-6">
                <span className="inline-flex h-7 items-center rounded-full bg-mint px-3 text-label-m text-brand-900 tabular">
                  Step {i + 1}
                </span>
                <h3 className="text-headline-s">{s.title}</h3>
                <p className="text-body-l text-ink-600">{s.body}</p>
                <Link
                  to={s.to}
                  className="group mt-auto inline-flex h-10 items-center gap-1.5 pt-2 text-label-l text-brand-700"
                >
                  {s.action}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </PublicSection>

      <PublicSection
        dark
        eyebrow="After you send a message"
        title="What happens next."
        lede="Messages to a doctor are answered in turn, not live. Here is the order things happen in."
      >
        <StaggerContainer className="grid gap-px overflow-hidden rounded-2xl bg-white/12 sm:grid-cols-2 lg:grid-cols-4">
          {AFTER.map((a, i) => (
            <StaggerItem key={a.title} className="flex flex-col gap-4 bg-ground p-6 lg:p-7">
              <div className="flex items-center justify-between">
                <span className="font-display text-[34px] leading-none font-[440] text-mint-200 tabular">0{i + 1}</span>
                <a.icon className="size-6 text-white/60" aria-hidden />
              </div>
              <h3 className="text-title-l text-white">{a.title}</h3>
              <p className="text-body-m text-white/75">{a.body}</p>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </PublicSection>

      <PublicSection id="help" eyebrow="Before you begin" title="Good to know.">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div className="flex flex-col gap-3">
            {FAQ.map((f) => (
              <Question key={f.q} q={f.q} a={f.a} />
            ))}
          </div>
          <Reveal className="flex flex-col gap-4 lg:sticky lg:top-28">
            <div className="rounded-2xl bg-urgent-red-50 p-6">
              <p className="text-title-l text-urgent-red">If it&apos;s urgent</p>
              <p className="mt-2 text-body-l text-ink-900">
                Can&apos;t breathe, won&apos;t wake, fitting or bleeding heavily? Don&apos;t wait for a message. Call 15 or go to the nearest
                emergency unit now.
              </p>
              <a
                href="tel:15"
                className="mt-5 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-urgent-red px-5 text-title-m text-white hover:brightness-110"
              >
                <Phone className="size-5" aria-hidden /> Call 15
              </a>
            </div>
            <AdvisoryNote long />
          </Reveal>
        </div>
      </PublicSection>
    </>
  )
}
