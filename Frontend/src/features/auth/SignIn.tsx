import { Navigate, useSearchParams } from "react-router-dom"
import { Stethoscope, User } from "lucide-react"
import { homeFor, useAuth } from "@/auth/AuthProvider"
import type { Session } from "@/auth/session"
import { authConfigured } from "@/config/env"
import { Button } from "@/design/components/Button"
import { LogoMark } from "@/design/components/Logo"
import { Notice } from "@/design/components/primitives"

function safeReturn(raw: string | null): string | null {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : null
}

function destination(session: Session, returnTo: string | null): string {
  const isDoctor = session.groups.includes("Doctor")
  if (returnTo && returnTo.startsWith("/doctor") === isDoctor) return returnTo
  return homeFor(session)
}

export default function SignIn() {
  const [params] = useSearchParams()
  const { session, signIn, signInDemo } = useAuth()
  const returnTo = safeReturn(params.get("returnTo"))
  const denied = params.get("denied") === "1"

  if (session && !denied) return <Navigate to={destination(session, returnTo)} replace />

  return (
    <div className="container-page flex justify-center py-16">
      <div className="w-full max-w-md rounded-[20px] border border-line bg-white p-8 shadow-[var(--shadow-float)]">
        <LogoMark className="h-12 w-14" />
        <h1 className="mt-5 text-[28px] font-extrabold">Welcome to CareBridge</h1>
        <p className="mt-2 text-[15px] text-ink-600">
          Sign in or create an account with your phone number or email to message a doctor and
          keep your health history.
        </p>

        {denied && (
          <Notice tone="warn" className="mt-5">
            Your account doesn't have access to that area. Sign in with a different account.
          </Notice>
        )}

        {authConfigured ? (
          <Button full size="lg" className="mt-8" onClick={() => void signIn(returnTo ?? "/app")}>
            Sign in or create account
          </Button>
        ) : (
          <div className="mt-8">
            <Notice tone="info">
              Demo mode — secure sign-in isn't connected yet. Choose a role to explore the app.
            </Notice>
            <div className="mt-4 grid gap-3">
              <Button full size="lg" onClick={() => signInDemo("Patient")}>
                <User className="size-5" aria-hidden />
                Continue as a patient
              </Button>
              <Button full size="lg" variant="secondary" onClick={() => signInDemo("Doctor")}>
                <Stethoscope className="size-5" aria-hidden />
                Continue as a doctor
              </Button>
            </div>
          </div>
        )}

        <p className="mt-6 text-xs leading-5 text-ink-600">
          Finding facilities and checking symptoms work without an account.
        </p>
      </div>
    </div>
  )
}
