import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { motion } from "motion/react"
import { Check, ClipboardList, Droplet, ExternalLink, FlaskConical, MapPin, Phone, PhoneCall, Search, Send, Siren } from "lucide-react"
import { serviceApi, LAB_STEPS, type BloodRequest, type CallbackRequest, type Emergency, type LabRequest, type LabStatus } from "@/api/services"
import type { Facility, Urgency } from "@/api/types"
import { AppPage, Panel } from "@/design/components/AppPage"
import { Button, ButtonA, iconButtonClass } from "@/design/components/Button"
import { CopyReference } from "@/design/components/CopyReference"
import { FacilityMap, LocationMap } from "@/design/components/FacilityMap"
import { FacilityPicker } from "@/design/components/FacilityPicker"
import { CAPABILITY_ICON, hoursLabel, primaryCapability } from "@/design/components/FacilityRow"
import { Field, Input, Textarea } from "@/design/components/Field"
import { ConfirmAction, Feedback } from "@/design/components/Feedback"
import { FormGuard } from "@/design/components/FormGuard"
import { Skeleton } from "@/design/components/Lively"
import { ServiceError } from "@/design/components/ServicePage"
import { FilterTiles, ListSearch, PickHint, RecordList, UpdatedAt, useConsoleQuery, useRecordParams } from "@/design/components/Staff"
import { toast } from "@/design/components/Toast"
import { UrgencyBadge } from "@/design/components/UrgencyBadge"
import { EmptyState } from "@/design/components/primitives"
import { popIn } from "@/design/motion"
import { CAPABILITY_LABELS, formatDateTime, formatPhone, telHref, timeAgo } from "@/lib/format"
import { rules, useForm } from "@/lib/form"
import { formatDistance, rankFacilities } from "@/lib/geo"
import { useNow, useOnline } from "@/lib/hooks"
import { LAB_STATUS_LABEL, humanize, plural } from "@/lib/labels"
import { cn } from "@/lib/utils"
import { useFacilities } from "@/offline/facilities"
import { LabTimeline } from "@/features/services/Labs"
import { waited } from "@/features/doctor/DoctorQueue"

/*
 * Operator console, from the dispatch-dashboard study (RapidSOS, Corti, Uber Freight and ~10
 * Dribbble dispatch boards): counters that filter, the queue on the left and the person to
 * call on the right, nearest help computed from the facility directory. Eyebrow "Operator"
 * on every page (QA C6), one "Updated" indicator (C4), plain labels (C3).
 */

const RANK: Record<Urgency, number> = { RED: 0, AMBER: 1, GREEN: 2 }
const URGENCY_TILES = (count: (u: Urgency) => number) => [
  { key: "RED", label: "Emergency", tone: "RED" as const, count: count("RED") },
  { key: "AMBER", label: "Today", tone: "AMBER" as const, count: count("AMBER") },
  { key: "GREEN", label: "Can wait", tone: "GREEN" as const, count: count("GREEN") },
]
const byUrgencyThenAge = <T extends { urgency: Urgency; created_at: number }>(a: T, b: T) => RANK[a.urgency] - RANK[b.urgency] || a.created_at - b.created_at

function Loading() {
  return (
    <div className="flex flex-col gap-2" role="status" aria-label="Loading">
      <Skeleton className="h-20 rounded-xl" />
      <Skeleton className="h-20 rounded-xl" />
      <Skeleton className="h-20 rounded-xl" />
    </div>
  )
}

function CallRow({ name, meta, phone, icon: Icon = MapPin }: { name: string; meta: string; phone?: string; icon?: typeof MapPin }) {
  return (
    <li className="flex items-center gap-3 rounded-lg bg-cream p-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-white text-brand-700">
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-label-l">{name}</span>
        <span className="block text-label-m font-normal text-ink-600">{meta}</span>
      </span>
      {phone && (
        <a href={telHref(phone)} className={iconButtonClass("tonal")} aria-label={`Call ${name}`}>
          <Phone className="size-[18px]" aria-hidden />
        </a>
      )}
    </li>
  )
}

