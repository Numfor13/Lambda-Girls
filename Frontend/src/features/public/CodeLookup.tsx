import { useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { motion } from "motion/react"
import { ArrowRight, Building2, FileText, Pill, RefreshCw, SearchX, ShieldCheck } from "lucide-react"
import { ApiError } from "@/api/errors"
import { doctorApi, facilityApi } from "@/api/endpoints"
import { AppPage, Panel } from "@/design/components/AppPage"
import { Button } from "@/design/components/Button"
import { CopyReference } from "@/design/components/CopyReference"
import { Skeleton, StepTrack } from "@/design/components/Lively"
import { ServiceError } from "@/design/components/ServicePage"
import { SPRING, popIn } from "@/design/motion"
import { formatDateTime } from "@/lib/format"
import { useOnline } from "@/lib/hooks"
import { cn } from "@/lib/utils"

/*
 * Prescription / referral lookup, from the "verify code page" study (Stripe, Apple and ~10
 * Dribbble code screens): eight boxes you can see filling, one action, and the answer as a
 * ticket you can show at the counter. Opens with the tool, not a hero (QA P1).
 */

const LEN = 8
const CODE = /^[A-Za-z0-9]{8}$/

const COPY = {
  rx: {
    eyebrow: "Prescription",
    title: "Look up a prescription",
    subtitle: "Enter the 8-character code the doctor gave you to see the medicine and how to take it.",
    label: "Prescription code",
    icon: Pill,
    done: "Dispensed",
    where: [
      "Show the code at any pharmacy. They can look it up here too.",
      "Once the medicine is handed over, the code is marked as dispensed.",
    ],
  },
  ref: {
    eyebrow: "Referral",
    title: "Look up a referral",
    subtitle: "Enter the 8-character code the doctor gave you to see where you've been referred and why.",
    label: "Referral code",
    icon: Building2,
    done: "Used",
    where: [
      "Show the code at the facility's reception when you arrive.",
      "Once the facility sees you, the code is marked as used.",
    ],
  },
} as const

function CodeBoxes({ value, onChange, label, error }: { value: string; onChange: (v: string) => void; label: string; error?: string }) {
  const [focused, setFocused] = useState(false)
  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="care-code" className="text-label-l text-ink-900">
        {label}
      </label>
      {/* One real input over eight boxes: paste, autofill and screen readers all work as normal. */}
      <div className="relative max-w-[480px]">
        <div className="grid grid-cols-8 gap-1.5 sm:gap-2" aria-hidden>
          {Array.from({ length: LEN }, (_, i) => {
            const ch = value[i]
            const active = focused && (i === value.length || (value.length === LEN && i === LEN - 1))
            return (
              <div
                key={i}
                className={cn(
                  "flex aspect-[4/5] items-center justify-center rounded-lg bg-white font-mono text-[22px] text-ink-900 transition-shadow sm:text-[28px]",
                  error
                    ? "shadow-[inset_0_0_0_2px_var(--color-urgent-red)]"
                    : active
                      ? "shadow-[inset_0_0_0_2px_var(--color-brand-600),0_0_0_4px_color-mix(in_oklab,var(--color-brand-500)_15%,transparent)]"
                      : ch
                        ? "shadow-[inset_0_0_0_1.5px_var(--color-brand-700)]"
                        : "shadow-[inset_0_0_0_1px_var(--color-line)]",
                )}
              >
                {ch ? (
                  <motion.span key={`${i}:${ch}`} initial={{ y: 6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={SPRING.fast}>
                    {ch}
                  </motion.span>
                ) : (
                  active && <span className="h-7 w-0.5 animate-pulse rounded-full bg-brand-600 motion-reduce:animate-none" />
                )}
              </div>
            )
          })}
        </div>
        <input
          id="care-code"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, LEN))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          maxLength={LEN}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={Boolean(error)}
          aria-describedby="care-code-hint"
          className="absolute inset-0 h-full w-full cursor-text bg-transparent text-transparent caret-transparent opacity-0 outline-none selection:bg-transparent"
        />
      </div>
      <p id="care-code-hint" className={cn("text-body-m", error ? "text-urgent-red" : "text-ink-600")} role={error ? "alert" : undefined}>
        {error ?? "Letters and numbers only. Capitals matter: “A” and “a” are different."}
      </p>
    </div>
  )
}

