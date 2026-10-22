import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { useLiveQuery } from "dexie-react-hooks"
import { motion } from "motion/react"
import { ChevronRight, Download, MapPin, MessagesSquare, Plus, Stethoscope, Siren } from "lucide-react"
import { useAuth } from "@/auth/AuthProvider"
import { flags } from "@/config/flags"
import { ButtonLink } from "@/design/components/Button"
import { EASE_OUT } from "@/design/motion"
import { Avatar } from "@/design/components/primitives"
import { UrgencyBadge } from "@/design/components/UrgencyBadge"
import { useProfile } from "@/features/profile/useProfile"
import { useNow } from "@/lib/hooks"
import { formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import { db } from "@/offline/db"

const MotionLink = motion.create(Link)

interface InstallEvent extends Event {
  prompt: () => Promise<void>
}

function useInstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null)
  const [installed, setInstalled] = useState(() =>
    window.matchMedia("(display-mode: standalone)").matches,
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

const TILES = [
  { to: "/app/triage", label: "Check symptoms", icon: Stethoscope, tone: "bg-mint text-brand-900" },
  { to: "/app/facilities?locate=1", label: "Find care near me", icon: MapPin, tone: "bg-cream text-brand-900" },
  { to: "/app/consult/new", label: "Message a doctor", icon: MessagesSquare, tone: "bg-cream text-brand-900" },
  flags.emergency
    ? { to: "/app/emergency", label: "Emergency", icon: Siren, tone: "bg-urgent-red text-white" }
    : { to: "/app/consults", label: "My consultations", icon: MessagesSquare, tone: "bg-mint text-brand-900" },
]

export default function PatientHome() {
  const { session } = useAuth()
  const profile = useProfile()
  const now = useNow(60_000)
  const install = useInstallPrompt()
  const [installDismissed, setInstallDismissed] = useState(false)

  const latestConsult = useLiveQuery(
    () => db.consultations.orderBy("created_at").reverse().filter((c) => c.status !== "closed").first(),
    [],
  )
  const latestTriage = useLiveQuery(() => db.triage_results.orderBy("created_at").reverse().first(), [])

  const name = profile.data?.display_name ?? session?.name
  const members = profile.data?.on_behalf_profiles ?? []

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-[28px] leading-tight font-extrabold">
          {greeting(now)}
          {session && name ? `, ${name}` : ""}
        </h1>
        <p className="mt-1 text-[15px] text-ink-600">What would you like to do today?</p>
      </header>

      <nav aria-label="Quick actions" className="grid grid-cols-2 gap-3">
        {TILES.map((t, i) => (
          <MotionLink
            key={t.label}
            to={t.to}
            className={cn(
              "flex min-h-32 flex-col justify-between rounded-[16px] p-4 transition-transform active:scale-[0.98]",
              t.tone,
            )}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE_OUT, delay: i * 0.08 }}
          >
            <t.icon className="size-8" strokeWidth={1.75} aria-hidden />
            <span className="font-display text-[17px] leading-tight font-bold">{t.label}</span>
          </MotionLink>
        ))}
      </nav>

      {(latestConsult || latestTriage) && (
        <section>
          <h2 className="text-[18px] font-bold">Continue</h2>
          <div className="mt-3 flex flex-col gap-3">
            {latestConsult && (
              <Link
                to={`/app/consult/${latestConsult.consultation_id ?? latestConsult.local_id}`}
                className="flex items-center gap-3 rounded-[16px] border border-line p-4 hover:bg-cream"
              >
                <MessagesSquare className="size-6 shrink-0 text-brand-700" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{latestConsult.complaint}</span>
                  <span className="text-sm text-ink-600">
                    {latestConsult.subject_label} · {formatDateTime(latestConsult.created_at)}
                  </span>
                </span>
                <ChevronRight className="size-5 text-ink-400" aria-hidden />
              </Link>
            )}
            {latestTriage && (
              <Link
                to={`/app/triage/${latestTriage.result_id}`}
                className="flex items-center gap-3 rounded-[16px] border border-line p-4 hover:bg-cream"
              >
                <Stethoscope className="size-6 shrink-0 text-brand-700" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">Last symptom check</span>
                  <span className="text-sm text-ink-600">
                    {latestTriage.subject_label} · {formatDateTime(latestTriage.created_at)}
                  </span>
                </span>
                <UrgencyBadge urgency={latestTriage.urgency} size="sm" />
              </Link>
            )}
          </div>
        </section>
      )}

      {session ? (
        <section>
          <h2 className="text-[18px] font-bold">For your household</h2>
          <div className="no-scrollbar mt-3 flex gap-4 overflow-x-auto pb-1">
            {members.map((m) => (
              <Link key={m.member_id} to="/app/profile/household" className="flex w-16 shrink-0 flex-col items-center gap-1.5">
                <Avatar name={m.name} />
                <span className="w-full truncate text-center text-xs">{m.name.split(" ")[0]}</span>
              </Link>
            ))}
            <Link to="/app/profile/household" className="flex w-16 shrink-0 flex-col items-center gap-1.5">
              <span className="flex size-11 items-center justify-center rounded-full border-2 border-dashed border-brand-500 text-brand-700">
                <Plus className="size-5" aria-hidden />
              </span>
              <span className="text-xs font-semibold text-brand-700">Add</span>
            </Link>
          </div>
        </section>
      ) : (
        <section className="rounded-[16px] bg-mint p-5">
          <h2 className="text-[18px] font-bold">Message a doctor and keep your history</h2>
          <p className="mt-1 text-[15px] text-ink-600">
            Facilities and symptom checks work without an account.
          </p>
          <ButtonLink to="/sign-in?returnTo=/app" className="mt-4" trailing="arrow">
            Log in or sign up
          </ButtonLink>
        </section>
      )}

      {!install.installed && !installDismissed && (install.event || install.isIos) && (
        <section className="flex items-start gap-4 rounded-[16px] border border-line p-5">
          <Download className="mt-0.5 size-6 shrink-0 text-brand-700" aria-hidden />
          <div className="flex-1">
            <h2 className="text-[16px] font-bold">Add CareBridge to your home screen</h2>
            <p className="mt-1 text-sm text-ink-600">
              {install.isIos
                ? "Tap the Share button, then “Add to Home Screen”. It opens even with no network."
                : "Open it like an app — even with no network. No app store needed."}
            </p>
            <div className="mt-3 flex gap-2">
              {install.event && (
                <button
                  type="button"
                  className="h-10 rounded-[10px] bg-brand-700 px-4 text-sm font-semibold text-white"
                  onClick={async () => {
                    await install.event?.prompt()
                    install.clear()
                  }}
                >
                  Install
                </button>
              )}
              <button
                type="button"
                className="h-10 rounded-[10px] px-4 text-sm font-semibold text-ink-600"
                onClick={() => setInstallDismissed(true)}
              >
                Not now
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
