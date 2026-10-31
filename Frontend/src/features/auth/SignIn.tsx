import { useState } from "react"
import {
  Link,
  Navigate,
  useNavigate,
  useSearchParams,
  useLocation,
} from "react-router-dom"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import {
  Activity,
  BadgeCheck,
  Building2,
  ClipboardList,
  Droplet,
  FileText,
  Headphones,
  LogIn,
  MapPin,
  MessageCircle,
  Phone,
  PhoneCall,
  ShieldCheck,
  Stethoscope,
  User,
  type LucideIcon,
} from "lucide-react"
import type { Urgency } from "@/api/types"
import { useAuth } from "@/auth/AuthProvider"
import type { Role } from "@/auth/session"
import { authConfigured, staffAuthConfigured, env } from "@/config/env"
import { flags } from "@/config/flags"
import { Button } from "@/design/components/Button"
import { Feedback } from "@/design/components/Feedback"
import { PulseDot } from "@/design/components/Lively"
import { UrgencyBadge } from "@/design/components/UrgencyBadge"
import { SPRING } from "@/design/motion"
import { formatXaf } from "@/lib/format"
import { cn } from "@/lib/utils"
import { authDestination, safeReturn } from "./destination"

/*
 * Sign-in, from the split-screen study (Linear, Mercury, Stripe and ~10 Dribbble sign-in
 * screens): the form owns one half, the other half shows the product you are about to enter.
 * In demo mode the preview follows the chosen role, so the choice explains itself.
 */

type RoleOption = { role: Role; icon: LucideIcon; title: string; line: string }

const ROLES: RoleOption[] = [
  {
    role: "Patient",
    icon: User,
    title: "Patient",
    line: "Check symptoms, message a doctor, book visits",
  },
  {
    role: "Doctor",
    icon: Stethoscope,
    title: "Doctor",
    line: "Answer cases, most urgent first",
  },
  ...(flags.operator_console
    ? [
        {
          role: "Operator" as const,
          icon: Headphones,
          title: "Operator",
          line: "Callbacks, emergencies, blood and lab requests",
        },
        {
          role: "Admin" as const,
          icon: ShieldCheck,
          title: "Administrator",
          line: "Facilities, health tips and appointments",
        },
      ]
    : []),
]

type PreviewRow = {
  icon: LucideIcon
  title: string
  meta: string
  urgency?: Urgency
  dark?: boolean
}

const FEE = formatXaf(env.consultationFeeXaf)
const PREVIEW: Record<Role, { title: string; rows: PreviewRow[] }> = {
  Patient: {
    title: "Care for you and your household, even offline.",
    rows: [
      {
        icon: Activity,
        title: "Fever and fast breathing",
        meta: "Symptom check · for Amina, 4 years",
        urgency: "AMBER",
      },
      {
        icon: MessageCircle,
        title:
          "“Keep giving fluids. If the fever is still there tomorrow, come in.”",
        meta: "Doctor reply · 12 min ago",
        dark: true,
      },
      {
        icon: BadgeCheck,
        title: `Payment confirmed · ${FEE}`,
        meta: "Mobile Money",
      },
    ],
  },
  Doctor: {
    title: "One queue. The most urgent case is always on top.",
    rows: [
      {
        icon: Activity,
        title: "Breathing fast, 2 years",
        meta: "Waiting 4 min",
        urgency: "RED",
      },
      {
        icon: Activity,
        title: "Fever for 3 days, 34 years",
        meta: "Waiting 18 min",
        urgency: "AMBER",
      },
      {
        icon: FileText,
        title: "Prescription code sent",
        meta: "The patient shows it at the pharmacy",
        dark: true,
      },
    ],
  },
  Operator: {
    title: "Every request that needs a person, in one place.",
    rows: [
      {
        icon: PhoneCall,
        title: "Callback requested",
        meta: "2 min ago · Molyko",
      },
      {
        icon: Droplet,
        title: "2 units of O+ · Emergency",
        meta: "Blood request · Regional Hospital",
        urgency: "RED",
      },
      {
        icon: ClipboardList,
        title: "Lab result ready to share",
        meta: "Full blood count",
        dark: true,
      },
    ],
  },
  Admin: {
    title: "Keep the directory and advice people rely on up to date.",
    rows: [
      {
        icon: Building2,
        title: "Facility hours updated",
        meta: "Saved for every phone on the next sync",
      },
      {
        icon: FileText,
        title: "Health tip published",
        meta: "English · Malaria",
        dark: true,
      },
      {
        icon: MapPin,
        title: "Visit request confirmed",
        meta: "Tomorrow morning",
      },
    ],
  },
}