// ---------- Callbacks ----------

function CallbackDetail({ item, active, done }: { item: CallbackRequest; active: boolean; done: () => void }) {
  const online = useOnline()
  const now = useNow()
  const qc = useQueryClient()
  const [confirm, setConfirm] = useState(false)
  const form = useForm({ note: "" }, { note: [rules.maxLength(2000)] })
  const handle = useMutation({
    mutationFn: () => serviceApi.handleCallback(item.request_id, form.values.note.trim()),
    onSuccess: async () => {
      form.reset()
      setConfirm(false)
      await qc.invalidateQueries({ queryKey: ["operator-callbacks"] })
      toast("Marked as handled")
      done()
    },
    onError: () => void qc.invalidateQueries({ queryKey: ["operator-callbacks"] }),
  })
  return (
    <Panel>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <UrgencyBadge urgency={item.urgency} />
          <span className="text-label-m text-ink-600 tabular">Asked {timeAgo(item.created_at, now)}</span>
        </div>
        <p className="font-display text-[30px] leading-none font-[460] tracking-[-0.01em] tabular">{formatPhone(item.phone)}</p>
        <ButtonA icon={PhoneCall} href={telHref(item.phone)} size="lg">
          Call now
        </ButtonA>
        {!active && <Feedback>Someone else has already handled this request.</Feedback>}
        <form
          noValidate
          className="flex flex-col gap-4 border-t border-line pt-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (form.check() && online && active) setConfirm(true)
          }}
        >
          <Field label="What happened on the call?" hint="Optional. Only staff see this." count={form.values.note.length} max={2000} error={form.error("note")}>
            {(id) => <Textarea id={id} rows={3} maxLength={2000} {...form.bind("note")} />}
          </Field>
          <ServiceError error={handle.error} />
          {confirm ? (
            <ConfirmAction
              title="Mark as handled?"
              confirmLabel="Mark handled"
              loading={handle.isPending}
              onConfirm={() => handle.mutate()}
              onCancel={() => setConfirm(false)}
            >
              It leaves the queue for every operator, and can&apos;t be undone.
            </ConfirmAction>
          ) : (
            <Button type="submit" variant="secondary" icon={Check} disabled={!online || !active} className="self-start">
              Mark as handled
            </Button>
          )}
          {!online && <p className="text-label-m text-ink-600">You&apos;re offline. Reconnect to mark it handled.</p>}
          <FormGuard when={form.dirty && !handle.isPending} watchQuery={["selected"]} />
        </form>
        <p className="text-label-m break-all text-ink-600">Reference {item.request_id}</p>
      </div>
    </Panel>
  )
}

