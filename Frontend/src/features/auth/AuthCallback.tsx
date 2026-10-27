import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { LogIn } from "lucide-react"
import { getUserManager, sessionFromUser } from "@/auth/session"
import { ButtonLink } from "@/design/components/Button"
import { PulseDot } from "@/design/components/Lively"
import { Logo } from "@/design/components/Logo"
import { StatusMark } from "@/design/components/primitives"
import { authDestination } from "./destination"

/** Where the hosted sign-in page sends people back. One calm card while the session is read. */
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
        navigate(authDestination(sessionFromUser(user), state?.returnTo), { replace: true })
      })
      .catch(() => setFailed(true))
  }, [navigate])

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 bg-gradient-to-b from-mint to-cream px-4 py-10">
      <Logo />
      <section className="flex w-full max-w-md flex-col items-center gap-4 rounded-2xl bg-white p-6 text-center shadow-[var(--shadow-elev-2)] sm:p-8">
        {failed ? (
          <>
            <StatusMark state="info" icon={LogIn} />
            <h1 className="text-headline-m">Sign-in didn&apos;t finish</h1>
            <p className="text-body-l text-ink-600">
              The link may have expired or been opened twice. Go back and sign in again; it only takes a moment.
            </p>
            <ButtonLink to="/sign-in" icon={LogIn}>
              Back to sign in
            </ButtonLink>
          </>
        ) : (
          <>
            <h1 className="text-headline-m">Signing you in</h1>
            <p role="status" className="flex items-center gap-3 text-body-l text-ink-600">
              <PulseDot tone="brand" /> Getting your account ready…
            </p>
          </>
        )}
      </section>
    </main>
  )
}
