import { useState } from "react"
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom"
import { Menu, X } from "lucide-react"
import { useAuth, homeFor } from "@/auth/AuthProvider"
import { Logo, LogoMark } from "@/design/components/Logo"
import { ButtonLink, buttonClass } from "@/design/components/Button"
import { flags } from "@/config/flags"
import { cn } from "@/lib/utils"

const NAV = [
  { to: "/app/facilities", label: "Find care" },
  { to: "/how-it-works", label: "How it works" },
  { to: "/#services", label: "Services" },
  { to: "/about", label: "About" },
]

function PublicNav() {
  const [open, setOpen] = useState(false)
  const { session } = useAuth()
  const navigate = useNavigate()

  const authLink = session ? (
    <Link
      to={homeFor(session)}
      className="text-[15px] font-medium text-ink-900 hover:text-brand-700"
    >
      My account
    </Link>
  ) : (
    <button
      type="button"
      onClick={() => navigate("/sign-in?returnTo=/app")}
      className="text-[15px] font-medium text-ink-900 hover:text-brand-700"
    >
      Log in
    </button>
  )

  return (
    <header className="sticky top-0 z-40 border-b border-transparent bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
      <div className="container-page flex h-[76px] items-center justify-between gap-6">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-9 lg:flex">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className="text-[15px] font-medium text-ink-900 hover:text-brand-700"
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden items-center gap-8 lg:flex">
          {authLink}
          <ButtonLink to="/app" size="sm" className="h-11 px-5">
            Get started
          </ButtonLink>
        </div>
        <button
          type="button"
          className="flex size-11 items-center justify-center rounded-[10px] text-ink-900 lg:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </div>
      {open && (
        <nav aria-label="Main" className="border-t border-line bg-white lg:hidden">
          <div className="container-page flex flex-col py-3">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setOpen(false)}
                className="py-3 text-[16px] font-medium text-ink-900"
              >
                {n.label}
              </Link>
            ))}
            <div className="mt-2 flex items-center gap-4 border-t border-line pt-4">
              {authLink}
              <ButtonLink to="/app" size="sm" className="ml-auto" onClick={() => setOpen(false)}>
                Get started
              </ButtonLink>
            </div>
          </div>
        </nav>
      )}
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
    <ul className="flex items-center gap-2 text-[13px]" aria-label="Language">
      {langs.map((l, i) => (
        <li key={l.code} className="flex items-center gap-2">
          {i > 0 && <span className={light ? "text-white/40" : "text-ink-400"}>/</span>}
          <button
            type="button"
            aria-current={l.code === "en" ? "true" : undefined}
            aria-disabled={!l.enabled}
            title={l.enabled ? undefined : "Coming soon"}
            className={cn(
              light ? "text-white/85 hover:text-white" : "text-ink-600 hover:text-ink-900",
              l.code === "en" && (light ? "font-semibold text-white" : "font-semibold text-ink-900"),
              !l.enabled && "cursor-default",
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
      { to: "/app/consult/new", label: "Doctor consultations" },
      { to: flags.appointments ? "/app/appointments" : "/app/facilities", label: "Appointments" },
      {
        to: flags.lab_tests ? "/app/lab-tests" : "/app/facilities?capability=laboratory",
        label: "Lab tests",
      },
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

export function PublicFooter() {
  return (
    <footer className="relative overflow-hidden bg-brand-900 text-white">
      <div className="container-page relative z-10">
        <div className="flex flex-col items-start justify-between gap-6 border-b border-white/15 py-12 sm:flex-row sm:items-center lg:py-14">
          <p className="font-display text-[28px] leading-[1.15] font-bold tracking-tight text-white lg:text-[34px]">
            Good care starts
            <br />
            with a simple step.
          </p>
          <Link
            to="/app/facilities"
            className={buttonClass({ variant: "light", className: "rounded-[12px] px-6" })}
          >
            Find care near me
            <span aria-hidden>↗</span>
          </Link>
        </div>

        <div className="grid gap-10 py-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Logo light size="lg" />
            <p className="mt-6 text-[15px] text-white/85">Connecting communities with care.</p>
          </div>
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="text-[15px] font-semibold text-white">{col.title}</p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link to={l.to} className="text-[14px] text-white/80 hover:text-white">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-4 border-t border-white/15 py-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] text-white/85">© CareBridge</p>
          <LanguageSwitch light />
        </div>
      </div>

      <div
        className="pointer-events-none flex items-center justify-center gap-6 pb-2 opacity-[0.07] select-none"
        aria-hidden
      >
        <LogoMark light className="h-24 w-28 sm:h-36 sm:w-40" />
        <span className="font-display text-[72px] leading-none font-extrabold tracking-tight sm:text-[120px] lg:text-[150px]">
          CareBridge
        </span>
      </div>
    </footer>
  )
}

export function PublicShell() {
  return (
    <div className="flex min-h-svh flex-col">
      <a
        href="#main"
        className="sr-only z-50 bg-white p-3 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <PublicNav />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <PublicFooter />
    </div>
  )
}
