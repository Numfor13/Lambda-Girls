import { Link, NavLink, Outlet, useLocation } from "react-router-dom"
import { House, MessagesSquare, Stethoscope, User } from "lucide-react"
import { useAuth } from "@/auth/AuthProvider"
import { Logo } from "@/design/components/Logo"
import { OfflineBanner } from "@/design/components/OfflineBanner"
import { Avatar } from "@/design/components/primitives"
import { cn } from "@/lib/utils"

const TABS = [
  { to: "/app", label: "Home", icon: House, match: (p: string) => p === "/app" },
  {
    to: "/app/facilities",
    label: "Care",
    icon: Stethoscope,
    match: (p: string) => p.startsWith("/app/facilities") || p.startsWith("/app/triage"),
  },
  {
    to: "/app/consults",
    label: "Consults",
    icon: MessagesSquare,
    match: (p: string) => p.startsWith("/app/consult"),
  },
  { to: "/app/profile", label: "Profile", icon: User, match: (p: string) => p.startsWith("/app/profile") },
]

export function PatientShell() {
  const { session } = useAuth()
  const { pathname } = useLocation()

  return (
    <div className="flex min-h-svh flex-col bg-white lg:flex-row">
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col border-r border-line bg-white px-5 py-6 lg:flex">
        <Logo to="/" />
        <nav aria-label="App" className="mt-10 flex flex-col gap-1">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.to === "/app"}
              className={cn(
                "flex h-12 items-center gap-3 rounded-[10px] px-3 text-[15px] font-medium",
                t.match(pathname) ? "bg-mint text-brand-900" : "text-ink-600 hover:bg-cream",
              )}
            >
              <t.icon className="size-5" aria-hidden />
              {t.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
          <OfflineBanner />
          <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:justify-end">
            <div className="lg:hidden">
              <Logo to="/" />
            </div>
            {session ? (
              <Link to="/app/profile" aria-label="Your profile">
                <Avatar name={session.name} size="sm" />
              </Link>
            ) : (
              <Link
                to={`/sign-in?returnTo=${encodeURIComponent(pathname)}`}
                className="text-[15px] font-semibold text-brand-700"
              >
                Log in
              </Link>
            )}
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-28 sm:px-6 lg:pb-12">
          <Outlet />
        </main>
      </div>

      <nav
        aria-label="App"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="grid grid-cols-4">
          {TABS.map((t) => {
            const active = t.match(pathname)
            return (
              <li key={t.to}>
                <Link
                  to={t.to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-16 flex-col items-center justify-center gap-1 text-[12px] font-medium",
                    active ? "text-brand-700" : "text-ink-600",
                  )}
                >
                  <t.icon className="size-[22px]" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                  {t.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
