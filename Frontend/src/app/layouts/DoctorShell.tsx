import { useLocation, useOutlet } from "react-router-dom"
import { AnimatePresence } from "motion/react"
import { ClipboardList, LogOut } from "lucide-react"
import { useAuth } from "@/auth/AuthProvider"
import { Backdrop } from "@/design/components/Landscape"
import { MobileTopBar, NavRail, SyncStatus, type NavDest } from "@/design/components/AppChrome"
import { IconButton } from "@/design/components/Button"
import { Avatar } from "@/design/components/primitives"
import { PageTransition } from "@/design/motion"

const DOCTOR_DESTS: NavDest[] = [
  { to: "/doctor", label: "Queue", icon: ClipboardList, match: (p) => p.startsWith("/doctor") },
]

/** Same chrome as the patient app: glass NavRail on desktop, glass top bar on mobile. */
export function DoctorShell() {
  const { session, signOut } = useAuth()
  const { pathname } = useLocation()
  const outlet = useOutlet()
  const account = (
    <div className="flex items-center gap-3">
      {session && <Avatar name={session.name} size="sm" />}
      <span className="hidden min-w-0 flex-1 truncate text-label-l lg:block">{session?.name}</span>
      <IconButton icon={LogOut} label="Log out" variant="plain" onClick={() => void signOut()} />
    </div>
  )
  return (
    <div className="relative min-h-svh">
      <Backdrop />
      <NavRail dests={DOCTOR_DESTS} home="/doctor" footer={<><SyncStatus className="self-start" />{account}</>} />
      <MobileTopBar home="/doctor" right={account} />
      <main id="main" className="min-w-0 px-4 pt-5 pb-16 sm:px-6 lg:pt-8 lg:pr-10 lg:pl-[296px]">
        <AnimatePresence mode="wait" initial={false}>
          <PageTransition key={pathname} id={pathname}>
            {outlet}
          </PageTransition>
        </AnimatePresence>
      </main>
    </div>
  )
}
