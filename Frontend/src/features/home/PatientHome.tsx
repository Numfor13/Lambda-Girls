import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { useLiveQuery } from "dexie-react-hooks"
import { useQuery } from "@tanstack/react-query"
import { motion } from "motion/react"
import {
  Activity,
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  Download,
  Droplet,
  FlaskConical,
  History,
  Lightbulb,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react"
import { consultApi, extendedApi } from "@/api/endpoints"
import { LAB_STEPS, serviceApi, type Appointment, type LabRequest } from "@/api/services"
import type { HouseholdMember } from "@/api/types"
import { useAuth } from "@/auth/AuthProvider"
import { env } from "@/config/env"
import { flags } from "@/config/flags"
import { Button, ButtonA, ButtonLink } from "@/design/components/Button"
import { FacilityRow } from "@/design/components/FacilityRow"
import { AvatarStack, NumberTicker, PulseDot, PulseLine, Skeleton, StepTrack } from "@/design/components/Lively"
import { Avatar, SectionHeader } from "@/design/components/primitives"
import { UrgencyBadge } from "@/design/components/UrgencyBadge"
import { SPRING, popIn, staggerOnMount } from "@/design/motion"
import { STATUS_LABEL, reconcileStatus } from "@/features/consult/actions"
import { useProfile } from "@/features/profile/useProfile"
import { rankFacilities } from "@/lib/geo"
import { ageInMonths, describeAge, formatDate, formatXaf, timeAgo } from "@/lib/format"
import { useGeolocation, useNow } from "@/lib/hooks"
import { APPOINTMENT_STATUS_LABEL, LAB_STATUS_LABEL, SLOT_LABEL, humanize, plural } from "@/lib/labels"
import { cn } from "@/lib/utils"
import { db, type LocalConsultation } from "@/offline/db"
import { useFacilities } from "@/offline/facilities"

interface InstallEvent extends Event {
  prompt: () => Promise<void>
}

function useInstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null)
  const [installed, setInstalled] = useState(() => window.matchMedia("(display-mode: standalone)").matches)
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setEvent(e as InstallEvent)
    }
    const onInstalled = () => setInstalled(true)
    window.addEventListener("beforeinstallprompt", onPrompt)
    window.addEventListener("appinstalled", onInstalled)
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
  return { event, installed, isIos, clear: () => setEvent(null) }
}

function greeting(now: number) {
  const h = new Date(now).getHours()
  if (h < 12) return "Good morning"
  if (h < 18) return "Good afternoon"
  return "Good evening"
}

// ---------- Greeting ----------

