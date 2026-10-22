import { useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ulid } from "ulid"
import { Baby, Check, ChevronLeft, Search, Siren, User, UserPlus, Users } from "lucide-react"
import type { Sex, SymptomPayload } from "@/api/types"
import { useAuth } from "@/auth/AuthProvider"
import { Button } from "@/design/components/Button"
import { ChoiceCard, Field, Input, Select } from "@/design/components/Field"
import { AdvisoryNote, Notice } from "@/design/components/primitives"
import { SlideStep } from "@/design/motion"
import { useProfile } from "@/features/profile/useProfile"
import { ageInMonths, describeAge } from "@/lib/format"
import { useNow } from "@/lib/hooks"
import { cn } from "@/lib/utils"
import { db } from "@/offline/db"
import { enqueue } from "@/offline/outbox"
import { evaluate } from "@/triage-engine/engine"
import { GROUP_LABELS, symptomsFor, type SymptomGroup } from "@/triage-engine/symptoms"
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
  const [search, setSearch] = useState("")
  const [saving, setSaving] = useState(false)
  const dirRef = useRef<1 | -1>(1)

  const ageMonths = Number(a.years || 0) * 12 + Number(a.months || 0)
  const ageKnown = a.years !== "" || a.months !== ""
  const isChild = ageMonths <= 60
  const askPregnancy = a.sex === "female" && ageMonths >= 144 && ageMonths <= 600
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
    [askPregnancy, isChild],
  )
  const step = steps[Math.min(stepIndex, steps.length - 1)]!

  const catalogue = useMemo(
    () => symptomsFor({ ageMonths, isPregnant }),
    [ageMonths, isPregnant],
  )
  const selected = new Set(a.symptoms)
  const dangerSelected = catalogue.some((s) => s.urgency === "RED" && selected.has(s.code))
  const memberName = members.find((m) => m.member_id === a.memberId)?.name

  const subjectLabel =
    a.subject === "me"
      ? "You"
      : a.subject === "member"
        ? (memberName ?? "Household member")
        : `Someone else (${describeAge(ageMonths)}, ${a.sex || "sex not given"})`

  const update = (patch: Partial<Answers>) => setA((prev) => ({ ...prev, ...patch }))
  const next = () => { dirRef.current = 1; setStepIndex((i) => Math.min(i + 1, steps.length - 1)) }
  const back = () => { dirRef.current = -1; stepIndex === 0 ? navigate(-1) : setStepIndex((i) => i - 1) }

  const chooseSubject = (subject: Subject, memberId: string | null = null) => {
    const patch: Partial<Answers> = { subject, memberId }
    if (subject === "member") {
      const m = members.find((x) => x.member_id === memberId)
      if (m) Object.assign(patch, splitAge(ageInMonths(m.dob, now)), { sex: m.sex })
    } else if (subject === "me" && profile.data?.date_of_birth) {
      Object.assign(patch, splitAge(ageInMonths(profile.data.date_of_birth, now)), {
        sex: profile.data.sex ?? "",
      })
    } else {
      Object.assign(patch, { years: "", months: "", sex: "" })
    }
    update({ ...patch, symptoms: [], respRate: undefined, pregnant: null })
    next()
  }

  const toggleSymptom = (code: string) =>
    update({
      symptoms: selected.has(code) ? a.symptoms.filter((c) => c !== code) : [...a.symptoms, code],
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
    navigate(`/app/triage/${resultId}`, { replace: true })
  }

  const canContinue =
    step === "about" ? ageKnown && a.sex !== "" && ageMonths <= 1440 : step === "pregnancy" ? a.pregnant !== null : true

  const q = search.trim().toLowerCase()
  const grouped = GROUP_ORDER.map((g) => ({
    group: g,
    items: catalogue.filter((s) => s.group === g && (!q || s.label.toLowerCase().includes(q))),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="flex min-h-[70vh] flex-col">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={back}
          className="flex h-12 items-center gap-1 rounded-[10px] pr-3 text-[16px] font-semibold text-brand-700"
        >
          <ChevronLeft className="size-6" aria-hidden /> Back
        </button>
        <div
          className="h-2 flex-1 overflow-hidden rounded-full bg-mint"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={stepIndex + 1}
          aria-label={`Step ${stepIndex + 1} of ${steps.length}`}
        >
          <div
            className="h-full rounded-full bg-brand-700 transition-all"
            style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
          />
        </div>
        <span className="text-sm text-ink-600 tabular-nums">
          {stepIndex + 1}/{steps.length}
        </span>
      </div>

      <SlideStep stepKey={step} direction={dirRef.current} className="mt-6 flex-1">
        {step === "who" && (
          <section>
            <h1 className="text-[26px] font-extrabold">Who is this for?</h1>
            <p className="mt-1 text-ink-600">We'll ask about the person who feels unwell.</p>
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
                  selected={a.subject === "member" && a.memberId === m.member_id}
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
              <p className="mt-4 text-sm text-ink-600">
                Sign in to pick a saved household member.
              </p>
            )}
          </section>
        )}

        {step === "about" && (
          <section>
            <h1 className="text-[26px] font-extrabold">
              {a.subject === "me" ? "About you" : `About ${a.subject === "member" ? memberName : "them"}`}
            </h1>
            <p className="mt-1 text-ink-600">Age changes which danger signs we check.</p>
            <div className="mt-6 grid grid-cols-2 gap-4">
              <Field label="Years">
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={120}
                    value={a.years}
                    onChange={(e) => update({ years: e.target.value })}
                  />
                )}
              </Field>
              <Field label="Months" hint="For babies and young children">
                {(id) => (
                  <Input
                    id={id}
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
              <Field label="Sex">
                {(id) => (
                  <Select
                    id={id}
                    value={a.sex}
                    onChange={(e) => update({ sex: e.target.value as Sex, pregnant: null })}
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
              <Notice tone="info" className="mt-5 flex items-center gap-2">
                <Baby className="size-5 shrink-0" aria-hidden />
                Child under 5: we'll check the danger signs for young children.
              </Notice>
            )}
          </section>
        )}

        {step === "pregnancy" && (
          <section>
            <h1 className="text-[26px] font-extrabold">Is she pregnant?</h1>
            <p className="mt-1 text-ink-600">Pregnancy has its own danger signs.</p>
            <div className="mt-6 flex flex-col gap-3">
              <ChoiceCard title="Yes" selected={a.pregnant === true} onClick={() => update({ pregnant: true })} />
              <ChoiceCard title="No" selected={a.pregnant === false} onClick={() => update({ pregnant: false })} />
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
          </section>
        )}

        {step === "symptoms" && (
          <section>
            <h1 className="text-[26px] font-extrabold">What signs do you see?</h1>
            <p className="mt-1 text-ink-600">Choose all that apply. If none fit, continue.</p>
            <div className="relative mt-5">
              <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-400" aria-hidden />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search signs"
                aria-label="Search signs"
                className="h-12 w-full rounded-[12px] border border-line bg-cream pr-4 pl-12 text-[16px] focus:border-brand-500 focus:bg-white focus:outline-none"
              />
            </div>

            {dangerSelected && (
              <div className="mt-4 flex flex-col gap-3 rounded-[14px] bg-urgent-red p-4 text-white sm:flex-row sm:items-center">
                <Siren className="size-6 shrink-0" aria-hidden />
                <p className="flex-1 text-[15px] font-semibold">
                  You chose a danger sign. Get guidance now.
                </p>
                <Button variant="light" size="sm" onClick={() => setStepIndex(steps.length - 1)}>
                  Get guidance
                </Button>
              </div>
            )}

            <div className="mt-5 flex flex-col gap-6">
              {grouped.map(({ group, items }) => (
                <fieldset key={group}>
                  <legend className="mb-2 text-sm font-bold tracking-wide text-ink-600 uppercase">
                    {GROUP_LABELS[group]}
                  </legend>
                  <ul className="flex flex-col gap-2">
                    {items.map((s) => {
                      const on = selected.has(s.code)
                      return (
                        <li key={s.code}>
                          <button
                            type="button"
                            aria-pressed={on}
                            onClick={() => toggleSymptom(s.code)}
                            className={cn(
                              "flex min-h-14 w-full items-center gap-3 rounded-[12px] border-[1.5px] px-4 py-2.5 text-left",
                              on ? "border-brand-700 bg-mint" : "border-line bg-white hover:bg-cream",
                            )}
                          >
                            <span
                              className={cn(
                                "flex size-6 shrink-0 items-center justify-center rounded-md border-2",
                                on ? "border-brand-700 bg-brand-700 text-white" : "border-ink-400",
                              )}
                            >
                              {on && <Check className="size-4" aria-hidden />}
                            </span>
                            <span className="flex-1">
                              <span className="block text-[15px] font-medium">{s.label}</span>
                              {s.hint && <span className="block text-xs text-ink-600">{s.hint}</span>}
                            </span>
                            {s.urgency === "RED" && (
                              <span className="rounded-full bg-urgent-red-50 px-2 py-0.5 text-[10px] font-bold text-urgent-red uppercase">
                                Danger sign
                              </span>
                            )}
                          </button>
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
            <h1 className="text-[26px] font-extrabold">Count the breathing</h1>
            <p className="mt-1 text-ink-600">
              Fast breathing can be a sign of pneumonia in young children.{" "}
              {selected.has("fast_breathing") ? "Please count if you can." : "This step is optional."}
            </p>
            <div className="mt-6">
              <BreathCounter value={a.respRate} onChange={(respRate) => update({ respRate })} />
            </div>
          </section>
        )}

        {step === "review" && (
          <section>
            <h1 className="text-[26px] font-extrabold">Check your answers</h1>
            <dl className="mt-6 divide-y divide-line rounded-[16px] border border-line">
              {[
                ["For", subjectLabel],
                ["Age", describeAge(ageMonths)],
                ...(askPregnancy ? [["Pregnant", isPregnant ? "Yes" : "No"]] : []),
                [
                  "Signs",
                  a.symptoms.length
                    ? catalogue.filter((s) => selected.has(s.code)).map((s) => s.label).join(", ")
                    : "None chosen",
                ],
                ...(isChild && a.respRate ? [["Breathing", `${a.respRate} per minute`]] : []),
              ].map(([k, v]) => (
                <div key={k} className="flex gap-4 px-4 py-3">
                  <dt className="w-24 shrink-0 text-sm text-ink-600">{k}</dt>
                  <dd className="text-[15px] font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <label className="mt-5 flex items-start gap-3 rounded-[12px] bg-cream p-4 text-sm">
              <input
                type="checkbox"
                checked={a.consent}
                onChange={(e) => update({ consent: e.target.checked })}
                className="mt-0.5 size-5 accent-brand-700"
              />
              <span>
                Save this result on this phone and, when signed in, to my CareBridge record so a
                doctor can see it.
              </span>
            </label>
            <AdvisoryNote className="mt-4" />
          </section>
        )}
      </SlideStep>

      {step !== "who" && (
        <div className="sticky bottom-20 mt-8 bg-white/95 py-3 lg:bottom-0">
          {step === "review" ? (
            <Button full size="lg" onClick={finish} disabled={!a.consent} loading={saving} trailing="arrow">
              Get guidance
            </Button>
          ) : (
            <Button full size="lg" onClick={next} disabled={!canContinue} trailing="arrow">
              {step === "vitals" && a.respRate === undefined ? "Skip" : "Continue"}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
