import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { motion } from "motion/react"
import { ArrowLeft, BookOpen, Building2, CalendarDays, Check, Clock, Eye, FlaskConical, Phone, Plus, Save, ShieldCheck, Siren, Trash2, Baby } from "lucide-react"
import { facilityApi } from "@/api/endpoints"
import { serviceApi, type Appointment, type FacilityInput, type TipInput } from "@/api/services"
import type { Capability, Facility, HealthTip, Locale } from "@/api/types"
import { AppPage, Panel } from "@/design/components/AppPage"
import { Button, iconButtonClass } from "@/design/components/Button"
import { CAPABILITY_ICON, hoursLabel, primaryCapability } from "@/design/components/FacilityRow"
import { Chip, Field, Input, Textarea } from "@/design/components/Field"
import { ConfirmAction, Feedback } from "@/design/components/Feedback"
import { FormGuard } from "@/design/components/FormGuard"
import { Skeleton } from "@/design/components/Lively"
import { ServiceError } from "@/design/components/ServicePage"
import { DateTile, FilterTiles, ListSearch, PickHint, RecordList, Switch, UpdatedAt, useConsoleQuery, useRecordParams } from "@/design/components/Staff"
import { toast } from "@/design/components/Toast"
import { EmptyState } from "@/design/components/primitives"
import { popIn } from "@/design/motion"
import { CAPABILITY_LABELS, formatDate, formatPhone, telHref } from "@/lib/format"
import { rules, todayIso, useForm } from "@/lib/form"
import { useNow, useOnline } from "@/lib/hooks"
import { SLOT_LABEL, humanize, plural } from "@/lib/labels"
import { cn } from "@/lib/utils"
import { refreshFacilities, useFacilities } from "@/offline/facilities"

/*
 * Admin console, from the CRUD-table study (Linear settings, Stripe dashboard tables, Retool
 * and ~10 Dribbble admin tables): a real table with the columns admins scan (QA K4), the
 * editor opening in place of the list with a live "as patients see it" preview beside it,
 * no internal IDs (K5), destructive actions styled as such.
 */

const CAPABILITIES = Object.keys(CAPABILITY_LABELS) as Capability[]
const LOCALE_LABEL: Record<Locale, string> = { en: "English", fr: "Français", pid: "Pidgin" }
const BUEA = { lat: [3.9, 4.4], lng: [9.0, 9.5] }

function Loading() {
  return (
    <div className="flex flex-col gap-2" role="status" aria-label="Loading">
      <Skeleton className="h-16 rounded-xl" />
      <Skeleton className="h-16 rounded-xl" />
      <Skeleton className="h-16 rounded-xl" />
    </div>
  )
}

function Back({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex h-10 items-center gap-1.5 self-start rounded-full pr-3 text-label-l text-brand-700 hover:bg-mint">
      <ArrowLeft className="size-4" aria-hidden /> {children}
    </button>
  )
}

function OptionRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg bg-cream p-3.5">
      <span>
        <span className="block text-label-l">{label}</span>
        <span className="block text-body-m text-ink-600">{hint}</span>
      </span>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  )
}

// ---------- Facilities ----------

type FacilityValues = {
  name: string
  phone: string
  region: string
  quarter: string
  address: string
  latitude: string
  longitude: string
  opening_hours: string
  consultation_fee_xaf: string
  capabilities: Capability[]
  has_backup_power: boolean
  accepts_csu_card: boolean
  is_active: boolean
}

const toValues = (f?: Facility): FacilityValues => ({
  name: f?.name ?? "",
  phone: f?.phone ?? "",
  region: f?.region ?? "South-West",
  quarter: f?.quarter ?? "",
  address: f?.address ?? "",
  latitude: f ? String(f.latitude) : "",
  longitude: f ? String(f.longitude) : "",
  opening_hours: f ? (typeof f.opening_hours === "string" ? f.opening_hours : JSON.stringify(f.opening_hours)) : "",
  consultation_fee_xaf: f ? String(f.consultation_fee_xaf) : "",
  capabilities: f?.capabilities ?? ["general"],
  has_backup_power: f?.has_backup_power ?? false,
  accepts_csu_card: f?.accepts_csu_card ?? false,
  is_active: f?.is_active ?? true,
})

