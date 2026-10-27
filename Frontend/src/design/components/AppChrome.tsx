import { useEffect, useState } from "react"
import { Link, useLocation } from "react-router-dom"
import { useLiveQuery } from "dexie-react-hooks"
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useMotionValueEvent,
  useScroll,
} from "motion/react"
import {
  Activity,
  CloudOff,
  House,
  MapPin,
  MessageCircle,
  Plus,
  RefreshCw,
  User,
  type LucideIcon,
} from "lucide-react"
import { useAuth } from "@/auth/AuthProvider"
import { SPRING } from "@/design/motion"
import { useNow, useOnline } from "@/lib/hooks"
import { timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"
import { db } from "@/offline/db"
import { syncOutbox } from "@/offline/sync"
import { Logo } from "./Logo"
import { ButtonLink } from "./Button"
import { Avatar } from "./primitives"

export interface NavDest {
  to: string
  label: string
  icon: LucideIcon
  match: (path: string) => boolean
}

/**
 * The patient app's destinations. Same names, icons and order in the mobile TabBar and the
 * desktop NavRail (docs/DESIGN_SYSTEM.md §5 rule 5). Household and payments live under Profile.
 */
export const PATIENT_DESTS: NavDest[] = [
  { to: "/app", label: "Home", icon: House, match: (p) => p === "/app" || p === "/app/" },
  { to: "/app/triage", label: "Triage", icon: Activity, match: (p) => p.startsWith("/app/triage") },
  { to: "/app/consults", label: "Consults", icon: MessageCircle, match: (p) => p.startsWith("/app/consult") },
  { to: "/app/facilities", label: "Facilities", icon: MapPin, match: (p) => p.startsWith("/app/facilities") },
  { to: "/app/profile", label: "Profile", icon: User, match: (p) => p.startsWith("/app/profile") },
]

// ---------- Sync status ----------

const LAST_SYNC_KEY = "cb_last_synced"

function readLastSync(): number | null {
  try {
    const v = localStorage.getItem(LAST_SYNC_KEY)
    return v ? Number(v) : null
  } catch {
    return null
  }
}

export function useSyncStatus() {
  const online = useOnline()
  const queued = useLiveQuery(() => db.outbox.count(), [], 0)
  const [last, setLast] = useState<number | null>(readLastSync)
  useEffect(() => {
    const onSynced = () => {
      const t = Date.now()
      try {
        localStorage.setItem(LAST_SYNC_KEY, String(t))
      } catch {
        /* storage unavailable: keep in memory */
      }
      setLast(t)
    }
    window.addEventListener("carebridge:synced", onSynced)
    return () => window.removeEventListener("carebridge:synced", onSynced)
  }, [])
  return { online, queued, last }
}

/** "Synced · 2 min ago" / "Saved on this phone · 3 waiting" / "Offline" (DESIGN_SYSTEM §5 rule 8). */
export function SyncStatus({ className, glass = true }: { className?: string; glass?: boolean }) {
  const { online, queued, last } = useSyncStatus()
  const { session } = useAuth()
  const now = useNow(30_000)
  const [spinning, setSpinning] = useState(false)
  const label = !online
    ? queued > 0
      ? `Offline · ${queued} saved on this phone`
      : "Offline · saved data still works"
    : queued > 0
      ? `${queued} waiting to sync`
      : last
        ? `Synced · ${timeAgo(last, now)}`
        : "Up to date"
  const Icon = online ? RefreshCw : CloudOff
  return (
    <motion.button
      type="button"
      layout
      onClick={async () => {
        if (!online || !session) return
        setSpinning(true)
        await syncOutbox()
        setSpinning(false)
      }}
      whileTap={{ scale: 0.94 }}
      transition={SPRING.fast}
      className={cn(
        "inline-flex h-8 items-center gap-2 rounded-full px-3 text-label-m text-brand-900",
        glass ? "bg-white/70 ring-1 ring-ink-900/8" : "bg-mint",
        !online && "text-ink-900",
        className,
      )}
      aria-live="polite"
    >
      <motion.span
        animate={spinning ? { rotate: 360 } : { rotate: 0 }}
        transition={spinning ? { duration: 0.8, repeat: Infinity, ease: "linear" } : SPRING.fast}
        className="flex"
      >
        <Icon className={cn("size-3.5", online ? "text-brand-700" : "text-ink-600")} aria-hidden />
      </motion.span>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={SPRING.fast}
        >
          {label}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  )
}

// ---------- Desktop: NavRail ----------

export function NavRail({
  dests,
  fab,
  footer,
  home = "/",
}: {
  dests: NavDest[]
  fab?: { to: string; label: string }
  footer?: React.ReactNode
  home?: string
}) {
  const { pathname } = useLocation()
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col gap-1 border-r border-ink-900/[0.07] bg-white/75 px-3 py-5 no-scrollbar overflow-y-auto backdrop-blur-xl lg:flex">
      <div className="px-3">
        <Logo to={home} />
      </div>
      {fab && (
        <ButtonLink to={fab.to} icon={Plus} size="md" full className="mt-6 mb-4">
          {fab.label}
        </ButtonLink>
      )}
      <p className="px-3 pb-1 text-label-m text-ink-600">Menu</p>
      <LayoutGroup id="rail">
        <nav aria-label="App" className="flex flex-col gap-0.5">
          {dests.map((d) => {
            const active = d.match(pathname)
            return (
              <Link
                key={d.to}
                to={d.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-10 items-center gap-3 rounded-md px-3 text-label-l transition-colors duration-150",
                  active ? "text-brand-900" : "text-ink-600 hover:bg-ink-900/[0.04] hover:text-ink-900",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="rail-indicator"
                    className="absolute inset-0 rounded-md bg-mint"
                    transition={SPRING.default}
                  />
                )}
                <span className="relative flex">
                  <d.icon
                    className={cn("size-[19px]", active ? "text-brand-700" : "text-ink-400")}
                    strokeWidth={active ? 2.2 : 1.9}
                    aria-hidden
                  />
                </span>
                <span className="relative">{d.label}</span>
              </Link>
            )
          })}
        </nav>
      </LayoutGroup>
      <div className="mt-auto flex flex-col gap-3 border-t border-ink-900/[0.06] px-2 pt-4">{footer}</div>
    </aside>
  )
}

