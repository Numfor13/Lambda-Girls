import { useMutation } from "@tanstack/react-query"
import { motion } from "motion/react"
import { Check, Droplet, Minus, Phone, Plus, Send } from "lucide-react"
import { BLOOD_TYPES, serviceApi, type BloodRequest } from "@/api/services"
import type { Urgency } from "@/api/types"
import { AppPage, Panel } from "@/design/components/AppPage"
import { Button, iconButtonClass } from "@/design/components/Button"
import { FacilityPicker } from "@/design/components/FacilityPicker"
import { Feedback } from "@/design/components/Feedback"
import { FormGuard } from "@/design/components/FormGuard"
import { ConnectionNote, DraftNote, ServiceError, useServiceDraft } from "@/design/components/ServicePage"
import { toast } from "@/design/components/Toast"
import { SPRING, popIn } from "@/design/motion"
import { formatDateTime, telHref } from "@/lib/format"
import { rules } from "@/lib/form"
import { useOnline } from "@/lib/hooks"
import { plural } from "@/lib/labels"
import { cn } from "@/lib/utils"
import { useDraftForm } from "@/lib/useDraftForm"
import { useFacilities } from "@/offline/facilities"

type BloodResponse = Awaited<ReturnType<typeof serviceApi.requestBlood>>

/** Plain answers for the clinician's urgency (QA S1); the API still receives RED/AMBER/GREEN. */
const URGENCY: { value: Urgency; title: string; sub: string; dot: string }[] = [
  { value: "RED", title: "Emergency", sub: "Needed now", dot: "bg-urgent-red" },
  { value: "AMBER", title: "Today", sub: "Within the day", dot: "bg-urgent-amber" },
  { value: "GREEN", title: "Can wait", sub: "Planned, a day or more", dot: "bg-urgent-green" },
]

function Legend({ children, required = true }: { children: React.ReactNode; required?: boolean }) {
  return (
    <legend className="mb-3 text-label-l text-ink-900">
      {children}
      {required && <span className="ml-1.5 text-label-m font-normal text-ink-600">Required</span>}
    </legend>
  )
}

function FieldError({ children }: { children?: string }) {
  return children ? (
    <p role="alert" className="mt-2 text-label-m text-urgent-red">
      {children}
    </p>
  ) : null
}