const coord = (min: number, max: number, msg: string) => (v: unknown) => {
  const n = Number(v)
  return v === "" || !Number.isFinite(n) ? "Enter a number." : n < min || n > max ? msg : undefined
}

function FacilityPreview({ v }: { v: FacilityValues }) {
  const caps = v.capabilities.length ? v.capabilities : (["general"] as Capability[])
  const Icon = CAPABILITY_ICON[primaryCapability(caps)]
  const hours = hoursLabel(v.opening_hours)
  return (
    <section className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-label-l text-ink-600">
        <Eye className="size-4" aria-hidden /> As patients see it
      </p>
      <div className="flex items-start gap-3 rounded-xl bg-white p-4 shadow-[var(--shadow-elev-1)]">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-mint text-brand-700">
          <Icon className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-title-m">{v.name || "Facility name"}</span>
          <span className="block text-body-m text-ink-600">{[v.quarter || "Quarter", hours].filter(Boolean).join(" · ")}</span>
          <span className="mt-2 flex flex-wrap gap-1">
            {caps.slice(0, 4).map((c) => (
              <span key={c} className="rounded-full bg-cream px-2 py-0.5 text-label-m">
                {CAPABILITY_LABELS[c]}
              </span>
            ))}
          </span>
        </span>
      </div>
      {!v.is_active && <Feedback>Hidden: patients won&apos;t see this facility, and it drops off this list after saving.</Feedback>}
    </section>
  )
}