export default function OperatorCallbacks() {
  const query = useConsoleQuery("operator-callbacks", serviceApi.callbacks)
  const view = useRecordParams()
  const now = useNow()
  const [snapshot, setSnapshot] = useState<CallbackRequest | null>(null)
  const all = [...(query.data?.callbacks ?? [])].sort(byUrgencyThenAge)
  const rows = all.filter((c) => (!view.filter || c.urgency === view.filter) && c.phone.replace(/\s/g, "").includes(view.q.replace(/\s/g, "")))
  const selected = all.find((c) => c.request_id === view.selected) ?? (snapshot?.request_id === view.selected ? snapshot : undefined)
  const red = all.filter((c) => c.urgency === "RED").length

  return (
    <AppPage
      eyebrow="Operator"
      title="Callbacks"
      subtitle={query.data ? (all.length ? `${plural(all.length, "person", "people")} asked to be called back${red ? `, ${red} urgently` : ""}. Most urgent first.` : "Nobody is waiting for a call.") : undefined}
      actions={<UpdatedAt updated={query.dataUpdatedAt} refresh={() => void query.refetch()} loading={query.isFetching} />}
      asideFirst={Boolean(selected)}
      aside={
        selected ? (
          <CallbackDetail key={selected.request_id} item={selected} active={all.some((c) => c.request_id === selected.request_id)} done={() => view.set("selected", "")} />
        ) : (
          <PickHint icon={PhoneCall} title="Pick someone to call">
            People ask for a callback by SMS or USSD when they can&apos;t use the app. Call them, then note what happened and mark it handled.
          </PickHint>
        )
      }
    >
      <FilterTiles label="Filter by urgency" tiles={URGENCY_TILES((u) => all.filter((c) => c.urgency === u).length)} value={view.filter} onChange={(k) => view.set("filter", k)} />
      <ListSearch value={view.q} onChange={(v) => view.set("q", v)} placeholder="Search by phone number" total={all.length} />
      <ServiceError error={query.error} />
      {query.isPending ? (
        <Loading />
      ) : rows.length ? (
        <RecordList
          rows={rows}
          id={(c) => c.request_id}
          selected={view.selected}
          onSelect={(c) => {
            setSnapshot(c)
            view.set("selected", c.request_id)
          }}
          label="Callback requests"
          urgency={(c) => c.urgency}
          render={(c) => (
            <span className="flex items-center gap-3">
              <span className="min-w-0 flex-1">
                <span className="block text-title-m tabular">{formatPhone(c.phone)}</span>
                <span className="block text-body-m text-ink-600">{{ RED: "Emergency", AMBER: "Today", GREEN: "Can wait" }[c.urgency]}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-label-l tabular">{waited(c.created_at, now)}</span>
                <span className="block text-label-m font-normal text-ink-600">waiting</span>
              </span>
            </span>
          )}
        />
      ) : (
        <EmptyState
          icon={ClipboardList}
          title={view.filter || view.q ? "No callbacks match." : "No one is waiting for a call."}
          body={view.filter || view.q ? undefined : "New requests from SMS and USSD appear here by themselves."}
          action={view.filter || view.q ? <Button variant="tonal" onClick={() => view.setMany({ filter: "", q: "" })}>Show all</Button> : undefined}
        />
      )}
    </AppPage>
  )
}

// ---------- Dispatch ----------

function FacilityCard({ f, all }: { f: Facility; all: Facility[] }) {
  const Icon = CAPABILITY_ICON[primaryCapability(f.capabilities)]
  return (
    <motion.section variants={popIn} initial="hidden" animate="show" className="flex flex-col gap-4 rounded-xl bg-white p-5 shadow-[var(--shadow-elev-1)] lg:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-mint text-brand-700">
          <Icon className="size-5" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block text-title-l">{f.name}</span>
          <span className="block text-body-m text-ink-600">{[f.quarter, hoursLabel(f.opening_hours)].filter(Boolean).join(" · ")}</span>
        </span>
      </div>
      {f.address && <p className="text-body-m">{f.address}</p>}
      <ul className="flex flex-wrap gap-1.5">
        {f.capabilities.map((c) => (
          <li key={c} className="rounded-full bg-cream px-2.5 py-1 text-label-m">
            {CAPABILITY_LABELS[c]}
          </li>
        ))}
      </ul>
      {f.phone && (
        <ButtonA variant="tonal" icon={Phone} href={telHref(f.phone)} className="self-start">
          Call {formatPhone(f.phone)}
        </ButtonA>
      )}
      <FacilityMap all={all} shown={[f]} highlight={f.facility_id} origin={null} />
    </motion.section>
  )
}