function Greeting({ name }: { name?: string }) {
  const now = useNow(60_000)
  return (
    <motion.header variants={popIn} className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
      <h1 className="text-headline-l lg:text-display-m">
        {greeting(now)}
        {name ? (
          <>
            , <em className="accent">{name.split(" ")[0]}.</em>
          </>
        ) : (
          "."
        )}
      </h1>
      <p className="text-body-m text-ink-600">
        {new Date(now).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
      </p>
    </motion.header>
  )
}

// ---------- Hero: the danger-sign check, started for the right person ----------

/**
 * The one dark moment on Home. Left: why and how to start. Right: who the check is for
 * (Kin / NHS 111 "who is this for" first question), so a parent goes straight to the
 * child's check with age and sex already filled in.
 */
function HeroBand({ signedIn, members }: { signedIn: boolean; members: HouseholdMember[] }) {
  const now = useNow(3_600_000)
  const people = [
    ...(signedIn ? [{ key: "me", name: "Me", sub: "Your own check", to: "/app/triage?for=me" }] : []),
    ...members.slice(0, 3).map((m) => ({
      key: m.member_id,
      name: m.name,
      sub: `${humanize(m.relationship)} · ${describeAge(ageInMonths(m.dob, now))}`,
      to: `/app/triage?for=${encodeURIComponent(m.member_id)}`,
    })),
  ]
  return (
    <motion.section
      variants={popIn}
      className="relative isolate overflow-hidden rounded-2xl bg-brand-900 text-white"
      aria-labelledby="home-hero"
    >
      <div className="absolute -right-24 -bottom-40 -z-10 size-[460px] rounded-full bg-brand-500/35 blur-[100px]" aria-hidden />
      <PulseLine className="absolute inset-x-0 bottom-0 -z-10 h-14 w-full opacity-60" />
      <div className="grid gap-8 p-6 pb-14 sm:p-8 sm:pb-16 lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)] lg:items-center lg:gap-12 lg:p-10 lg:pb-16 short:gap-8 short:px-8 short:pt-7 short:pb-12">
        <div className="max-w-[560px]">
          <p className="eyebrow text-mint-200">Danger-sign check · about 1 minute</p>
          <h2 id="home-hero" className="mt-3 text-display-m text-white">
            How are you <em className="text-mint-200 italic">feeling</em> today?
          </h2>
          <p className="mt-3 max-w-[46ch] text-body-l text-white/75">
            A few plain questions. You&apos;ll see how urgent it is and where to go. Works without network.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row short:mt-5">
            <ButtonLink to="/app/triage" icon={Activity} size="lg" variant="light">
              Check symptoms
            </ButtonLink>
            <ButtonA href="tel:15" icon={Phone} variant="danger" size="lg" aria-label="Call emergency 15">
              Emergency · 15
            </ButtonA>
          </div>
        </div>

        <div className="rounded-xl bg-white/[0.07] p-2 ring-1 ring-white/12">
          <p className="px-3 pt-2 pb-1 text-label-l text-white/70">
            {people.length ? "Checking for someone?" : "No account needed for the check"}
          </p>
          <ul className="grid grid-cols-2 gap-0.5 lg:flex lg:flex-col">
            {people.map((p, i) => (
              <motion.li
                key={p.key}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...SPRING.default, delay: 0.25 + i * 0.07 }}
              >
                <Link
                  to={p.to}
                  className="group flex min-h-12 items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-white/10 lg:min-h-14 lg:px-3 short:min-h-12"
                >
                  {p.key === "me" ? (
                    <span className="flex size-9 items-center justify-center rounded-full bg-mint-200 text-brand-900">
                      <UserRound className="size-[18px]" aria-hidden />
                    </span>
                  ) : (
                    <Avatar name={p.name} size="sm" className="ring-brand-900" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-label-l text-white">{p.name}</span>
                    <span className="hidden truncate text-body-m text-white/65 lg:block">{p.sub}</span>
                  </span>
                  <ChevronRight className="hidden size-4 text-white/50 transition-transform group-hover:translate-x-0.5 lg:block" aria-hidden />
                </Link>
              </motion.li>
            ))}
            <li>
              <Link
                to={signedIn ? "/app/triage?for=other" : "/app/triage"}
                className="group flex min-h-12 items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-white/10 lg:min-h-14 lg:px-3 short:min-h-12"
              >
                <span className="flex size-9 items-center justify-center rounded-full bg-white/10 text-white">
                  <Users className="size-[18px]" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-label-l text-white">{signedIn ? "Someone else" : "Start the check"}</span>
                  <span className="hidden text-body-m text-white/65 lg:block">
                    {signedIn ? "A neighbour, a visitor" : "Saved on this phone only"}
                  </span>
                </span>
                <ChevronRight className="hidden size-4 text-white/50 transition-transform group-hover:translate-x-0.5 lg:block" aria-hidden />
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </motion.section>
  )
}

// ---------- Quick actions ----------

function Tile({
  to,
  title,
  sub,
  icon: Icon,
  primary = false,
}: {
  to: string
  title: string
  sub: React.ReactNode
  icon: LucideIcon
  primary?: boolean
}) {
  return (
    <motion.div variants={popIn} className="h-full">
      <Link
        to={to}
        className={cn(
          "group flex h-full min-h-[120px] flex-col justify-between gap-5 rounded-xl p-4 transition-[box-shadow,background-color] duration-200 sm:p-5 short:min-h-0 short:gap-3 short:p-4",
          primary
            ? "bg-brand-700 text-white hover:bg-brand-800"
            : "bg-white shadow-[var(--shadow-elev-1)] hover:shadow-[var(--shadow-elev-2)]",
        )}
      >
        <span className="flex items-start justify-between">
          <span
            className={cn(
              "flex size-10 items-center justify-center rounded-full transition-transform duration-300 group-hover:-translate-y-0.5",
              primary ? "bg-white/15 text-white" : "bg-mint text-brand-700",
            )}
          >
            <Icon className="size-5" strokeWidth={1.9} aria-hidden />
          </span>
          <ArrowUpRight
            className={cn(
              "size-5 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5",
              primary ? "text-white/70" : "text-ink-400",
            )}
            aria-hidden
          />
        </span>
        <span>
          <span className={cn("block text-title-m", primary ? "text-white" : "text-ink-900")}>{title}</span>
          <span className={cn("block text-body-m", primary ? "text-white/75" : "text-ink-600")}>{sub}</span>
        </span>
      </Link>
    </motion.div>
  )
}

function QuickActions({ facilityCount, members, signedIn }: { facilityCount?: number; members: number; signedIn: boolean }) {
  return (
    <section aria-labelledby="qa-title">
      <h2 id="qa-title" className="sr-only">
        Quick actions
      </h2>
      <motion.div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4" variants={staggerOnMount(0.05)}>
        <Tile to="/app/consult/new" title="Talk to a doctor" sub="Text or voice note" icon={MessageCircle} primary />
        <Tile
          to="/app/facilities?locate=1"
          title="Find a facility"
          sub={facilityCount ? <><NumberTicker value={facilityCount} /> around Buea</> : "Near you"}
          icon={MapPin}
        />
        {signedIn ? (
          <Tile
            to="/app/profile/household"
            title="Household"
            sub={members ? plural(members, "person", "people") : "Add family"}
            icon={Users}
          />
        ) : (
          <Tile to="/sign-in?returnTo=/app" title="Sign in" sub="Keep your history" icon={UserRound} />
        )}
        <Tile to="/app/consults" title="My consultations" sub="Replies and receipts" icon={History} />
      </motion.div>
    </section>
  )
}

// ---------- Your care: everything in progress, in one timeline ----------

const CONSULT_STEP: Record<LocalConsultation["status"], number> = { pending_payment: 0, paid: 1, open: 2, closed: 3 }

function CareItem({
  icon,
  title,
  meta,
  status,
  live,
  children,
  action,
}: {
  icon: React.ReactNode
  title: React.ReactNode
  meta: React.ReactNode
  status: string
  live?: boolean
  children?: React.ReactNode
  action: React.ReactNode
}) {
  return (
    <motion.li
      variants={popIn}
      layout
      className="flex flex-col gap-4 rounded-xl bg-white p-4 shadow-[var(--shadow-elev-1)] sm:flex-row sm:items-center sm:p-5"
    >
      <div className="flex min-w-0 flex-1 gap-4">
        {icon}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-label-m text-ink-600">
            <PulseDot live={live} tone={live ? "brand" : "muted"} />
            {status}
          </p>
          <p className="mt-1 line-clamp-2 text-title-m">{title}</p>
          <p className="mt-0.5 text-body-m text-ink-600">{meta}</p>
          {children && <div className="mt-3">{children}</div>}
        </div>
      </div>
      <div className="flex shrink-0 gap-2 sm:w-[190px] sm:flex-col">{action}</div>
    </motion.li>
  )
}

function IconTile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-mint text-brand-700">
      <Icon className="size-[22px]" strokeWidth={1.8} aria-hidden />
    </span>
  )
}

