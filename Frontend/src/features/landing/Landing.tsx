import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { AnimatePresence, LayoutGroup, motion } from "motion/react"
import {
  Activity,
  ArrowRight,
  CreditCard,
  HeartHandshake,
  MapPin,
  Mic,
  Play,
  Users,
  WifiOff,
  type LucideIcon,
} from "lucide-react"
import seed from "@/data/facilities.seed.json"
import { env } from "@/config/env"
import { ButtonLink, LinkArrow } from "@/design/components/Button"
import { Landscape } from "@/design/components/Landscape"
import { UrgencyBadge } from "@/design/components/UrgencyBadge"
import { Reveal, SPRING, StaggerContainer, StaggerItem } from "@/design/motion"
import { Eyebrow } from "@/design/components/primitives"
import { formatXaf } from "@/lib/format"
import { cn } from "@/lib/utils"

const MotionLink = motion.create(Link)
const FACILITY_COUNT = (seed as unknown[]).length

const hero = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.15 } },
}
const rise = {
  hidden: { opacity: 0, y: 32 },
  show: { opacity: 1, y: 0, transition: SPRING.default },
}

// ---------- Interactive preview card ----------

const TABS = ["Triage", "Consult", "Pay"] as const
type Tab = (typeof TABS)[number]

const PREVIEW: Record<Tab, { title: string; body: string }> = {
  Triage: {
    title: "Know how urgent it is — in under a minute",
    body: "Danger-sign check that works offline, re-checked by our server when you reconnect.",
  },
  Consult: {
    title: "A doctor replies by text or voice note",
    body: "For you or someone in your household. Messages wait safely on your phone until you're online.",
  },
  Pay: {
    title: "Pay by mobile money — or for someone else",
    body: "One clear price per consultation. You get a receipt, and family can pay for you.",
  },
}

function TriagePreview() {
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <UrgencyBadge urgency="AMBER" />
        <span className="text-label-m text-ink-600">Example</span>
      </div>
      <div className="flex items-center gap-3 rounded-md bg-cream p-3">
        <span className="flex size-11 items-center justify-center rounded-md bg-mint">
          <Activity className="size-5 text-brand-700" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-title-m">Nearest clinic for this</span>
          <span className="block text-body-m text-ink-600">Sorted by distance from you</span>
        </span>
      </div>
    </div>
  )
}

function ConsultPreview() {
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-white p-4">
      <motion.p
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ ...SPRING.bouncy, delay: 0.05 }}
        className="ml-auto max-w-[80%] rounded-lg rounded-br-[6px] bg-brand-700 px-4 py-2 text-body-m text-white"
      >
        My daughter has had a fever since yesterday.
      </motion.p>
      <motion.div
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ ...SPRING.bouncy, delay: 0.25 }}
        className="flex max-w-[85%] items-center gap-3 rounded-lg rounded-bl-[6px] bg-mint px-3 py-2"
      >
        <span className="flex size-9 items-center justify-center rounded-full bg-brand-700 text-white">
          <Play className="size-4 fill-current" aria-hidden />
        </span>
        <span className="flex h-6 items-end gap-0.5" aria-hidden>
          {[8, 14, 20, 12, 18, 24, 10, 16, 22, 12, 8, 14].map((h, i) => (
            <motion.span
              key={i}
              className="w-1 rounded-full bg-brand-700/70"
              animate={{ height: [h * 0.5, h, h * 0.6] }}
              transition={{ duration: 1.2, repeat: Infinity, repeatType: "mirror", delay: i * 0.05 }}
            />
          ))}
        </span>
        <span className="text-label-m text-brand-900">Doctor · 0:42</span>
      </motion.div>
    </div>
  )
}

function PayPreview() {
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-white p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-body-m text-ink-600">Consultation</span>
        <motion.span
          className="text-headline-m"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={SPRING.bouncy}
        >
          {formatXaf(env.consultationFeeXaf)}
        </motion.span>
      </div>
      <div className="flex gap-2">
        <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-mint px-3 text-label-m text-brand-900">
          <CreditCard className="size-4" aria-hidden />
          Mobile money
        </span>
        <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-cream px-3 text-label-m text-ink-900">
          <Users className="size-4" aria-hidden />
          Pay for someone
        </span>
      </div>
    </div>
  )
}

