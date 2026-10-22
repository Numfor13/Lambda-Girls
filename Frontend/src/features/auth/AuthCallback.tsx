import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { LogIn } from "lucide-react"
import { getUserManager, sessionFromUser } from "@/auth/session"
import { ButtonLink } from "@/design/components/Button"
import { Feedback } from "@/design/components/Feedback"
import { PageSpinner, StatusMark } from "@/design/components/primitives"
import { authDestination } from "./destination"

export default function AuthCallback() {
  const navigate = useNavigate()
  const [failed, setFailed] = useState(false)
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    const manager = getUserManager()
    if (!manager) {
      navigate("/sign-in", { replace: true })
      return
    }
    manager
      .signinRedirectCallback()
      .then((user) => {
        const state = user.state as { returnTo?: string } | undefined
        navigate(authDestination(sessionFromUser(user), state?.returnTo), {
          replace: true,
        })
      })
      .catch(() => setFailed(true))
  }, [navigate])
  return (
    <div className="container-page flex min-h-svh flex-col items-center justify-center gap-5 py-10">
      {failed ? (
        <section className="flex w-full max-w-md flex-col items-center gap-5 rounded-xl bg-white p-6 text-center shadow-[var(--shadow-elev-1)]">
          <StatusMark state="info" icon={LogIn} />
          <h1 className="text-headline-m">Sign-in did not finish</h1>
          <Feedback error>Please return to sign-in and try again.</Feedback>
          <ButtonLink to="/sign-in" icon={LogIn}>
            Back to sign in
          </ButtonLink>
        </section>
      ) : (
        <>
          <PageSpinner />
          <p className="text-body-l text-ink-600" role="status">
            Finishing your sign-in…
          </p>
        </>
      )}
    </div>
  )
}