export function OperatorDispatch() {
  const online = useOnline()
  const facilities = useFacilities() ?? []
  const [sent, setSent] = useState<{ log_id: string; name: string } | null>(null)
  const form = useForm(
    { facility_id: "", urgency: "" as Urgency | "", note: "" },
    { facility_id: [rules.required("Choose where the team is going.")], note: [rules.maxLength(2000)] },
  )
  const chosen = facilities.find((f) => f.facility_id === form.values.facility_id)
  const send = useMutation({
    mutationFn: () =>
      serviceApi.dispatch({ facility_id: form.values.facility_id, note: form.values.note.trim(), ...(form.values.urgency ? { urgency: form.values.urgency } : {}) }),
    onSuccess: (r) => {
      setSent({ log_id: r.log_id, name: chosen?.name ?? "the facility" })
      form.reset()
      toast("Dispatch logged")
    },
  })
  return (
    <AppPage
      eyebrow="Operator"
      title="Dispatch"
      subtitle="Log a team or ambulance you've arranged, so the whole team can see it. This doesn't send anyone by itself."
      asideFirst={false}
      aside={
        chosen ? (
          <FacilityCard f={chosen} all={facilities} />
        ) : (
          <PickHint icon={Send} title="Choose the destination">
            Search the directory by name or quarter. Places with emergency care are listed first; their number and position appear here.
          </PickHint>
        )
      }
    >
      {sent && (
        <motion.div variants={popIn} initial="hidden" animate="show" className="flex flex-col gap-3 rounded-xl bg-brand-900 p-5 text-white sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-title-m">
            <Check className="size-5 text-mint-200" aria-hidden /> Logged: dispatch to {sent.name}
          </p>
          <span className="text-label-m break-all text-white/70">Reference {sent.log_id}</span>
        </motion.div>
      )}
      <Panel title="Log a dispatch">
        <form
          noValidate
          className="flex flex-col gap-6"
          onSubmit={(e) => {
            e.preventDefault()
            if (!form.check()) {
              document.querySelector<HTMLElement>("#dispatch-facility [role=radio]")?.focus()
              return
            }
            if (online && !send.isPending) send.mutate()
          }}
        >
          <FacilityPicker
            id="dispatch-facility"
            label="Destination"
            prefer={["emergency"]}
            value={form.values.facility_id}
            onChange={(v) => {
              form.set("facility_id", v)
              setSent(null)
            }}
            error={form.error("facility_id")}
          />
          <fieldset>
            <legend className="mb-3 text-label-l">
              How urgent? <span className="ml-1 text-label-m font-normal text-ink-600">Optional</span>
            </legend>
            <div role="radiogroup" aria-label="Urgency" className="grid gap-2 sm:grid-cols-3">
              {(["RED", "AMBER", "GREEN"] as const).map((u) => {
                const on = form.values.urgency === u
                return (
                  <button
                    key={u}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => form.set("urgency", on ? "" : u)}
                    className={cn(
                      "flex h-12 items-center gap-2.5 rounded-lg px-4 text-label-l transition-[background-color,box-shadow]",
                      on ? "bg-mint shadow-[inset_0_0_0_2px_var(--color-brand-700)]" : "bg-white shadow-[inset_0_0_0_1px_var(--color-line)] hover:shadow-[inset_0_0_0_1px_var(--color-brand-500)]",
                    )}
                  >
                    <span className={cn("size-3 rounded-full", { RED: "bg-urgent-red", AMBER: "bg-urgent-amber", GREEN: "bg-urgent-green" }[u])} aria-hidden />
                    {{ RED: "Emergency", AMBER: "Today", GREEN: "Can wait" }[u]}
                  </button>
                )
              })}
            </div>
          </fieldset>
          <Field label="Note" hint="Who, where to pick them up, what you arranged." count={form.values.note.length} max={2000} error={form.error("note")}>
            {(id) => <Textarea id={id} rows={3} maxLength={2000} {...form.bind("note")} />}
          </Field>
          <ServiceError error={send.error} />
          <div className="flex flex-col gap-3 rounded-xl bg-cream p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-body-m text-ink-600">
              {chosen ? (
                <>
                  To <span className="font-semibold text-ink-900">{chosen.name}</span>
                </>
              ) : (
                "Choose a destination first."
              )}
            </p>
            <Button type="submit" icon={Send} loading={send.isPending} className="shrink-0">
              Log dispatch
            </Button>
          </div>
          {!online && <Feedback>You&apos;re offline. Reconnect to log it.</Feedback>}
          <FormGuard when={form.dirty && !send.isPending} />
        </form>
      </Panel>
    </AppPage>
  )
}

