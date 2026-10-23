import { useState } from "react"
import {
  Link,
  NavLink,
  useLocation,
  useNavigate,
  useOutlet,
} from "react-router-dom"
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useScroll,
} from "motion/react"
import { Activity, Globe, Menu, X } from "lucide-react"
import { useAuth, homeFor } from "@/auth/AuthProvider"
import { Logo } from "@/design/components/Logo"
import { ButtonLink, IconButton } from "@/design/components/Button"
import {
  PageTransition,
  Reveal,
  SPRING,
  StaggerContainer,
  StaggerItem,
} from "@/design/motion"
import { flags } from "@/config/flags"
import { cn } from "@/lib/utils"
import { Toaster } from "@/design/components/Toast"

const NAV = [
  { to: "/how-it-works", label: "How it works" },
  { to: "/app/facilities", label: "Facilities" },
  { to: "/app/triage", label: "Check symptoms" },
  { to: "/about", label: "About" },
]

/** Floating Liquid Glass pill nav. Lifts (stronger shadow) once the page scrolls. */
function PublicNav() {
  const [lifted, setLifted] = useState(false)
  const { session } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { scrollY } = useScroll()
  useMotionValueEvent(scrollY, "change", (y) => setLifted(y > 24))
  // The menu belongs to the page it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn === pathname

  const authClass =
    "inline-flex h-10 items-center rounded-full px-4 text-label-l text-ink-900 transition-colors hover:bg-ink-900/5"
  const auth = session ? (
    <Link to={homeFor(session)} className={authClass}>
      My account
    </Link>
  ) : (
    <button type="button" onClick={() => navigate("/sign-in?returnTo=/app")} className={authClass}>
      Sign in
    </button>
  )

  return (
    <header className="sticky top-0 z-40 px-3 pt-3 lg:px-6 lg:pt-5">
      <motion.div
        initial={{ y: -60, opacity: 0 }}
        animate={{ y: 0, opacity: 1, scale: lifted ? 0.985 : 1 }}
        transition={SPRING.default}
        className={cn(
          "mx-auto flex h-[60px] max-w-[1200px] items-center justify-between gap-4 rounded-full pr-2 pl-5 transition-[background-color,box-shadow] duration-300 lg:h-[64px]",
          lifted ? "glass-strong" : "bg-white/40 ring-1 ring-white/60"
        )}
      >
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-0.5 lg:flex">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                cn(
                  "relative rounded-full px-4 py-2 text-label-l transition-colors duration-150",
                  isActive ? "text-brand-900" : "text-ink-600 hover:text-ink-900"
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="public-nav"
                      className="absolute inset-0 rounded-full bg-mint"
                      transition={SPRING.default}
                    />
                  )}
                  <span className="relative">{n.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="hidden items-center gap-1 lg:flex">
          <span className="inline-flex h-10 items-center gap-1.5 px-2 text-label-l text-ink-600" title="Language">
            <Globe className="size-4" aria-hidden />
            EN
          </span>
          {auth}
          <ButtonLink to="/app/triage" icon={Activity} size="sm">
            Check symptoms
          </ButtonLink>
        </div>
        <IconButton
          icon={open ? X : Menu}
          label={open ? "Close menu" : "Open menu"}
          variant="filled"
          aria-expanded={open}
          onClick={() => setOpenOn(open ? null : pathname)}
          className="lg:hidden"
        />
      </motion.div>

      <AnimatePresence>
        {open && (
          <motion.nav
            aria-label="Main"
            initial={{ opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.96 }}
            transition={SPRING.default}
            style={{ originY: 0 }}
            className="mx-auto mt-2 flex max-w-[1280px] flex-col shape-tr p-3 glass-strong lg:hidden"
          >
            {NAV.map((n, i) => (
              <motion.div
                key={n.to}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...SPRING.fast, delay: 0.04 * i }}
              >
                <Link
                  to={n.to}
                  className="flex h-12 items-center rounded-full px-4 text-title-m hover:bg-white/60"
                >
                  {n.label}
                </Link>
              </motion.div>
            ))}
            <div className="mt-2 flex items-center justify-between gap-4 border-t border-white/60 px-4 pt-3">
              {auth}
              <ButtonLink to="/app/triage" icon={Activity} size="sm">
                Check symptoms
              </ButtonLink>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  )
}