function PreviewCard({ className }: { className?: string }) {
  const [tab, setTab] = useState<Tab>("Triage")
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (paused) return
    const id = window.setInterval(() => setTab((t) => TABS[(TABS.indexOf(t) + 1) % TABS.length]), 4500)
    return () => window.clearInterval(id)
  }, [paused])

  return (
    <motion.div
      initial={{ opacity: 0, y: 60, scale: 0.92, rotate: -2 }}
      animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
      transition={{ ...SPRING.bouncy, delay: 0.35 }}
      onHoverStart={() => setPaused(true)}
      onHoverEnd={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      className={cn("glass-strong flex flex-col gap-5 p-5 shape-bl sm:p-7", className)}
    >
      <LayoutGroup id="preview-tabs">
        <div className="flex items-center gap-2" role="tablist" aria-label="What CareBridge does">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                "relative h-10 rounded-full px-4 text-label-l transition-colors",
                tab === t ? "text-white" : "bg-white/70 text-ink-900 ring-1 ring-line ring-inset",
              )}
            >
              {tab === t && (
                <motion.span layoutId="preview-chip" className="absolute inset-0 rounded-full bg-brand-900" transition={SPRING.bouncy} />
              )}
              <span className="relative">{t}</span>
            </button>
          ))}
        </div>
      </LayoutGroup>
      <div className="relative min-h-[236px]" role="tabpanel">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -10, filter: "blur(6px)" }}
            transition={SPRING.default}
            className="flex flex-col gap-4"
          >
            <div>
              <h2 className="text-headline-s sm:text-headline-m">{PREVIEW[tab].title}</h2>
              <p className="mt-2 text-body-m text-ink-900">{PREVIEW[tab].body}</p>
            </div>
            {tab === "Triage" && <TriagePreview />}
            {tab === "Consult" && <ConsultPreview />}
            {tab === "Pay" && <PayPreview />}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="flex gap-1.5" aria-hidden>
        {TABS.map((t) => (
          <span key={t} className="relative h-1 flex-1 overflow-hidden rounded-full bg-brand-900/10">
            {tab === t && (
              <motion.span
                key={`${t}-${paused}`}
                className="absolute inset-y-0 left-0 rounded-full bg-brand-700"
                initial={{ width: "0%" }}
                animate={{ width: paused ? "100%" : "100%" }}
                transition={paused ? { duration: 0.2 } : { duration: 4.5, ease: "linear" }}
              />
            )}
          </span>
        ))}
      </div>
    </motion.div>
  )
}

// ---------- Sections ----------

function Hero() {
  return (
    <section className="relative isolate -mt-[76px] overflow-hidden bg-mint-200 lg:-mt-[92px]">
      <Landscape className="fade-top top-[30%] -z-10 sm:top-[22%] lg:top-[26%]" />
      <div className="container-page grid min-h-[100svh] items-center gap-10 pt-[112px] pb-20 lg:grid-cols-[1.1fr_0.9fr] lg:pt-[clamp(108px,17svh,140px)] lg:pb-[clamp(56px,11svh,128px)]">
        <motion.div variants={hero} initial="hidden" animate="show" className="max-w-[640px]">
          <motion.div variants={rise}>
            <Eyebrow>Offline-first care · Buea, Cameroon</Eyebrow>
          </motion.div>
          <motion.h1 variants={rise} className="mt-4 text-[52px] lg:mt-5 leading-[1] font-extrabold tracking-[-0.04em] sm:text-display-l lg:text-display-xl">
            Care that
            <br />
            reaches you.
          </motion.h1>
          <motion.p variants={rise} className="mt-5 text-headline-s text-brand-800">
            Even when the network doesn’t.
          </motion.p>
          <motion.p variants={rise} className="mt-4 max-w-[520px] text-body-l text-ink-900">
            Check danger signs, find the nearest facility and message a doctor by text or voice note — for you or
            someone in your household, on any phone.
          </motion.p>
          <motion.div variants={rise} className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink to="/app/triage" icon={Activity} size="lg">
              Check symptoms
            </ButtonLink>
            <ButtonLink to="/app/facilities?locate=1" icon={MapPin} variant="glass" size="lg">
              Find a facility
            </ButtonLink>
          </motion.div>
        </motion.div>
        <PreviewCard className="w-full max-w-[540px] justify-self-center lg:justify-self-end" />
      </div>
    </section>
  )
}

function GroundBand() {
  return (
    <section className="bg-ground text-white">
      <div className="container-page grid gap-6 py-14 lg:grid-cols-[1fr_300px_1.2fr] lg:gap-8 lg:py-20">
        <Reveal className="flex flex-col gap-4 bg-brand-800 p-7 shape-br">
          <MapPin className="size-8 text-mint-200" aria-hidden />
          <h2 className="text-headline-l text-white">{FACILITY_COUNT} verified facilities around Buea</h2>
          <p className="text-body-m text-white/80">
            Molyko · Buea Town · Great Soppo · Mile 17. Saved on your phone, sorted by distance, one tap to call.
          </p>
        </Reveal>
        <StaggerContainer className="flex flex-col gap-4" stagger={0.1}>
          <StaggerItem className="glass-dark rounded-xl p-6">
            <WifiOff className="size-6 text-mint-200" aria-hidden />
            <p className="mt-3 text-headline-m text-white">Works offline</p>
            <p className="text-body-m text-white/80">Facilities and symptom checks need no network</p>
          </StaggerItem>
          <StaggerItem className="glass-dark rounded-xl p-6">
            <p className="text-headline-m text-white">{formatXaf(env.consultationFeeXaf)}</p>
            <p className="text-body-m text-white/80">per consultation, paid by mobile money</p>
          </StaggerItem>
        </StaggerContainer>
        <Reveal variant="right" className="flex flex-col justify-center gap-6">
          <p className="text-headline-l text-white lg:text-display-m">CHECK, FIND AND CONSULT — EVEN OFFLINE.</p>
          <LinkArrow to="/how-it-works" light>
            How it works
          </LinkArrow>
          <p className="text-body-m text-white/70">Advisory, not a diagnosis. In an emergency call 15.</p>
        </Reveal>
      </div>
    </section>
  )
}

