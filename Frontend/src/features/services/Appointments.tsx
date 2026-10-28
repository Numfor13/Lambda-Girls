import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, motion } from "motion/react"
import { CalendarDays, Phone, Send, X } from "lucide-react"
import { serviceApi, type Appointment } from "@/api/services"
import { useAuth } from "@/auth/AuthProvider"
import { AppPage, Panel } from "@/design/components/AppPage"
import { Button, iconButtonClass } from "@/design/components/Button"
import { Field, Input, Textarea } from "@/design/components/Field"
import { ConfirmAction } from "@/design/components/Feedback"
import { FacilityPicker } from "@/design/components/FacilityPicker"
import { FormGuard } from "@/design/components/FormGuard"
import { Skeleton, StepTrack } from "@/design/components/Lively"
import { ConnectionNote, DraftNote, ServiceError } from "@/design/components/ServicePage"
import { EmptyState } from "@/design/components/primitives"
import { toast } from "@/design/components/Toast"
import { SPRING, popIn, staggerOnMount } from "@/design/motion"
import { formatDate, telHref, timeAgo } from "@/lib/format"
import { rules, todayIso } from "@/lib/form"
import { useNow, useOnline, useVisible } from "@/lib/hooks"
import { APPOINTMENT_STATUS_LABEL, SLOT_LABEL, plural } from "@/lib/labels"
import { cn } from "@/lib/utils"
import { useDraftForm } from "@/lib/useDraftForm"
import { useFacilities } from "@/offline/facilities"

const SLOTS = ["morning", "afternoon", "evening"] as const

/** The next 14 days as tappable day chips (Zocdoc / Cal.com date strip). */
function useDays() {
  return useMemo(() => {
    const out: { iso: string; dow: string; day: number; month: string }[] = []
    const d = new Date()
    for (let i = 0; i < 14; i++) {
      const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i)
      out.push({
        iso: todayIso(x),
        dow: i === 0 ? "Today" : i === 1 ? "Tmrw" : x.toLocaleDateString("en-GB", { weekday: "short" }),
        day: x.getDate(),
        month: x.toLocaleDateString("en-GB", { month: "short" }),
      })
    }
    return out
  }, [])
}

function DateTile({ iso, muted = false }: { iso: string; muted?: boolean }) {
  const d = new Date(`${iso}T00:00:00`)
  return (
    <span
      className={cn(
        "flex size-14 shrink-0 flex-col items-center justify-center rounded-lg",
        muted ? "bg-cream text-ink-600" : "bg-brand-900 text-white",
      )}
    >
      <span className={cn("text-[11px] leading-none font-semibold tracking-[0.08em] uppercase", muted ? "text-ink-600" : "text-mint-200")}>
        {d.toLocaleDateString("en-GB", { month: "short" })}
      </span>
      <span className="mt-1 font-display text-[24px] leading-none font-[460] tabular">{d.getDate()}</span>
    </span>
  )
}