export function LanguageSwitch({ light = false }: { light?: boolean }) {
  const langs = [
    { code: "en", label: "English", enabled: true },
    { code: "fr", label: "Français", enabled: flags.i18n_fr },
    { code: "pid", label: "Pidgin", enabled: flags.i18n_pid },
  ]
  return (
    <ul className="flex items-center gap-2 text-label-m" aria-label="Language">
      {langs.map((l, i) => (
        <li key={l.code} className="flex items-center gap-2">
          {i > 0 && (
            <span className={light ? "text-white/40" : "text-ink-400"}>·</span>
          )}
          <button
            type="button"
            aria-current={l.code === "en" ? "true" : undefined}
            aria-disabled={!l.enabled}
            title={l.enabled ? undefined : "Coming soon"}
            className={cn(
              light
                ? "text-white/75 hover:text-white"
                : "text-ink-600 hover:text-ink-900",
              l.code === "en" && (light ? "text-white" : "text-ink-900"),
              !l.enabled && "cursor-default"
            )}
          >
            {l.label}
          </button>
        </li>
      ))}
    </ul>
  )
}

const FOOTER_COLUMNS = [
  {
    title: "Get care",
    links: [
      { to: "/app/facilities", label: "Find a facility" },
      { to: "/app/triage", label: "Check symptoms" },
      { to: "/app/consult/new", label: "Message a doctor" },
    ],
  },
  {
    title: "CareBridge",
    links: [
      { to: "/about", label: "About us" },
      { to: "/how-it-works", label: "How it works" },
      { to: "/about#providers", label: "For healthcare providers" },
    ],
  },
  {
    title: "Support",
    links: [
      { to: "/how-it-works#help", label: "Help centre" },
      { to: "/about#contact", label: "Contact us" },
      { to: "/about#privacy", label: "Privacy & terms" },
    ],
  },
]

/** Dark "ground" band footer — continues the landscape's foreground. */
export function PublicFooter() {
  return (
    <footer className="relative overflow-hidden bg-ground text-white">
      <div className="relative z-10 container-page">
        <Reveal className="flex flex-col items-start justify-between gap-8 border-b border-white/12 py-14 lg:flex-row lg:items-end lg:py-20">
          <p className="max-w-[16ch] text-display-m text-white">
            Good care starts with <em className="text-mint-200 italic">one simple step.</em>
          </p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink to="/app/triage" variant="light" size="lg" icon={Activity}>
              Check symptoms
            </ButtonLink>
            <ButtonLink to="/app/facilities" variant="outline-light" size="lg" trailing="arrow">
              Find care near me
            </ButtonLink>
          </div>
        </Reveal>

        <StaggerContainer
          className="grid gap-10 py-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]"
          stagger={0.08}
        >
          <StaggerItem>
            <span className="inline-flex rounded-full bg-white py-1.5 pr-4 pl-2.5">
              <Logo />
            </span>
            <p className="mt-5 max-w-[28ch] text-body-l text-white/75">
              Health within reach — even offline.
            </p>
          </StaggerItem>
          {FOOTER_COLUMNS.map((col) => (
            <StaggerItem key={col.title}>
              <p className="text-label-m tracking-[0.08em] text-white/50 uppercase">{col.title}</p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      to={l.to}
                      className="text-body-m text-white/75 transition-colors hover:text-white"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </StaggerItem>
          ))}
        </StaggerContainer>

        <div className="flex flex-col gap-4 border-t border-white/12 py-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-body-m text-white/70">
            © CareBridge · Advisory, not a diagnosis. In an emergency call 15.
          </p>
          <LanguageSwitch light />
        </div>
      </div>
    </footer>
  )
}

export function PublicShell() {
  const { pathname } = useLocation()
  const outlet = useOutlet()
  return (
    <div className="flex min-h-svh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-white p-3 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <PublicNav />
      <main id="main" className="flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <PageTransition key={pathname} id={pathname}>
            {outlet}
          </PageTransition>
        </AnimatePresence>
      </main>
      <PublicFooter />
      <Toaster />
    </div>
  )
}
