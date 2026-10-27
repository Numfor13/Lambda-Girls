import { AnimatePresence } from "motion/react"
import { LogOut } from "lucide-react"
import { useLocation, useOutlet } from "react-router-dom"
import { useAuth } from "@/auth/AuthProvider"
import { Backdrop } from "@/design/components/Landscape"
import {
  MobileTopBar,
  NavRail,
  SyncStatus,
  TabBar,
  type NavDest,
} from "@/design/components/AppChrome"
import { IconButton } from "@/design/components/Button"
import { Avatar } from "@/design/components/primitives"
import { PageTransition } from "@/design/motion"
import { Toaster } from "@/design/components/Toast"

export function StaffShell({
  dests,
  home,
}: {
  dests: NavDest[]
  home: string
}) {
  const { session, signOut } = useAuth(),
    { pathname } = useLocation(),
    outlet = useOutlet()
  const account = (
    <div className="flex min-w-0 items-center gap-3">
      {session && <Avatar name={session.name} size="sm" />}
      <span className="hidden min-w-0 flex-1 truncate text-label-l lg:block">
        {session?.name}
      </span>
      <IconButton
        icon={LogOut}
        label="Log out"
        variant="plain"
        onClick={() => void signOut()}
      />
    </div>
  )
  return (
    <div className="relative min-h-svh">
      <Backdrop />
      <NavRail
        dests={dests}
        home={home}
        footer={
          <>
            <SyncStatus className="self-start" />
            {account}
          </>
        }
      />
      <MobileTopBar home={home} right={account} />
      <main
        id="main"
        className="min-w-0 px-4 pt-5 pb-32 sm:px-6 lg:pt-8 lg:pr-10 lg:pb-10 lg:pl-[296px]"
      >
        <AnimatePresence mode="wait" initial={false}>
          <PageTransition key={pathname} id={pathname}>
            {outlet}
          </PageTransition>
        </AnimatePresence>
      </main>
      <TabBar dests={dests} />
      <Toaster />
    </div>
  )
}
