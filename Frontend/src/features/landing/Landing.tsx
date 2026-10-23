import { Link } from "react-router-dom"
import { motion } from "motion/react"
import {
  Activity,
  ArrowRight,
  ChevronRight,
  CloudOff,
  HeartHandshake,
  MapPin,
  MessageCircle,
  Phone,
  Play,
  ShieldCheck,
  Siren,
  Smartphone,
  Users,
  WifiOff,
  type LucideIcon,
} from "lucide-react"
import seed from "@/data/facilities.seed.json"
import type { Facility } from "@/api/types"
import { env } from "@/config/env"
import { ButtonLink } from "@/design/components/Button"
import { Landscape } from "@/design/components/Landscape"
import { UrgencyBadge } from "@/design/components/UrgencyBadge"
import { Reveal, SPRING, StaggerContainer, StaggerItem } from "@/design/motion"
import { formatXaf } from "@/lib/format"
import { cn } from "@/lib/utils"

/*
 * Landing, v2 (docs/DESIGN_LANGUAGE.md). Composition taken from the reference study:
 *  - Hero: editorial serif headline on the Buea landscape (One Medical type, Mercury scene),
 *    with a working "What do you need?" panel instead of a picture (NHS 111 options, Wise's
 *    live calculator): the first screen already does something.
 *  - Bento of real product fragments, not stock photos (Stripe, Headspace, Oscar).
 *  - One dark band for safety facts (Maven), then household + closing call to action.
 * Every number on this page comes from data or config; sample UI is labelled "Example".
 */

const FACILITIES = seed as unknown as Facility[]
const FACILITY_COUNT = FACILITIES.length
const COUNT = {
  emergency: FACILITIES.filter((f) => f.capabilities.includes("emergency")).length,
  maternity: FACILITIES.filter((f) => f.capabilities.includes("maternity")).length,
  allDay: FACILITIES.filter((f) => f.opening_hours === "24/7").length,
  quarters: new Set(FACILITIES.map((f) => f.quarter)).size,
}
const FEE = formatXaf(env.consultationFeeXaf)

const rise = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: SPRING.default },
}

// ---------- Hero ----------

const NEEDS: { to: string; icon: LucideIcon; title: string; meta: string }[] = [
  { to: "/app/triage", icon: Activity, title: "Check my symptoms", meta: "About 1 minute · free · works offline" },
  {
    to: "/app/facilities?locate=1",
    icon: MapPin,
    title: "Find the nearest facility",
    meta: `${FACILITY_COUNT} around Buea, sorted by distance`,
  },
  { to: "/app/consult/new", icon: MessageCircle, title: "Message a doctor", meta: `Text or voice note · ${FEE}` },
]

function NeedsPanel() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING.slow, delay: 0.25 }}
      className="w-full overflow-hidden rounded-2xl bg-white shadow-[var(--shadow-float)]"
    >
      <div className="px-5 pt-5 pb-2 sm:px-7 sm:pt-7">
        <p className="eyebrow">Start here</p>
        <h2 className="mt-2 text-headline-m">What do you need right now?</h2>
      </div>
      <ul className="px-2 pb-2 sm:px-4">
        {NEEDS.map((n, i) => (
          <motion.li
            key={n.to}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ...SPRING.default, delay: 0.45 + i * 0.07 }}
          >
            <Link
              to={n.to}
              className="group flex items-center gap-4 rounded-lg px-3 py-3.5 transition-colors hover:bg-cream sm:px-4"
            >
              <span
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-full transition-colors",
                  i === 0 ? "bg-brand-700 text-white" : "bg-mint text-brand-700 group-hover:bg-mint-200",
                )}
              >
                <n.icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-title-m text-ink-900">{n.title}</span>
                <span className="block text-body-m text-ink-600">{n.meta}</span>
              </span>
              <ChevronRight
                className="size-5 text-ink-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-700"
                aria-hidden
              />
            </Link>
          </motion.li>
        ))}
      </ul>
      <div className="flex flex-col gap-3 border-t border-urgent-red/15 bg-urgent-red-50 px-5 py-4 sm:flex-row sm:items-center sm:px-7">
        <p className="flex-1 text-body-m text-ink-900">
          <span className="font-semibold text-urgent-red">Emergency?</span> Can&apos;t breathe, won&apos;t wake or
          bleeding heavily: don&apos;t wait.
        </p>
        <a
          href="tel:15"
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-urgent-red px-4 text-label-l text-white hover:brightness-110"
        >
          <Phone className="size-4" aria-hidden /> Call 15
        </a>
      </div>
    </motion.div>
  )
}