const STEPS: { icon: LucideIcon; title: string; body: string; to: string }[] = [
  { icon: Activity, title: "Check danger signs", body: "Answer a few questions. Get red, amber or green — and why.", to: "/app/triage" },
  { icon: MapPin, title: "Find the right place", body: "The nearest facility that can help, with one tap to call.", to: "/app/facilities" },
  { icon: Mic, title: "Talk to a doctor", body: "Send text or a voice note. Pay by mobile money.", to: "/app/consult/new" },
]

function Steps() {
  return (
    <section className="container-page section-y">
      <Reveal className="max-w-[640px]">
        <Eyebrow>How it works</Eyebrow>
        <h2 className="mt-4 text-headline-l lg:text-display-m">Three steps to the right care.</h2>
      </Reveal>
      <StaggerContainer className="mt-10 grid gap-4 md:grid-cols-3" stagger={0.1}>
        {STEPS.map((s, i) => (
          <StaggerItem key={s.title}>
            <MotionLink
              to={s.to}
              whileHover={{ y: -6, borderRadius: "32px" }}
              transition={SPRING.fast}
              style={{ borderRadius: ["40px 16px 40px 40px", "40px 40px 40px 16px", "40px 40px 16px 40px"][i] }}
              className={cn(
                "group flex h-full flex-col gap-6 p-7",
                i === 1 ? "bg-brand-700 text-white" : i === 0 ? "bg-mint" : "bg-white shadow-[var(--shadow-elev-1)]",
              )}
            >
              <span className="flex items-center justify-between">
                <span className={cn("flex size-14 items-center justify-center rounded-full", i === 1 ? "bg-white/15" : "bg-white")}>
                  <s.icon className={cn("size-6", i === 1 ? "text-white" : "text-brand-700")} aria-hidden />
                </span>
                <span className={cn("text-display-m", i === 1 ? "text-white/25" : "text-brand-700/15")}>0{i + 1}</span>
              </span>
              <span>
                <span className={cn("block text-headline-s", i === 1 ? "text-white" : "text-ink-900")}>{s.title}</span>
                <span className={cn("mt-2 block text-body-l", i === 1 ? "text-white/80" : "text-ink-600")}>{s.body}</span>
              </span>
              <ArrowRight
                className={cn("mt-auto size-6 transition-transform group-hover:translate-x-1", i === 1 ? "text-white" : "text-brand-700")}
                aria-hidden
              />
            </MotionLink>
          </StaggerItem>
        ))}
      </StaggerContainer>
    </section>
  )
}

function Household() {
  return (
    <section className="container-page pb-14 lg:pb-24">
      <Reveal className="relative isolate overflow-hidden bg-mint-200 p-8 shape-tl lg:p-14">
        <div className="grid items-center gap-8 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <Eyebrow>Care for someone you love</Eyebrow>
            <h2 className="mt-4 text-headline-l lg:text-display-m">One phone can care for the whole household.</h2>
            <p className="mt-4 max-w-[520px] text-body-l text-ink-900">
              Add family members without phones, run a symptom check for them, and keep each person’s history separate.
            </p>
            <ButtonLink to="/app/profile/household" className="mt-8" icon={HeartHandshake} size="lg">
              Add your household
            </ButtonLink>
          </div>
          <div className="flex justify-center gap-3" aria-hidden>
            {["M", "A", "T"].map((l, i) => (
              <motion.span
                key={l}
                className="flex size-24 items-center justify-center bg-white text-display-m text-brand-700 shadow-[var(--shadow-elev-2)] lg:size-32"
                style={{ borderRadius: i === 1 ? "50%" : i === 0 ? "40px 40px 40px 16px" : "40px 16px 40px 40px" }}
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: i * 0.4 }}
              >
                {l}
              </motion.span>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  )
}

export default function Landing() {
  return (
    <>
      <Hero />
      <GroundBand />
      <Steps />
      <Household />
    </>
  )
}