function RequestVisit() {
  const online = useOnline()
  const qc = useQueryClient()
  const facilities = useFacilities()
  const days = useDays()
  const [otherDate, setOtherDate] = useState(false)
  const form = useDraftForm(
    "appointment",
    { facility_id: "", slot_date: "", slot_label: "morning" as Appointment["slot_label"], note: "" },
    {
      facility_id: [
        rules.required("Choose where you'd like to go."),
        (v) => (facilities?.some((f) => f.is_active && f.facility_id === v) ? undefined : "Choose a facility from the list."),
      ],
      slot_date: [rules.required("Choose a day."), rules.notPast()],
      slot_label: [rules.required("Choose a time of day.")],
      note: [rules.maxLength(300)],
    },
  )
  const create = useMutation({
    mutationFn: () => serviceApi.requestAppointment({ ...form.values, note: form.values.note.trim() }),
    onSuccess: async () => {
      form.reset()
      setOtherDate(false)
      await qc.invalidateQueries({ queryKey: ["appointments"] })
      toast("Visit requested. The facility will confirm it.")
    },
  })
  const chosen = facilities?.find((f) => f.facility_id === form.values.facility_id)
  const inStrip = days.some((d) => d.iso === form.values.slot_date)

  return (
    <Panel>
      <form
        id="appointment-request"
        noValidate
        className="flex flex-col gap-7"
        onSubmit={(e) => {
          e.preventDefault()
          if (!form.check()) {
            if (form.errors.facility_id) document.querySelector<HTMLElement>("#visit-facility [role=radio]")?.focus()
            else if (form.errors.slot_date) document.querySelector<HTMLElement>("#visit-days button")?.focus()
            return
          }
          if (online && !create.isPending) create.mutate()
        }}
      >
        <div>
          <h2 className="text-headline-s">Request a visit</h2>
          <p className="mt-1 text-body-m text-ink-600">The facility confirms the day. This is a request, not a booked time.</p>
        </div>

        <FacilityPicker
          id="visit-facility"
          label="Where"
          value={form.values.facility_id}
          onChange={(v) => form.set("facility_id", v)}
          error={form.error("facility_id")}
        />

        <fieldset className="min-w-0">
          <legend className="mb-3 text-label-l text-ink-900">
            Which day
            <span className="ml-1.5 text-label-m font-normal text-ink-600">Required</span>
          </legend>
          <div id="visit-days" className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label="Day">
            {days.map((d) => {
              const on = form.values.slot_date === d.iso
              return (
                <motion.button
                  key={d.iso}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={`${d.dow === "Today" || d.dow === "Tmrw" ? (d.dow === "Tmrw" ? "Tomorrow" : "Today") : d.dow}, ${d.day} ${d.month}`}
                  onClick={() => {
                    form.set("slot_date", d.iso)
                    setOtherDate(false)
                  }}
                  whileTap={{ scale: 0.95 }}
                  transition={SPRING.fast}
                  className={cn(
                    "flex h-[72px] w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg transition-colors",
                    on ? "bg-brand-900 text-white" : "bg-white text-ink-900 shadow-[inset_0_0_0_1px_var(--color-line)] hover:shadow-[inset_0_0_0_1px_var(--color-brand-500)]",
                  )}
                >
                  <span className={cn("text-label-m", on ? "text-mint-200" : "text-ink-600")}>{d.dow}</span>
                  <span className="font-display text-[22px] leading-none font-[460] tabular">{d.day}</span>
                  <span className={cn("text-[11px] leading-none", on ? "text-white/70" : "text-ink-600")}>{d.month}</span>
                </motion.button>
              )
            })}
          </div>
          {otherDate || (form.values.slot_date && !inStrip) ? (
            <div className="mt-3 max-w-xs">
              <Field label="Another day" error={form.error("slot_date")}>
                {(id) => <Input id={id} type="date" min={todayIso()} {...form.bind("slot_date")} />}
              </Field>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setOtherDate(true)}
                className="mt-2 inline-flex h-10 items-center rounded-full px-3 text-label-l text-brand-700 hover:bg-mint"
              >
                Later than two weeks?
              </button>
              {form.error("slot_date") && (
                <p role="alert" className="text-label-m text-urgent-red">
                  {form.error("slot_date")}
                </p>
              )}
            </>
          )}
        </fieldset>

        <fieldset>
          <legend className="mb-3 text-label-l text-ink-900">Time of day</legend>
          {/* Segmented control: one row, one choice (QA S2). */}
          <div className="relative grid grid-cols-3 rounded-full bg-cream p-1" role="radiogroup" aria-label="Time of day">
            {SLOTS.map((slot) => {
              const on = form.values.slot_label === slot
              return (
                <button
                  key={slot}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => form.set("slot_label", slot)}
                  className={cn("relative h-11 rounded-full text-label-l transition-colors", on ? "text-white" : "text-ink-600 hover:text-ink-900")}
                >
                  {on && (
                    <motion.span layoutId="slot-pill" className="absolute inset-0 rounded-full bg-brand-900" transition={SPRING.default} />
                  )}
                  <span className="relative">{SLOT_LABEL[slot]}</span>
                </button>
              )
            })}
          </div>
        </fieldset>

        <Field label="Anything the facility should know" hint="Optional" error={form.error("note")} count={form.values.note.length} max={300}>
          {(id) => <Textarea id={id} maxLength={300} rows={2} placeholder="For example: follow-up for fever" {...form.bind("note")} />}
        </Field>

        <div className="flex flex-col gap-3 rounded-xl bg-cream p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-body-m text-ink-600" aria-live="polite">
            {chosen && form.values.slot_date ? (
              <>
                <span className="font-semibold text-ink-900">{chosen.name}</span> · {formatDate(form.values.slot_date)} ·{" "}
                {SLOT_LABEL[form.values.slot_label]}
              </>
            ) : (
              "Choose a place and a day."
            )}
          </p>
          <Button type="submit" icon={Send} disabled={!online} loading={create.isPending} className="shrink-0">
            Request visit
          </Button>
        </div>
        <ConnectionNote />
        <DraftNote saved={form.saved} />
        <ServiceError error={create.error} />
        <FormGuard when={form.dirty && !form.saved && !create.isPending} />
      </form>
    </Panel>
  )
}