function FacilityEditor({ initial, onDone }: { initial?: Facility; onDone: () => void }) {
  const online = useOnline()
  const qc = useQueryClient()
  const form = useForm<FacilityValues>(toValues(initial), {
    name: [rules.required("Enter the facility's name."), rules.maxLength(200)],
    phone: [rules.required("Enter a phone number patients can call."), rules.phone("Enter a phone number, for example 677 000 000.")],
    quarter: [rules.required("Enter the quarter, for example Molyko.")],
    address: [rules.required("Describe how to find it.")],
    region: [rules.required()],
    latitude: [coord(BUEA.lat[0], BUEA.lat[1], "That's outside the Buea area. Check the latitude.")],
    longitude: [coord(BUEA.lng[0], BUEA.lng[1], "That's outside the Buea area. Check the longitude.")],
    opening_hours: [rules.required("Enter the opening hours, or 24/7.")],
    consultation_fee_xaf: [rules.required("Enter the fee, or 0 if it's free."), rules.intRange(0, 1_000_000)],
    capabilities: [rules.required("Choose at least one service.")],
  })
  const v = form.values
  const save = useMutation({
    mutationFn: () => {
      const body: FacilityInput = {
        name: v.name.trim(),
        phone: v.phone.trim(),
        region: v.region.trim(),
        quarter: v.quarter.trim(),
        address: v.address.trim(),
        latitude: Number(v.latitude),
        longitude: Number(v.longitude),
        opening_hours: v.opening_hours.trim(),
        consultation_fee_xaf: Number(v.consultation_fee_xaf),
        capabilities: v.capabilities,
        has_backup_power: v.has_backup_power,
        accepts_csu_card: v.accepts_csu_card,
        is_active: v.is_active,
      }
      if (initial) return serviceApi.updateFacility(initial.facility_id, body)
      const { is_active: _active, ...create } = body
      void _active
      return serviceApi.createFacility(create)
    },
    onSuccess: async (f) => {
      await refreshFacilities().catch(() => undefined)
      await qc.invalidateQueries({ queryKey: ["admin-facilities"] })
      toast(initial ? `Saved ${f.name}` : `Added ${f.name}`)
      onDone()
    },
  })
  const locate = () =>
    navigator.geolocation?.getCurrentPosition(
      (p) => {
        form.set("latitude", p.coords.latitude.toFixed(6))
        form.set("longitude", p.coords.longitude.toFixed(6))
      },
      () => toast("Couldn't get your position", { tone: "info" }),
    )

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
      <Panel>
        <form
          noValidate
          className="flex flex-col gap-6"
          onSubmit={(e) => {
            e.preventDefault()
            if (!form.check()) {
              requestAnimationFrame(() => document.querySelector<HTMLElement>("main [aria-invalid=true]")?.focus())
              return
            }
            if (online && !save.isPending) save.mutate()
          }}
        >
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-3 text-title-l">Basics</legend>
            <Field label="Name" required error={form.error("name")}>
              {(id) => <Input id={id} maxLength={200} {...form.bind("name")} />}
            </Field>
            <Field label="Phone" required error={form.error("phone")}>
              {(id) => <Input id={id} type="tel" inputMode="tel" placeholder="677 000 000" {...form.bind("phone")} />}
            </Field>
            <Field label="Opening hours" required error={form.error("opening_hours")} hint="“24/7”, or for example “Mon–Sat 7:00–20:00”">
              {(id) => <Input id={id} maxLength={200} {...form.bind("opening_hours")} />}
            </Field>
            <Field label="Consultation fee (XAF)" required error={form.error("consultation_fee_xaf")} hint="0 if free">
              {(id) => <Input id={id} type="number" inputMode="numeric" min={0} step={1} {...form.bind("consultation_fee_xaf")} />}
            </Field>
          </fieldset>

          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-3 text-title-l">Where it is</legend>
            <Field label="Quarter" required error={form.error("quarter")}>
              {(id) => <Input id={id} maxLength={100} placeholder="Molyko" {...form.bind("quarter")} />}
            </Field>
            <Field label="Region" required error={form.error("region")}>
              {(id) => <Input id={id} maxLength={100} {...form.bind("region")} />}
            </Field>
            <div className="sm:col-span-2">
              <Field label="How to find it" required error={form.error("address")} hint="Street, landmark, what's next door">
                {(id) => <Input id={id} maxLength={300} {...form.bind("address")} />}
              </Field>
            </div>
            <Field label="Latitude" required error={form.error("latitude")}>
              {(id) => <Input id={id} inputMode="decimal" placeholder="4.15" {...form.bind("latitude")} />}
            </Field>
            <Field label="Longitude" required error={form.error("longitude")}>
              {(id) => <Input id={id} inputMode="decimal" placeholder="9.24" {...form.bind("longitude")} />}
            </Field>
            <button type="button" onClick={locate} className="inline-flex h-10 items-center gap-1.5 self-start rounded-full px-3 text-label-l text-brand-700 hover:bg-mint sm:col-span-2">
              Use my current position
            </button>
          </fieldset>

          <fieldset>
            <legend className="mb-3 text-title-l">
              Services <span className="ml-1 text-label-m font-normal text-ink-600">Required</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {CAPABILITIES.map((c) => (
                <Chip
                  key={c}
                  selected={v.capabilities.includes(c)}
                  onClick={() => form.set("capabilities", v.capabilities.includes(c) ? v.capabilities.filter((x) => x !== c) : [...v.capabilities, c])}
                >
                  {CAPABILITY_LABELS[c]}
                </Chip>
              ))}
            </div>
            {form.error("capabilities") && (
              <p role="alert" className="mt-2 text-label-m text-urgent-red">
                {form.error("capabilities")}
              </p>
            )}
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-3 text-title-l">Good to know</legend>
            <OptionRow label="Backup power" hint="Keeps working in a power cut" checked={v.has_backup_power} onChange={(x) => form.set("has_backup_power", x)} />
            <OptionRow label="Accepts CSU card" hint="Universal health coverage card" checked={v.accepts_csu_card} onChange={(x) => form.set("accepts_csu_card", x)} />
            {initial && <OptionRow label="Shown to patients" hint="Turn off to hide it from the directory" checked={v.is_active} onChange={(x) => form.set("is_active", x)} />}
          </fieldset>

          <ServiceError error={save.error} />
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
            <Button type="submit" icon={Save} loading={save.isPending}>
              {initial ? "Save changes" : "Add facility"}
            </Button>
            <Button variant="ghost" onClick={onDone}>
              Cancel
            </Button>
            {!online && <span className="text-label-m text-ink-600">You&apos;re offline. Reconnect to save.</span>}
          </div>
          <FormGuard when={form.dirty && !save.isPending && !save.isSuccess} />
        </form>
      </Panel>
      <div className="xl:sticky xl:top-6">
        <FacilityPreview v={v} />
      </div>
    </div>
  )
}