function Hero() {
  return (
    <section className="relative isolate -mt-[76px] overflow-hidden bg-gradient-to-b from-mint via-cream to-cream lg:-mt-[92px]">
      <div className="relative z-10 container-page grid grid-cols-[minmax(0,1fr)] items-center gap-10 pt-[124px] pb-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-16 lg:pt-[clamp(128px,19svh,176px)]">
        <motion.div
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } } }}
          initial="hidden"
          animate="show"
          className="max-w-[660px]"
        >
          <motion.p variants={rise} className="eyebrow">
            Buea · Fako · works offline
          </motion.p>
          <motion.h1 variants={rise} className="mt-5 text-display-l lg:text-display-xl">
            Care that <em className="accent">reaches you.</em>
          </motion.h1>
          <motion.p variants={rise} className="mt-6 max-w-[540px] text-[18px] leading-[30px] text-ink-600">
            Check danger signs, find the nearest facility and hear from a doctor by text or voice note, for you or
            anyone in your household. Even when the network drops.
          </motion.p>
          <motion.div variants={rise} className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink to="/app/triage" icon={Activity} size="lg">
              Check symptoms
            </ButtonLink>
            <ButtonLink to="/how-it-works" variant="secondary" size="lg" trailing="arrow">
              How it works
            </ButtonLink>
          </motion.div>
          <motion.ul variants={rise} className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-body-m text-ink-600">
            {[
              { icon: CloudOff, text: "No signal? It still works" },
              { icon: Smartphone, text: "Any phone, no app store" },
              { icon: ShieldCheck, text: "Urgent cases seen first" },
            ].map((t) => (
              <li key={t.text} className="flex items-center gap-2">
                <t.icon className="size-4 text-brand-600" aria-hidden />
                {t.text}
              </li>
            ))}
          </motion.ul>
        </motion.div>
        <div className="w-full max-w-[520px] justify-self-center lg:justify-self-end">
          <NeedsPanel />
        </div>
      </div>
      {/* Mount Cameroon band: the ridges run into the dark facts strip below. */}
      <div className="relative -mt-10 h-[clamp(150px,20vw,280px)] lg:-mt-24" aria-hidden>
        <Landscape sky={false} viewBox="0 262 1440 584" preserve="none" className="inset-0" />
      </div>
    </section>
  )
}

// ---------- Facts strip ----------

