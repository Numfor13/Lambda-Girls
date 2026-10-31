import { useEffect, useState } from "react"
import { useReducedMotion } from "motion/react"
import {
  Activity,
  CloudOff,
  Eye,
  HardDrive,
  Languages,
  MapPin,
  Phone,
  ShieldCheck,
  Stethoscope,
  UserX,
  Users,
  type LucideIcon,
} from "lucide-react"
import seed from "@/data/facilities.seed.json"
import type { Facility, Urgency } from "@/api/types"
import { flags } from "@/config/flags"
import { ButtonLink } from "@/design/components/Button"
import { FacilityMap } from "@/design/components/FacilityMap"
import { NumberTicker, PulseDot } from "@/design/components/Lively"
import { ExampleTag, PublicIntro, PublicSection } from "@/design/components/PublicPage"
import { UrgencyBadge } from "@/design/components/UrgencyBadge"
import { Reveal, StaggerContainer, StaggerItem } from "@/design/motion"
import { cn } from "@/lib/utils"

/*
 * About, from the "about us page" study (Mercury, Monzo, Headspace and ~10 Dribbble pages): a
 * mission statement, the real numbers behind it, what we believe, then who it's for. The map
 * is the real directory, not a stock photo. Plain words throughout (QA P6).
 */

const FACILITIES = seed as unknown as Facility[]
const ALL_DAY = FACILITIES.filter((f) => f.opening_hours === "24/7")
const NUMBERS = [
  { value: FACILITIES.length, label: "facilities saved on every phone" },
  { value: new Set(FACILITIES.map((f) => f.quarter)).size, label: "quarters of Buea covered" },
  { value: FACILITIES.filter((f) => f.capabilities.includes("emergency")).length, label: "with emergency care" },
  { value: ALL_DAY.length, label: "open day and night" },
]

function DirectoryMap() {
  const reduce = useReducedMotion()
  const [i, setI] = useState(0)
  useEffect(() => {
    if (reduce || !ALL_DAY.length) return
    const t = window.setInterval(() => setI((x) => (x + 1) % ALL_DAY.length), 2400)
    return () => window.clearInterval(t)
  }, [reduce])
  return (
    <div className="rounded-2xl bg-white p-3 shadow-[var(--shadow-float)] sm:p-4">
      <div className="flex items-center justify-between gap-3 px-2 pt-1 pb-3">
        <p className="flex items-center gap-2 text-title-m">
          <MapPin className="size-5 text-brand-700" aria-hidden /> Around Buea
        </p>
        <span className="text-label-m text-ink-600 tabular">{FACILITIES.length} places</span>
      </div>
      <FacilityMap
        all={FACILITIES}
        shown={FACILITIES}
        highlight={reduce ? null : (ALL_DAY[i]?.facility_id ?? null)}
        origin={null}
      />
    </div>
  )
}

const BELIEFS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Activity,
    title: "The most urgent person goes first",
    body: "Danger signs come before everything else: in the symptom check, in the doctor's queue and on every result. Call 15 is always one tap away.",
  },
  {
    icon: CloudOff,
    title: "No signal shouldn't mean no help",
    body: "The symptom check and the facility directory live on your phone. Messages wait and send when the network returns.",
  },
  {
    icon: Users,
    title: "One phone can care for a family",
    body: "A parent, carer or neighbour can check symptoms and ask a doctor for someone who doesn't have their own phone, with their permission.",
  },
  {
    icon: Languages,
    title: "Plain words, never a diagnosis",
    body: "We say what to do next in everyday language. Only a clinician who sees the person can diagnose, and we say so on every result.",
  },
]