export default function AdminFacilities() {
  const view = useRecordParams()
  const query = useConsoleQuery("admin-facilities", async () => {
    const all: Facility[] = []
    let key: string | undefined
    do {
      const page = await facilityApi.list(key)
      all.push(...page.facilities)
      key = page.next_key ?? undefined
    } while (key)
    return all
  })
  const all = [...(query.data ?? [])].sort((a, b) => a.name.localeCompare(b.name))
  const editing = view.params.get("edit") ?? ""
  const current = all.find((f) => f.facility_id === editing)
  const tiles = [
    { key: "emergency", label: "Emergency", icon: Siren, count: all.filter((f) => f.capabilities.includes("emergency")).length },
    { key: "maternity", label: "Maternity", icon: Baby, count: all.filter((f) => f.capabilities.includes("maternity")).length },
    { key: "laboratory", label: "Laboratory", icon: FlaskConical, count: all.filter((f) => f.capabilities.includes("laboratory")).length },
    { key: "24/7", label: "Open 24/7", icon: Clock, count: all.filter((f) => f.opening_hours === "24/7").length },
  ]
  const needle = view.q.trim().toLowerCase()
  const rows = all.filter(
    (f) =>
      (!view.filter || (view.filter === "24/7" ? f.opening_hours === "24/7" : f.capabilities.includes(view.filter as Capability))) &&
      (!needle || `${f.name} ${f.quarter} ${f.address}`.toLowerCase().includes(needle)),
  )
  const open = (id: string) => {
    view.setMany({ edit: id })
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  if (editing && (editing === "new" || current))
    return (
      <AppPage eyebrow="Administrator" title={current ? current.name : "New facility"} subtitle={current ? `${current.quarter} · changes reach every phone on its next sync` : "It appears in the patient directory once saved."} back={<Back onClick={() => view.set("edit", "")}>All facilities</Back>}>
        <FacilityEditor key={editing} initial={current} onDone={() => view.set("edit", "")} />
      </AppPage>
    )

  return (
    <AppPage
      eyebrow="Administrator"
      title="Facilities"
      subtitle={query.data ? `${plural(all.length, "facility", "facilities")} in the directory. Changes reach every phone on its next sync.` : undefined}
      actions={
        <>
          <UpdatedAt updated={query.dataUpdatedAt} refresh={() => void query.refetch()} loading={query.isFetching} />
          <Button icon={Plus} onClick={() => open("new")}>
            New facility
          </Button>
        </>
      }
    >
      <FilterTiles label="Filter by service" tiles={tiles} value={view.filter} onChange={(k) => view.set("filter", k)} />
      <ListSearch value={view.q} onChange={(v) => view.set("q", v)} placeholder="Search by name, quarter or address" total={all.length} />
      <ServiceError error={query.error} />
      {query.isPending ? (
        <Loading />
      ) : !rows.length ? (
        <EmptyState
          icon={Building2}
          title={view.filter || needle ? "No facilities match." : "No facilities yet."}
          action={
            view.filter || needle ? (
              <Button variant="tonal" onClick={() => view.setMany({ filter: "", q: "" })}>
                Show all
              </Button>
            ) : (
              <Button icon={Plus} onClick={() => open("new")}>
                Add the first facility
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl bg-white shadow-[var(--shadow-elev-1)] lg:block">
            <table className="w-full text-left text-body-m">
              <caption className="sr-only">Facilities ({rows.length})</caption>
              <thead className="bg-cream text-label-l text-ink-600">
                <tr>
                  <th scope="col" className="py-3 pr-3 pl-5">Facility</th>
                  <th scope="col" className="p-3">Quarter</th>
                  <th scope="col" className="p-3">Services</th>
                  <th scope="col" className="p-3">Hours</th>
                  <th scope="col" className="py-3 pr-5 pl-3 text-right">Phone</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((f) => {
                  const Icon = CAPABILITY_ICON[primaryCapability(f.capabilities)]
                  return (
                    <tr key={f.facility_id} className="relative transition-colors hover:bg-cream">
                      <td className="py-3 pr-3 pl-5">
                        <button type="button" onClick={() => open(f.facility_id)} className="flex items-center gap-3 text-left after:absolute after:inset-0">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-mint text-brand-700">
                            <Icon className="size-[18px]" aria-hidden />
                          </span>
                          <span className="text-label-l text-ink-900">{f.name}</span>
                        </button>
                      </td>
                      <td className="p-3 text-ink-600">{f.quarter}</td>
                      <td className="p-3">
                        <span className="flex flex-wrap gap-1">
                          {f.capabilities.slice(0, 3).map((c) => (
                            <span key={c} className="rounded-full bg-cream px-2 py-0.5 text-label-m whitespace-nowrap">
                              {CAPABILITY_LABELS[c]}
                            </span>
                          ))}
                          {f.capabilities.length > 3 && <span className="px-1 text-label-m text-ink-600">+{f.capabilities.length - 3}</span>}
                        </span>
                      </td>
                      <td className="p-3 text-ink-600">{hoursLabel(f.opening_hours) ?? "—"}</td>
                      <td className="py-3 pr-5 pl-3 text-right whitespace-nowrap text-ink-600 tabular">{f.phone ? formatPhone(f.phone) : "—"}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="lg:hidden">
            <RecordList
              rows={rows}
              id={(f) => f.facility_id}
              selected=""
              onSelect={(f) => open(f.facility_id)}
              label="Facilities"
              render={(f) => (
                <span className="block">
                  <span className="block text-title-m">{f.name}</span>
                  <span className="block text-body-m text-ink-600">{[f.quarter, hoursLabel(f.opening_hours)].filter(Boolean).join(" · ")}</span>
                </span>
              )}
            />
          </div>
        </>
      )}
      <details className="group rounded-xl bg-white/60 px-4 py-1 text-body-m text-ink-600">
        <summary className="flex min-h-10 cursor-pointer list-none items-center text-label-l text-brand-700 [&::-webkit-details-marker]:hidden">Where are hidden facilities?</summary>
        <p className="pb-3">
          Facilities you hide disappear from this list as well as from the patient directory. To show one again, ask the technical team to switch it
          back on.
        </p>
      </details>
    </AppPage>
  )
}

// ---------- Health tips ----------

type TipValues = { title: string; body: string; source_name: string; source_url: string; published_date: string; locale: Locale; tags: string; is_active: boolean; hidden_id: string }

function TipEditor({ initial, onDone }: { initial?: HealthTip; onDone: () => void }) {
  const online = useOnline()
  const qc = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const form = useForm<TipValues>(
    {
      title: initial?.title ?? "",
      body: initial?.body ?? "",
      source_name: initial?.source_name ?? "",
      source_url: initial?.source_url ?? "",
      published_date: initial?.published_date ?? todayIso(),
      locale: initial?.locale ?? "en",
      tags: initial?.tags.join(", ") ?? "",
      is_active: initial?.is_active ?? true,
      hidden_id: "",
    },
    {
      title: [rules.required("Give the tip a short title."), rules.maxLength(200)],
      body: [rules.required("Write the tip."), rules.minLength(30, "A tip needs a little more: at least 30 characters."), rules.maxLength(4000)],
      source_name: [rules.required("Name the source, for example WHO or the Ministry of Health.")],
      source_url: [(v) => (typeof v === "string" && v && !/^https?:\/\/\S+$/i.test(v) ? "Use a full web address starting with https://" : undefined)],
      published_date: [rules.required("Choose a date.")],
    },
  )
  const v = form.values
  const save = useMutation({
    mutationFn: () => {
      const body: TipInput = {
        title: v.title.trim(),
        body: v.body.trim(),
        source_name: v.source_name.trim(),
        source_url: v.source_url.trim() || null,
        published_date: v.published_date,
        locale: v.locale,
        tags: v.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
        is_active: v.is_active,
      }
      const id = initial?.tip_id ?? v.hidden_id.trim()
      return id ? serviceApi.updateTip(id, body) : serviceApi.createTip(body)
    },
    onSuccess: async (t) => {
      await qc.invalidateQueries({ queryKey: ["admin-tips"] })
      toast(initial ? "Tip saved" : `Published “${t.title}”`)
      onDone()
    },
  })
  const del = useMutation({
    mutationFn: () => serviceApi.deleteTip(initial!.tip_id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin-tips"] })
      toast("Tip deleted")
      onDone()
    },
  })
  const tags = v.tags.split(",").map((t) => t.trim()).filter(Boolean)

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      <Panel>
        <form
          noValidate
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault()
            if (!form.check()) {
              requestAnimationFrame(() => document.querySelector<HTMLElement>("main [aria-invalid=true]")?.focus())
              return
            }
            if (online && !save.isPending) save.mutate()
          }}
        >
          <Field label="Title" required error={form.error("title")} count={v.title.length} max={200}>
            {(id) => <Input id={id} maxLength={200} {...form.bind("title")} />}
          </Field>
          <Field label="The tip" required error={form.error("body")} hint="Plain words, short sentences. Say what to do." count={v.body.length} max={4000}>
            {(id) => <Textarea id={id} rows={6} maxLength={4000} {...form.bind("body")} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Source" required error={form.error("source_name")}>
              {(id) => <Input id={id} maxLength={200} placeholder="WHO" {...form.bind("source_name")} />}
            </Field>
            <Field label="Source link" error={form.error("source_url")} hint="Optional">
              {(id) => <Input id={id} type="url" inputMode="url" placeholder="https://" {...form.bind("source_url")} />}
            </Field>
            <Field label="Published" required error={form.error("published_date")}>
              {(id) => <Input id={id} type="date" max={todayIso()} {...form.bind("published_date")} />}
            </Field>
            <Field label="Topics" hint="Separate with commas, for example: malaria, children">
              {(id) => <Input id={id} maxLength={200} {...form.bind("tags")} />}
            </Field>
          </div>
          <fieldset>
            <legend className="mb-3 text-label-l">Language</legend>
            <div role="radiogroup" aria-label="Language" className="flex flex-wrap gap-2">
              {(Object.keys(LOCALE_LABEL) as Locale[]).map((l) => (
                <Chip key={l} selected={v.locale === l} onClick={() => form.set("locale", l)}>
                  {LOCALE_LABEL[l]}
                </Chip>
              ))}
            </div>
          </fieldset>
          <OptionRow label="Published" hint="Turn off to hide it from patients" checked={v.is_active} onChange={(x) => form.set("is_active", x)} />
          {!initial && (
            <details className="rounded-lg bg-cream px-3.5 py-1">
              <summary className="flex min-h-10 cursor-pointer list-none items-center text-label-l text-brand-700 [&::-webkit-details-marker]:hidden">Replacing a hidden tip?</summary>
              <div className="pb-3">
                <Field label="Hidden tip's reference" hint="Hidden tips don't appear in the list. Enter its reference to overwrite it with the text above.">
                  {(id) => <Input id={id} maxLength={200} {...form.bind("hidden_id")} />}
                </Field>
              </div>
            </details>
          )}
          <ServiceError error={save.error || del.error} />
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
            <Button type="submit" icon={Save} loading={save.isPending}>
              {initial ? "Save changes" : "Publish tip"}
            </Button>
            <Button variant="ghost" onClick={onDone}>
              Cancel
            </Button>
            {initial && !confirmDelete && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={!online}
                className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-label-l text-urgent-red hover:bg-urgent-red-50 disabled:opacity-40"
              >
                <Trash2 className="size-4" aria-hidden /> Delete
              </button>
            )}
          </div>
          {confirmDelete && (
            <ConfirmAction title="Delete this tip?" confirmLabel="Delete tip" loading={del.isPending} onConfirm={() => del.mutate()} onCancel={() => setConfirmDelete(false)}>
              Patients won&apos;t see it any more, and it can&apos;t be brought back. To hide it for now, turn off &ldquo;Published&rdquo; instead.
            </ConfirmAction>
          )}
          {!online && <p className="text-label-m text-ink-600">You&apos;re offline. Reconnect to save.</p>}
          <FormGuard when={form.dirty && !save.isPending && !save.isSuccess} />
        </form>
      </Panel>
      <section className="flex flex-col gap-3 xl:sticky xl:top-6">
        <p className="flex items-center gap-2 text-label-l text-ink-600">
          <Eye className="size-4" aria-hidden /> As patients see it
        </p>
        <motion.article layout className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-[var(--shadow-elev-1)]">
          <span className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span key={t} className="rounded-full bg-mint px-2.5 py-0.5 text-label-m text-brand-900">
                {humanize(t)}
              </span>
            ))}
          </span>
          <p className="font-display text-[22px] leading-[1.2] font-[460]">{v.title || "Your title"}</p>
          <p className="line-clamp-6 text-body-m whitespace-pre-wrap">{v.body || "The tip text appears here."}</p>
          <p className="flex items-center gap-2 border-t border-line pt-3 text-body-m text-ink-600">
            <ShieldCheck className="size-4 text-brand-600" aria-hidden />
            {v.source_name || "Source"} · {v.published_date ? formatDate(v.published_date) : "date"}
          </p>
        </motion.article>
      </section>
    </div>
  )
}

