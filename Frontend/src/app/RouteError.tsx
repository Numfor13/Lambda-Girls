import { isRouteErrorResponse, useRouteError } from "react-router-dom"
import { Logo } from "@/design/components/Logo"
import { RecoveryPanel } from "@/design/components/RecoveryPanel"
export function RouteError() {
  const error = useRouteError()
  const notFound = isRouteErrorResponse(error) && error.status === 404
  return (
    <main className="container-page flex min-h-svh flex-col items-center justify-center gap-6 py-10">
      <Logo />
      <RecoveryPanel
        title={notFound ? "We couldn't find that page" : "Something went wrong"}
        retry={() => window.location.reload()}
      >
        {notFound
          ? "This link is unavailable. Return home to find your way."
          : "Please try loading the page again. You can also go back or return home."}
      </RecoveryPanel>
    </main>
  )
}