function LookupForm({ kind, initial, compact = false }: { kind: "rx" | "ref"; initial: string; compact?: boolean }) {
  const navigate = useNavigate()
  const [value, setValue] = useState(initial)
  const [submitted, setSubmitted] = useState(false)
  const error = !value ? "Enter the code first." : value.length < LEN ? `The code has ${LEN} characters. You've entered ${value.length}.` : undefined
  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        setSubmitted(true)
        if (error) {
          document.getElementById("care-code")?.focus()
          return
        }
        navigate(`/${kind}/${encodeURIComponent(value)}`)
      }}
    >
      <CodeBoxes value={value} onChange={setValue} label={COPY[kind].label} error={submitted ? error : undefined} />
      <Button type="submit" icon={ArrowRight} variant={compact ? "tonal" : "primary"} className="self-start">
        Look up code
      </Button>
    </form>
  )
}

function Result({ kind, code }: { kind: "rx" | "ref"; code: string }) {
  const online = useOnline()
  const rx = useQuery({
    queryKey: ["public-rx", code],
    queryFn: () => doctorApi.prescription(code),
    enabled: kind === "rx",
    retry: false,
  })
  const referral = useQuery({
    queryKey: ["public-ref", code],
    queryFn: () => doctorApi.referral(code),
    enabled: kind === "ref",
    retry: false,
  })
  const target = referral.data?.target_facility_id
  const facility = useQuery({
    queryKey: ["public-ref-facility", target],
    queryFn: () => facilityApi.get(target!),
    enabled: kind === "ref" && Boolean(target),
    retry: false,
  })
  const query = kind === "rx" ? rx : referral
  const data = query.data
  const c = COPY[kind]

  if (query.isPending)
    return (
      <div className="flex flex-col gap-3" role="status" aria-label="Looking up the code">
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    )

  if (query.isError || !data) {
    const missing = query.error instanceof ApiError && query.error.status === 404
    return (
      <Panel>
        <div className="flex flex-col items-start gap-4">
          <span className="flex size-12 items-center justify-center rounded-full bg-cream text-ink-600">
            <SearchX className="size-6" aria-hidden />
          </span>
          <p className="text-headline-s">{missing ? "We couldn't find that code." : "We couldn't look up the code."}</p>
          <p className="text-body-l text-ink-600">
            {missing
              ? `Check each character against what the doctor sent, including capitals. “${code}” didn't match any ${kind === "rx" ? "prescription" : "referral"}.`
              : "Check your connection and try again."}
          </p>
          {!missing && <ServiceError error={query.error} />}
          {!missing && (
            <Button variant="tonal" icon={RefreshCw} disabled={!online} onClick={() => void query.refetch()}>
              Try again
            </Button>
          )}
        </div>
      </Panel>
    )
  }

  const done = data.status !== "active"
  return (
    <motion.article variants={popIn} initial="hidden" animate="show" className="overflow-hidden rounded-2xl bg-white shadow-[var(--shadow-elev-2)]">
      <header className="flex flex-col gap-4 bg-brand-900 p-5 text-white sm:flex-row sm:items-center sm:justify-between lg:p-7">
        <div className="flex items-center gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-white/12 text-mint-200">
            <c.icon className="size-6" aria-hidden />
          </span>
          <div>
            <p className="eyebrow text-mint-200">{c.eyebrow}</p>
            <p className="mt-1 font-mono text-[26px] leading-none tracking-[0.12em] break-all">{code}</p>
          </div>
        </div>
        <span
          className={cn(
            "inline-flex h-8 items-center gap-2 self-start rounded-full px-3 text-label-l sm:self-auto",
            done ? "bg-white/12 text-white" : "bg-mint-200 text-brand-900",
          )}
        >
          {done ? c.done : "Ready to use"}
        </span>
      </header>
      {/* Perforation, as on the receipt ticket. */}
      <div className="relative h-0 border-t-2 border-dashed border-line" aria-hidden />
      <div className="flex flex-col gap-6 p-5 lg:p-7">
        {kind === "rx" && rx.data ? (
          <>
            <section>
              <h2 className="text-label-l text-ink-600">Medicine</h2>
              <p className="mt-1 text-title-l whitespace-pre-wrap">{rx.data.medication_details}</p>
            </section>
            {rx.data.instructions && (
              <section className="rounded-xl bg-cream p-4">
                <h2 className="text-label-l text-ink-600">How to take it</h2>
                <p className="mt-1 text-body-l whitespace-pre-wrap">{rx.data.instructions}</p>
              </section>
            )}
          </>
        ) : (
          referral.data && (
            <>
              <section>
                <h2 className="text-label-l text-ink-600">Go to</h2>
                <p className="mt-1 text-title-l">
                  {facility.data ? (
                    <Link to={`/app/facilities/${facility.data.facility_id}`} className="text-brand-700 underline-offset-4 hover:underline">
                      {facility.data.name}
                    </Link>
                  ) : facility.isPending ? (
                    "Loading the facility…"
                  ) : (
                    "Facility details unavailable"
                  )}
                </p>
                {facility.data && <p className="text-body-m text-ink-600">{facility.data.quarter}</p>}
                {facility.isError && <p className="mt-1 text-body-m text-ink-600">Ask the doctor which facility this is.</p>}
              </section>
              {referral.data.reason && (
                <section className="rounded-xl bg-cream p-4">
                  <h2 className="text-label-l text-ink-600">Reason</h2>
                  <p className="mt-1 text-body-l whitespace-pre-wrap">{referral.data.reason}</p>
                </section>
              )}
            </>
          )
        )}
        <StepTrack steps={["Issued", c.done]} at={done ? 2 : 1} label={`${c.eyebrow} status`} />
        <div className="flex flex-col gap-4 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-body-m text-ink-600">
            Issued {formatDateTime(data.issued_at)} · checked {formatDateTime(query.dataUpdatedAt)}
          </p>
          <div className="flex flex-wrap gap-2">
            <CopyReference value={code} label="Copy code" />
            <Button variant="secondary" icon={RefreshCw} disabled={!online} loading={query.isFetching} onClick={() => void query.refetch()}>
              Refresh
            </Button>
          </div>
        </div>
      </div>
    </motion.article>
  )
}

