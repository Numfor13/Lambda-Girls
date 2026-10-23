import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { useLiveQuery } from "dexie-react-hooks"
import { useQuery } from "@tanstack/react-query"
import { motion } from "motion/react"
import {
  CalendarDays,
  Droplet,
  FlaskConical,
  Activity,
  Check,
  Download,
  History,
  Lightbulb,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  Users,
  type LucideIcon,
} from "lucide-react"
import { extendedApi } from "@/api/endpoints"
import { useAuth } from "@/auth/AuthProvider"
import { flags } from "@/config/flags"
import { Button, ButtonA, ButtonLink } from "@/design/components/Button"
import { FacilityRow } from "@/design/components/FacilityRow"
import { Landscape } from "@/design/components/Landscape"
import { Avatar, SectionHeader } from "@/design/components/primitives"
import { UrgencyBadge } from "@/design/components/UrgencyBadge"
import { SPRING, popIn, staggerOnMount } from "@/design/motion"
import { useProfile } from "@/features/profile/useProfile"
import { useGeolocation, useNow } from "@/lib/hooks"
import { rankFacilities } from "@/lib/geo"
import { formatDate, formatDateTime, formatXaf } from "@/lib/format"
import { env } from "@/config/env"
import { cn } from "@/lib/utils"
import { db, type LocalConsultation } from "@/offline/db"
import { useFacilities } from "@/offline/facilities"

interface InstallEvent extends Event {
  prompt: () => Promise<void>
}

function useInstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null)
  const [installed, setInstalled] = useState(
    () => window.matchMedia("(display-mode: standalone)").matches
  )
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

// ---------- Hero band ----------

function HeroBand({ name }: { name?: string }) {
  const now = useNow(60_000)
  return (
    <motion.section
      variants={popIn}
      className="relative isolate overflow-hidden rounded-xl lg:rounded-2xl"
      aria-labelledby="home-hero"
    >
      <Landscape className="-z-10" preserve="xMidYMid slice" />
      <div className="flex min-h-[420px] flex-col justify-between gap-6 p-4 sm:p-6 lg:min-h-[400px] lg:p-8">
        <motion.div
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={SPRING.default}
        >
          <p className="text-body-l text-ink-600">
            {name ? `${greeting(now)},` : greeting(now)}
          </p>
          <p className="text-headline-l">{name ?? "Welcome to CareBridge"}</p>
        </motion.div>
        <motion.div
          className="max-w-[560px] shape-bl p-5 glass-strong sm:p-7"
          initial={{ opacity: 0, y: 40, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ ...SPRING.bouncy, delay: 0.15 }}
        >
          <h1 id="home-hero" className="text-headline-l lg:text-display-m">
            How are you feeling today?
          </h1>
          <p className="mt-2 text-body-l text-ink-900">
            A 1-minute danger-sign check tells you where to go. Works without
            network.
          </p>
          <div className="mt-5 flex items-center gap-3">
            <ButtonLink
              to="/app/triage"
              icon={Activity}
              size="lg"
              className="min-w-0 flex-1 sm:flex-none"
            >
              Check symptoms
            </ButtonLink>
            <ButtonA
              href="tel:15"
              icon={Phone}
              variant="danger"
              size="lg"
              aria-label="Call emergency 15"
              className="shrink-0 px-5"
            >
              <span className="hidden sm:inline">Emergency ·</span> 15
            </ButtonA>
          </div>
        </motion.div>
      </div>
    </motion.section>
  )
}

// ---------- Quick actions (M3 Expressive tiles) ----------

const TILE_SHAPES = [
  "40px 16px 40px 40px",
  "16px 40px 40px 40px",
  "40px 40px 40px 16px",
  "40px 40px 16px 40px",
]

function Tile({
  to,
  title,
  sub,
  icon: Icon,
  tone,
  shape,
  compact = false,
}: {
  to: string
  title: string
  sub: string
  icon: LucideIcon
  tone: "mint" | "brand" | "white" | "mint-200"
  shape: number
  compact?: boolean
}) {
  const dark = tone === "brand"
  return (
    <motion.div variants={popIn}>
      <motion.div
        style={{ borderRadius: TILE_SHAPES[shape] }}
        whileHover={{ borderRadius: "32px", y: -3 }}
        whileTap={{ scale: 0.96, borderRadius: "24px" }}
        transition={SPRING.fast}
        className={cn(
          "h-full overflow-hidden",
          tone === "mint" && "bg-mint",
          tone === "brand" && "bg-brand-700",
          tone === "white" && "bg-white shadow-[var(--shadow-elev-1)]",
          tone === "mint-200" && "bg-mint-200"
        )}
      >
        <Link
          to={to}
          className={cn(
            "flex h-full flex-col justify-between p-4",
            compact ? "min-h-[112px] gap-4" : "min-h-[136px] gap-5"
          )}
        >
          <Icon
            className={cn(
              "size-[26px]",
              dark ? "text-white" : "text-brand-700"
            )}
            strokeWidth={2}
            aria-hidden
          />
          <span>
            <span
              className={cn(
                "block text-title-m",
                dark ? "text-white" : "text-ink-900"
              )}
            >
              {title}
            </span>
            <span
              className={cn(
                "block text-body-m",
                dark ? "text-white/80" : "text-ink-600"
              )}
            >
              {sub}
            </span>
          </span>
        </Link>
      </motion.div>
    </motion.div>
  )
}

