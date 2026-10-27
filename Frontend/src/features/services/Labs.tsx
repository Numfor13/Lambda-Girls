import { useState } from "react"
import { Link, useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, motion } from "motion/react"
import { ArrowLeft, Check, ChevronRight, Copy, FlaskConical, Phone, Send } from "lucide-react"
import { LAB_STEPS, serviceApi, type LabRequest } from "@/api/services"
import { useAuth } from "@/auth/AuthProvider"
import { AppPage, Panel } from "@/design/components/AppPage"
import { Button, ButtonA, ButtonLink } from "@/design/components/Button"
import { Field, Input, Textarea } from "@/design/components/Field"
import { FacilityPicker } from "@/design/components/FacilityPicker"
import { FormGuard } from "@/design/components/FormGuard"
import { PulseDot, Skeleton, StepTrack } from "@/design/components/Lively"
import { ConnectionNote, DraftNote, ServiceError } from "@/design/components/ServicePage"
import { EmptyState } from "@/design/components/primitives"
import { toast } from "@/design/components/Toast"
import { SPRING, popIn, staggerOnMount } from "@/design/motion"
import { formatDateTime, telHref, timeAgo } from "@/lib/format"
import { rules } from "@/lib/form"
import { useNow, useOnline, useVisible } from "@/lib/hooks"
import { LAB_STATUS_LABEL, humanize, plural } from "@/lib/labels"
import { cn } from "@/lib/utils"
import { useDraftForm } from "@/lib/useDraftForm"
import { useFacilities } from "@/offline/facilities"

/** Quick fills for the free-text test name; people can still type anything. */
const COMMON_TESTS = ["Malaria test", "Full blood count", "Typhoid test", "Urine test", "Blood sugar", "Pregnancy test"]

const NEXT: Record<LabRequest["status"], string> = {
  requested: "The laboratory arranges collection. Call them if you need to agree a time.",
  sample_collected: "Your sample is at the laboratory. The result summary appears here when it's ready.",
  results_ready: "Your result summary is below. Ask a clinician to explain what it means for you.",
  delivered: "This request is complete. Keep the reference for any follow-up.",
}

