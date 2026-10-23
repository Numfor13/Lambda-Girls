import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { BookOpen, Building2, CalendarDays, Save } from "lucide-react"
import { facilityApi } from "@/api/endpoints"
import { serviceApi, type FacilityInput, type TipInput } from "@/api/services"
import type { Capability, Facility, HealthTip, Locale } from "@/api/types"
import { Button } from "@/design/components/Button"
import { Chip, Field, Input, Select, Textarea } from "@/design/components/Field"
import { ConfirmAction, Feedback } from "@/design/components/Feedback"
import {
  ConsoleTable,
  PollStatus,
  useConsoleQuery,
} from "@/design/components/ConsoleData"
import {
  ConnectionNote,
  ServiceCard,
  ServiceError,
  ServicePage,
  ServiceStatus,
} from "@/design/components/ServicePage"
import { EmptyState, PageSpinner } from "@/design/components/primitives"
import { formatDate } from "@/lib/format"
import { useOnline } from "@/lib/hooks"
import { refreshFacilities, useFacilities } from "@/offline/facilities"

const CAPABILITIES: Capability[] = [
  "general",
  "maternity",
  "emergency",
  "laboratory",
  "pharmacy",
  "blood_bank",
  "x_ray",
  "dental",
  "eye_clinic",
]
function FacilityEditor({
  initial,
  onSaved,
}: {
  initial?: Facility
  onSaved: (f: Facility) => void
}) {
  const online = useOnline()
  const [value, setValue] = useState<FacilityInput>(
    initial ?? {
      name: "",
      region: "",
      quarter: "",
      address: "",
      phone: "",
      latitude: NaN,
      longitude: NaN,
      capabilities: ["general"],
      opening_hours: "",
      has_backup_power: false,
      accepts_csu_card: false,
      consultation_fee_xaf: NaN,
      is_active: true,
    }
  )
  const save = useMutation({
    mutationFn: () => {
      if (initial) return serviceApi.updateFacility(initial.facility_id, value)
      const { is_active: _, ...create } = value
      void _
      return serviceApi.createFacility(create)
    },
    onSuccess: async (f) => {
      await refreshFacilities().catch(() => undefined)
      onSaved(f)
    },
  })
  const edit = (v: Partial<FacilityInput>) => setValue({ ...value, ...v })
  return (
    <ServiceCard title={initial ? "Edit facility" : "Create facility"}>
      <form
        className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start"
        onSubmit={(e) => {
          e.preventDefault()
          if (online && !save.isPending) save.mutate()
        }}
      >
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-2">
            {(["name", "region", "quarter", "address", "phone"] as const).map(
              (k) => (
                <Field key={k} label={k.charAt(0).toUpperCase() + k.slice(1)}>
                  {(id) => (
                    <Input
                      id={id}
                      required
                      value={value[k]}
                      onChange={(e) => edit({ [k]: e.target.value })}
                      maxLength={300}
                    />
                  )}
                </Field>
              )
            )}
            {(["latitude", "longitude", "consultation_fee_xaf"] as const).map(
              (k) => (
                <Field
                  key={k}
                  label={
                    k === "consultation_fee_xaf"
                      ? "Consultation fee (FCFA)"
                      : k.charAt(0).toUpperCase() + k.slice(1)
                  }
                >
                  {(id) => (
                    <Input
                      id={id}
                      type="number"
                      required
                      step={k === "consultation_fee_xaf" ? "1" : "any"}
                      min={
                        k === "latitude" ? -90 : k === "longitude" ? -180 : 0
                      }
                      max={
                        k === "latitude"
                          ? 90
                          : k === "longitude"
                            ? 180
                            : undefined
                      }
                      value={Number.isFinite(value[k]) ? value[k] : ""}
                      onChange={(e) =>
                        edit({
                          [k]:
                            e.target.value === ""
                              ? NaN
                              : Number(e.target.value),
                        })
                      }
                    />
                  )}
                </Field>
              )
            )}
          </div>
          <Field label="Opening hours">
            {(id) => (
              <Input
                id={id}
                value={
                  typeof value.opening_hours === "string"
                    ? value.opening_hours
                    : JSON.stringify(value.opening_hours)
                }
                onChange={(e) => edit({ opening_hours: e.target.value })}
              />
            )}
          </Field>
          <fieldset>
            <legend className="mb-3 text-label-l">Capabilities</legend>
            <div className="flex flex-wrap gap-2">
              {CAPABILITIES.map((c) => (
                <Chip
                  key={c}
                  selected={value.capabilities.includes(c)}
                  onClick={() =>
                    edit({
                      capabilities: value.capabilities.includes(c)
                        ? value.capabilities.filter((v) => v !== c)
                        : [...value.capabilities, c],
                    })
                  }
                >
                  {c.replaceAll("_", " ")}
                </Chip>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap gap-3">
            <Chip
              selected={value.has_backup_power}
              onClick={() =>
                edit({ has_backup_power: !value.has_backup_power })
              }
            >
              Backup power
            </Chip>
            <Chip
              selected={value.accepts_csu_card}
              onClick={() =>
                edit({ accepts_csu_card: !value.accepts_csu_card })
              }
            >
              Accepts CSU card
            </Chip>
            {initial && (
              <Chip
                selected={value.is_active}
                onClick={() => edit({ is_active: !value.is_active })}
              >
                Active in directory
              </Chip>
            )}
          </div>
        </div>
        <aside className="contents lg:sticky lg:top-6 lg:flex lg:flex-col lg:gap-4">
          <ConnectionNote />
          <ServiceError error={save.error} />
          <Button
            icon={Save}
            type="submit"
            className="self-start"
            disabled={
              !online ||
              !value.capabilities.length ||
              !Number.isFinite(value.latitude) ||
              !Number.isFinite(value.longitude) ||
              !Number.isFinite(value.consultation_fee_xaf)
            }
            loading={save.isPending}
          >
            Save facility
          </Button>
        </aside>
      </form>
    </ServiceCard>
  )
}
export default function AdminFacilities() {
  const [selected, setSelected] = useState<Facility | null>(null),
    [creating, setCreating] = useState(false),
    [search, setSearch] = useState(""),
    [lookup, setLookup] = useState(""),
    [lookupId, setLookupId] = useState(""),
    [saved, setSaved] = useState<Facility | null>(null)
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
  const byId = useQuery({
    queryKey: ["admin-facility-id", lookupId],
    queryFn: () => facilityApi.get(lookupId),
    enabled: Boolean(lookupId),
  })
  const qc = useQueryClient()
  const afterSave = (f: Facility) => {
    setSaved(f)
    setCreating(false)
    setSelected(null)
    setLookupId("")
    void qc.invalidateQueries({ queryKey: ["admin-facilities"] })
  }
  const rows =
    query.data?.filter((f) =>
      f.name.toLowerCase().includes(search.toLowerCase())
    ) ?? []
  return (
    <ServicePage
      title="Facility administration"
      subtitle="Maintain facility details and directory availability."
    >
      <PollStatus
        updated={query.dataUpdatedAt}
        refresh={() => void query.refetch()}
        loading={query.isFetching}
      />
      <ServiceError error={query.error} />
      {saved && (
        <Feedback success>
          Saved {saved.name}. Reference: {saved.facility_id}
        </Feedback>
      )}
      {!creating && !selected && !byId.data && (
        <ServiceCard title="Find or create">
          <Field label="Search facilities">
            {(id) => (
              <Input
                id={id}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            )}
          </Field>
          <Button
            icon={Building2}
            className="self-start"
            variant="tonal"
            onClick={() => {
              setCreating(true)
              setSelected(null)
              setLookupId("")
            }}
          >
            New facility
          </Button>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              setLookupId(lookup.trim())
              setSelected(null)
              setCreating(false)
            }}
          >
            <Field
              label="Open a known facility ID"
              hint="Only active facilities can be loaded. The backend cannot read inactive facilities, even for administrators."
            >
              {(id) => (
                <Input
                  id={id}
                  value={lookup}
                  required
                  onChange={(e) => setLookup(e.target.value)}
                />
              )}
            </Field>
            <Button variant="secondary" type="submit" className="self-start">
              Look up facility
            </Button>
          </form>
          <ServiceError error={byId.error} />
        </ServiceCard>
      )}
      {(creating || selected || byId.data) && (
        <>
          <FacilityEditor
            key={selected?.facility_id ?? byId.data?.facility_id ?? "new"}
            initial={selected ?? byId.data}
            onSaved={afterSave}
          />
          <Button
            className="self-start"
            variant="secondary"
            onClick={() => {
              setCreating(false)
              setSelected(null)
              setLookupId("")
            }}
          >
            Close editor
          </Button>
        </>
      )}
      {query.isPending ? (
        <PageSpinner />
      ) : !rows.length ? (
        <EmptyState icon={Building2} title="No matching facilities." />
      ) : (
        <ConsoleTable caption="Facilities" columns={["Facility", "Edit"]}>
          {rows.map((f) => (
            <tr key={f.facility_id}>
              <td className="p-4">
                <h2 className="text-title-m">{f.name}</h2>
                <p className="mt-2 text-ink-600">
                  {f.quarter} · {f.region}
                </p>
              </td>
              <td className="p-4">
                <Button
                  variant="tonal"
                  onClick={() => {
                    setSelected(f)
                    setCreating(false)
                    setLookupId("")
                    window.scrollTo({ top: 0, behavior: "instant" })
                  }}
                >
                  Edit
                </Button>
              </td>
            </tr>
          ))}
        </ConsoleTable>
      )}
    </ServicePage>
  )
}
function TipEditor({
  initial,
  onSaved,
}: {
  initial?: HealthTip
  onSaved: (tip: HealthTip) => void
}) {
  const online = useOnline(),
    [knownId, setKnownId] = useState("")
  const [value, setValue] = useState<TipInput>(
    initial ?? {
      title: "",
      body: "",
      source_name: "",
      source_url: null,
      published_date: "",
      locale: "en",
      tags: [],
      is_active: true,
    }
  )
  const save = useMutation({
    mutationFn: () =>
      initial || knownId.trim()
        ? serviceApi.updateTip(initial?.tip_id ?? knownId.trim(), value)
        : serviceApi.createTip(value),
    onSuccess: onSaved,
  })
  const edit = (v: Partial<TipInput>) => setValue({ ...value, ...v })
  return (
    <ServiceCard title={initial ? "Edit health tip" : "Write a sourced tip"}>
      <form
        className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start"
        onSubmit={(e) => {
          e.preventDefault()
          if (online && !save.isPending) save.mutate()
        }}
      >
        <div className="flex min-w-0 flex-col gap-4">
          {!initial && (
            <Field
              label="Existing tip ID (optional)"
              hint="Leave blank to create. To replace an inactive tip by ID, enter its full content below; current content cannot be loaded by ID."
            >
              {(id) => (
                <Input
                  id={id}
                  value={knownId}
                  onChange={(e) => setKnownId(e.target.value)}
                />
              )}
            </Field>
          )}
          {(["title", "source_name"] as const).map((k) => (
            <Field key={k} label={k === "title" ? "Title" : "Source name"}>
              {(id) => (
                <Input
                  id={id}
                  required
                  value={value[k]}
                  onChange={(e) => edit({ [k]: e.target.value })}
                />
              )}
            </Field>
          ))}
          <Field label="Tip body">
            {(id) => (
              <Textarea
                id={id}
                required
                value={value.body}
                onChange={(e) => edit({ body: e.target.value })}
                rows={6}
              />
            )}
          </Field>
          <Field label="Source URL (optional)">
            {(id) => (
              <Input
                id={id}
                type="url"
                pattern="https?://.*"
                value={value.source_url ?? ""}
                onChange={(e) => edit({ source_url: e.target.value || null })}
              />
            )}
          </Field>
          <Field label="Published date">
            {(id) => (
              <Input
                id={id}
                type="date"
                required
                value={value.published_date}
                onChange={(e) => edit({ published_date: e.target.value })}
              />
            )}
          </Field>
          <Field label="Language">
            {(id) => (
              <Select
                id={id}
                value={value.locale}
                onChange={(e) => edit({ locale: e.target.value as Locale })}
              >
                <option value="en">English</option>
                <option value="fr">Français</option>
                <option value="pid">Pidgin</option>
              </Select>
            )}
          </Field>
          <Field label="Tags, separated by commas">
            {(id) => (
              <Input
                id={id}
                value={value.tags.join(",")}
                onChange={(e) => edit({ tags: e.target.value.split(",") })}
              />
            )}
          </Field>
          <Chip
            selected={value.is_active}
            onClick={() => edit({ is_active: !value.is_active })}
          >
            Active in public feed
          </Chip>
        </div>
        <aside className="contents lg:sticky lg:top-6 lg:flex lg:flex-col lg:gap-4">
          <ConnectionNote />
          <ServiceError error={save.error} />
          <Button
            type="submit"
            icon={Save}
            className="self-start"
            disabled={!online}
            loading={save.isPending}
          >
            Save tip
          </Button>
        </aside>
      </form>
    </ServiceCard>
  )
}
export function AdminTips() {
  const [selected, setSelected] = useState<HealthTip | null>(null),
    [editing, setEditing] = useState(false),
    [remove, setRemove] = useState<string | null>(null),
    [saved, setSaved] = useState<HealthTip | null>(null)
  const online = useOnline(),
    qc = useQueryClient()
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
  const del = useMutation({
    mutationFn: serviceApi.deleteTip,
    onSuccess: async () => {
      setRemove(null)
      setSaved(null)
      await qc.invalidateQueries({ queryKey: ["admin-tips"] })
    },
  })
  return (
    <ServicePage
      title="Health-tip administration"
      subtitle="Publish sourced information. Only active tips appear in this feed."
    >
      <PollStatus
        updated={query.dataUpdatedAt}
        refresh={() => void query.refetch()}
        loading={query.isFetching}
      />
      <ServiceError error={query.error || del.error} />
      <Button
        icon={BookOpen}
        variant="tonal"
        className="self-start"
        onClick={() => {
          setEditing(true)
          setSelected(null)
        }}
      >
        New tip / edit by ID
      </Button>
      {saved && (
        <Feedback success>
          Saved {saved.title}. Keep its ID to edit it later: {saved.tip_id}
        </Feedback>
      )}
      {editing && (
        <>
          <TipEditor
            key={selected?.tip_id ?? "new"}
            initial={selected ?? undefined}
            onSaved={(tip) => {
              setSaved(tip)
              setEditing(false)
              void qc.invalidateQueries({ queryKey: ["admin-tips"] })
            }}
          />
          <Button
            className="self-start"
            variant="secondary"
            onClick={() => setEditing(false)}
          >
            Close editor
          </Button>
        </>
      )}
      {query.isPending ? (
        <PageSpinner />
      ) : !query.data?.length ? (
        <EmptyState icon={BookOpen} title="No active tips." />
      ) : (
        <ul className="flex flex-col gap-4">
          {query.data.map((t) => (
            <li
              className="flex flex-col items-start gap-4 rounded-xl bg-white p-5 shadow-[var(--shadow-elev-1)]"
              key={t.tip_id}
            >
              <h2 className="text-title-l">{t.title}</h2>
              <p className="text-body-m text-ink-600">
                {t.source_name} · {formatDate(t.published_date)} · {t.locale}
              </p>
              <p className="text-label-m break-all">ID: {t.tip_id}</p>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="tonal"
                  onClick={() => {
                    setSelected(t)
                    setEditing(true)
                    window.scrollTo({ top: 0, behavior: "instant" })
                  }}
                >
                  Edit tip
                </Button>
                <Button
                  variant="secondary"
                  disabled={!online}
                  onClick={() => setRemove(t.tip_id)}
                >
                  Delete tip
                </Button>
              </div>
              {remove === t.tip_id && (
                <ConfirmAction
                  title="Delete this tip?"
                  confirmLabel="Delete tip"
                  loading={del.isPending}
                  onConfirm={() => del.mutate(t.tip_id)}
                  onCancel={() => setRemove(null)}
                >
                  This removes the tip from the service.
                </ConfirmAction>
              )}
            </li>
          ))}
        </ul>
      )}
    </ServicePage>
  )
}
export function AdminAppointments() {
  const query = useConsoleQuery("admin-appointments", () =>
      serviceApi.appointments("requested")
    ),
    facilities = useFacilities(),
    qc = useQueryClient(),
    online = useOnline()
  const confirm = useMutation({
    mutationFn: serviceApi.confirmAppointment,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-appointments"] }),
    onError: () => void query.refetch(),
  })
  return (
    <ServicePage
      title="Confirm appointments"
      subtitle="Review requested visits and confirm only after arranging the slot with the facility."
    >
      <PollStatus
        updated={query.dataUpdatedAt}
        refresh={() => void query.refetch()}
        loading={query.isFetching}
      />
      <ServiceError error={query.error || confirm.error} />
      {confirm.isSuccess && <Feedback success>Appointment confirmed.</Feedback>}
      {query.isPending ? (
        <PageSpinner />
      ) : !query.data?.appointments.length ? (
        <EmptyState
          icon={CalendarDays}
          title="No appointments waiting for confirmation."
        />
      ) : (
        <ConsoleTable
          caption="Appointments to confirm"
          columns={["Visit", "Action"]}
        >
          {query.data.appointments.map((a) => (
            <tr key={a.appointment_id}>
              <td className="p-4 align-top">
                <h2 className="text-title-m">
                  {facilities?.find((f) => f.facility_id === a.facility_id)
                    ?.name ?? "Requested facility"}
                </h2>
                <p className="mt-2">
                  {formatDate(a.slot_date)} · {a.slot_label}
                </p>
                <div className="mt-3">
                  <ServiceStatus>{a.status}</ServiceStatus>
                </div>
                {a.note && <p className="mt-3 whitespace-pre-wrap">{a.note}</p>}
              </td>
              <td className="p-4 align-top">
                <Button
                  variant="tonal"
                  disabled={!online}
                  loading={
                    confirm.isPending && confirm.variables === a.appointment_id
                  }
                  onClick={() => confirm.mutate(a.appointment_id)}
                >
                  Confirm
                </Button>
              </td>
            </tr>
          ))}
        </ConsoleTable>
      )}
      <ConnectionNote />
    </ServicePage>
  )
}
