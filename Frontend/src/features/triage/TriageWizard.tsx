import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ulid } from "ulid"
import { AnimatePresence, motion } from "motion/react"
import {
  ArrowLeft,
  Baby,
  Check,
  Phone,
  Search,
  Siren,
  User,
  UserPlus,
  Users,
} from "lucide-react"
import type { Sex, SymptomPayload } from "@/api/types"
import { useAuth } from "@/auth/AuthProvider"
import { Button, ButtonA, IconButton } from "@/design/components/Button"
import { SPRING } from "@/design/motion"
import { ChoiceCard, Field, Input, Select } from "@/design/components/Field"
import { AdvisoryNote, Notice } from "@/design/components/primitives"
import { useProfile } from "@/features/profile/useProfile"
import { ageInMonths, describeAge } from "@/lib/format"
import { useNow } from "@/lib/hooks"
import { cn } from "@/lib/utils"
import { triageApi } from "@/api/endpoints"
import { db } from "@/offline/db"
import { enqueue } from "@/offline/outbox"
import { evaluate } from "@/triage-engine/engine"
import {
  GROUP_LABELS,
  symptomsFor,
  type SymptomGroup,
} from "@/triage-engine/symptoms"
import { BreathCounter } from "./BreathCounter"

type Step = "who" | "about" | "pregnancy" | "symptoms" | "vitals" | "review"
type Subject = "me" | "member" | "other"

interface Answers {
  subject: Subject | null
  memberId: string | null
  years: string
  months: string
  sex: Sex | ""
  pregnant: boolean | null
  symptoms: string[]
  respRate: number | undefined
  consent: boolean
}

const CONSENT_KEY = "cb_triage_consent"
const GROUP_ORDER: SymptomGroup[] = [
  "breathing",
  "fever",
  "pain",
  "bleeding",
  "consciousness",
  "skin",
  "digestion",
  "pregnancy",
  "other",
]

function splitAge(months: number) {
  return { years: String(Math.floor(months / 12)), months: String(months % 12) }
}