function Preview({ role }: { role: Role }) {
  const reduce = useReducedMotion()
  const p = PREVIEW[role]
  return (
    <div className="relative flex h-full flex-col justify-center gap-10 overflow-hidden bg-brand-900 p-6 text-white sm:p-10 lg:p-12 short:p-8">
      {/* Soft rings, not a picture: the same calm glow as the Home hero. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -right-40 size-[520px] rounded-full bg-[radial-gradient(circle,rgb(255_255_255/0.08),transparent_65%)]"
      />
      <div className="relative">
        <p className="flex items-center gap-2 eyebrow text-mint-200">
          <PulseDot tone="light" /> Inside CareBridge
        </p>
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={role}
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -6 }}
            transition={SPRING.default}
            className="mt-4 max-w-[18ch] font-display text-[30px] leading-[1.12] font-[440] tracking-[-0.015em] lg:text-[38px] short:text-[32px]"
          >
            {p.title}
          </motion.p>
        </AnimatePresence>
      </div>

      <div className="relative">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.ul
            key={role}
            className="flex flex-col gap-3"
            aria-label={`Example of the ${role.toLowerCase()} view`}
          >
            {p.rows.map((r, i) => (
              <motion.li
                key={r.title}
                initial={reduce ? false : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={
                  reduce
                    ? undefined
                    : { opacity: 0, y: -10, transition: { duration: 0.15 } }
                }
                transition={{
                  ...SPRING.default,
                  delay: reduce ? 0 : 0.06 + i * 0.08,
                }}
                className={cn(
                  "flex items-center gap-3 rounded-xl p-3.5 sm:p-4",
                  r.dark
                    ? "bg-white/10 ring-1 ring-white/15 ring-inset"
                    : "bg-white text-ink-900 shadow-[var(--shadow-elev-2)]",
                  i === 1 && "lg:ml-10",
                  i === 2 && "lg:mr-10"
                )}
              >
                <span
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-md",
                    r.dark
                      ? "bg-white/12 text-mint-200"
                      : "bg-mint text-brand-700"
                  )}
                >
                  <r.icon className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-label-l">{r.title}</span>
                  <span
                    className={cn(
                      "block text-body-m",
                      r.dark ? "text-white/70" : "text-ink-600"
                    )}
                  >
                    {r.meta}
                  </span>
                </span>
                {r.urgency && (
                  <UrgencyBadge
                    urgency={r.urgency}
                    className="hidden sm:inline-flex"
                  />
                )}
              </motion.li>
            ))}
          </motion.ul>
        </AnimatePresence>
        <p className="mt-4 text-label-m text-white/60">
          Example screens. Names and cases are made up.
        </p>
      </div>
    </div>
  )
}

function RolePicker({
  value,
  onChange,
}: {
  value: Role
  onChange: (r: Role) => void
}) {
  return (
    <fieldset>
      <legend className="mb-3 text-label-l text-ink-900">
        Who are you signing in as?
      </legend>
      <div
        role="radiogroup"
        aria-label="Demo role"
        className="grid gap-2 sm:grid-cols-2"
      >
        {ROLES.map((r) => {
          const on = r.role === value
          return (
            <button
              key={r.role}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={r.title}
              aria-describedby={`role-${r.role}`}
              onClick={() => onChange(r.role)}
              className={cn(
                "flex items-start gap-3 rounded-lg p-3.5 text-left transition-[background-color,box-shadow] duration-150",
                on
                  ? "bg-mint shadow-[inset_0_0_0_2px_var(--color-brand-700)]"
                  : "bg-white shadow-[inset_0_0_0_1px_var(--color-line)] hover:shadow-[inset_0_0_0_1px_var(--color-brand-500)]"
              )}
            >
              <span
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-md transition-colors",
                  on ? "bg-brand-700 text-white" : "bg-mint text-brand-700"
                )}
              >
                <r.icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-label-l text-ink-900">
                  {r.title}
                </span>
                <span
                  id={`role-${r.role}`}
                  className="block text-body-m text-ink-600"
                >
                  {r.line}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

export default function SignIn() {
  const [params] = useSearchParams()
  const staff = useLocation().pathname.startsWith("/staff")
  const configured = staff ? staffAuthConfigured : authConfigured
  const demo = env.useMockApi && !authConfigured && !staffAuthConfigured
  const { session, isLoading, signIn, signInDemo, signOut } = useAuth()
  const navigate = useNavigate()
  const [role, setRole] = useState<Role>(staff ? "Doctor" : "Patient")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const returnTo = safeReturn(params.get("returnTo"))
  const denied = params.get("denied") === "1"

  // QA M5: keep something on screen while the role's workspace loads.
  if (
    session &&
    !denied &&
    (demo ||
      (staff
        ? session.groups.some((g) =>
            ["Doctor", "Operator", "Admin"].includes(g)
          )
        : session.groups.includes("Patient")))
  )
    return (
      <>
        <Navigate to={authDestination(session, returnTo)} replace />
        <div
          role="status"
          className="flex min-h-[50svh] items-center justify-center gap-3 text-body-l text-ink-600"
        >
          <PulseDot tone="brand" /> Signing you in…
        </div>
      </>
    )

  const continueDemo = () => {
    setError(false)
    try {
      const next = signInDemo(role)
      navigate(authDestination(next, returnTo), { replace: true })
    } catch {
      setError(true)
    }
  }
  const continueHosted = async () => {
    setBusy(true)
    setError(false)
    try {
      await signIn(
        returnTo ?? (staff ? "/doctor" : "/app"),
        staff ? "staff" : "patient"
      )
    } catch {
      setBusy(false)
      setError(true)
    }
  }
  const chosen = ROLES.find((r) => r.role === role) ?? ROLES[0]

  return (
    <section className="container-page pt-3 pb-12 lg:pt-6 lg:pb-16 short:pt-3">
      <div className="grid overflow-hidden rounded-2xl bg-white shadow-[var(--shadow-elev-2)] lg:min-h-[min(calc(100svh-150px),760px)] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING.default}
          className="flex flex-col justify-center gap-6 p-5 sm:p-10 lg:px-14 lg:py-12 short:gap-5 short:py-8"
        >
          <div>
            <p className="eyebrow">
              {demo ? "Demo" : staff ? "Care team" : "Welcome"}
            </p>
            <h1 className="mt-3 text-headline-l lg:text-display-m">
              {staff ? "Staff sign in" : "Sign in to CareBridge"}
            </h1>
            <p className="mt-2 max-w-[52ch] text-body-l text-ink-600">
              {configured
                ? staff
                  ? "Use the staff account from your invitation. An authenticator code is required."
                  : "Use your phone number or email. New here? You can create an account on the next screen."
                : demo
                  ? "Choose who you want to be. Everything here is sample data and no money is charged."
                  : "Sign-in is not configured for this workspace yet."}
            </p>
          </div>

          {denied && (
            <Feedback>
              That workspace is for another role. Choose the right role below,
              or sign in with another account.
            </Feedback>
          )}
          {session && !session.groups.length && (
            <Feedback>
              Your staff account has no workspace assigned. Contact the
              administrator who invited you.
              <Button variant="secondary" onClick={() => void signOut()}>
                Sign out
              </Button>
            </Feedback>
          )}
          {error && (
            <Feedback error>
              We couldn&apos;t open sign-in. Check your connection and try
              again.
            </Feedback>
          )}

          {configured ? (
            <div className="flex flex-col gap-4">
              <ol className="flex flex-col gap-3 rounded-xl bg-cream p-4 text-body-m text-ink-600">
                {(staff
                  ? [
                      "Open the secure staff sign-in page.",
                      "Use your invitation password on first sign-in, then set a new password and an authenticator app.",
                      "Enter your authenticator code to open your workspace.",
                    ]
                  : [
                      "You go to CareBridge's secure sign-in page.",
                      "Enter your phone number or email and password.",
                      "You come straight back here.",
                    ]
                ).map((s, i) => (
                  <li key={s} className="flex items-start gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white text-label-m text-brand-700 tabular">
                      {i + 1}
                    </span>
                    {s}
                  </li>
                ))}
              </ol>
              <Button
                full
                size="lg"
                icon={LogIn}
                loading={busy || isLoading}
                onClick={() => void continueHosted()}
              >
                {staff
                  ? "Continue to staff sign in"
                  : "Sign in or create account"}
              </Button>
            </div>
          ) : demo ? (
            <div className="flex flex-col gap-5">
              <RolePicker value={role} onChange={setRole} />
              <Button
                full
                size="lg"
                icon={chosen.icon}
                onClick={continueDemo}
                disabled={isLoading}
              >
                Continue as {chosen.title.toLowerCase()}
              </Button>
            </div>
          ) : (
            <Feedback>
              Staff sign-in needs the staff pool configuration. Patient accounts
              cannot enter staff workspaces.
            </Feedback>
          )}

          <div className="flex flex-wrap gap-4 text-body-m">
            <Link
              to={staff ? "/sign-in" : "/staff/sign-in"}
              className="text-brand-700 underline"
            >
              {staff ? "Patient sign in" : "Staff sign in"}
            </Link>
            <Link to="/apply/doctor" className="text-brand-700 underline">
              Apply as a doctor
            </Link>
            <Link to="/apply/status" className="text-brand-700 underline">
              Application status
            </Link>
          </div>
          <div
            className="flex items-center gap-3 text-label-m text-ink-600"
            aria-hidden
          >
            <span className="h-px flex-1 bg-line" /> or{" "}
            <span className="h-px flex-1 bg-line" />
          </div>
          <p className="text-body-m text-ink-600">
            No account needed to{" "}
            <Link
              to="/app/facilities"
              className="font-semibold text-brand-700 underline-offset-4 hover:underline"
            >
              find a facility
            </Link>{" "}
            or{" "}
            <Link
              to="/app/triage"
              className="font-semibold text-brand-700 underline-offset-4 hover:underline"
            >
              check symptoms
            </Link>
            {flags.anonymous && (
              <>
                , or to{" "}
                <Link
                  to="/ask"
                  className="font-semibold text-brand-700 underline-offset-4 hover:underline"
                >
                  ask a doctor anonymously
                </Link>
              </>
            )}
            .
          </p>

          <div className="flex flex-col gap-3 rounded-xl bg-urgent-red-50 p-4 sm:flex-row sm:items-center">
            <p className="flex-1 text-body-m text-ink-900">
              <span className="font-semibold text-urgent-red">Emergency?</span>{" "}
              Don&apos;t sign in first. Call now.
            </p>
            <a
              href="tel:15"
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-urgent-red px-4 text-label-l text-white hover:brightness-110"
            >
              <Phone className="size-4" aria-hidden /> Call 15
            </a>
          </div>
        </motion.div>

        <Preview role={configured ? (staff ? "Doctor" : "Patient") : role} />
      </div>
    </section>
  )
}