function FactsStrip() {
  const facts = [
    { value: String(FACILITY_COUNT), label: "facilities saved offline" },
    { value: String(COUNT.emergency), label: "with emergency care" },
    { value: String(COUNT.allDay), label: "open 24/7" },
    { value: FEE, label: "per doctor consultation" },
  ]
  return (
    <section className="bg-ground text-white" aria-label="CareBridge in numbers">
      <div className="container-page grid grid-cols-2 gap-y-6 py-8 lg:grid-cols-4 lg:py-10">
        {facts.map((f, i) => (
          <Reveal
            key={f.label}
            delay={i * 0.05}
            className={cn("flex flex-col gap-1 px-1 lg:px-6", i > 0 && "lg:border-l lg:border-white/12")}
          >
            <span className="font-display text-[34px] leading-none font-[440] tracking-[-0.02em] tabular lg:text-[44px]">
              {f.value}
            </span>
            <span className="text-body-m text-white/70">{f.label}</span>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

// ---------- Bento: real product fragments ----------

function ExampleTag({ dark = false }: { dark?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full px-2 text-label-m",
        dark ? "bg-white/12 text-white/80" : "bg-ink-900/[0.05] text-ink-600",
      )}
    >
      Example
    </span>
  )
}

function TriageVignette() {
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-white p-4 shadow-[var(--shadow-elev-2)] sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <UrgencyBadge urgency="AMBER" />
        <ExampleTag />
      </div>
      <p className="font-display text-[24px] leading-[30px] font-[480] tracking-[-0.012em]">See a doctor today.</p>
      <ul className="flex flex-col gap-1.5 text-body-m text-ink-600">
        {["Hot body (fever)", "Breathing fast"].map((r) => (
          <li key={r} className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-urgent-amber" aria-hidden />
            {r}
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3 rounded-lg bg-cream p-3">
        <span className="flex size-10 items-center justify-center rounded-md bg-mint text-brand-700">
          <MapPin className="size-[18px]" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-label-l">Nearest clinic for this</span>
          <span className="block text-label-m font-normal text-ink-600">Sorted by distance from you</span>
        </span>
        <span className="flex size-9 items-center justify-center rounded-full bg-brand-700 text-white">
          <Phone className="size-4" aria-hidden />
        </span>
      </div>
    </div>
  )
}

function VoiceVignette() {
  return (
    <div className="flex flex-col gap-2">
      <p className="ml-auto max-w-[85%] rounded-lg rounded-br-sm bg-white px-4 py-2.5 text-body-m text-ink-900 shadow-[var(--shadow-elev-1)]">
        My daughter has had a fever since yesterday.
      </p>
      <div className="flex max-w-[90%] items-center gap-3 rounded-lg rounded-bl-sm bg-brand-700 px-3 py-2.5 text-white">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15">
          <Play className="size-4 fill-current" aria-hidden />
        </span>
        <span className="flex h-6 flex-1 items-center gap-[3px]" aria-hidden>
          {[6, 12, 18, 10, 22, 14, 8, 16, 20, 9, 13, 6, 11, 17].map((h, i) => (
            <motion.span
              key={i}
              className="w-[3px] rounded-full bg-white/75"
              animate={{ height: [h * 0.55, h, h * 0.7] }}
              transition={{ duration: 1.4, repeat: Infinity, repeatType: "mirror", delay: i * 0.06 }}
            />
          ))}
        </span>
        <span className="text-label-m text-white/80 tabular">0:42</span>
      </div>
      <p className="pl-1 text-label-m font-normal text-ink-600">Doctor · voice note</p>
    </div>
  )
}

function OfflineVignette() {
  return (
    <div className="flex flex-col gap-2">
      {[
        { icon: CloudOff, text: "Offline · 2 saved on this phone", tone: "bg-white text-ink-900" },
        { icon: ArrowRight, text: "Back online · sending…", tone: "bg-white/70 text-ink-600" },
        { icon: ShieldCheck, text: "Sent to the doctor", tone: "bg-brand-700 text-white" },
      ].map((s, i) => (
        <motion.div
          key={s.text}
          initial={{ opacity: 0, x: -10 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ ...SPRING.default, delay: 0.15 + i * 0.25 }}
          className={cn("flex h-11 items-center gap-2.5 rounded-full px-4 text-label-l shadow-[var(--shadow-elev-1)]", s.tone)}
        >
          <s.icon className="size-4" aria-hidden />
          {s.text}
        </motion.div>
      ))}
    </div>
  )
}

function HouseholdVignette() {
  const people = [
    { n: "You", t: "bg-brand-700" },
    { n: "Mother", t: "bg-brand-500" },
    { n: "Son, 4", t: "bg-land-near" },
  ]
  return (
    <div className="flex flex-col gap-2">
      {people.map((p, i) => (
        <div
          key={p.n}
          className={cn(
            "flex items-center gap-3 rounded-lg bg-white/90 p-2.5 pr-4 shadow-[var(--shadow-elev-1)]",
            i === 2 && "ring-2 ring-brand-700",
          )}
        >
          <span className={cn("flex size-9 items-center justify-center rounded-full text-label-l text-white", p.t)}>
            {p.n[0]}
          </span>
          <span className="flex-1 text-label-l">{p.n}</span>
          {i === 2 && <span className="text-label-m text-brand-700">Checking for</span>}
        </div>
      ))}
    </div>
  )
}

function Tile({
  eyebrow,
  title,
  body,
  to,
  cta,
  className,
  dark = false,
  children,
}: {
  eyebrow: string
  title: string
  body: string
  to: string
  cta: string
  className?: string
  dark?: boolean
  children: React.ReactNode
}) {
  return (
    <StaggerItem
      className={cn(
        "group flex flex-col justify-between gap-8 overflow-hidden rounded-2xl p-6 sm:p-8",
        dark ? "bg-brand-900 text-white" : "bg-white shadow-[var(--shadow-elev-1)]",
        className,
      )}
    >
      <div>
        <p className={cn("eyebrow", dark && "text-mint-200")}>{eyebrow}</p>
        <h3 className={cn("mt-3 max-w-[22ch] text-headline-m lg:text-headline-l", dark && "text-white")}>{title}</h3>
        <p className={cn("mt-3 max-w-[48ch] text-body-l", dark ? "text-white/75" : "text-ink-600")}>{body}</p>
        <Link
          to={to}
          className={cn(
            "mt-5 inline-flex items-center gap-1.5 text-label-l underline-offset-4 hover:underline",
            dark ? "text-white" : "text-brand-700",
          )}
        >
          {cta}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
      </div>
      {children}
    </StaggerItem>
  )
}

function Bento() {
  return (
    <section className="container-page section-y" aria-labelledby="bento-title">
      <Reveal className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-[640px]">
          <p className="eyebrow">What you can do</p>
          <h2 id="bento-title" className="mt-4 text-display-m">
            Built for how care <em className="accent">really</em> happens here.
          </h2>
        </div>
        <p className="max-w-[420px] text-body-l text-ink-600">
          Weak signal, shared phones, family decisions, mobile money. CareBridge was designed around all of it.
        </p>
      </Reveal>
      <StaggerContainer className="mt-12 grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-6 lg:gap-5" stagger={0.08}>
        <Tile
          eyebrow="Danger-sign check"
          title="Know how urgent it is, and why."
          body="Answer a few plain questions. You get red, amber or green with the reasons, then the nearest place that can help."
          to="/app/triage"
          cta="Check symptoms"
          className="bg-mint shadow-none lg:col-span-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-center lg:gap-12"
        >
          <div className="w-full max-w-[420px] lg:justify-self-end">
            <TriageVignette />
          </div>
        </Tile>
        <Tile
          eyebrow="Doctor consultations"
          title="A doctor replies by voice or text."
          body={`For you or someone you care for. ${FEE}, paid by Mobile Money.`}
          to="/app/consult/new"
          cta="Message a doctor"
          className="lg:col-span-3"
        >
          <VoiceVignette />
        </Tile>
        <Tile
          eyebrow="Offline first"
          title="No signal? Nothing is lost."
          body="Messages wait safely on your phone and send themselves when you reconnect."
          to="/how-it-works#help"
          cta="What works offline"
          dark
          className="lg:col-span-3"
        >
          <OfflineVignette />
        </Tile>
      </StaggerContainer>
    </section>
  )
}

// ---------- Safety band ----------

const SAFETY: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Siren,
    title: "Emergencies come first",
    body: "A red result always leads with Call 15 and directions, before anything else.",
  },
  {
    icon: ShieldCheck,
    title: "Advisory, never a diagnosis",
    body: "The check looks for danger signs so you know how fast to act. A clinician decides the rest.",
  },
  {
    icon: Users,
    title: "Most urgent, seen first",
    body: "Doctors work a queue ordered by urgency, so a sick child isn't stuck behind a routine question.",
  },
  {
    icon: WifiOff,
    title: "Built for a weak signal",
    body: "What you write is saved on your phone first and sent when you're back online, with its status shown.",
  },
]

function SafetyBand() {
  return (
    <section className="relative isolate overflow-hidden bg-ground text-white">
      <div className="container-page grid gap-12 py-20 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-20 lg:py-28">
        <Reveal className="flex flex-col gap-6 lg:sticky lg:top-28 lg:self-start">
          <p className="eyebrow text-mint-200">Safety by design</p>
          <h2 className="text-display-m text-white">
            Designed so the urgent case <em className="font-[inherit] text-mint-200 italic">never waits.</em>
          </h2>
          <p className="max-w-[46ch] text-body-l text-white/70">
            The symptom check looks for danger signs. Its rules are not yet clinically validated, so the advice
            always errs towards care: if in doubt, go now.
          </p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink to="/app/triage" variant="light" icon={Activity}>
              Check symptoms
            </ButtonLink>
            <ButtonLink to="/about" variant="outline-light" trailing="arrow">
              About CareBridge
            </ButtonLink>
          </div>
        </Reveal>
        <StaggerContainer as="ul" className="grid gap-px overflow-hidden rounded-2xl bg-white/10 sm:grid-cols-2" stagger={0.08}>
          {SAFETY.map((s) => (
            <StaggerItem as="li" key={s.title} className="flex flex-col gap-4 bg-ground p-6 sm:p-8">
              <span className="flex size-11 items-center justify-center rounded-full bg-white/8 ring-1 ring-white/15">
                <s.icon className="size-5 text-mint-200" aria-hidden />
              </span>
              <h3 className="text-title-l text-white">{s.title}</h3>
              <p className="text-body-m text-white/70">{s.body}</p>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>
    </section>
  )
}

// ---------- Household + facilities ----------

function HouseholdAndPlaces() {
  return (
    <section className="container-page section-y grid gap-5 lg:grid-cols-2">
      <Reveal className="flex flex-col justify-between gap-10 overflow-hidden rounded-2xl bg-white p-6 shadow-[var(--shadow-elev-1)] sm:p-10">
        <div>
          <p className="eyebrow">Care for someone you love</p>
          <h2 className="mt-4 text-headline-l lg:text-display-m">One phone for the whole household.</h2>
          <p className="mt-4 max-w-[46ch] text-body-l text-ink-600">
            Add family members who don&apos;t have a phone. Check symptoms or ask a doctor on their behalf, with each
            person&apos;s history kept separate.
          </p>
        </div>
        <div className="grid items-end gap-6 sm:grid-cols-[1fr_auto]">
          <div className="max-w-[320px]">
            <HouseholdVignette />
          </div>
          <ButtonLink to="/app/profile/household" icon={HeartHandshake} variant="tonal">
            Add your household
          </ButtonLink>
        </div>
      </Reveal>
      <Reveal delay={0.08} className="relative isolate flex flex-col justify-between gap-10 overflow-hidden rounded-2xl bg-mint-200 p-6 sm:p-10">
        <Landscape className="top-[52%] -z-10 opacity-90" sky={false} />
        <div>
          <p className="eyebrow">Facilities</p>
          <h2 className="mt-4 text-headline-l lg:text-display-m">
            Every clinic in Buea, <em className="accent">in your pocket.</em>
          </h2>
          <p className="mt-4 max-w-[46ch] text-body-l text-ink-900/80">
            {FACILITY_COUNT} facilities across {COUNT.quarters} quarters, including {COUNT.maternity} with maternity
            care. Sorted by distance, one tap to call, saved for offline use.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <ButtonLink to="/app/facilities?locate=1" icon={MapPin}>
            Find care near me
          </ButtonLink>
          <ButtonLink to="/app/facilities?capability=emergency" variant="light">
            Emergency care
          </ButtonLink>
        </div>
      </Reveal>
    </section>
  )
}

export default function Landing() {
  return (
    <>
      <Hero />
      <FactsStrip />
      <Bento />
      <SafetyBand />
      <HouseholdAndPlaces />
    </>
  )
}