export default function TriageWizard() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const profile = useProfile()
  const members = profile.data?.on_behalf_profiles ?? []
  const now = useNow(60_000)

  const [a, setA] = useState<Answers>({
    subject: null,
    memberId: null,
    years: "",
    months: "",
    sex: "",
    pregnant: null,
    symptoms: [],
    respRate: undefined,
    consent: localStorage.getItem(CONSENT_KEY) === "1",
  })
  const [stepIndex, setStepIndex] = useState(0)
  const [dir, setDir] = useState(1)
  const [search, setSearch] = useState("")
  const [saving, setSaving] = useState(false)
  /** Show validation messages for the current step after a Continue attempt. */
  const [tried, setTried] = useState(false)

  const ageMonths = Number(a.years || 0) * 12 + Number(a.months || 0)
  const ageKnown = a.years !== "" || a.months !== ""
  const isChild = ageMonths <= 60
  const askPregnancy =
    a.sex === "female" && ageMonths >= 144 && ageMonths <= 600
  const isPregnant = askPregnancy && a.pregnant === true

  const steps = useMemo<Step[]>(
    () => [
      "who",
      "about",
      ...(askPregnancy ? (["pregnancy"] as const) : []),
      "symptoms",
      ...(isChild ? (["vitals"] as const) : []),
      "review",
    ],
    [askPregnancy, isChild]
  )
  const step = steps[Math.min(stepIndex, steps.length - 1)]!

  const catalogue = useMemo(
    () => symptomsFor({ ageMonths, isPregnant }),
    [ageMonths, isPregnant]
  )
  const selected = new Set(a.symptoms)
  const dangerSelected = catalogue.some(
    (s) => s.urgency === "RED" && selected.has(s.code)
  )
  const memberName = members.find((m) => m.member_id === a.memberId)?.name

  const subjectLabel =
    a.subject === "me"
      ? "You"
      : a.subject === "member"
        ? (memberName ?? "Household member")
        : `Someone else (${describeAge(ageMonths)}, ${a.sex || "sex not given"})`

  const update = (patch: Partial<Answers>) =>
    setA((prev) => ({ ...prev, ...patch }))
  const next = () => {
    setDir(1)
    setTried(false)
    setStepIndex((i) => Math.min(i + 1, steps.length - 1))
  }
  const back = () => {
    setDir(-1)
    setTried(false)
    if (stepIndex === 0) navigate(-1)
    else setStepIndex((i) => i - 1)
  }

  const chooseSubject = (subject: Subject, memberId: string | null = null) => {
    const patch: Partial<Answers> = { subject, memberId }
    if (subject === "member") {
      const m = members.find((x) => x.member_id === memberId)
      if (m)
        Object.assign(patch, splitAge(ageInMonths(m.dob, now)), { sex: m.sex })
    } else if (subject === "me" && profile.data?.date_of_birth) {
      Object.assign(
        patch,
        splitAge(ageInMonths(profile.data.date_of_birth, now)),
        {
          sex: profile.data.sex ?? "",
        }
      )
    } else {
      Object.assign(patch, { years: "", months: "", sex: "" })
    }
    update({ ...patch, symptoms: [], respRate: undefined, pregnant: null })
    next()
  }

  const toggleSymptom = (code: string) =>
    update({
      symptoms: selected.has(code)
        ? a.symptoms.filter((c) => c !== code)
        : [...a.symptoms, code],
    })

  const finish = async () => {
    setSaving(true)
    const allowed = new Set(catalogue.map((s) => s.code))
    const payload: SymptomPayload = {
      age_months: ageMonths,
      is_pregnant: isPregnant,
      symptoms: a.symptoms.filter((c) => allowed.has(c)),
      vitals: isChild && a.respRate ? { resp_rate: a.respRate } : {},
      ...(a.sex ? { sex: a.sex } : {}),
    }
    const result = evaluate(payload)
    const resultId = ulid()
    await db.triage_results.put({
      result_id: resultId,
      ...result,
      symptom_payload: payload,
      on_behalf_member_id: a.subject === "member" ? a.memberId : null,
      synced_from_offline: !navigator.onLine,
      created_at: Date.now(),
      sync_state: "queued",
      subject_label: subjectLabel,
    })
    localStorage.setItem(CONSENT_KEY, "1")
    await enqueue("triage", resultId)
    if (navigator.onLine) {
      triageApi
        .submit({
          ...payload,
          on_behalf_member_id: a.subject === "member" ? a.memberId : null,
        })
        .then(async (serverResult) => {
          await db.triage_results.update(resultId, {
            urgency: serverResult.urgency,
            recommendation: serverResult.recommendation,
            facility_type_needed: serverResult.facility_type_needed,
            rules_fired: serverResult.rules_fired,
            sync_state: "sent",
          })
          await db.outbox.where("ref").equals(resultId).delete()
        })
        .catch(() => {
          // Falls back to offline sync; the outbox item is already enqueued.
        })
    }
    navigate(`/app/triage/${resultId}`, { replace: true })
  }

  const isInt = (v: string, min: number, max: number) =>
    /^\d+$/.test(v) && Number(v) >= min && Number(v) <= max
  const errors = {
    years:
      a.years !== "" && !isInt(a.years, 0, 120)
        ? "Years must be a whole number from 0 to 120."
        : undefined,
    months:
      a.months !== "" && !isInt(a.months, 0, 11)
        ? "Months must be a whole number from 0 to 11."
        : undefined,
    age: !ageKnown ? "Enter the age in years, months, or both." : undefined,
    sex:
      a.sex === ""
        ? "Choose one: it changes which danger signs we check."
        : undefined,
    pregnant: a.pregnant === null ? "Choose an answer to continue." : undefined,
    consent: !a.consent
      ? "Tick this box so we can save the result and show you guidance."
      : undefined,
  }
  const stepErrors =
    step === "about"
      ? [errors.age, errors.years, errors.months, errors.sex].filter(Boolean)
      : step === "pregnancy"
        ? [errors.pregnant].filter(Boolean)
        : step === "review"
          ? [errors.consent].filter(Boolean)
          : []
  const show = (msg: string | undefined) => (tried ? msg : undefined)
  const attempt = (go: () => void) => {
    if (stepErrors.length) {
      setTried(true)
      document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      return
    }
    go()
  }

  const q = search.trim().toLowerCase()
  const grouped = GROUP_ORDER.map((g) => ({
    group: g,
    items: catalogue.filter(
      (s) => s.group === g && (!q || s.label.toLowerCase().includes(q))
    ),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:items-start lg:gap-10 xl:gap-14">
      <div className="flex min-h-[70vh] flex-col">
        <div className="flex items-center gap-3">
          <IconButton
            icon={ArrowLeft}
            label="Back"
            variant="glass"
            onClick={back}
          />
          <div
            className="h-3 flex-1 overflow-hidden rounded-full bg-white/70 ring-1 ring-line ring-inset"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={steps.length}
            aria-valuenow={stepIndex + 1}
            aria-label={`Step ${stepIndex + 1} of ${steps.length}`}
          >
            <motion.div
              className="h-full rounded-full bg-brand-700"
              initial={false}
              animate={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
              transition={SPRING.bouncy}
            />
          </div>
          <span className="inline-flex h-9 items-center rounded-full px-3 text-label-m text-brand-900 tabular-nums glass">
            {stepIndex + 1}/{steps.length}
          </span>
        </div>

        <div className="relative mt-6 flex-1">
          <AnimatePresence mode="wait" initial={false} custom={dir}>
            <motion.div
              key={step}
              custom={dir}
              variants={{
                enter: (d: number) => ({ opacity: 0, x: d * 48 }),
                center: { opacity: 1, x: 0 },
                exit: (d: number) => ({ opacity: 0, x: d * -48 }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={SPRING.default}
            >
              {step === "who" && (
                <section>
                  <h1 className="text-headline-l lg:text-display-m">
                    Who is this for?
                  </h1>
                  <p className="mt-2 text-body-l text-ink-600">
                    We'll ask about the person who feels unwell.
                  </p>
                  <div className="mt-6 flex flex-col gap-3">
                    <ChoiceCard
                      title="Me"
                      icon={<User className="size-5" />}
                      selected={a.subject === "me"}
                      onClick={() => chooseSubject("me")}
                    />
                    {members.map((m) => (
                      <ChoiceCard
                        key={m.member_id}
                        title={m.name}
                        description={`${m.relationship} · ${describeAge(ageInMonths(m.dob, now))}`}
                        icon={<Users className="size-5" />}
                        selected={
                          a.subject === "member" && a.memberId === m.member_id
                        }
                        onClick={() => chooseSubject("member", m.member_id)}
                      />
                    ))}
                    <ChoiceCard
                      title="Someone else"
                      description="Enter their age and sex only"
                      icon={<UserPlus className="size-5" />}
                      selected={a.subject === "other"}
                      onClick={() => chooseSubject("other")}
                    />
                  </div>
                  {!session && (
                    <p className="mt-4 text-body-m text-ink-600">
                      Sign in to pick a saved household member.
                    </p>
                  )}
                </section>
              )}

              {step === "about" && (
                <section>
                  <h1 className="text-headline-l lg:text-display-m">
                    {a.subject === "me"
                      ? "About you"
                      : `About ${a.subject === "member" ? memberName : "them"}`}
                  </h1>
                  <p className="mt-2 text-body-l text-ink-600">
                    Age changes which danger signs we check.
                  </p>
                  <div className="mt-6 grid grid-cols-2 gap-4">
                    <Field
                      label="Years"
                      error={show(errors.years ?? errors.age)}
                    >
                      {(id) => (
                        <Input
                          id={id}
                          aria-invalid={
                            tried && Boolean(errors.years ?? errors.age)
                              ? true
                              : undefined
                          }
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={120}
                          value={a.years}
                          onChange={(e) => update({ years: e.target.value })}
                        />
                      )}
                    </Field>
                    <Field
                      label="Months"
                      hint="For babies and young children"
                      error={show(errors.months)}
                    >
                      {(id) => (
                        <Input
                          id={id}
                          aria-invalid={
                            tried && Boolean(errors.months) ? true : undefined
                          }
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={11}
                          value={a.months}
                          onChange={(e) => update({ months: e.target.value })}
                        />
                      )}
                    </Field>
                  </div>
                  <div className="mt-4">
                    <Field label="Sex" error={show(errors.sex)}>
                      {(id) => (
                        <Select
                          id={id}
                          aria-invalid={
                            tried && Boolean(errors.sex) ? true : undefined
                          }
                          value={a.sex}
                          onChange={(e) =>
                            update({
                              sex: e.target.value as Sex,
                              pregnant: null,
                            })
                          }
                        >
                          <option value="" disabled>
                            Choose…
                          </option>
                          <option value="female">Female</option>
                          <option value="male">Male</option>
                          <option value="other">Other</option>
                        </Select>
                      )}
                    </Field>
                  </div>
                  {ageKnown && isChild && (
                    <Notice
                      tone="info"
                      className="mt-5 flex items-center gap-2"
                    >
                      <Baby className="size-5 shrink-0" aria-hidden />
                      Child under 5: we'll check the danger signs for young
                      children.
                    </Notice>
                  )}
                </section>
              )}

              {step === "pregnancy" && (
                <section>
                  <h1 className="text-headline-l lg:text-display-m">
                    Is she pregnant?
                  </h1>
                  <p className="mt-2 text-body-l text-ink-600">
                    Pregnancy has its own danger signs.
                  </p>
                  <div className="mt-6 flex flex-col gap-3">
                    <ChoiceCard
                      title="Yes"
                      selected={a.pregnant === true}
                      onClick={() => update({ pregnant: true })}
                    />
                    <ChoiceCard
                      title="No"
                      selected={a.pregnant === false}
                      onClick={() => update({ pregnant: false })}
                    />
                    <ChoiceCard
                      title="Not sure"
                      description="We'll include pregnancy signs to be safe"
                      selected={false}
                      onClick={() => {
                        update({ pregnant: true })
                        next()
                      }}
                    />
                  </div>
                  {show(errors.pregnant) && (
                    <p
                      role="alert"
                      className="mt-3 text-label-m text-urgent-red"
                    >
                      {errors.pregnant}
                    </p>
                  )}
                </section>
              )}

              {step === "symptoms" && (
                <section>
                  <h1 className="text-headline-l lg:text-display-m">
                    What signs do you see?
                  </h1>
                  <p className="mt-2 text-body-l text-ink-600">
                    Choose all that apply. If none fit, continue.
                  </p>
                  <div className="relative mt-5">
                    <Search
                      className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-400"
                      aria-hidden
                    />
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search signs"
                      aria-label="Search signs"
                      className="h-12 w-full rounded-full border-[1.5px] border-line bg-white pr-4 pl-12 text-body-l transition-shadow focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 focus:outline-none"
                    />
                  </div>

                  <AnimatePresence>
                    {dangerSelected && (
                      <motion.div
                        initial={{ opacity: 0, y: -12, scale: 0.95 }}
                        animate={{
                          opacity: 1,
                          y: 0,
                          scale: 1,
                          x: [0, -6, 6, -3, 0],
                        }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={SPRING.bouncy}
                        className="mt-4 flex flex-col gap-3 shape-bl bg-urgent-red p-4 text-white sm:flex-row sm:items-center"
                      >
                        <Siren className="size-6 shrink-0" aria-hidden />
                        <p className="flex-1 text-title-m">
                          You chose a danger sign. Get guidance now.
                        </p>
                        <Button
                          variant="light"
                          size="sm"
                          onClick={() => setStepIndex(steps.length - 1)}
                        >
                          Get guidance
                        </Button>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="mt-5 flex flex-col gap-6">
                    {grouped.map(({ group, items }) => (
                      <fieldset key={group}>
                        <legend className="mb-3 eyebrow text-ink-600">
                          {GROUP_LABELS[group]}
                        </legend>
                        <ul className="flex flex-col gap-2">
                          {items.map((s) => {
                            const on = selected.has(s.code)
                            return (
                              <li key={s.code}>
                                <motion.button
                                  type="button"
                                  aria-pressed={on}
                                  onClick={() => toggleSymptom(s.code)}
                                  whileTap={{ scale: 0.98 }}
                                  animate={{
                                    borderRadius: on
                                      ? "24px 24px 24px 8px"
                                      : "16px 16px 16px 16px",
                                  }}
                                  transition={SPRING.fast}
                                  className={cn(
                                    "flex min-h-14 w-full items-center gap-3 border-[1.5px] px-4 py-2.5 text-left transition-colors",
                                    on
                                      ? "border-brand-700 bg-mint"
                                      : "border-line bg-white hover:border-brand-500/50"
                                  )}
                                >
                                  <motion.span
                                    animate={{
                                      scale: on ? [1, 1.25, 1] : 1,
                                      borderRadius: on ? "50%" : "8px",
                                    }}
                                    transition={SPRING.bouncy}
                                    className={cn(
                                      "flex size-6 shrink-0 items-center justify-center border-2",
                                      on
                                        ? "border-brand-700 bg-brand-700 text-white"
                                        : "border-ink-400"
                                    )}
                                  >
                                    <AnimatePresence>
                                      {on && (
                                        <motion.span
                                          initial={{ scale: 0 }}
                                          animate={{ scale: 1 }}
                                          exit={{ scale: 0 }}
                                          transition={SPRING.bouncy}
                                        >
                                          <Check
                                            className="size-4"
                                            aria-hidden
                                          />
                                        </motion.span>
                                      )}
                                    </AnimatePresence>
                                  </motion.span>
                                  <span className="flex-1">
                                    <span className="block text-title-m font-medium">
                                      {s.label}
                                    </span>
                                    {s.hint && (
                                      <span className="block text-body-m text-ink-600">
                                        {s.hint}
                                      </span>
                                    )}
                                  </span>
                                  {s.urgency === "RED" && (
                                    <span className="shrink-0 rounded-full bg-urgent-red-50 px-2.5 py-1 text-label-m text-urgent-red">
                                      Danger sign
                                    </span>
                                  )}
                                </motion.button>
                              </li>
                            )
                          })}
                        </ul>
                      </fieldset>
                    ))}
                  </div>
                </section>
              )}

              {step === "vitals" && (
                <section>
                  <h1 className="text-headline-l lg:text-display-m">
                    Count the breathing
                  </h1>
                  <p className="mt-2 text-body-l text-ink-600">
                    Fast breathing can be a sign of pneumonia in young children.{" "}
                    {selected.has("fast_breathing")
                      ? "Please count if you can."
                      : "This step is optional."}
                  </p>
                  <div className="mt-6">
                    <BreathCounter
                      value={a.respRate}
                      onChange={(respRate) => update({ respRate })}
                    />
                  </div>
                </section>
              )}

              {step === "review" && (
                <section>
                  <h1 className="text-headline-l lg:text-display-m">
                    Check your answers
                  </h1>
                  <dl className="mt-6 divide-y divide-line overflow-hidden rounded-xl bg-white shadow-[var(--shadow-elev-1)]">
                    {[
                      ["For", subjectLabel],
                      ["Age", describeAge(ageMonths)],
                      ...(askPregnancy
                        ? [["Pregnant", isPregnant ? "Yes" : "No"]]
                        : []),
                      [
                        "Signs",
                        a.symptoms.length
                          ? catalogue
                              .filter((s) => selected.has(s.code))
                              .map((s) => s.label)
                              .join(", ")
                          : "None chosen",
                      ],
                      ...(isChild && a.respRate
                        ? [["Breathing", `${a.respRate} per minute`]]
                        : []),
                    ].map(([k, v]) => (
                      <div key={k} className="flex gap-4 px-5 py-4">
                        <dt className="w-24 shrink-0 text-body-m text-ink-600">
                          {k}
                        </dt>
                        <dd className="text-title-m">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <label
                    className={cn(
                      "mt-5 flex items-start gap-3 rounded-md bg-white p-4 text-body-m shadow-[var(--shadow-elev-1)]",
                      show(errors.consent) && "ring-2 ring-urgent-red"
                    )}
                  >
                    <input
                      type="checkbox"
                      aria-invalid={show(errors.consent) ? true : undefined}
                      checked={a.consent}
                      onChange={(e) => update({ consent: e.target.checked })}
                      className="mt-0.5 size-5 accent-brand-700"
                    />
                    <span>
                      Save this result on this phone and, when signed in, to my
                      CareBridge record so a doctor can see it.
                    </span>
                  </label>
                  {show(errors.consent) && (
                    <p
                      role="alert"
                      className="mt-2 text-label-m text-urgent-red"
                    >
                      {errors.consent}
                    </p>
                  )}
                  <AdvisoryNote className="mt-4" />
                </section>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {step !== "who" && (
          <div className="sticky bottom-[104px] z-20 mt-8 rounded-full p-2 glass-strong lg:bottom-4">
            {step === "review" ? (
              <Button
                full
                size="lg"
                onClick={() => attempt(() => void finish())}
                loading={saving}
                trailing="arrow"
              >
                Get guidance
              </Button>
            ) : (
              <Button
                full
                size="lg"
                onClick={() => attempt(next)}
                trailing="arrow"
              >
                {step === "vitals" && a.respRate === undefined
                  ? "Skip"
                  : "Continue"}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Desktop context: what's been answered so far, and the emergency route. */}
      <aside className="sticky top-6 hidden flex-col gap-4 lg:flex">
        <section className="rounded-xl bg-white p-5 shadow-[var(--shadow-elev-1)]">
          <p className="eyebrow">Your answers</p>
          <dl className="mt-3 flex flex-col gap-3 text-body-m">
            <div>
              <dt className="text-ink-600">For</dt>
              <dd className="text-title-m">
                {!a.subject
                  ? "Not chosen yet"
                  : a.subject === "other"
                    ? "Someone else"
                    : subjectLabel}
              </dd>
            </div>
            <div>
              <dt className="text-ink-600">Age</dt>
              <dd className="text-title-m">
                {ageKnown ? describeAge(ageMonths) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-ink-600">Signs chosen</dt>
              <dd className="text-title-m">
                {a.symptoms.length
                  ? catalogue
                      .filter((s) => selected.has(s.code))
                      .map((s) => s.label)
                      .join(", ")
                  : "None yet"}
              </dd>
            </div>
          </dl>
        </section>
        <section className="flex flex-col gap-3 rounded-xl bg-white p-5 shadow-[var(--shadow-elev-1)]">
          <p className="text-title-m">
            Someone can't breathe, won't wake, or is bleeding heavily?
          </p>
          <p className="text-body-m text-ink-600">
            Don't finish the check. Call now.
          </p>
          <ButtonA href="tel:15" icon={Phone} variant="danger">
            Call 15
          </ButtonA>
        </section>
        <AdvisoryNote />
      </aside>
    </div>
  )
}