function QuickActions({
  facilityCount,
  members,
}: {
  facilityCount?: number
  members: number
}) {
  return (
    <section aria-labelledby="qa-title">
      <h2 id="qa-title" className="sr-only">
        Quick actions
      </h2>
      <motion.div
        className="grid grid-cols-2 gap-3"
        variants={staggerOnMount(0.05)}
      >
        <Tile
          to="/app/facilities?locate=1"
          title="Find a facility"
          sub={facilityCount ? `${facilityCount} near Buea` : "Near you"}
          icon={MapPin}
          tone="mint"
          shape={0}
        />
        <Tile
          to="/app/consult/new"
          title="Talk to a doctor"
          sub="Text or voice"
          icon={MessageCircle}
          tone="brand"
          shape={1}
        />
        <Tile
          to="/app/profile/household"
          title="Household"
          sub={
            members
              ? `${members} member${members === 1 ? "" : "s"}`
              : "Add family"
          }
          icon={Users}
          tone="white"
          shape={2}
        />
        <Tile
          to="/app/consults"
          title="My consultations"
          sub="History & receipts"
          icon={History}
          tone="mint-200"
          shape={3}
        />
      </motion.div>
    </section>
  )
}

// ---------- More services (Tier 2, each behind its flag) ----------

function MoreServices() {
  const items = [
    flags.appointments && {
      to: "/app/appointments",
      title: "Appointments",
      sub: "Request a visit",
      icon: CalendarDays,
    },
    flags.lab_tests && {
      to: "/app/labs",
      title: "Lab tests",
      sub: "Request and track",
      icon: FlaskConical,
    },
    flags.blood && {
      to: "/app/blood",
      title: "Blood request",
      sub: "Find blood banks",
      icon: Droplet,
    },
    (flags.consult_history || flags.receipts) && {
      to: "/app/history",
      title: "History",
      sub: "Checks, consults, receipts",
      icon: History,
    },
  ].filter(
    (i): i is { to: string; title: string; sub: string; icon: LucideIcon } =>
      Boolean(i)
  )
  if (!items.length) return null
  return (
    <motion.section variants={popIn} aria-labelledby="services-title">
      <SectionHeader title="More services" />
      <h2 id="services-title" className="sr-only">
        More services
      </h2>
      <motion.div
        className="grid grid-cols-[repeat(auto-fit,minmax(148px,1fr))] gap-3"
        variants={staggerOnMount(0.05)}
      >
        {items.map((i, n) => (
          <Tile
            key={i.to}
            {...i}
            tone={n % 2 ? "mint" : "white"}
            shape={n % 4}
            compact
          />
        ))}
      </motion.div>
    </motion.section>
  )
}

// ---------- Active consultation ----------

const STEPS = ["Paid", "With doctor", "Closed"] as const

function stepIndex(status: LocalConsultation["status"]) {
  return status === "pending_payment"
    ? -1
    : status === "paid"
      ? 0
      : status === "open"
        ? 1
        : 2
}

