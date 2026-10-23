import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ClipboardList, MapPin, Phone, Search, Send } from "lucide-react"
import { request } from "@/api/client"
import { serviceApi, LAB_STEPS, type CallbackRequest } from "@/api/services"
import type { Facility } from "@/api/types"
import { Button, ButtonA } from "@/design/components/Button"
import { Field, Input, Select, Textarea } from "@/design/components/Field"
import { Feedback } from "@/design/components/Feedback"
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
import { UrgencyBadge } from "@/design/components/UrgencyBadge"
import { formatDateTime, telHref } from "@/lib/format"
import { useOnline } from "@/lib/hooks"
import { useFacilities } from "@/offline/facilities"
import { LabTimeline } from "@/features/services/Labs"

function CallbackAction({ item }: { item: CallbackRequest }) {
  const [note, setNote] = useState(""),
    online = useOnline(),
    qc = useQueryClient()
  const handle = useMutation({
    mutationFn: () => serviceApi.handleCallback(item.request_id, note),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["operator-callbacks"] }),
  })
  return (
    <div className="flex flex-col gap-3">
      <Field label="Handler note (optional)">
        {(id) => (
          <Textarea
            id={id}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
          />
        )}
      </Field>
      <Button
        variant="tonal"
        disabled={!online}
        loading={handle.isPending}
        onClick={() => handle.mutate()}
      >
        Mark handled
      </Button>
      <ServiceError error={handle.error} />
    </div>
  )
}
export default function OperatorCallbacks() {
  const query = useConsoleQuery("operator-callbacks", serviceApi.callbacks)
  const rows = [...(query.data?.callbacks ?? [])].sort(
    (a, b) => a.created_at - b.created_at
  )
  return (
    <ServicePage
      title="Nurse callbacks"
      subtitle="Pending requests, longest waiting first."
    >
      <PollStatus
        updated={query.dataUpdatedAt}
        refresh={() => void query.refetch()}
        loading={query.isFetching}
      />
      <ServiceError error={query.error} />
      {query.isPending ? (
        <PageSpinner />
      ) : !rows.length ? (
        <EmptyState icon={ClipboardList} title="No pending callbacks." />
      ) : (
        <ConsoleTable
          columns={["Request", "Action"]}
          caption="Pending nurse callbacks"
        >
          {rows.map((c) => (
            <tr key={c.request_id}>
              <td className="p-4 align-top">
                <div className="flex flex-col items-start gap-3">
                  <UrgencyBadge urgency={c.urgency} short />
                  <p className="text-title-m break-words">{c.phone}</p>
                  <p>{formatDateTime(c.created_at)}</p>
                  <ButtonA variant="tonal" icon={Phone} href={telHref(c.phone)}>
                    Call
                  </ButtonA>
                </div>
              </td>
              <td className="min-w-0 p-4 align-top">
                <CallbackAction item={c} />
              </td>
            </tr>
          ))}
        </ConsoleTable>
      )}
      <ConnectionNote />
    </ServicePage>
  )
}
export function OperatorDispatch() {
  const online = useOnline()
  const [capability, setCapability] = useState(""),
    [term, setTerm] = useState(""),
    [facility, setFacility] = useState(""),
    [note, setNote] = useState("")
  const query = useConsoleQuery(
    `dispatch-facilities:${capability}`,
    async () => {
      const facilities: Facility[] = []
      let lastKey: string | undefined
      do {
        const page = await request<{
          facilities: Facility[]
          next_key: string | null
        }>("facility", "/facilities", {
          auth: false,
          query: { capability: capability || undefined, last_key: lastKey },
        })
        facilities.push(...page.facilities)
        lastKey = page.next_key ?? undefined
      } while (lastKey)
      return { facilities }
    }
  )
  const rows =
    query.data?.facilities.filter(
      (f) =>
        f.name.toLowerCase().includes(term.toLowerCase()) ||
        f.quarter.toLowerCase().includes(term.toLowerCase())
    ) ?? []
  const send = useMutation({
    mutationFn: () => serviceApi.dispatch({ facility_id: facility, note }),
    onSuccess: () => {
      setNote("")
      setFacility("")
    },
  })
  return (
    <ServicePage
      title="Dispatch log"
      subtitle="Find a facility, then record the dispatch you arranged."
    >
      <ServiceCard title="Facility search">
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          <Field label="Capability">
            {(id) => (
              <Select
                id={id}
                value={capability}
                onChange={(e) => {
                  setCapability(e.target.value)
                  setFacility("")
                }}
              >
                <option value="">All capabilities</option>
                {[
                  "general",
                  "emergency",
                  "maternity",
                  "laboratory",
                  "blood_bank",
                ].map((c) => (
                  <option key={c} value={c}>
                    {c.replaceAll("_", " ")}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Search name or quarter">
            {(id) => (
              <Input
                id={id}
                value={term}
                onChange={(e) => {
                  setTerm(e.target.value)
                  setFacility("")
                }}
              />
            )}
          </Field>
        </div>
        <PollStatus
          updated={query.dataUpdatedAt}
          refresh={() => void query.refetch()}
          loading={query.isFetching}
        />
        <ServiceError error={query.error} />
        <form
          className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start"
          onSubmit={(e) => {
            e.preventDefault()
            if (online && !send.isPending) send.mutate()
          }}
        >
          <div className="flex min-w-0 flex-col gap-4">
            <Field label="Destination facility">
              {(id) => (
                <Select
                  id={id}
                  value={facility}
                  onChange={(e) => setFacility(e.target.value)}
                  required
                >
                  <option value="">Choose a destination</option>
                  {rows.map((f) => (
                    <option value={f.facility_id} key={f.facility_id}>
                      {f.name} · {f.quarter}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Dispatch note (optional)">
              {(id) => (
                <Textarea
                  id={id}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={2000}
                />
              )}
            </Field>
          </div>
          <aside className="contents lg:sticky lg:top-6 lg:flex lg:flex-col lg:gap-4">
            <ConnectionNote />
            <ServiceError error={send.error} />
            {send.isSuccess && (
              <Feedback success>
                Dispatch logged. Reference: {send.data.log_id}
              </Feedback>
            )}
            <Button
              icon={Send}
              type="submit"
              className="self-start"
              disabled={!online || !facility}
              loading={send.isPending}
            >
              Save dispatch log
            </Button>
          </aside>
        </form>
      </ServiceCard>
    </ServicePage>
  )
}
export function OperatorEmergencies() {
  const query = useConsoleQuery("operator-emergencies", serviceApi.emergencies)
  return (
    <ServicePage
      title="Shared emergency locations"
      subtitle="Live locations shared in the last 24 hours. Follow your emergency-response procedures."
    >
      <PollStatus
        updated={query.dataUpdatedAt}
        refresh={() => void query.refetch()}
        loading={query.isFetching}
      />
      <ServiceError error={query.error} />
      {query.isPending ? (
        <PageSpinner />
      ) : !query.data?.emergencies.length ? (
        <EmptyState icon={MapPin} title="No active shared locations." />
      ) : (
        <ConsoleTable
          columns={["Shared location", "Time"]}
          caption="Active emergency locations"
        >
          {query.data.emergencies.map((e) => (
            <tr key={e.emergency_id}>
              <td className="p-4 align-top">
                <div className="flex flex-col items-start gap-3">
                  <p className="text-title-m">
                    {e.latitude.toFixed(5)}, {e.longitude.toFixed(5)}
                  </p>
                  <p className="text-label-m break-all">
                    Reference {e.emergency_id}
                  </p>
                  <ButtonA
                    variant="tonal"
                    icon={MapPin}
                    href={`https://www.google.com/maps/search/?api=1&query=${e.latitude},${e.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open map
                  </ButtonA>
                  <p className="text-label-m text-ink-600">
                    Opening the map sends these coordinates to Google Maps.
                  </p>
                </div>
              </td>
              <td className="p-4 align-top">
                <p>{formatDateTime(e.timestamp)}</p>
                <p className="mt-2 text-ink-600">
                  Expires {formatDateTime(e.ttl * 1000)}
                </p>
              </td>
            </tr>
          ))}
        </ConsoleTable>
      )}
    </ServicePage>
  )
}
export function OperatorBlood() {
  const query = useConsoleQuery("operator-blood", serviceApi.blood),
    facilities = useFacilities()
  return (
    <ServicePage
      title="Blood requests"
      subtitle="Pending clinical requests, most urgent first."
    >
      <PollStatus
        updated={query.dataUpdatedAt}
        refresh={() => void query.refetch()}
        loading={query.isFetching}
      />
      <ServiceError error={query.error} />
      {query.isPending ? (
        <PageSpinner />
      ) : !query.data?.blood_requests.length ? (
        <EmptyState icon={ClipboardList} title="No pending blood requests." />
      ) : (
        <ConsoleTable
          columns={["Request", "Facility"]}
          caption="Pending blood requests"
        >
          {query.data.blood_requests.map((b) => (
            <tr key={b.request_id}>
              <td className="p-4 align-top">
                <div className="flex flex-col items-start gap-3">
                  <UrgencyBadge urgency={b.urgency} short />
                  <h2 className="text-title-l">
                    {b.blood_type} · {b.units} unit(s)
                  </h2>
                  <p>{formatDateTime(b.created_at)}</p>
                  <ServiceStatus>{b.status}</ServiceStatus>
                </div>
              </td>
              <td className="p-4 align-top">
                {facilities?.find(
                  (f) => f.facility_id === b.requesting_facility_id
                )?.name ?? "Requesting facility"}
              </td>
            </tr>
          ))}
        </ConsoleTable>
      )}
      <Feedback>
        Use your operational process to coordinate availability. This service
        does not provide a fulfilment status update.
      </Feedback>
    </ServicePage>
  )
}
export function OperatorLabs() {
  const [entry, setEntry] = useState(""),
    [id, setId] = useState(""),
    [summary, setSummary] = useState("")
  const online = useOnline(),
    qc = useQueryClient()
  const query = useConsoleQuery(
    `staff-lab:${id}`,
    () => serviceApi.lab(id),
    Boolean(id)
  )
  const next = query.data
    ? LAB_STEPS[LAB_STEPS.indexOf(query.data.status) + 1]
    : undefined
  const update = useMutation({
    mutationFn: () =>
      serviceApi.updateLab(id, {
        status: next!,
        ...(next === "results_ready" ? { result_summary: summary } : {}),
      }),
    onSuccess: async () => {
      setSummary("")
      await qc.invalidateQueries({ queryKey: [`staff-lab:${id}`] })
    },
    onError: () => void query.refetch(),
  })
  return (
    <ServicePage
      title="Lab status"
      subtitle="Open a request by its ID. Operators cannot browse all lab requests."
    >
      <ServiceCard title="Find a request">
        <form
          className="flex flex-col gap-4 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault()
            setId(entry.trim())
            update.reset()
          }}
        >
          <div className="min-w-0 flex-1">
            <Field label="Lab request ID">
              {(field) => (
                <Input
                  id={field}
                  value={entry}
                  onChange={(e) => setEntry(e.target.value)}
                  required
                />
              )}
            </Field>
          </div>
          <Button
            icon={Search}
            type="submit"
            disabled={!online || !entry.trim()}
          >
            Open request
          </Button>
        </form>
      </ServiceCard>
      {id && (
        <>
          <PollStatus
            updated={query.dataUpdatedAt}
            refresh={() => void query.refetch()}
            loading={query.isFetching}
          />
          <ServiceError error={query.error} />
          {query.isPending ? (
            <PageSpinner />
          ) : (
            query.data && (
              <ServiceCard title={query.data.test_type}>
                <p className="text-body-m break-all">{query.data.request_id}</p>
                <LabTimeline lab={query.data} />
                {query.data.result_summary && (
                  <p className="text-body-l whitespace-pre-wrap">
                    {query.data.result_summary}
                  </p>
                )}
                {next && (
                  <form
                    className="flex flex-col items-start gap-4"
                    onSubmit={(e) => {
                      e.preventDefault()
                      if (online && !update.isPending) update.mutate()
                    }}
                  >
                    {next === "results_ready" && (
                      <Field label="Result summary (optional)">
                        {(field) => (
                          <Textarea
                            id={field}
                            value={summary}
                            onChange={(e) => setSummary(e.target.value)}
                            maxLength={8000}
                          />
                        )}
                      </Field>
                    )}
                    <Button
                      type="submit"
                      variant="tonal"
                      loading={update.isPending}
                      disabled={!online}
                    >
                      Mark {next.replaceAll("_", " ")}
                    </Button>
                  </form>
                )}
                <ServiceError error={update.error} />
                {update.isSuccess && (
                  <Feedback success>Lab status updated.</Feedback>
                )}
                <ConnectionNote />
              </ServiceCard>
            )
          )}
        </>
      )}
    </ServicePage>
  )
}
