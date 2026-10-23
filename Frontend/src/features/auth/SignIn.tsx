import { useState } from "react"
import { Navigate, useSearchParams, Link } from "react-router-dom"
import { homeFor, useAuth } from "@/auth/AuthProvider"
import { signUpRedirect } from "@/auth/session"
import type { Session } from "@/auth/session"
import { authConfigured } from "@/config/env"
import { Button } from "@/design/components/Button"
import { LogoMark } from "@/design/components/Logo"
import { Notice } from "@/design/components/primitives"
import { User, Stethoscope, LogIn, UserPlus } from "lucide-react"
import { cn } from "@/lib/utils"

type Mode = "signin" | "signup"

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
  const initialMode: Mode = params.get("mode") === "signup" ? "signup" : "signin"
  const [mode, setMode] = useState<Mode>(initialMode)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (session && !denied) return <Navigate to={destination(session, returnTo)} replace />

  const handleSignIn = async () => {
    setError(null)
    setLoading(true)
    try {
      await signIn(returnTo ?? "/app")
    } catch {
      setError("Could not reach the sign-in page. Please check your connection and try again.")
      setLoading(false)
    }
  }

  const handleSignUp = async () => {
    setError(null)
    setLoading(true)
    try {
      await signUpRedirect(returnTo ?? "/app")
    } catch {
      setError("Could not reach the sign-up page. Please check your connection and try again.")
      setLoading(false)
    }
  }

  return (
    <div className="container-page flex justify-center py-16">
      <div className="w-full max-w-md rounded-[20px] border border-line bg-white shadow-[var(--shadow-float)]">

        {/* Header */}
        <div className="px-8 pt-8 pb-6 border-b border-line">
          <LogoMark className="h-12" />
          <h1 className="mt-4 text-[26px] font-extrabold leading-tight">
            {mode === "signin" ? "Welcome back" : "Join CareBridge"}
          </h1>
          <p className="mt-1.5 text-[14px] text-ink-600">
            {mode === "signin"
              ? "Sign in to access your consultations and health history."
              : "Create a free account to message doctors and track your health."}
          </p>
        </div>

        {/* Tab toggle */}
        <div className="flex border-b border-line">
          <button
            type="button"
            onClick={() => { setMode("signin"); setError(null) }}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-3.5 text-[14px] font-semibold transition-colors",
              mode === "signin"
                ? "border-b-2 border-brand-700 text-brand-700"
                : "text-ink-500 hover:text-ink-900"
            )}
          >
            <LogIn className="size-4" aria-hidden />
            Sign in
          </button>
          <button
            type="button"
            onClick={() => { setMode("signup"); setError(null) }}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-3.5 text-[14px] font-semibold transition-colors",
              mode === "signup"
                ? "border-b-2 border-brand-700 text-brand-700"
                : "text-ink-500 hover:text-ink-900"
            )}
          >
            <UserPlus className="size-4" aria-hidden />
            Create account
          </button>
        </div>

        {/* Body */}
        <div className="px-8 py-7">
          {denied && (
            <Notice tone="warn" className="mb-5">
              Your account doesn't have access to that area. Sign in with a different account.
            </Notice>
          )}

          {error && (
            <Notice tone="error" className="mb-5">{error}</Notice>
          )}

          {authConfigured ? (
            mode === "signin" ? (
              <div className="flex flex-col gap-4">
                <Button full size="lg" loading={loading} onClick={() => void handleSignIn()}>
                  <LogIn className="size-5" aria-hidden />
                  Continue to sign in
                </Button>
                <p className="text-center text-[13px] text-ink-500">
                  No account?{" "}
                  <button
                    type="button"
                    className="font-semibold text-brand-700 hover:underline"
                    onClick={() => { setMode("signup"); setError(null) }}
                  >
                    Create one free
                  </button>
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="rounded-[14px] bg-mint px-4 py-4 text-[14px] text-brand-900">
                  <p className="font-semibold">What you get with a free account:</p>
                  <ul className="mt-2 space-y-1 list-disc list-inside text-ink-700">
                    <li>Online consultations with verified doctors</li>
                    <li>Full health consultation history</li>
                    <li>Household member management</li>
                    <li>Offline access to your records</li>
                  </ul>
                </div>
                <Button full size="lg" loading={loading} onClick={() => void handleSignUp()}>
                  <UserPlus className="size-5" aria-hidden />
                  Create my account
                </Button>
                <p className="text-center text-[13px] text-ink-500">
                  Already have an account?{" "}
                  <button
                    type="button"
                    className="font-semibold text-brand-700 hover:underline"
                    onClick={() => { setMode("signin"); setError(null) }}
                  >
                    Sign in instead
                  </button>
                </p>
              </div>
            )
          ) : (
            /* Demo mode fallback */
            <div>
              <Notice tone="info" className="mb-4">
                Demo mode — Cognito is not connected. Choose a role to explore the app.
              </Notice>
              <div className="grid gap-3">
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
        </div>

        <p className="px-8 pb-7 text-xs text-ink-500">
          Facility search, symptom checks, and the facility map work without an account.{" "}
          <Link to="/app/facilities" className="font-semibold text-brand-700 hover:underline">
            Explore without signing in →
          </Link>
        </p>
      </div>
    </div>
  )
}