function ActiveConsult({
  consult,
}: {
  consult: LocalConsultation | undefined
}) {
  const ref = consult ? (consult.consultation_id ?? consult.local_id) : ""
  return (
    <motion.section variants={popIn} aria-labelledby="active-title">
      <SectionHeader
        title="Active consultation"
        to="/app/consults"
        linkLabel="See all"
      />
      <h2 id="active-title" className="sr-only">
        Active consultation
      </h2>
      {consult ? (
        <motion.div
          layout
          className="flex flex-col gap-5 rounded-xl bg-white p-5 shadow-[var(--shadow-elev-1)] sm:flex-row sm:items-center"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {consult.urgency && (
                <UrgencyBadge urgency={consult.urgency} short />
              )}
              <span className="text-label-m text-ink-600">
                {consult.subject_label} · {formatDateTime(consult.created_at)}
              </span>
            </div>
            <p className="text-headline-s">{consult.complaint}</p>
            <ol
              className="flex flex-wrap items-center gap-2"
              aria-label="Progress"
            >
              {STEPS.map((s, i) => {
                const idx = stepIndex(consult.status)
                const done = i <= idx && !(i === idx && i < 2)
                const now = i === idx && i < 2
                return (
                  <motion.li
                    key={s}
                    layout
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ ...SPRING.bouncy, delay: 0.1 + i * 0.06 }}
                    className={cn(
                      "inline-flex h-7 items-center gap-1 rounded-full px-3 text-label-m",
                      done && "bg-mint text-brand-800",
                      now && "bg-brand-700 text-white",
                      !done && !now && "bg-cream text-ink-400"
                    )}
                    aria-current={now ? "step" : undefined}
                  >
                    {done && <Check className="size-3.5" aria-hidden />}
                    {s}
                  </motion.li>
                )
              })}
            </ol>
          </div>
          <div className="flex flex-col gap-2 sm:w-[220px]">
            {consult.status === "pending_payment" ? (
              <ButtonLink
                to={`/app/consult/${ref}/pay`}
                icon={Plus}
                variant="primary"
                full
              >
                Pay {formatXaf(env.consultationFeeXaf)}
              </ButtonLink>
            ) : null}
            <ButtonLink
              to={`/app/consult/${ref}`}
              icon={MessageCircle}
              variant="tonal"
              full
            >
              Open chat
            </ButtonLink>
          </div>
        </motion.div>
      ) : (
        <div className="flex flex-col items-start gap-4 rounded-xl bg-white p-5 shadow-[var(--shadow-elev-1)] sm:flex-row sm:items-center">
          <span className="flex size-12 items-center justify-center shape-bl bg-mint">
            <MessageCircle className="size-6 text-brand-700" aria-hidden />
          </span>
          <p className="flex-1 text-body-l text-ink-600">
            No open consultation. A doctor can reply by text or voice note.
          </p>
          <ButtonLink to="/app/consult/new" variant="tonal" icon={Plus}>
            Message a doctor
          </ButtonLink>
        </div>
      )}
    </motion.section>
  )
}

// ---------- Side cards ----------

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
  return (
    <motion.section
      variants={popIn}
      className="rounded-xl bg-white p-5 shadow-[var(--shadow-elev-1)]"
    >
      <div className="flex items-center gap-2">
        <span className="relative flex size-2.5">
          {n > 0 && (
            <motion.span
              className="absolute inset-0 rounded-full bg-urgent-green"
              animate={{ scale: [1, 2.2], opacity: [0.5, 0] }}
              transition={{ duration: 1.6, repeat: Infinity }}
            />
          )}
          <span
            className={cn(
              "relative size-2.5 rounded-full",
              n > 0 ? "bg-urgent-green" : "bg-ink-400"
            )}
          />
        </span>
        <h2 className="text-title-m">
          {n > 0
            ? `${n} doctor${n === 1 ? "" : "s"} online now`
            : "No doctors online right now"}
        </h2>
      </div>
      {n > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {q.data.doctors.map((d) => (
            <li key={d.doctor_id} className="flex items-center gap-3">
              <Avatar name={d.specialty ?? "Doctor"} size="sm" />
              <span className="text-body-m text-ink-600">
                {d.specialty ?? "Doctor"} · replies in ~
                {d.typical_response_minutes} min
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-body-m text-ink-600">
          Your message waits in the queue and a doctor replies when online.
        </p>
      )}
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
    <motion.section
      variants={popIn}
      className="flex gap-4 bg-mint-200 p-5"
      style={{ borderRadius: "40px 16px 40px 40px" }}
    >
      <motion.span
        animate={{ rotate: [0, -8, 8, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 3 }}
        className="flex h-fit"
      >
        <Lightbulb className="size-7 text-brand-800" aria-hidden />
      </motion.span>
      <div className="min-w-0">
        <p className="eyebrow">Health tip</p>
        <h2 className="mt-1 text-title-m">{tip.title}</h2>
        <p className="mt-1 text-body-m text-ink-600">{tip.body}</p>
        <p className="mt-2 text-label-m text-ink-600">
          Source: {tip.source_name} · {formatDate(tip.published_date)}
        </p>
      </div>
    </motion.section>
  )
}

function HouseholdStrip({
  members,
}: {
  members: { member_id: string; name: string }[]
}) {
  return (
    <motion.section
      variants={popIn}
      className="rounded-xl bg-white p-5 shadow-[var(--shadow-elev-1)]"
    >
      <h2 className="text-title-m">For your household</h2>
      <div className="mt-3 no-scrollbar flex gap-4 overflow-x-auto pb-1">
        {members.map((m, i) => (
          <motion.div
            key={m.member_id}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ ...SPRING.bouncy, delay: i * 0.05 }}
          >
            <Link
              to="/app/profile/household"
              className="flex w-16 shrink-0 flex-col items-center gap-1.5"
            >
              <Avatar name={m.name} />
              <span className="w-full truncate text-center text-label-m">
                {m.name.split(" ")[0]}
              </span>
            </Link>
          </motion.div>
        ))}
        <Link
          to="/app/profile/household"
          className="flex w-16 shrink-0 flex-col items-center gap-1.5"
        >
          <motion.span
            whileHover={{ rotate: 90 }}
            transition={SPRING.bouncy}
            className="flex size-12 items-center justify-center rounded-full border-2 border-dashed border-brand-500 text-brand-700"
          >
            <Plus className="size-5" aria-hidden />
          </motion.span>
          <span className="text-label-m text-brand-700">Add</span>
        </Link>
      </div>
    </motion.section>
  )
}

