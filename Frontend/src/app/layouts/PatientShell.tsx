import { useLocation, useOutlet } from "react-router-dom"
import { AnimatePresence } from "motion/react"
import { Backdrop } from "@/design/components/Landscape"
import {
  AccountButton,
  MobileTopBar,
  NavRail,
  PATIENT_DESTS,
  SyncStatus,
  TabBar,
} from "@/design/components/AppChrome"
import { OfflineBanner } from "@/design/components/OfflineBanner"
import { PageTransition } from "@/design/motion"
import { cn } from "@/lib/utils"
import { Toaster } from "@/design/components/Toast"

/**
 * Every page gets the full content width (pages lay themselves out with <AppPage>).
 * TEMPORARY: routes not yet moved onto AppPage keep the old reading column so they don't
 * stretch. Remove each entry as its page is reworked (docs/REDESIGN_BUILD.md §3c).
 */
const LEGACY_NARROW = [
  /^\/app\/profile/,
  /^\/app\/appointments/,
  /^\/app\/labs/,
  /^\/app\/blood/,
  /^\/app\/history/,
]

export function PatientShell() {
  const { pathname } = useLocation()
  const outlet = useOutlet()
  const narrow = LEGACY_NARROW.some((r) => r.test(pathname))

  return (
    <div className="relative min-h-svh">
      <Backdrop />
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-white p-3 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <NavRail
        dests={PATIENT_DESTS}
        home="/"
        fab={{ to: "/app/consult/new", label: "New consultation" }}
        footer={
          <>
            <SyncStatus className="self-start" />
            <div className="flex items-center gap-3 px-1">
              <AccountButton />
            </div>
          </>
        }
      />
      <MobileTopBar
        home="/"
        right={
          <>
            <SyncStatus className="hidden min-[400px]:inline-flex" />
            <AccountButton />
          </>
        }
      />
      <div className="lg:pl-[264px]">
        <OfflineBanner />
        <main
          id="main"
          className={cn(
            "mx-auto w-full px-4 pt-5 pb-32 sm:px-6 lg:px-10 lg:pt-8 lg:pb-16",
            narrow ? "max-w-3xl" : "max-w-[1320px] min-[1800px]:max-w-[1560px]"
          )}
        >
          <AnimatePresence mode="wait" initial={false}>
            <PageTransition key={pathname} id={pathname}>
              {outlet}
            </PageTransition>
          </AnimatePresence>
        </main>
      </div>
      <TabBar dests={PATIENT_DESTS} />
      <Toaster />
    </div>
  )
}
