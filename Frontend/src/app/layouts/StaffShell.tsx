import { AnimatePresence } from "motion/react"
import { LogOut } from "lucide-react"
import { useLocation, useOutlet } from "react-router-dom"
import { useAuth } from "@/auth/AuthProvider"
import { Backdrop } from "@/design/components/Landscape"
import { MobileTopBar, NavRail, SyncStatus, TabBar, type NavDest } from "@/design/components/AppChrome"
import { IconButton } from "@/design/components/Button"
import { Avatar } from "@/design/components/primitives"
import { PageTransition } from "@/design/motion"
import { Toaster } from "@/design/components/Toast"
import { cn } from "@/lib/utils"

/**
 * Doctor, operator and admin chrome: the patient app's glass rail and top bar, the role under
 * the name (QA K6), and a labelled tab bar on phones when there's more than one place to go.
 */
export function StaffShell({ dests, home, role }: { dests: NavDest[]; home: string; role: string }) {
  const { session, signOut } = useAuth()
  const { pathname } = useLocation()
  const outlet = useOutlet()
  const tabs = dests.length > 1

  const signOutButton = <IconButton icon={LogOut} label="Sign out" variant="plain" onClick={() => void signOut()} />
  return (
    <div className="relative min-h-svh">
      <Backdrop />
      <NavRail
        dests={dests}
        home={home}
        footer={
          <>
            <SyncStatus className="self-start" />
            <div className="flex min-w-0 items-center gap-3">
              {session && <Avatar name={session.name} size="sm" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-label-l" title={session?.name}>
                  {session?.name}
                </span>
                <span className="block text-label-m font-normal text-ink-600">{role}</span>
              </span>
              {signOutButton}
            </div>
          </>
        }
      />
      <MobileTopBar
        home={home}
        right={
          <>
            <span className="inline-flex h-8 items-center rounded-full bg-mint px-3 text-label-m text-brand-900">{role}</span>
            {signOutButton}
          </>
        }
      />
      <main
        id="main"
        className={cn("min-w-0 px-4 pt-5 sm:px-6 lg:pt-8 lg:pr-10 lg:pb-10 lg:pl-[296px] short:pt-5", tabs ? "pb-32" : "pb-12")}
      >
        <AnimatePresence mode="wait" initial={false}>
          <PageTransition key={pathname} id={pathname}>
            {outlet}
          </PageTransition>
        </AnimatePresence>
      </main>
      {tabs && <TabBar dests={dests} labels="always" />}
      <Toaster />
    </div>
  )
}