function QueuePreview() {
  const rows: { urgency: Urgency; text: string; wait: string }[] = [
    { urgency: "RED", text: "Breathing fast, 2 years", wait: "4 min" },
    { urgency: "AMBER", text: "Fever for 3 days, 34 years", wait: "18 min" },
    { urgency: "GREEN", text: "Skin rash, 8 years", wait: "1 h" },
  ]
  return (
    <div className="rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/12 ring-inset sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-label-l text-white">
          <PulseDot tone="light" /> Doctor queue
        </p>
        <ExampleTag dark />
      </div>
      <ul className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <li
            key={r.text}
            className={cn("flex items-center gap-3 rounded-lg bg-white p-3 text-ink-900", i === 0 && "ring-2 ring-urgent-red ring-offset-2 ring-offset-ground")}
          >
            <UrgencyBadge urgency={r.urgency} size="sm" short />
            <span className="min-w-0 flex-1 truncate text-label-l">{r.text}</span>
            <span className="text-label-m text-ink-600 tabular">{r.wait}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function About() {
  return (
    <>
      <PublicIntro
        eyebrow="About CareBridge"
        title={
          <>
            Health care that <em className="accent">finds you</em>, wherever you are in Buea.
          </>
        }
        lede="CareBridge helps families in Buea know when to get care, where to go and how to reach a doctor, from any phone, even on a weak connection. It's a web app: open it in the browser and add it to your home screen."
        actions={
          <>
            <ButtonLink to="/app/facilities" icon={MapPin} size="lg">
              Find care near you
            </ButtonLink>
            <ButtonLink to="/how-it-works" variant="secondary" size="lg" trailing="arrow">
              How it works
            </ButtonLink>
          </>
        }
        aside={<DirectoryMap />}
      />

      <section className="bg-ground text-white" aria-label="CareBridge in numbers">
        <div className="container-page grid grid-cols-2 gap-y-6 py-8 lg:grid-cols-4 lg:py-10">
          {NUMBERS.map((n, i) => (
            <Reveal key={n.label} delay={i * 0.05} className={cn("flex flex-col gap-1 px-1 lg:px-6", i > 0 && "lg:border-l lg:border-white/12")}>
              <NumberTicker
                value={n.value}
                className="font-display text-[34px] leading-none font-[440] tracking-[-0.02em] tabular lg:text-[44px]"
              />
              <span className="text-body-m text-white/70">{n.label}</span>
            </Reveal>
          ))}
        </div>
      </section>

      <PublicSection eyebrow="What we believe" title="Built around the next step, not the app.">
        <StaggerContainer className="grid gap-4 sm:grid-cols-2">
          {BELIEFS.map((b, i) => (
            <StaggerItem
              key={b.title}
              className={cn(
                "flex flex-col gap-4 rounded-2xl p-6 lg:p-8",
                i === 0 ? "bg-brand-900 text-white" : "bg-white shadow-[var(--shadow-elev-1)]",
              )}
            >
              <span
                className={cn(
                  "flex size-12 items-center justify-center rounded-md",
                  i === 0 ? "bg-white/12 text-mint-200" : "bg-mint text-brand-700",
                )}
              >
                <b.icon className="size-6" aria-hidden />
              </span>
              <h3 className={cn("text-headline-s", i === 0 && "text-white")}>{b.title}</h3>
              <p className={cn("text-body-l", i === 0 ? "text-white/80" : "text-ink-600")}>{b.body}</p>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </PublicSection>

      <PublicSection
        id="providers"
        dark
        eyebrow="For doctors and health workers"
        title="See the most urgent case first."
        lede="Cases arrive with the symptom check already done: the danger signs, the person's age and how long they've waited. Reply by text or voice and give a prescription or referral code the patient carries to the pharmacy or facility."
      >
        <div className="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
          <ul className="flex flex-col gap-4">
            {[
              { icon: Activity, text: "Ordered by urgency, then by waiting time" },
              { icon: Stethoscope, text: "The symptom-check answers come with every case" },
              { icon: ShieldCheck, text: "Access is given by the service, not by sign-up" },
            ].map((r) => (
              <li key={r.text} className="flex items-center gap-4 text-body-l text-white/85">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-mint-200">
                  <r.icon className="size-5" aria-hidden />
                </span>
                {r.text}
              </li>
            ))}
            <li className="pt-2">
              <ButtonLink to="/staff/sign-in" variant="light">
                Staff sign-in
              </ButtonLink>
            </li>
          </ul>
          <Reveal variant="right" className="min-w-0">
            <QueuePreview />
          </Reveal>
        </div>
      </PublicSection>

      <PublicSection
        id="privacy"
        eyebrow="Privacy"
        title="Your information, your phone."
        lede="Shared phones are common, so here is plainly what stays where."
      >
        <StaggerContainer className="grid gap-4 lg:grid-cols-3">
          {[
            {
              icon: HardDrive,
              title: "Some care stays on this phone",
              body: "So parts of the app work offline, recent checks and messages are saved in this browser. Anyone who opens it may see them.",
            },
            {
              icon: Eye,
              title: "On a shared phone, sign out",
              body: "Sign out from Profile when you've finished. That removes your session from this browser.",
            },
            {
              icon: UserX,
              title: "Ask without an account",
              body: flags.anonymous
                ? "Anonymous questions last 7 days on this phone. Forgetting the session removes your way back; it doesn't delete what the doctor saw. Mobile Money may still show your number to the payment provider."
                : "Find facilities and check symptoms without signing in. Nothing you tick is sent anywhere until you choose to.",
            },
          ].map((p) => (
            <StaggerItem key={p.title} className="flex flex-col gap-3 rounded-2xl bg-white p-6 shadow-[var(--shadow-elev-1)]">
              <p.icon className="size-6 text-brand-700" aria-hidden />
              <h3 className="text-title-l">{p.title}</h3>
              <p className="text-body-l text-ink-600">{p.body}</p>
            </StaggerItem>
          ))}
        </StaggerContainer>
        {flags.anonymous && (
          <ButtonLink className="mt-6" variant="tonal" to="/ask">
            Ask a doctor anonymously
          </ButtonLink>
        )}
      </PublicSection>

      <section id="contact" className="scroll-mt-24">
        <div className="container-page pb-16 lg:pb-24">
          <Reveal className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <div className="flex flex-col justify-between gap-6 rounded-2xl bg-mint p-6 lg:p-10">
              <div>
                <p className="eyebrow">Need help?</p>
                <p className="mt-3 text-headline-l">Start with the step that fits.</p>
                <p className="mt-3 max-w-[52ch] text-body-l text-ink-600">
                  Worried about symptoms? Run the check. Need a doctor&apos;s view? Send a message. Unsure how something works? Read the
                  short answers.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <ButtonLink to="/app/triage" icon={Activity}>
                  Check symptoms
                </ButtonLink>
                <ButtonLink to="/how-it-works#help" variant="secondary">
                  Read the answers
                </ButtonLink>
              </div>
            </div>
            <div className="flex flex-col justify-between gap-6 rounded-2xl bg-urgent-red-50 p-6 lg:p-10">
              <div>
                <p className="text-title-l text-urgent-red">Emergency</p>
                <p className="mt-3 text-body-l text-ink-900">
                  CareBridge isn&apos;t an emergency service. If someone can&apos;t breathe, won&apos;t wake or is bleeding heavily, call now.
                </p>
              </div>
              <a
                href="tel:15"
                className="inline-flex h-12 items-center justify-center gap-2 self-start rounded-full bg-urgent-red px-5 text-title-m text-white hover:brightness-110"
              >
                <Phone className="size-5" aria-hidden /> Call 15
              </a>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  )
}