// ---------- Mobile: floating Liquid Glass TabBar ----------

/**
 * Compacts while scrolling down (labels tuck away), expands on scroll up — like iOS 26.
 * Staff bars keep their labels (`labels="always"`, QA C7): their destinations are less familiar.
 */
export function TabBar({ dests, labels = "auto" }: { dests: NavDest[]; labels?: "auto" | "always" }) {
  const { pathname } = useLocation()
  const { scrollY } = useScroll()
  const [compactState, setCompact] = useState(false)
  const compact = labels === "auto" && compactState
  useMotionValueEvent(scrollY, "change", (y) => {
    const prev = scrollY.getPrevious() ?? 0
    if (y > prev + 6 && y > 120) setCompact(true)
    else if (y < prev - 6) setCompact(false)
  })
  return (
    <motion.nav
      aria-label="App"
      initial={{ y: 120, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ ...SPRING.default, delay: 0.1 }}
      className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[max(16px,env(safe-area-inset-bottom))] lg:hidden"
    >
      <motion.ul
        layout
        transition={SPRING.default}
        className={cn(
          "glass-strong flex w-full max-w-[420px] items-center justify-between rounded-full p-1.5",
          compact ? "h-[58px]" : "h-[68px]",
        )}
      >
        <LayoutGroup id="tabs">
          {dests.map((d) => {
            const active = d.match(pathname)
            return (
              <li key={d.to} className="flex-1">
                <Link
                  to={d.to}
                  aria-current={active ? "page" : undefined}
                  className="relative flex h-full flex-col items-center justify-center gap-0.5 rounded-full py-1.5"
                >
                  {active && (
                    <motion.span
                      layoutId="tab-indicator"
                      className="absolute inset-0 rounded-full bg-mint"
                      transition={SPRING.default}
                    />
                  )}
                  <motion.span className="relative flex" whileTap={{ scale: 0.9 }} transition={SPRING.fast}>
                    <d.icon
                      className={cn("size-[22px]", active ? "text-brand-700" : "text-ink-600")}
                      strokeWidth={active ? 2.2 : 1.8}
                      aria-hidden
                    />
                  </motion.span>
                  <AnimatePresence initial={false}>
                    {!compact && (
                      <motion.span
                        className={cn("relative text-[11px] leading-4 font-semibold", active ? "text-brand-900" : "text-ink-600")}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={SPRING.fast}
                      >
                        {d.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                  {compact && <span className="sr-only">{d.label}</span>}
                </Link>
              </li>
            )
          })}
        </LayoutGroup>
      </motion.ul>
    </motion.nav>
  )
}

// ---------- Mobile: glass top bar ----------

export function MobileTopBar({ home = "/", right }: { home?: string; right?: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-30 px-3 pt-[max(8px,env(safe-area-inset-top))] lg:hidden">
      <motion.div
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={SPRING.default}
        className="glass-strong flex h-14 items-center justify-between rounded-full pr-1.5 pl-4"
      >
        <Logo to={home} />
        <div className="flex items-center gap-1.5">{right}</div>
      </motion.div>
    </div>
  )
}

export function AccountButton() {
  const { session } = useAuth()
  const { pathname } = useLocation()
  if (session) {
    return (
      <Link to="/app/profile" aria-label="Your profile" className="flex size-10 items-center justify-center rounded-full">
        <Avatar name={session.name} size="sm" />
      </Link>
    )
  }
  return (
    <Link
      to={`/sign-in?returnTo=${encodeURIComponent(pathname)}`}
      className="inline-flex h-10 items-center rounded-full bg-brand-700 px-4 text-label-l text-white hover:bg-brand-800"
    >
      Log in
    </Link>
  )
}
