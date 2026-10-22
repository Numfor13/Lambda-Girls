import { useState } from "react"
import { Navigate, useNavigate, useSearchParams } from "react-router-dom"
import { motion } from "motion/react"
import { ArrowRight, LogIn, Stethoscope, User } from "lucide-react"
import { useAuth } from "@/auth/AuthProvider"
import { authConfigured } from "@/config/env"
import { Button, ButtonLink } from "@/design/components/Button"
import { Feedback } from "@/design/components/Feedback"
import { Landscape } from "@/design/components/Landscape"
import { Logo } from "@/design/components/Logo"
import { popIn, staggerOnMount } from "@/design/motion"
import { authDestination, safeReturn } from "./destination"

export default function SignIn() {
  const [params] = useSearchParams()
  const { session, signIn, signInDemo } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const returnTo = safeReturn(params.get("returnTo"))
  const denied = params.get("denied") === "1"
  if (session && !denied)
    return <Navigate to={authDestination(session, returnTo)} replace />
  const demo = (role: "Patient" | "Doctor") => {
    signInDemo(role)
    const target =
      returnTo &&
      (returnTo === "/doctor" || returnTo.startsWith("/doctor/")) ===
        (role === "Doctor")
        ? returnTo
        : role === "Doctor"
          ? "/doctor"
          : "/app"
    navigate(target, { replace: true })
  }
  return (
    <section className="relative isolate overflow-hidden py-14 lg:py-20">
      <Landscape className="-z-10" preserve="xMidYMid slice" />
      <motion.div
        variants={staggerOnMount()}
        initial="hidden"
        animate="show"
        className="container-page flex justify-center"
      >
        <motion.div
          variants={popIn}
          className="flex w-full max-w-xl flex-col items-start gap-5 shape-bl p-6 glass-strong sm:p-10"
        >
          <Logo size="lg" />
          <div>
            <p className="eyebrow">Health within reach</p>
            <h1 className="mt-3 text-headline-l lg:text-display-m">
              Welcome to CareBridge
            </h1>
            <p className="mt-4 text-body-l text-ink-900">
              Sign in to message a doctor and keep track of your care, for you
              or your household.
            </p>
          </div>
          {denied && (
            <Feedback>
              This account cannot open that area. Choose another account or
              return to your home.
            </Feedback>
          )}
          {error && (
            <Feedback error>Could not open sign-in. Please try again.</Feedback>
          )}
          {authConfigured ? (
            <Button
              full
              icon={LogIn}
              size="lg"
              loading={busy}
              onClick={async () => {
                setBusy(true)
                setError(false)
                try {
                  await signIn(returnTo ?? "/app")
                } catch {
                  setError(true)
                  setBusy(false)
                }
              }}
            >
              Sign in or create account
            </Button>
          ) : (
            <>
              <Feedback>
                Demo mode. Choose a role to try the app with demo data.
              </Feedback>
              <div className="flex w-full flex-col gap-3">
                <Button
                  full
                  icon={User}
                  size="lg"
                  onClick={() => demo("Patient")}
                >
                  Continue as a patient
                </Button>
                <Button
                  full
                  icon={Stethoscope}
                  variant="secondary"
                  size="lg"
                  onClick={() => demo("Doctor")}
                >
                  Continue as a doctor
                </Button>
              </div>
            </>
          )}
          <p className="text-body-m text-ink-900">
            Finding facilities and checking symptoms work without an account.
          </p>
          <ButtonLink to="/app/facilities" icon={ArrowRight} variant="glass">
            Browse facilities
          </ButtonLink>
        </motion.div>
      </motion.div>
    </section>
  )
}
