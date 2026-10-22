import { useEffect, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { getUserManager, sessionFromUser } from "@/auth/session"
import { homeFor } from "@/auth/AuthProvider"
import { Notice, PageSpinner } from "@/design/components/primitives"

export default function AuthCallback() {
  const navigate = useNavigate()
  const [failed, setFailed] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const um = getUserManager()
    if (!um) {
      navigate("/sign-in", { replace: true })
      return
    }
    um.signinRedirectCallback()
      .then((user) => {
        const state = user.state as { returnTo?: string } | undefined
        const session = sessionFromUser(user)
        const home = homeFor(session)
        const target =
          state?.returnTo && state.returnTo !== "/" && !state.returnTo.startsWith("/sign-in")
            ? state.returnTo
            : home
        navigate(target, { replace: true })
      })
      .catch(() => setFailed(true))
  }, [navigate])

  if (failed) {
    return (
      <div className="container-page max-w-md py-16">
        <Notice tone="error">We couldn't finish signing you in. Please try again.</Notice>
        <Link to="/sign-in" className="mt-4 inline-block font-semibold text-brand-700">
          Back to sign in
        </Link>
      </div>
    )
  }
  return <PageSpinner />
}
