import { NavLink, Outlet } from "react-router-dom"
import { ClipboardList, LogOut } from "lucide-react"
import { useAuth } from "@/auth/AuthProvider"
import { Logo } from "@/design/components/Logo"
import { Avatar } from "@/design/components/primitives"
import { cn } from "@/lib/utils"

export function DoctorShell() {
  const { session, signOut } = useAuth()
  return (
    <div className="flex min-h-svh flex-col bg-cream lg:flex-row">
      <aside className="flex shrink-0 items-center justify-between border-b border-line bg-white px-4 py-3 lg:sticky lg:top-0 lg:h-svh lg:w-60 lg:flex-col lg:items-stretch lg:justify-start lg:border-r lg:border-b-0 lg:px-5 lg:py-6">
        <Logo to="/doctor" />
        <nav aria-label="Doctor" className="hidden flex-col gap-1 lg:mt-10 lg:flex">
          <NavLink
            to="/doctor"
            end
            className={({ isActive }) =>
              cn(
                "flex h-12 items-center gap-3 rounded-[10px] px-3 text-[15px] font-medium",
                isActive ? "bg-mint text-brand-900" : "text-ink-600 hover:bg-cream",
              )
            }
          >
            <ClipboardList className="size-5" aria-hidden />
            Queue
          </NavLink>
        </nav>
        <div className="flex items-center gap-3 lg:mt-auto lg:border-t lg:border-line lg:pt-4">
          {session && <Avatar name={session.name} size="sm" />}
          <span className="hidden min-w-0 flex-1 truncate text-sm font-semibold lg:block">
            {session?.name}
          </span>
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex size-10 items-center justify-center rounded-[10px] text-ink-600 hover:bg-cream"
            aria-label="Log out"
          >
            <LogOut className="size-5" aria-hidden />
          </button>
        </div>
      </aside>
      <main id="main" className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  )
}
