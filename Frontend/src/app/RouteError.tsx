import { isRouteErrorResponse, useRouteError } from "react-router-dom"
import { Logo } from "@/design/components/Logo"
import { RecoveryScene } from "@/design/components/RecoveryScene"

/** Router error boundary: no shell around it, so it brings its own logo. */
export function RouteError() {
  const error = useRouteError()
  const notFound = isRouteErrorResponse(error) && error.status === 404
  return (
    <main className="flex min-h-svh flex-col gap-4 bg-cream p-3 sm:p-6">
      <div className="px-2 pt-1">
        <Logo />
      </div>
      {notFound ? (
        <RecoveryScene eyebrow="Page not found" title="This page took a wrong turn.">
          The link may be old or mistyped. Go home, or pick up from one of the places below.
        </RecoveryScene>
      ) : (
        <RecoveryScene eyebrow="Something went wrong" title="This page didn't load properly." retry={() => window.location.reload()}>
          It&apos;s not something you did. Try again; anything you saved on this phone is still there.
        </RecoveryScene>
      )}
    </main>
  )
}