export default function Blood() {
  const online = useOnline()
  const facilities = useFacilities()
  const previous = useServiceDraft("blood-last-response", { response: null as BloodResponse | null })
  const form = useDraftForm(
    "blood",
    {
      requesting_facility_id: "",
      blood_type: "" as BloodRequest["blood_type"] | "",
      units: 1,
      urgency: "" as Urgency | "",
    },
    {
      requesting_facility_id: [
        rules.required("Choose the facility treating the patient."),
        (v) => (facilities?.some((f) => f.facility_id === v && f.is_active) ? undefined : "Choose a facility from the list."),
      ],
      blood_type: [
        rules.required("Choose the blood type the clinician gave you."),
        (v) => (BLOOD_TYPES.includes(v as never) ? undefined : "Choose one of the eight blood types."),
      ],
      units: [rules.required(), rules.intRange(1, 20)],
      urgency: [rules.required("Choose how urgent the clinician said it is.")],
    },
  )
  const send = useMutation({
    mutationFn: () =>
      serviceApi.requestBlood({
        requesting_facility_id: form.values.requesting_facility_id,
        blood_type: form.values.blood_type as BloodRequest["blood_type"],
        units: Number(form.values.units),
        urgency: form.values.urgency as Urgency,
      }),
    onSuccess: (response) => {
      previous.setValue({ response })
      form.reset()
      toast("Blood request sent")
      window.scrollTo({ top: 0, behavior: "smooth" })
    },
  })
  const result = previous.value.response
  const units = Number(form.values.units) || 1
  const chosen = facilities?.find((f) => f.facility_id === form.values.requesting_facility_id)

  const aside = (
    <>
      {result ? (
        <motion.section variants={popIn} className="rounded-xl bg-brand-900 p-5 text-white lg:p-6" aria-live="polite">
          <p className="flex items-center gap-2 eyebrow text-mint-200">
            <Check className="size-4" aria-hidden /> Request sent
          </p>
          <p className="mt-2 font-display text-[26px] leading-tight font-[460]">
            {plural(result.units, "unit")} of {result.blood_type}
          </p>
          <p className="mt-1 text-body-m text-white/70">
            {formatDateTime(result.created_at)}. Availability isn&apos;t confirmed yet: call a blood bank below.
          </p>
          <p className="mt-4 text-label-m text-white/60">Reference</p>
          <p className="text-code break-all text-white">{result.request_id}</p>
        </motion.section>
      ) : (
        <Panel tone="mint">
          <p className="text-title-m text-brand-900">Use what the clinician told you</p>
          <ol className="mt-3 flex flex-col gap-2 text-body-m text-brand-900/85">
            <li>1 · The treating facility, the blood type and how many units.</li>
            <li>2 · Send the request. Operators see it straight away.</li>
            <li>3 · Call the blood banks we return to check what they have.</li>
          </ol>
        </Panel>
      )}
      {result && (
        <Panel title="Call a blood bank">
          {!result.blood_bank_facilities.length ? (
            <Feedback>No blood bank was returned. Ask the treating facility.</Feedback>
          ) : (
            <ul className="flex flex-col gap-2">
              {result.blood_bank_facilities.map((f) => (
                <li key={f.facility_id} className="flex items-center gap-3 rounded-lg bg-cream p-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-white text-brand-700">
                    <Droplet aria-hidden className="size-5" />
                  </span>
                  <p className="min-w-0 flex-1 text-label-l">{f.name}</p>
                  {f.phone && (
                    <a href={telHref(f.phone)} className={iconButtonClass("tonal")} aria-label={`Call ${f.name}`}>
                      <Phone className="size-[18px]" aria-hidden />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
    </>
  )

  return (
    <AppPage
      eyebrow="Care services"
      title="Blood request"
      subtitle="For a patient a clinician says needs blood. Fill in what they told you."
      aside={aside}
      asideFirst={Boolean(result)}
    >
      <Panel>
        <form
          noValidate
          className="flex flex-col gap-7"
          onSubmit={(e) => {
            e.preventDefault()
            if (!form.check()) {
              const first = form.errors.requesting_facility_id ? "#blood-facility [role=radio]" : form.errors.blood_type ? "#blood-type button" : "#blood-urgency button"
              document.querySelector<HTMLElement>(first)?.focus()
              return
            }
            if (online && !send.isPending) send.mutate()
          }}
        >
          <FacilityPicker
            id="blood-facility"
            label="Facility treating the patient"
            prefer={["blood_bank", "emergency"]}
            value={form.values.requesting_facility_id}
            onChange={(v) => form.set("requesting_facility_id", v)}
            error={form.error("requesting_facility_id")}
          />

          <fieldset>
            <Legend>Blood type</Legend>
            <div id="blood-type" className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Blood type">
              {BLOOD_TYPES.map((t) => {
                const on = form.values.blood_type === t
                return (
                  <motion.button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => form.set("blood_type", t)}
                    whileTap={{ scale: 0.95 }}
                    transition={SPRING.fast}
                    className={cn(
                      "flex h-16 flex-col items-center justify-center gap-0.5 rounded-lg transition-colors",
                      on ? "bg-brand-900 text-white" : "bg-white text-ink-900 shadow-[inset_0_0_0_1px_var(--color-line)] hover:shadow-[inset_0_0_0_1px_var(--color-brand-500)]",
                    )}
                  >
                    <Droplet className={cn("size-4", on ? "fill-mint-200 text-mint-200" : "text-brand-600")} aria-hidden />
                    <span className="font-display text-[22px] leading-none font-[480]">{t}</span>
                  </motion.button>
                )
              })}
            </div>
            <FieldError>{form.error("blood_type")}</FieldError>
          </fieldset>

          <fieldset>
            <Legend>Units</Legend>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => form.set("units", Math.max(1, units - 1))}
                disabled={units <= 1}
                className={iconButtonClass("tonal", "size-12 disabled:opacity-40")}
                aria-label="One unit fewer"
              >
                <Minus className="size-5" aria-hidden />
              </button>
              <motion.span
                key={units}
                initial={{ y: -6, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={SPRING.fast}
                className="w-12 text-center font-display text-[36px] leading-none font-[460] tabular"
                aria-live="polite"
              >
                {units}
              </motion.span>
              <button
                type="button"
                onClick={() => form.set("units", Math.min(20, units + 1))}
                disabled={units >= 20}
                className={iconButtonClass("tonal", "size-12 disabled:opacity-40")}
                aria-label="One unit more"
              >
                <Plus className="size-5" aria-hidden />
              </button>
              <span className="text-body-m text-ink-600">{units === 1 ? "unit" : "units"} · up to 20</span>
            </div>
          </fieldset>

          <fieldset>
            <Legend>How urgent did the clinician say it is?</Legend>
            <div id="blood-urgency" className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Urgency">
              {URGENCY.map((u) => {
                const on = form.values.urgency === u.value
                return (
                  <button
                    key={u.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => form.set("urgency", u.value)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-4 py-3 text-left transition-[background-color,box-shadow]",
                      on ? "bg-mint shadow-[inset_0_0_0_2px_var(--color-brand-700)]" : "bg-white shadow-[inset_0_0_0_1px_var(--color-line)] hover:shadow-[inset_0_0_0_1px_var(--color-brand-500)]",
                    )}
                  >
                    <span className={cn("size-3 shrink-0 rounded-full", u.dot)} aria-hidden />
                    <span>
                      <span className="block text-label-l">{u.title}</span>
                      <span className="block text-body-m text-ink-600">{u.sub}</span>
                    </span>
                  </button>
                )
              })}
            </div>
            <FieldError>{form.error("urgency")}</FieldError>
          </fieldset>

          <div className="flex flex-col gap-3 rounded-xl bg-cream p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-body-m text-ink-600" aria-live="polite">
              {form.values.blood_type ? (
                <>
                  <span className="font-semibold text-ink-900">
                    {plural(units, "unit")} of {form.values.blood_type}
                  </span>
                  {chosen ? ` for ${chosen.name}` : ""}
                </>
              ) : (
                "Choose the facility, blood type and urgency."
              )}
            </p>
            <Button type="submit" icon={Send} disabled={!online} loading={send.isPending} className="shrink-0">
              Send request
            </Button>
          </div>
          <ConnectionNote />
          <DraftNote saved={form.saved} />
          <ServiceError error={send.error} />
          <FormGuard when={form.dirty && !form.saved && !send.isPending} />
        </form>
      </Panel>
    </AppPage>
  )
}
