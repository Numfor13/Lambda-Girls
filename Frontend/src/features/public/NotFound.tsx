import { useLocation } from "react-router-dom"
import { homeFor, useAuth } from "@/auth/AuthProvider"
import { RecoveryScene } from "@/design/components/RecoveryScene"
import { useOnline } from "@/lib/hooks"

export default function NotFound() {
  const { session } = useAuth()
  const online = useOnline()
  // App and staff shells pad their own content; public pages need the page container.
  const inShell = /^\/(app|doctor|operator|admin)(\/|$)/.test(useLocation().pathname)
  return (
    <div className={inShell ? undefined : "container-page py-4 lg:py-8"}>
      <RecoveryScene eyebrow="Page not found" title="This page took a wrong turn." home={homeFor(session)}>
        {online
          ? "The link may be old or mistyped. Go home, or pick up from one of the places below."
          : "You're offline and this page isn't saved on your phone. The symptom check and facility directory still work."}
      </RecoveryScene>
    </div>
  )
}
