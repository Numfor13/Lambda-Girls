import { isRouteErrorResponse, Link, useRouteError } from "react-router-dom"
import { TriangleAlert } from "lucide-react"
import { Logo } from "@/design/components/Logo"

export function RouteError() {
  const error = useRouteError()
  const notFound = isRouteErrorResponse(error) && error.status === 404
  if (!notFound) console.error(error)

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-5 px-6 text-center">
      <Logo />
      <TriangleAlert className="mt-6 size-12 text-urgent-amber" strokeWidth={1.5} aria-hidden />
      <h1 className="text-headline-l lg:text-display-m">
        {notFound ? "We couldn't find that page" : "Something went wrong"}
      </h1>
      <p className="max-w-sm text-body-l text-ink-600">
        Your saved facilities, symptom checks and messages are safe on this phone.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="h-12 rounded-full bg-brand-700 px-5 font-semibold text-white"
        >
          Try again
        </button>
        <Link to="/app" className="flex h-12 items-center rounded-full border-[1.5px] border-brand-700 px-5 font-semibold text-brand-900">
          Go to home
        </Link>
      </div>
    </div>
  )
}