function VisitCard({ a, now }: { a: Appointment; now: number }) {
  const qc = useQueryClient()
  const online = useOnline()
  const facilities = useFacilities()
  const [confirm, setConfirm] = useState(false)
  const facility = facilities?.find((f) => f.facility_id === a.facility_id)
  const past = a.slot_date < todayIso() || a.status === "cancelled"
  const cancel = useMutation({
    mutationFn: () => serviceApi.cancelAppointment(a.appointment_id),
    onSuccess: async () => {
      setConfirm(false)
      await qc.invalidateQueries({ queryKey: ["appointments"] })
      toast("Visit cancelled", { tone: "info" })
    },
  })
  return (
    <motion.li variants={popIn} layout transition={SPRING.default} className="flex flex-col gap-4 rounded-xl bg-white p-4 shadow-[var(--shadow-elev-1)]">
      <div className="flex items-start gap-3">
        <DateTile iso={a.slot_date} muted={past} />
        <div className="min-w-0 flex-1">
          <p className="text-label-m text-ink-600">{APPOINTMENT_STATUS_LABEL[a.status]}</p>
          <p className="mt-0.5 line-clamp-2 text-title-m">{facility?.name ?? "Facility"}</p>
          <p className="text-body-m text-ink-600">{SLOT_LABEL[a.slot_label]} · requested {timeAgo(a.created_at, now)}</p>
        </div>
        {facility?.phone && (
          <a href={telHref(facility.phone)} className={iconButtonClass("tonal", "shrink-0")} aria-label={`Call ${facility.name}`}>
            <Phone className="size-[18px]" aria-hidden />
          </a>
        )}
      </div>
      {a.status !== "cancelled" && (
        <StepTrack steps={["Requested", "Confirmed"]} at={a.status === "confirmed" ? 2 : 0} label="Visit status" />
      )}
      {a.note && <p className="rounded-lg bg-cream px-3 py-2 text-body-m text-ink-600">{a.note}</p>}
      {!past &&
        (confirm ? (
          <ConfirmAction
            title="Cancel this visit?"
            confirmLabel="Cancel visit"
            onConfirm={() => cancel.mutate()}
            onCancel={() => setConfirm(false)}
            loading={cancel.isPending}
          >
            The facility will see it as cancelled. You can request another visit any time.
          </ConfirmAction>
        ) : (
          <button
            type="button"
            disabled={!online}
            onClick={() => setConfirm(true)}
            className="-mb-1 inline-flex h-10 items-center gap-1.5 self-start rounded-full px-3 text-label-l text-urgent-red transition-colors hover:bg-urgent-red-50 disabled:opacity-40"
          >
            <X className="size-4" aria-hidden /> Cancel visit
          </button>
        ))}
      <ServiceError error={cancel.error} />
    </motion.li>
  )
}

export default function Appointments() {
  const { session } = useAuth()
  const online = useOnline()
  const visible = useVisible()
  const now = useNow()
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming")
  const list = useQuery({
    queryKey: ["appointments", session?.sub],
    queryFn: () => serviceApi.appointments(),
    refetchInterval: visible && online ? 20_000 : false,
  })
  const all = list.data?.appointments ?? []
  const isPast = (a: Appointment) => a.slot_date < todayIso() || a.status === "cancelled"
  const upcoming = all.filter((a) => !isPast(a)).sort((a, b) => a.slot_date.localeCompare(b.slot_date))
  const past = all.filter(isPast).sort((a, b) => b.slot_date.localeCompare(a.slot_date))
  const rows = tab === "upcoming" ? upcoming : past

  const visits = (
    <section aria-labelledby="visits-title" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="visits-title" className="text-title-l">
          Your visits
        </h2>
        {list.dataUpdatedAt > 0 && <span className="text-label-m text-ink-600">Updated {timeAgo(list.dataUpdatedAt, now)}</span>}
      </div>
      {past.length > 0 && (
        <div className="grid grid-cols-2 rounded-full bg-white p-1 shadow-[var(--shadow-elev-1)]" role="tablist" aria-label="Visits">
          {(
            [
              ["upcoming", `Upcoming · ${upcoming.length}`],
              ["past", `Past · ${past.length}`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn("relative h-10 rounded-full text-label-l", tab === key ? "text-white" : "text-ink-600")}
            >
              {tab === key && <motion.span layoutId="visit-tab" className="absolute inset-0 rounded-full bg-brand-900" transition={SPRING.default} />}
              <span className="relative">{label}</span>
            </button>
          ))}
        </div>
      )}
      <ServiceError error={list.error} />
      {list.isPending ? (
        <div className="flex gap-3 rounded-xl bg-white p-4 shadow-[var(--shadow-elev-1)]" role="status" aria-label="Loading visits">
          <Skeleton className="size-14 rounded-lg" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      ) : rows.length ? (
        <motion.ul className="flex flex-col gap-3" variants={staggerOnMount(0.05)}>
          <AnimatePresence initial={false}>
            {rows.map((a) => (
              <VisitCard key={a.appointment_id} a={a} now={now} />
            ))}
          </AnimatePresence>
        </motion.ul>
      ) : (
        <EmptyState icon={CalendarDays} title={tab === "upcoming" ? "No upcoming visits." : "No past visits."} />
      )}
      {all.length > 0 && <p className="px-1 text-body-m text-ink-600">{plural(all.length, "visit")} in total.</p>}
    </section>
  )

  return (
    <AppPage
      eyebrow="Care services"
      title="Appointments"
      subtitle="Ask a facility for a visit, then follow its confirmation here."
      aside={visits}
      asideFirst={upcoming.length > 0}
    >
      <RequestVisit />
    </AppPage>
  )
}