// ---------- Shared locations ----------

function nearestEmergency(e: Emergency, facilities: Facility[]) {
  return rankFacilities(
    facilities.filter((f) => f.is_active && f.capabilities.includes("emergency")),
    { latitude: e.latitude, longitude: e.longitude },
  ).slice(0, 3)
}

function LocationDetail({ e, facilities }: { e: Emergency; facilities: Facility[] }) {
  const now = useNow()
  const coords = `${e.latitude.toFixed(5)}, ${e.longitude.toFixed(5)}`
  const left = Math.max(0, e.ttl * 1000 - now)
  const total = Math.max(1, e.ttl * 1000 - e.timestamp)
  const near = nearestEmergency(e, facilities)
  const area = rankFacilities(facilities, { latitude: e.latitude, longitude: e.longitude })[0]
  return (
    <Panel>
      <div className="flex flex-col gap-4">
        <p className="flex items-center gap-2 eyebrow text-urgent-red">
          <Siren className="size-4" aria-hidden /> Shared {timeAgo(e.timestamp, now)}
        </p>
        <p className="font-display text-[26px] leading-tight font-[460] tabular">{coords}</p>
        {area && <p className="text-body-m text-ink-600">Near {area.quarter} ({area.distanceKm !== null ? formatDistance(area.distanceKm) : ""} from {area.name})</p>}
        <div>
          <div className="h-1.5 overflow-hidden rounded-full bg-cream" aria-hidden>
            <div className="h-full rounded-full bg-brand-600" style={{ width: `${(left / total) * 100}%` }} />
          </div>
          <p className="mt-1.5 text-label-m text-ink-600">Disappears {formatDateTime(e.ttl * 1000)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonA
            icon={ExternalLink}
            href={`https://www.google.com/maps/search/?api=1&query=${e.latitude},${e.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open in Google Maps
          </ButtonA>
          <CopyReference value={coords} label="Copy position" />
        </div>
        <p className="text-label-m text-ink-600">Opening Google Maps sends this position to Google.</p>
        <LocationMap latitude={e.latitude} longitude={e.longitude} label="Shared emergency position" />
        <div className="border-t border-line pt-4">
          <p className="mb-2 text-label-l">Nearest emergency care</p>
          <ul className="flex flex-col gap-2">
            {near.map((f) => (
              <CallRow key={f.facility_id} name={f.name} meta={`${f.quarter} · ${f.distanceKm !== null ? formatDistance(f.distanceKm) : ""}`} phone={f.phone} icon={Siren} />
            ))}
          </ul>
        </div>
      </div>
    </Panel>
  )
}

export function OperatorEmergencies() {
  const query = useConsoleQuery("operator-emergencies", serviceApi.emergencies)
  const view = useRecordParams()
  const now = useNow()
  const facilities = useFacilities() ?? []
  const all = (query.data?.emergencies ?? []).filter((e) => e.ttl * 1000 > now).sort((a, b) => b.timestamp - a.timestamp)
  const selected = all.find((e) => e.emergency_id === view.selected)
  return (
    <AppPage
      eyebrow="Operator"
      title="Shared locations"
      subtitle={query.data ? (all.length ? `${plural(all.length, "person", "people")} shared where they are in the last 24 hours. Newest first.` : "No one has shared their location in the last 24 hours.") : undefined}
      actions={<UpdatedAt updated={query.dataUpdatedAt} refresh={() => void query.refetch()} loading={query.isFetching} />}
      asideFirst={Boolean(selected)}
      aside={
        selected ? (
          <LocationDetail key={selected.emergency_id} e={selected} facilities={facilities} />
        ) : (
          <PickHint icon={MapPin} title="Pick a location">
            People share their position from an emergency result. You&apos;ll see the nearest emergency care with phone numbers. Sharing doesn&apos;t
            mean help is on the way: follow your response procedure.
          </PickHint>
        )
      }
    >
      <ServiceError error={query.error} />
      {query.isPending ? (
        <Loading />
      ) : all.length ? (
        <RecordList
          rows={all}
          id={(e) => e.emergency_id}
          selected={view.selected}
          onSelect={(e) => view.set("selected", e.emergency_id)}
          label="Shared locations"
          urgency={() => "RED"}
          render={(e) => {
            const area = rankFacilities(facilities, { latitude: e.latitude, longitude: e.longitude })[0]
            return (
              <span className="flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-title-m">{area ? `Near ${area.quarter}` : "Shared location"}</span>
                  <span className="block text-body-m text-ink-600 tabular">
                    {e.latitude.toFixed(4)}, {e.longitude.toFixed(4)}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-label-l tabular">{waited(e.timestamp, now)}</span>
                  <span className="block text-label-m font-normal text-ink-600">ago</span>
                </span>
              </span>
            )
          }}
        />
      ) : (
        <EmptyState icon={MapPin} title="No shared locations right now." body="When someone shares where they are, it appears here for 24 hours." />
      )}
    </AppPage>
  )
}

// ---------- Blood ----------

function BloodDetail({ b, facilities }: { b: BloodRequest; facilities: Facility[] }) {
  const now = useNow()
  const from = facilities.find((f) => f.facility_id === b.requesting_facility_id)
  const banks = rankFacilities(
    facilities.filter((f) => f.is_active && f.capabilities.includes("blood_bank") && f.facility_id !== b.requesting_facility_id),
    from ? { latitude: from.latitude, longitude: from.longitude } : null,
  ).slice(0, 4)
  return (
    <Panel>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <UrgencyBadge urgency={b.urgency} />
          <span className="text-label-m text-ink-600 tabular">Asked {timeAgo(b.created_at, now)}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex size-16 shrink-0 flex-col items-center justify-center rounded-xl bg-brand-900 text-white">
            <Droplet className="size-4 fill-mint-200 text-mint-200" aria-hidden />
            <span className="font-display text-[22px] leading-none font-[480]">{b.blood_type}</span>
          </span>
          <span>
            <span className="block font-display text-[26px] leading-tight font-[460]">{plural(b.units, "unit")}</span>
            <span className="block text-body-m text-ink-600">of {b.blood_type}</span>
          </span>
        </div>
        <div className="border-t border-line pt-4">
          <p className="mb-2 text-label-l">Asked by</p>
          <ul>
            <CallRow name={from?.name ?? "Facility not in the directory"} meta={from?.quarter ?? ""} phone={from?.phone} />
          </ul>
        </div>
        <div>
          <p className="mb-2 text-label-l">Blood banks to call{from ? ", nearest first" : ""}</p>
          {banks.length ? (
            <ul className="flex flex-col gap-2">
              {banks.map((f) => (
                <CallRow key={f.facility_id} name={f.name} meta={`${f.quarter}${f.distanceKm !== null ? ` · ${formatDistance(f.distanceKm)}` : ""}`} phone={f.phone} icon={Droplet} />
              ))}
            </ul>
          ) : (
            <p className="text-body-m text-ink-600">No blood bank is listed in the directory.</p>
          )}
        </div>
        <p className="rounded-lg bg-cream p-3 text-body-m text-ink-600">Requests stay open here: there isn&apos;t a &ldquo;found&rdquo; status yet. Note the outcome in your usual log.</p>
        <p className="text-label-m break-all text-ink-600">Reference {b.request_id}</p>
      </div>
    </Panel>
  )
}

export function OperatorBlood() {
  const query = useConsoleQuery("operator-blood", serviceApi.blood)
  const view = useRecordParams()
  const now = useNow()
  const facilities = useFacilities() ?? []
  const all = [...(query.data?.blood_requests ?? [])].sort(byUrgencyThenAge)
  const name = (b: BloodRequest) => facilities.find((f) => f.facility_id === b.requesting_facility_id)?.name ?? "Requesting facility"
  const needle = view.q.trim().toLowerCase()
  const rows = all.filter((b) => (!view.filter || b.urgency === view.filter) && (!needle || `${b.blood_type} ${name(b)}`.toLowerCase().includes(needle)))
  const selected = all.find((b) => b.request_id === view.selected)
  return (
    <AppPage
      eyebrow="Operator"
      title="Blood requests"
      subtitle={query.data ? (all.length ? `${plural(all.length, "open request")}. Most urgent first.` : "No open blood requests.") : undefined}
      actions={<UpdatedAt updated={query.dataUpdatedAt} refresh={() => void query.refetch()} loading={query.isFetching} />}
      asideFirst={Boolean(selected)}
      aside={
        selected ? (
          <BloodDetail key={selected.request_id} b={selected} facilities={facilities} />
        ) : (
          <PickHint icon={Droplet} title="Pick a request">
            You&apos;ll see who asked, and the blood banks closest to them with their phone numbers.
          </PickHint>
        )
      }
    >
      <FilterTiles label="Filter by urgency" tiles={URGENCY_TILES((u) => all.filter((b) => b.urgency === u).length)} value={view.filter} onChange={(k) => view.set("filter", k)} />
      <ListSearch value={view.q} onChange={(v) => view.set("q", v)} placeholder="Search by blood type or facility" total={all.length} />
      <ServiceError error={query.error} />
      {query.isPending ? (
        <Loading />
      ) : rows.length ? (
        <RecordList
          rows={rows}
          id={(b) => b.request_id}
          selected={view.selected}
          onSelect={(b) => view.set("selected", b.request_id)}
          label="Blood requests"
          urgency={(b) => b.urgency}
          render={(b) => (
            <span className="flex items-center gap-3 sm:gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-cream font-display text-[20px] leading-none font-[480]">{b.blood_type}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-title-m">{plural(b.units, "unit")}</span>
                <span className="block truncate text-body-m text-ink-600">{name(b)}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-label-l tabular">{waited(b.created_at, now)}</span>
                <span className="block text-label-m font-normal text-ink-600">waiting</span>
              </span>
            </span>
          )}
        />
      ) : (
        <EmptyState
          icon={Droplet}
          title={view.filter || view.q ? "No requests match." : "No open blood requests."}
          action={view.filter || view.q ? <Button variant="tonal" onClick={() => view.setMany({ filter: "", q: "" })}>Show all</Button> : undefined}
        />
      )}
    </AppPage>
  )
}

// ---------- Lab tests ----------

function LabUpdate({ lab, refresh }: { lab: LabRequest; refresh: () => void }) {
  const online = useOnline()
  const form = useForm({ result_summary: "" }, { result_summary: [rules.maxLength(8000)] })
  const [confirm, setConfirm] = useState<LabStatus | null>(null)
  const next = LAB_STEPS[LAB_STEPS.indexOf(lab.status) + 1]
  const update = useMutation({
    mutationFn: (status: LabStatus) =>
      serviceApi.updateLab(lab.request_id, { status, ...(status === "results_ready" ? { result_summary: form.values.result_summary.trim() } : {}) }),
    onSuccess: (_, status) => {
      form.reset()
      setConfirm(null)
      refresh()
      toast(`Marked: ${LAB_STATUS_LABEL[status].toLowerCase()}`)
    },
    onError: () => {
      setConfirm(null)
      refresh()
    },
  })
  if (!next)
    return (
      <PickHint icon={Check} title="All done">
        This test has been delivered to the patient. There&apos;s nothing more to update.
      </PickHint>
    )
  return (
    <Panel title="Next step">
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (form.check() && online) setConfirm(next)
        }}
      >
        <p className="text-body-m text-ink-600">
          Now: <span className="font-semibold text-ink-900">{LAB_STATUS_LABEL[lab.status]}</span>. Next:{" "}
          <span className="font-semibold text-ink-900">{LAB_STATUS_LABEL[next]}</span>.
        </p>
        {next === "results_ready" && (
          <Field label="Result for the patient" hint="Optional. Plain words; the patient reads this." count={form.values.result_summary.length} max={8000} error={form.error("result_summary")}>
            {(id) => <Textarea id={id} rows={4} maxLength={8000} {...form.bind("result_summary")} />}
          </Field>
        )}
        <ServiceError error={update.error} />
        {confirm ? (
          <ConfirmAction
            title={`Mark as ${LAB_STATUS_LABEL[confirm].toLowerCase()}?`}
            confirmLabel="Yes, update"
            loading={update.isPending}
            onConfirm={() => update.mutate(confirm)}
            onCancel={() => setConfirm(null)}
          >
            Steps only move forward. The patient sees the change.
          </ConfirmAction>
        ) : (
          <Button type="submit" disabled={!online} className="self-start">
            Mark as {LAB_STATUS_LABEL[next].toLowerCase()}
          </Button>
        )}
        {!online && <p className="text-label-m text-ink-600">You&apos;re offline. Reconnect to update.</p>}
        <FormGuard when={form.dirty && !update.isPending} watchQuery={["selected"]} />
      </form>
    </Panel>
  )
}

export function OperatorLabs() {
  const view = useRecordParams()
  const now = useNow()
  const online = useOnline()
  const facilities = useFacilities()
  const [value, setValue] = useState(view.selected)
  const [submitted, setSubmitted] = useState(false)
  const query = useConsoleQuery(`staff-lab:${view.selected}`, () => serviceApi.lab(view.selected), Boolean(view.selected))
  const lab = query.data
  const error = !value.trim() ? "Enter the lab request reference." : undefined
  return (
    <AppPage
      eyebrow="Operator"
      title="Lab tests"
      subtitle="Open a request by its reference, then move it to the next step. There's no list of every request yet."
      actions={view.selected ? <UpdatedAt updated={query.dataUpdatedAt} refresh={() => void query.refetch()} loading={query.isFetching} /> : undefined}
      asideFirst={false}
      aside={
        lab ? (
          <LabUpdate key={`${lab.request_id}:${lab.status}`} lab={lab} refresh={() => void query.refetch()} />
        ) : (
          <PickHint icon={FlaskConical} title="Where's the reference?">
            The patient sees it on their lab test page, and can read it out or send it to you.
          </PickHint>
        )
      }
    >
      <Panel>
        <form
          noValidate
          className="flex flex-col gap-3 sm:flex-row sm:items-start"
          onSubmit={(e) => {
            e.preventDefault()
            setSubmitted(true)
            if (!error) view.set("selected", value.trim())
          }}
        >
          <div className="min-w-0 flex-1">
            <Field label="Lab request reference" error={submitted ? error : undefined}>
              {(id) => <Input id={id} maxLength={200} value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" spellCheck={false} />}
            </Field>
          </div>
          <Button type="submit" variant="tonal" icon={Search} disabled={!online} className="sm:mt-7">
            Open
          </Button>
        </form>
      </Panel>
      {view.selected && (
        <>
          <ServiceError error={query.error} />
          {query.isPending ? (
            <Skeleton className="h-72 rounded-xl" />
          ) : (
            lab && (
              <Panel>
                <div className="flex flex-col gap-1">
                  <p className="eyebrow">{LAB_STATUS_LABEL[lab.status]}</p>
                  <p className="text-headline-s">{humanize(lab.test_type)}</p>
                  <p className="text-body-m text-ink-600">
                    {facilities?.find((f) => f.facility_id === lab.facility_id)?.name ?? "Laboratory"} · collect at {lab.collection_address}
                  </p>
                </div>
                <div className="mt-5">
                  <LabTimeline lab={lab} />
                </div>
                {lab.result_summary && (
                  <div className="mt-5 rounded-lg bg-cream p-4">
                    <p className="text-label-l text-ink-600">Result</p>
                    <p className="mt-1 text-body-l whitespace-pre-wrap">{lab.result_summary}</p>
                  </div>
                )}
                <p className="mt-4 text-label-m text-ink-600">Last change {timeAgo(lab.updated_at, now)}</p>
              </Panel>
            )
          )}
        </>
      )}
    </AppPage>
  )
}