/** Vertical stepper for one request (sample-timeline pattern from lab dashboards). */
export function LabTimeline({ lab }: { lab: LabRequest }) {
  const at = LAB_STEPS.indexOf(lab.status)
  return (
    <ol className="flex flex-col" aria-label="Lab request progress">
      {LAB_STEPS.map((s, i) => {
        const done = i < at || lab.status === "delivered"
        const current = i === at && lab.status !== "delivered"
        return (
          <li key={s} className="relative flex gap-3 pb-5 last:pb-0" aria-current={current ? "step" : undefined}>
            {i < LAB_STEPS.length - 1 && (
              <span className="absolute top-8 bottom-1 left-[15px] w-0.5 overflow-hidden rounded-full bg-ink-900/8" aria-hidden>
                <motion.span
                  className="block w-full bg-brand-600"
                  initial={{ height: 0 }}
                  animate={{ height: done ? "100%" : 0 }}
                  transition={{ ...SPRING.slow, delay: 0.15 + i * 0.15 }}
                />
              </span>
            )}
            <motion.span
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ ...SPRING.default, delay: 0.1 + i * 0.12 }}
              className={cn(
                "relative flex size-8 shrink-0 items-center justify-center rounded-full text-label-m",
                done && "bg-brand-700 text-white",
                current && "bg-white text-brand-700 ring-2 ring-brand-700",
                !done && !current && "bg-cream text-ink-600 ring-1 ring-ink-900/10",
              )}
            >
              {done ? <Check className="size-4" aria-hidden /> : i + 1}
            </motion.span>
            <span className="min-w-0 pt-1">
              <span className={cn("flex items-center gap-2 text-label-l", !done && !current && "text-ink-600")}>
                {LAB_STATUS_LABEL[s]}
                {current && <PulseDot tone="brand" />}
              </span>
              {current && <span className="mt-0.5 block text-body-m text-ink-600">{NEXT[lab.status]}</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function RequestLab() {
  const online = useOnline()
  const qc = useQueryClient()
  const facilities = useFacilities()
  const form = useDraftForm(
    "lab",
    { test_type: "", facility_id: "", collection_address: "" },
    {
      test_type: [rules.required("Enter the test you need."), rules.minLength(2), rules.maxLength(200)],
      facility_id: [
        rules.required("Choose a laboratory."),
        (v) =>
          facilities?.some((f) => f.facility_id === v && f.is_active && f.capabilities.includes("laboratory"))
            ? undefined
            : "Choose a facility with a laboratory.",
      ],
      collection_address: [rules.maxLength(500)],
    },
  )
  const create = useMutation({
    mutationFn: () =>
      serviceApi.requestLab({
        test_type: form.values.test_type.trim(),
        facility_id: form.values.facility_id,
        collection_address: form.values.collection_address.trim(),
      }),
    onSuccess: async () => {
      form.reset()
      await qc.invalidateQueries({ queryKey: ["labs"] })
      toast("Lab test requested")
    },
  })
  return (
    <Panel>
      <form
        noValidate
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault()
          if (!form.check()) {
            if (!form.errors.test_type && form.errors.facility_id) document.querySelector<HTMLElement>("#lab-facility [role=radio]")?.focus()
            return
          }
          if (online && !create.isPending) create.mutate()
        }}
      >
        <div>
          <h2 className="text-headline-s">Request a test</h2>
          <p className="mt-1 text-body-m text-ink-600">Ask a laboratory for a test. Follow every step here until the result is ready.</p>
        </div>
        <div className="flex flex-col gap-3">
          <Field label="Which test" required error={form.error("test_type")} count={form.values.test_type.length} max={200}>
            {(id) => <Input id={id} maxLength={200} placeholder="For example: malaria test" {...form.bind("test_type")} />}
          </Field>
          <div className="flex flex-wrap gap-2" aria-label="Common tests">
            {COMMON_TESTS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => form.set("test_type", t)}
                aria-pressed={form.values.test_type === t}
                className={cn(
                  "inline-flex h-10 items-center rounded-full px-3.5 text-label-l transition-colors",
                  form.values.test_type === t ? "bg-brand-900 text-white" : "bg-cream text-ink-900 hover:bg-mint",
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <FacilityPicker
          id="lab-facility"
          label="Which laboratory"
          prefer={["laboratory"]}
          only
          value={form.values.facility_id}
          onChange={(v) => form.set("facility_id", v)}
          error={form.error("facility_id")}
        />
        <Field
          label="Where to collect the sample"
          hint="Optional. Leave empty to go to the laboratory yourself."
          error={form.error("collection_address")}
          count={form.values.collection_address.length}
          max={500}
        >
          {(id) => <Textarea id={id} rows={2} maxLength={500} placeholder="Quarter, street, a landmark" {...form.bind("collection_address")} />}
        </Field>
        <Button type="submit" icon={Send} disabled={!online} loading={create.isPending} className="self-start">
          Request test
        </Button>
        <ConnectionNote />
        <DraftNote saved={form.saved} />
        <ServiceError error={create.error} />
        <FormGuard when={form.dirty && !form.saved && !create.isPending} />
      </form>
    </Panel>
  )
}

function LabCard({ l, now }: { l: LabRequest; now: number }) {
  const facilities = useFacilities()
  const facility = facilities?.find((f) => f.facility_id === l.facility_id)
  const at = LAB_STEPS.indexOf(l.status)
  return (
    <motion.li variants={popIn} layout>
      <Link
        to={`/app/labs/${l.request_id}`}
        className="group flex flex-col gap-3 rounded-xl bg-white p-4 shadow-[var(--shadow-elev-1)] transition-shadow hover:shadow-[var(--shadow-elev-2)]"
      >
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-lg",
              l.status === "results_ready" ? "bg-brand-700 text-white" : "bg-mint text-brand-700",
            )}
          >
            <FlaskConical className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-label-m text-ink-600">
              <PulseDot live={l.status !== "delivered"} tone={l.status === "delivered" ? "muted" : "brand"} />
              {LAB_STATUS_LABEL[l.status]} · {timeAgo(l.updated_at, now)}
            </span>
            <span className="mt-0.5 block truncate text-title-m">{humanize(l.test_type)}</span>
            <span className="block truncate text-body-m text-ink-600">{facility?.name ?? "Laboratory"}</span>
          </span>
          <ChevronRight className="mt-1 size-5 shrink-0 text-ink-400 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </div>
        <StepTrack steps={["Requested", "Sample", "Results", "Done"]} at={l.status === "delivered" ? 4 : at} label="Lab request progress" />
      </Link>
    </motion.li>
  )
}

export default function Labs() {
  const { session } = useAuth()
  const online = useOnline()
  const visible = useVisible()
  const now = useNow()
  const list = useQuery({
    queryKey: ["labs", session?.sub],
    queryFn: () => serviceApi.labs(),
    refetchInterval: online && visible ? 20_000 : false,
  })
  const all = [...(list.data?.lab_requests ?? [])].sort((a, b) => b.updated_at - a.updated_at)
  const ready = all.filter((l) => l.status === "results_ready").length

  const requests = (
    <section aria-labelledby="labs-title" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="labs-title" className="text-title-l">
          Your tests
        </h2>
        {list.dataUpdatedAt > 0 && <span className="text-label-m text-ink-600">Updated {timeAgo(list.dataUpdatedAt, now)}</span>}
      </div>
      {ready > 0 && (
        <p className="rounded-lg bg-mint px-4 py-3 text-body-m text-brand-900">
          <span className="font-semibold">{plural(ready, "result")} ready.</span> Open the test to read the summary.
        </p>
      )}
      <ServiceError error={list.error} />
      {list.isPending ? (
        <div className="flex flex-col gap-3 rounded-xl bg-white p-4 shadow-[var(--shadow-elev-1)]" role="status" aria-label="Loading tests">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-1.5 w-full" />
        </div>
      ) : all.length ? (
        <motion.ul className="flex flex-col gap-3" variants={staggerOnMount(0.05)}>
          <AnimatePresence initial={false}>
            {all.map((l) => (
              <LabCard key={l.request_id} l={l} now={now} />
            ))}
          </AnimatePresence>
        </motion.ul>
      ) : (
        <EmptyState icon={FlaskConical} title="No lab tests yet. Request one with the form." />
      )}
    </section>
  )

  return (
    <AppPage
      eyebrow="Care services"
      title="Lab tests"
      subtitle="Request a test and follow it from sample to result."
      aside={requests}
      asideFirst={all.length > 0}
    >
      <RequestLab />
    </AppPage>
  )
}

function CopyLine({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-lg bg-cream py-1 pr-1 pl-3">
      <span className="min-w-0 truncate text-code text-ink-900">{value}</span>
      <button
        type="button"
        onClick={() =>
          void navigator.clipboard?.writeText(value).then(
            () => {
              setCopied(true)
              window.setTimeout(() => setCopied(false), 2000)
            },
            () => undefined,
          )
        }
        className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md px-3 text-label-l text-brand-700 hover:bg-white"
      >
        {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
      </button>
    </span>
  )
}

export function LabDetail() {
  const { id = "" } = useParams()
  const { session } = useAuth()
  const visible = useVisible()
  const online = useOnline()
  const now = useNow()
  const facilities = useFacilities()
  const query = useQuery({
    queryKey: ["lab", session?.sub, id],
    queryFn: () => serviceApi.lab(id),
    refetchInterval: online && visible ? 20_000 : false,
  })
  const lab = query.data
  const facility = facilities?.find((f) => f.facility_id === lab?.facility_id)

  return (
    <AppPage
      eyebrow="Lab test"
      title={lab ? humanize(lab.test_type) : "Lab test"}
      subtitle={lab ? `${LAB_STATUS_LABEL[lab.status]} · updated ${timeAgo(lab.updated_at, now)}` : undefined}
      back={
        <ButtonLink to="/app/labs" variant="ghost" size="sm" icon={ArrowLeft}>
          Lab tests
        </ButtonLink>
      }
      aside={
        facility ? (
          <Panel title="Laboratory">
            <p className="text-title-m">{facility.name}</p>
            <p className="mt-1 text-body-m text-ink-600">{facility.address}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {facility.phone && (
                <ButtonA href={telHref(facility.phone)} variant="tonal" size="sm" icon={Phone}>
                  Call
                </ButtonA>
              )}
              <ButtonLink to={`/app/facilities/${facility.facility_id}`} variant="ghost" size="sm">
                Details
              </ButtonLink>
            </div>
          </Panel>
        ) : undefined
      }
    >
      <ServiceError error={query.error} />
      {query.isError && (
        <Button variant="tonal" size="sm" onClick={() => void query.refetch()} className="self-start">
          Try again
        </Button>
      )}
      {query.isPending ? (
        <div className="flex flex-col gap-4 rounded-xl bg-white p-6 shadow-[var(--shadow-elev-1)]" role="status" aria-label="Loading test">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-8 rounded-full" />
              <Skeleton className="h-4 w-40" />
            </div>
          ))}
        </div>
      ) : (
        lab && (
          <>
            {lab.result_summary && (
              <motion.section variants={popIn} className="rounded-xl bg-brand-900 p-6 text-white">
                <p className="eyebrow text-mint-200">Result summary</p>
                <p className="mt-3 text-body-l whitespace-pre-wrap">{lab.result_summary}</p>
                <p className="mt-4 text-body-m text-white/70">Ask a clinician to explain what this means for you.</p>
                <ButtonLink to="/app/consult/new" variant="light" size="sm" className="mt-4">
                  Ask a doctor about it
                </ButtonLink>
              </motion.section>
            )}
            <Panel title="Progress">
              <LabTimeline lab={lab} />
            </Panel>
            <Panel title="Details">
              <dl className="flex flex-col gap-3 text-body-m">
                <div className="flex flex-col gap-1">
                  <dt className="text-ink-600">Reference</dt>
                  <dd>
                    <CopyLine value={lab.request_id} />
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-600">Requested</dt>
                  <dd>{formatDateTime(lab.created_at)}</dd>
                </div>
                {lab.collection_address && (
                  <div className="flex justify-between gap-4">
                    <dt className="shrink-0 text-ink-600">Collect from</dt>
                    <dd className="text-right">{lab.collection_address}</dd>
                  </div>
                )}
              </dl>
            </Panel>
          </>
        )
      )}
    </AppPage>
  )
}