function DateTile({ iso }: { iso: string }) {
  const d = new Date(`${iso}T00:00:00`)
  return (
    <span className="flex size-12 shrink-0 flex-col items-center justify-center rounded-lg bg-brand-900 text-white">
      <span className="text-[10px] leading-none font-semibold tracking-[0.08em] text-mint-200 uppercase">
        {d.toLocaleDateString("en-GB", { month: "short" })}
      </span>
      <span className="mt-0.5 font-display text-[22px] leading-none font-[460] tabular">{d.getDate()}</span>
    </span>
  )
}

function YourCare({
  consults,
  appointments,
  labs,
  loading,
  facilityName,
}: {
  consults: LocalConsultation[]
  appointments: Appointment[]
  labs: LabRequest[]
  loading: boolean
  facilityName: (id: string) => string
}) {
  const now = useNow(60_000)
  const total = consults.length + appointments.length + labs.length
  return (
    <motion.section variants={popIn} aria-labelledby="care-title">
      <SectionHeader
        id="care-title"
        title={total ? `Your care · ${total} in progress` : "Your care"}
        to="/app/history"
        linkLabel="History"
      />
      {loading && !total ? (
        <div className="flex flex-col gap-3" role="status" aria-label="Loading your care">
          {[0, 1].map((i) => (
            <div key={i} className="flex gap-4 rounded-xl bg-white p-5 shadow-[var(--shadow-elev-1)]">
              <Skeleton className="size-12 rounded-lg" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : total ? (
        <motion.ul className="flex flex-col gap-3" variants={staggerOnMount(0.06)}>
          {consults.map((c) => {
            const ref = c.consultation_id ?? c.local_id
            return (
              <CareItem
                key={c.local_id}
                icon={<IconTile icon={MessageCircle} />}
                status={c.status === "open" ? "A doctor is on your case" : STATUS_LABEL[c.status]}
                live={c.status !== "pending_payment"}
                title={c.complaint}
                meta={
                  <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                    {c.urgency && <UrgencyBadge urgency={c.urgency} short />}
                    For {c.subject_label === "You" ? "you" : c.subject_label} · {timeAgo(c.created_at, now)}
                  </span>
                }
                action={
                  c.status === "pending_payment" ? (
                    <>
                      <ButtonLink to={`/app/consult/${ref}/pay`} full>
                        Pay {formatXaf(env.consultationFeeXaf)}
                      </ButtonLink>
                      <ButtonLink to={`/app/consult/${ref}`} variant="ghost" full>
                        Open chat
                      </ButtonLink>
                    </>
                  ) : (
                    <ButtonLink to={`/app/consult/${ref}`} icon={MessageCircle} variant="tonal" full>
                      Open chat
                    </ButtonLink>
                  )
                }
              >
                <StepTrack steps={["Paid", "In queue", "With doctor"]} at={CONSULT_STEP[c.status]} label="Consultation progress" />
              </CareItem>
            )
          })}
          {appointments.map((ap) => (
            <CareItem
              key={ap.appointment_id}
              icon={<DateTile iso={ap.slot_date} />}
              status={APPOINTMENT_STATUS_LABEL[ap.status]}
              live={ap.status === "requested"}
              title={facilityName(ap.facility_id)}
              meta={`${formatDate(ap.slot_date)} · ${SLOT_LABEL[ap.slot_label]}`}
              action={
                <ButtonLink to="/app/appointments" variant="tonal" icon={CalendarDays} full>
                  View visit
                </ButtonLink>
              }
            />
          ))}
          {labs.map((l) => (
            <CareItem
              key={l.request_id}
              icon={<IconTile icon={FlaskConical} />}
              status={LAB_STATUS_LABEL[l.status]}
              live={l.status !== "results_ready"}
              title={humanize(l.test_type)}
              meta={facilityName(l.facility_id)}
              action={
                <ButtonLink to={`/app/labs/${l.request_id}`} variant="tonal" full>
                  {l.status === "results_ready" ? "See results" : "Track test"}
                </ButtonLink>
              }
            >
              <StepTrack
                steps={["Requested", "Sample", "Results"]}
                at={LAB_STEPS.indexOf(l.status)}
                label="Lab test progress"
              />
            </CareItem>
          ))}
        </motion.ul>
      ) : (
        <div className="flex flex-col gap-4 rounded-xl bg-white p-5 shadow-[var(--shadow-elev-1)] sm:flex-row sm:items-center sm:p-6">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-mint text-brand-700">
            <MessageCircle className="size-6" aria-hidden />
          </span>
          <div className="flex-1">
            <p className="text-title-m">Nothing in progress</p>
            <p className="mt-0.5 text-body-m text-ink-600">
              Consultations, visits and lab tests you start will show here with their progress.
            </p>
          </div>
          <ButtonLink to="/app/consult/new" variant="tonal" icon={Plus}>
            Message a doctor
          </ButtonLink>
        </div>
      )}
    </motion.section>
  )
}

// ---------- More services ----------

function MoreServices() {
  const items = [
    flags.appointments && { to: "/app/appointments", title: "Appointments", sub: "Request a visit", icon: CalendarDays },
    flags.lab_tests && { to: "/app/labs", title: "Lab tests", sub: "Request and track", icon: FlaskConical },
    flags.blood && { to: "/app/blood", title: "Blood request", sub: "Reach blood banks", icon: Droplet },
    (flags.consult_history || flags.receipts) && {
      to: "/app/history",
      title: "History",
      sub: "Checks, consults, receipts",
      icon: History,
    },
  ].filter((i): i is { to: string; title: string; sub: string; icon: LucideIcon } => Boolean(i))
  if (!items.length) return null
  return (
    <motion.section variants={popIn} aria-labelledby="services-title">
      <SectionHeader id="services-title" title="More services" />
      <motion.ul className="grid grid-cols-1 gap-2 sm:grid-cols-2" variants={staggerOnMount(0.05)}>
        {items.map(({ to, title, sub, icon: Icon }) => (
          <motion.li key={to} variants={popIn}>
            <Link
              to={to}
              className="group flex min-h-16 items-center gap-3 rounded-xl bg-white p-3 pr-4 shadow-[var(--shadow-elev-1)] transition-shadow hover:shadow-[var(--shadow-elev-2)]"
            >
              <span className="flex size-10 items-center justify-center rounded-lg bg-mint text-brand-700 transition-transform duration-300 group-hover:-translate-y-0.5">
                <Icon className="size-5" strokeWidth={1.9} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-label-l">{title}</span>
                <span className="block text-body-m text-ink-600">{sub}</span>
              </span>
              <ChevronRight className="size-4 text-ink-400 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </motion.li>
        ))}
      </motion.ul>
    </motion.section>
  )
}

// ---------- Aside ----------

function DoctorsOnline() {
  const { session } = useAuth()
  const q = useQuery({
    queryKey: ["doctors-available"],
    queryFn: extendedApi.availableDoctors,
    enabled: Boolean(session) && flags.doctors_available,
    refetchInterval: 60_000,
  })
  if (!q.data) return null
  const n = q.data.count
  const fastest = q.data.doctors.reduce((m, d) => Math.min(m, d.typical_response_minutes), Infinity)
  return (
    <motion.section variants={popIn} className="rounded-xl bg-white p-5 shadow-[var(--shadow-elev-1)]">
      <div className="flex items-center gap-2">
        <PulseDot live={n > 0} tone={n > 0 ? "green" : "muted"} />
        <h2 className="text-title-m">
          {n > 0 ? `${plural(n, "doctor")} online now` : "No doctors online right now"}
        </h2>
      </div>
      {n > 0 ? (
        <div className="mt-4 flex items-center justify-between gap-3">
          <AvatarStack names={q.data.doctors.map((d) => d.specialty ?? "Doctor")} />
          {Number.isFinite(fastest) && (
            <p className="text-right text-body-m text-ink-600">
              Replies in about
              <br />
              <span className="text-title-m text-ink-900">
                <NumberTicker value={fastest} /> min
              </span>
            </p>
          )}
        </div>
      ) : (
        <p className="mt-2 text-body-m text-ink-600">Your message waits in the queue and a doctor replies when online.</p>
      )}
      <ButtonLink to="/app/consult/new" variant="tonal" icon={MessageCircle} full className="mt-4">
        Message a doctor
      </ButtonLink>
    </motion.section>
  )
}

function HealthTipCard() {
  const q = useQuery({
    queryKey: ["health-tips", "en"],
    queryFn: () => extendedApi.healthTips({ locale: "en", limit: "1" }),
    enabled: flags.health_tips,
    staleTime: 3600_000,
  })
  const tip = q.data?.tips[0]
  if (!tip) return null
  return (
    <motion.section variants={popIn} className="rounded-xl bg-mint p-5">
      <p className="flex items-center gap-2 eyebrow">
        <Lightbulb className="size-4" aria-hidden /> Tip of the day
      </p>
      <h2 className="mt-2 font-display text-[22px] leading-[28px] font-[480]">{tip.title}</h2>
      <p className="mt-1.5 text-body-m text-ink-600">{tip.body}</p>
      <p className="mt-3 text-label-m text-ink-600">
        {tip.source_name} · {formatDate(tip.published_date)}
      </p>
      {flags.health_tips && (
        <Link to="/tips" className="mt-2 inline-flex min-h-10 items-center gap-1 text-label-l text-brand-700 hover:underline">
          More tips <ChevronRight className="size-4" aria-hidden />
        </Link>
      )}
    </motion.section>
  )
}

function HouseholdCard({ members }: { members: HouseholdMember[] }) {
  return (
    <motion.section variants={popIn} className="rounded-xl bg-white p-5 shadow-[var(--shadow-elev-1)]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-title-m">Your household</h2>
        <Link
          to="/app/profile/household"
          className="-mr-2 inline-flex min-h-10 items-center rounded-full px-3 text-label-l text-brand-700 hover:bg-mint"
        >
          {members.length ? "Manage" : "Add"}
        </Link>
      </div>
      <p className="mt-1 text-body-m text-ink-600">
        {members.length
          ? "Check symptoms or message a doctor on their behalf."
          : "Add the people you care for. You can then ask for them without their own phone."}
      </p>
      <ul className="mt-4 flex flex-wrap gap-3">
        {members.map((m, i) => (
          <motion.li
            key={m.member_id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING.default, delay: 0.15 + i * 0.05 }}
          >
            <Link to={`/app/triage?for=${encodeURIComponent(m.member_id)}`} className="flex w-16 flex-col items-center gap-1.5">
              <Avatar name={m.name} />
              <span className="w-full truncate text-center text-label-m">{m.name.split(" ")[0]}</span>
            </Link>
          </motion.li>
        ))}
        <li>
          <Link to="/app/profile/household" className="flex w-16 flex-col items-center gap-1.5">
            <span className="flex size-12 items-center justify-center rounded-full bg-mint text-brand-700 ring-1 ring-brand-500/30">
              <Plus className="size-5" aria-hidden />
            </span>
            <span className="text-label-m text-brand-700">Add</span>
          </Link>
        </li>
      </ul>
    </motion.section>
  )
}

function InstallCard() {
  const install = useInstallPrompt()
  const [dismissed, setDismissed] = useState(false)
  if (install.installed || dismissed || !(install.event || install.isIos)) return null
  return (
    <motion.section variants={popIn} className="flex items-start gap-4 rounded-xl bg-white p-5 shadow-[var(--shadow-elev-1)]">
      <Download className="mt-0.5 size-6 shrink-0 text-brand-700" aria-hidden />
      <div className="flex-1">
        <h2 className="text-title-m">Add CareBridge to your home screen</h2>
        <p className="mt-1 text-body-m text-ink-600">
          {install.isIos
            ? "Tap Share, then “Add to Home Screen”. It opens even with no network."
            : "Open it like an app, even with no network. No app store needed."}
        </p>
        <div className="mt-3 flex gap-2">
          {install.event && (
            <Button
              size="sm"
              onClick={async () => {
                await install.event?.prompt()
                install.clear()
              }}
            >
              Install
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
            Not now
          </Button>
        </div>
      </div>
    </motion.section>
  )
}

function SignInCard() {
  return (
    <motion.section variants={popIn} className="rounded-xl bg-white p-6 shadow-[var(--shadow-elev-1)]">
      <h2 className="text-headline-m">Message a doctor and keep your history</h2>
      <p className="mt-2 text-body-l text-ink-600">Facilities and symptom checks work without an account.</p>
      <ButtonLink to="/sign-in?returnTo=/app" className="mt-5" trailing="arrow">
        Log in or sign up
      </ButtonLink>
    </motion.section>
  )
}

// ---------- Page ----------

export default function PatientHome() {
  const { session } = useAuth()
  const profile = useProfile()
  const facilities = useFacilities()
  const { coords } = useGeolocation()
  const signedIn = Boolean(session)

  // Pull fresh statuses so the care timeline never shows "Pay" for a paid case.
  const remoteConsults = useQuery({ queryKey: ["consultations"], queryFn: consultApi.list, enabled: signedIn })
  useEffect(() => {
    for (const c of remoteConsults.data?.consultations ?? []) void reconcileStatus(c.consultation_id, c.status)
  }, [remoteConsults.data])

  const openConsults = useLiveQuery(
    () =>
      db.consultations
        .orderBy("created_at")
        .reverse()
        .filter((c) => c.status !== "closed")
        .limit(3)
        .toArray(),
    [],
  )
  const appointments = useQuery({
    queryKey: ["appointments", session?.sub],
    queryFn: () => serviceApi.appointments(),
    enabled: signedIn && flags.appointments,
  })
  const labs = useQuery({
    queryKey: ["labs", session?.sub],
    queryFn: () => serviceApi.labs(),
    enabled: signedIn && flags.lab_tests,
  })

  const today = new Date().toISOString().slice(0, 10)
  const upcoming = (appointments.data?.appointments ?? [])
    .filter((a) => a.status !== "cancelled" && a.slot_date >= today)
    .sort((a, b) => a.slot_date.localeCompare(b.slot_date))
    .slice(0, 2)
  const activeLabs = (labs.data?.lab_requests ?? []).filter((l) => l.status !== "delivered").slice(0, 2)

  // Local copies (including unsent ones) plus anything the server has that this phone doesn't,
  // e.g. after signing in on a new phone. The server's status wins (reconciled above).
  const consults = useMemo(() => {
    const local = openConsults ?? []
    const known = new Set(local.map((c) => c.consultation_id).filter(Boolean))
    const nameOf = (id: string | null) =>
      id ? (profile.data?.on_behalf_profiles?.find((m) => m.member_id === id)?.name ?? "Household member") : "You"
    const remote: LocalConsultation[] = (remoteConsults.data?.consultations ?? [])
      .filter((c) => c.status !== "closed" && !known.has(c.consultation_id))
      .map((c) => ({
        local_id: c.consultation_id,
        consultation_id: c.consultation_id,
        complaint: c.complaint,
        status: c.status,
        urgency: c.urgency,
        on_behalf_member_id: c.on_behalf_member_id,
        triage_result_id: c.triage_result_id,
        subject_label: nameOf(c.on_behalf_member_id),
        created_at: c.created_at,
        sync_state: "sent",
      }))
    return [...local, ...remote].sort((a, b) => b.created_at - a.created_at).slice(0, 3)
  }, [openConsults, remoteConsults.data, profile.data])

  const byId = useMemo(() => new Map((facilities ?? []).map((f) => [f.facility_id, f.name])), [facilities])
  const nearby = useMemo(() => (facilities ? rankFacilities(facilities, coords).slice(0, 3) : []), [facilities, coords])

  const name = profile.data?.display_name || session?.name
  const members = profile.data?.on_behalf_profiles ?? []

  return (
    <motion.div className="flex flex-col gap-6 lg:gap-8 short:gap-5" variants={staggerOnMount(0.07)} initial="hidden" animate="show">
      <Greeting name={signedIn ? name : undefined} />
      <HeroBand signedIn={signedIn} members={members} />
      <QuickActions facilityCount={facilities?.length} members={members.length} signedIn={signedIn} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
        <div className="flex min-w-0 flex-col gap-6 lg:gap-8">
          {signedIn ? (
            <YourCare
              consults={consults}
              appointments={upcoming}
              labs={activeLabs}
              loading={openConsults === undefined || appointments.isLoading || labs.isLoading}
              facilityName={(id) => byId.get(id) ?? "Facility"}
            />
          ) : (
            <SignInCard />
          )}
          <motion.section variants={popIn} aria-labelledby="nearby-title">
            <SectionHeader
              id="nearby-title"
              title={coords ? "Closest to you" : "Facilities in Buea"}
              to="/app/facilities"
              linkLabel="See all"
            />
            <motion.ul className="flex flex-col gap-2" variants={staggerOnMount(0.05, 0.1)}>
              {nearby.map((f) => (
                <FacilityRow key={f.facility_id} facility={f} compact />
              ))}
            </motion.ul>
          </motion.section>
          {signedIn && <MoreServices />}
        </div>
        <aside className="flex flex-col gap-6">
          <DoctorsOnline />
          {signedIn && <HouseholdCard members={members} />}
          <HealthTipCard />
          <InstallCard />
        </aside>
      </div>
    </motion.div>
  )
}