function SignInCard() {
  return (
    <motion.section
      variants={popIn}
      className="shape-br bg-brand-800 p-6 text-white"
    >
      <h2 className="text-headline-s text-white">
        Message a doctor and keep your history
      </h2>
      <p className="mt-2 text-body-l text-white/80">
        Facilities and symptom checks work without an account.
      </p>
      <ButtonLink
        to="/sign-in?returnTo=/app"
        variant="light"
        className="mt-5"
        trailing="arrow"
      >
        Log in or sign up
      </ButtonLink>
    </motion.section>
  )
}

// ---------- Page ----------

export default function PatientHome() {
  const { session } = useAuth()
  const profile = useProfile()
  const install = useInstallPrompt()
  const [installDismissed, setInstallDismissed] = useState(false)
  const facilities = useFacilities()
  const { coords } = useGeolocation()

  const latestConsult = useLiveQuery(
    () =>
      db.consultations
        .orderBy("created_at")
        .reverse()
        .filter((c) => c.status !== "closed")
        .first(),
    []
  )
  const nearby = useMemo(
    () => (facilities ? rankFacilities(facilities, coords).slice(0, 3) : []),
    [facilities, coords]
  )

  const name = profile.data?.display_name || session?.name
  const members = profile.data?.on_behalf_profiles ?? []

  return (
    <motion.div
      className="flex flex-col gap-6 lg:gap-8"
      variants={staggerOnMount(0.07)}
      initial="hidden"
      animate="show"
    >
      <HeroBand name={session ? name : undefined} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8">
        <div className="contents lg:flex lg:flex-col lg:gap-8">
          <div className="lg:hidden">
            <QuickActions
              facilityCount={facilities?.length}
              members={members.length}
            />
          </div>
          {session ? <ActiveConsult consult={latestConsult} /> : <SignInCard />}
          <motion.section variants={popIn} aria-labelledby="nearby-title">
            <SectionHeader
              title="Nearby facilities"
              to="/app/facilities"
              linkLabel={coords ? "See all" : "Open list"}
            />
            <h2 id="nearby-title" className="sr-only">
              Nearby facilities
            </h2>
            <motion.ul
              className="flex flex-col gap-2"
              variants={staggerOnMount(0.05, 0.1)}
            >
              {nearby.map((f) => (
                <FacilityRow key={f.facility_id} facility={f} compact />
              ))}
            </motion.ul>
          </motion.section>
          {session && <MoreServices />}
        </div>
        <aside className="contents lg:flex lg:flex-col lg:gap-6">
          <div className="hidden lg:block">
            <SectionHeader title="Quick actions" />
            <QuickActions
              facilityCount={facilities?.length}
              members={members.length}
            />
          </div>
          <DoctorsOnline />
          <HealthTipCard />
          {session && <HouseholdStrip members={members} />}
          {!install.installed &&
            !installDismissed &&
            (install.event || install.isIos) && (
              <motion.section
                variants={popIn}
                className="flex items-start gap-4 rounded-xl bg-white p-5 shadow-[var(--shadow-elev-1)]"
              >
                <Download
                  className="mt-0.5 size-6 shrink-0 text-brand-700"
                  aria-hidden
                />
                <div className="flex-1">
                  <h2 className="text-title-m">
                    Add CareBridge to your home screen
                  </h2>
                  <p className="mt-1 text-body-m text-ink-600">
                    {install.isIos
                      ? "Tap the Share button, then “Add to Home Screen”. It opens even with no network."
                      : "Open it like an app — even with no network. No app store needed."}
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
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setInstallDismissed(true)}
                    >
                      Not now
                    </Button>
                  </div>
                </div>
              </motion.section>
            )}
        </aside>
      </div>
    </motion.div>
  )
}
