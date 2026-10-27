import { isRouteErrorResponse, useRouteError } from "react-router-dom"
import { Logo } from "@/design/components/Logo"
import { RecoveryPanel } from "@/design/components/RecoveryPanel"
import { RecoveryScene } from "@/design/components/RecoveryScene"
export function RouteError() {
  const error = useRouteError()
  const notFound = isRouteErrorResponse(error) && error.status === 404
  return (
    <main className="flex min-h-svh flex-col gap-5 bg-mint-200 p-4 sm:p-6">
      <Logo />
      <RecoveryScene>
      <RecoveryPanel
        title={notFound ? "We couldn't find that page" : "Something went wrong"}
        retry={() => window.location.reload()}
      >
        {notFound
          ? "This link is unavailable. Return home to find your way."
          : "Please try loading the page again. You can also go back or return home."}
      </RecoveryPanel>
      </RecoveryScene>
    </main>
  )
}