export default function CodeLookup({ kind }: { kind: "rx" | "ref" }) {
  const { code = "" } = useParams()
  const valid = CODE.test(code)
  const c = COPY[kind]

  const help = (
    <Panel title="Where to use it">
      <ul className="flex flex-col gap-3">
        {c.where.map((w) => (
          <li key={w} className="flex gap-3 text-body-m text-ink-600">
            <FileText className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
            {w}
          </li>
        ))}
        <li className="flex gap-3 text-body-m text-ink-600">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
          No account needed. This page never shows the patient&apos;s name.
        </li>
      </ul>
    </Panel>
  )

  return (
    <div className="container-page pt-4 pb-14 lg:pt-8 lg:pb-20 short:pt-4">
      <AppPage
        eyebrow={c.eyebrow}
        title={c.title}
        subtitle={c.subtitle}
        aside={
          valid ? (
            <>
              <Panel title="Look up another code">
                <LookupForm key={`${kind}:${code}`} kind={kind} initial="" compact />
              </Panel>
              {help}
            </>
          ) : (
            help
          )
        }
      >
        {valid ? (
          <Result kind={kind} code={code} />
        ) : (
          <Panel>
            <LookupForm key={`${kind}:${code}`} kind={kind} initial={code.replace(/[^A-Za-z0-9]/g, "").slice(0, LEN)} />
          </Panel>
        )}
      </AppPage>
    </div>
  )
}