export function AdminTips() {
  const view = useRecordParams()
  const query = useConsoleQuery("admin-tips", async () => {
    const tips: HealthTip[] = []
    let next: string | undefined
    do {
      const p = await serviceApi.tips({ limit: "50", next_token: next })
      tips.push(...p.tips)
      next = p.next_token
    } while (next)
    return tips
  })
  const all = [...(query.data ?? [])].sort((a, b) => b.published_date.localeCompare(a.published_date))
  const editing = view.params.get("edit") ?? ""
  const current = all.find((t) => t.tip_id === editing)
  const needle = view.q.trim().toLowerCase()
  const rows = all.filter((t) => (!view.filter || t.locale === view.filter) && (!needle || `${t.title} ${t.source_name} ${t.tags.join(" ")}`.toLowerCase().includes(needle)))
  const open = (id: string) => {
    view.setMany({ edit: id })
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  if (editing && (editing === "new" || current))
    return (
      <AppPage eyebrow="Administrator" title={current ? "Edit tip" : "New tip"} back={<Back onClick={() => view.set("edit", "")}>All tips</Back>}>
        <TipEditor key={editing} initial={current} onDone={() => view.set("edit", "")} />
      </AppPage>
    )

  return (
    <AppPage
      eyebrow="Administrator"
      title="Health tips"
      subtitle={query.data ? `${plural(all.length, "tip")} published. Patients read them on the Health tips page.` : undefined}
      actions={
        <>
          <UpdatedAt updated={query.dataUpdatedAt} refresh={() => void query.refetch()} loading={query.isFetching} />
          <Button icon={Plus} onClick={() => open("new")}>
            New tip
          </Button>
        </>
      }
    >
      <FilterTiles
        label="Filter by language"
        tiles={(Object.keys(LOCALE_LABEL) as Locale[]).map((l) => ({ key: l, label: LOCALE_LABEL[l], icon: BookOpen, count: all.filter((t) => t.locale === l).length }))}
        value={view.filter}
        onChange={(k) => view.set("filter", k)}
      />
      <ListSearch value={view.q} onChange={(v) => view.set("q", v)} placeholder="Search tips" total={all.length} />
      <ServiceError error={query.error} />
      {query.isPending ? (
        <Loading />
      ) : rows.length ? (
        <RecordList
          rows={rows}
          id={(t) => t.tip_id}
          selected=""
          onSelect={(t) => open(t.tip_id)}
          label="Health tips"
          render={(t) => (
            <span className="block">
              <span className="block text-title-m">{t.title}</span>
              <span className="mt-0.5 block text-body-m text-ink-600">
                {t.source_name} · {formatDate(t.published_date)} · {LOCALE_LABEL[t.locale]}
                {t.tags.length ? ` · ${t.tags.map(humanize).join(", ")}` : ""}
              </span>
            </span>
          )}
        />
      ) : (
        <EmptyState
          icon={BookOpen}
          title={view.filter || needle ? "No tips match." : "No tips published yet."}
          action={
            view.filter || needle ? (
              <Button variant="tonal" onClick={() => view.setMany({ filter: "", q: "" })}>
                Show all
              </Button>
            ) : (
              <Button icon={Plus} onClick={() => open("new")}>
                Write the first tip
              </Button>
            )
          }
        />
      )}
    </AppPage>
  )
}

// ---------- Visit requests ----------

const SLOT_ORDER: Record<Appointment["slot_label"], number> = { morning: 0, afternoon: 1, evening: 2 }

function dayLabel(iso: string, now: number) {
  const today = todayIso(new Date(now))
  const tomorrow = todayIso(new Date(now + 864e5))
  if (iso === today) return "Today"
  if (iso === tomorrow) return "Tomorrow"
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
}

function VisitRow({ a, facility }: { a: Appointment; facility?: Facility }) {
  const online = useOnline()
  const qc = useQueryClient()
  const confirm = useMutation({
    mutationFn: () => serviceApi.confirmAppointment(a.appointment_id),
    onSuccess: async () => {
      toast("Visit confirmed")
      await qc.invalidateQueries({ queryKey: ["admin-appointments"] })
    },
  })
  return (
    <motion.li variants={popIn} layout exit={{ opacity: 0, height: 0 }} className="flex flex-col gap-3 rounded-xl bg-white p-4 shadow-[var(--shadow-elev-1)] sm:flex-row sm:items-center">
      <span className="min-w-0 flex-1">
        <span className="block text-title-m">{facility?.name ?? "Facility not in the directory"}</span>
        <span className="block text-body-m text-ink-600">
          {SLOT_LABEL[a.slot_label]}
          {facility ? ` · ${facility.quarter}` : ""}
        </span>
        {a.note && <span className="mt-1 block text-body-m whitespace-pre-wrap text-ink-900">“{a.note}”</span>}
        {confirm.error != null && (
          <span className="mt-2 block">
            <ServiceError error={confirm.error} />
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {facility?.phone && (
          <a href={telHref(facility.phone)} className={iconButtonClass("tonal")} aria-label={`Call ${facility.name}`}>
            <Phone className="size-[18px]" aria-hidden />
          </a>
        )}
        <Button icon={Check} variant="secondary" disabled={!online} loading={confirm.isPending} onClick={() => confirm.mutate()}>
          Confirm
        </Button>
      </span>
    </motion.li>
  )
}

export function AdminAppointments() {
  const query = useConsoleQuery("admin-appointments", () => serviceApi.appointments("requested"))
  const facilities = useFacilities()
  const now = useNow()
  const all = [...(query.data?.appointments ?? [])].sort((a, b) => a.slot_date.localeCompare(b.slot_date) || SLOT_ORDER[a.slot_label] - SLOT_ORDER[b.slot_label])
  const days = [...new Set(all.map((a) => a.slot_date))]
  const soon = all.filter((a) => a.slot_date <= todayIso(new Date(now + 864e5))).length
  return (
    <AppPage
      eyebrow="Administrator"
      title="Visit requests"
      subtitle={
        query.data
          ? all.length
            ? `${plural(all.length, "request")} waiting${soon ? `, ${soon} for today or tomorrow` : ""}. Call the facility to arrange the slot, then confirm.`
            : "No visit requests are waiting."
          : undefined
      }
      actions={<UpdatedAt updated={query.dataUpdatedAt} refresh={() => void query.refetch()} loading={query.isFetching} />}
    >
      <ServiceError error={query.error} />
      {query.isPending ? (
        <Loading />
      ) : !all.length ? (
        <EmptyState icon={CalendarDays} title="No visit requests are waiting." body="Patients' requests appear here, soonest first." />
      ) : (
        <div className="flex flex-col gap-6">
          {days.map((d) => {
            const list = all.filter((a) => a.slot_date === d)
            return (
              <section key={d} className="grid gap-3 sm:grid-cols-[72px_minmax(0,1fr)] sm:gap-4">
                <div className="flex items-center gap-3 sm:flex-col sm:items-start">
                  <DateTile iso={d} />
                  <span className="sm:hidden">
                    <span className="block text-title-m">{dayLabel(d, now)}</span>
                    <span className="block text-body-m text-ink-600">{plural(list.length, "request")}</span>
                  </span>
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                  <h2 className="hidden text-title-m sm:block">
                    {dayLabel(d, now)} <span className="text-body-m font-normal text-ink-600">· {plural(list.length, "request")}</span>
                  </h2>
                  <ul className={cn("flex flex-col gap-2")}>
                    {list.map((a) => (
                      <VisitRow key={a.appointment_id} a={a} facility={facilities?.find((f) => f.facility_id === a.facility_id)} />
                    ))}
                  </ul>
                </div>
              </section>
            )
          })}
        </div>
      )}
      <PickHint icon={CalendarDays} title="Before you confirm">
        Confirming tells the patient their visit is booked. Only confirm once the facility has agreed the day and time.
      </PickHint>
    </AppPage>
  )
}
