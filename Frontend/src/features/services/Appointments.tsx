import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, motion } from "motion/react"
import { CalendarDays, Send, X } from "lucide-react"
import { serviceApi, type Appointment } from "@/api/services"
import { useAuth } from "@/auth/AuthProvider"
import { Button } from "@/design/components/Button"
import { ChoiceCard, Field, Input, Textarea } from "@/design/components/Field"
import { ConfirmAction, Feedback } from "@/design/components/Feedback"
import {
  ConnectionNote,
  DraftNote,
  FacilitySelect,
  ServiceCard,
  ServiceError,
  ServicePage,
  ServiceStatus,
  useServiceDraft,
} from "@/design/components/ServicePage"
import { EmptyState, PageSpinner } from "@/design/components/primitives"
import { popIn } from "@/design/motion"
import { useOnline, useVisible } from "@/lib/hooks"
import { formatDate } from "@/lib/format"
import { useFacilities } from "@/offline/facilities"

export default function Appointments() {
  const { session } = useAuth(),
    online = useOnline(),
    visible = useVisible(),
    qc = useQueryClient()
  const facilities = useFacilities()
  const today = new Date().toISOString().slice(0, 10)
  const draft = useServiceDraft("appointment", {
    facility_id: "",
    slot_date: "",
    slot_label: "morning" as Appointment["slot_label"],
    note: "",
  })
  const [confirm, setConfirm] = useState<string | null>(null)
  const list = useQuery({
    queryKey: ["appointments", session?.sub],
    queryFn: () => serviceApi.appointments(),
    refetchInterval: visible && online ? 20_000 : false,
  })
  const create = useMutation({
    mutationFn: () => serviceApi.requestAppointment(draft.value),
    onSuccess: async () => {
      draft.reset()
      await qc.invalidateQueries({ queryKey: ["appointments"] })
    },
  })
  const cancel = useMutation({
    mutationFn: serviceApi.cancelAppointment,
    onSuccess: async () => {
      setConfirm(null)
      await qc.invalidateQueries({ queryKey: ["appointments"] })
    },
  })
  const update = (change: Partial<typeof draft.value>) =>
    draft.setValue({ ...draft.value, ...change })
  const rows = [...(list.data?.appointments ?? [])].sort((a, b) =>
    a.slot_date.localeCompare(b.slot_date)
  )
  const past = (a: Appointment) =>
    a.slot_date < today || a.status === "cancelled"
  return (
    <ServicePage
      title="Appointments"
      subtitle="Request a visit. Your facility must confirm the date and time."
    >
      <ServiceCard title="Request a visit">
        <form
          className="flex flex-col items-start gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_320px]"
          onSubmit={(e) => {
            e.preventDefault()
            if (online && !create.isPending) create.mutate()
          }}
        >
          <div className="flex w-full min-w-0 flex-col gap-4">
            <FacilitySelect
              value={draft.value.facility_id}
              onChange={(facility_id) => update({ facility_id })}
            />
            <Field label="Visit date">
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  required
                  min={today}
                  value={draft.value.slot_date}
                  onChange={(e) => update({ slot_date: e.target.value })}
                />
              )}
            </Field>
            <fieldset>
              <legend className="mb-3 text-label-l">Preferred time</legend>
              <div className="grid gap-3">
                {(["morning", "afternoon", "evening"] as const).map((slot) => (
                  <ChoiceCard
                    key={slot}
                    title={slot.charAt(0).toUpperCase() + slot.slice(1)}
                    selected={draft.value.slot_label === slot}
                    onClick={() => update({ slot_label: slot })}
                  />
                ))}
              </div>
            </fieldset>
            <Field label="Note (optional)">
              {(id) => (
                <Textarea
                  id={id}
                  maxLength={2000}
                  value={draft.value.note}
                  onChange={(e) => update({ note: e.target.value })}
                />
              )}
            </Field>
          </div>
          <aside className="contents lg:sticky lg:top-6 lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
            <ConnectionNote />
            <DraftNote saved={draft.saved} />
            <ServiceError error={create.error} />
            {create.isSuccess && (
              <Feedback success>
                Visit requested. It is not confirmed yet.
              </Feedback>
            )}
            <Button
              type="submit"
              icon={Send}
              className="self-start"
              loading={create.isPending}
              disabled={
                !online ||
                !draft.value.facility_id ||
                !draft.value.slot_date ||
                draft.value.slot_date < today
              }
            >
              Request appointment
            </Button>
          </aside>
        </form>
      </ServiceCard>
      <ServiceError error={list.error || cancel.error} />
      {list.isError && (
        <Button variant="tonal" onClick={() => void list.refetch()}>
          Refresh appointments
        </Button>
      )}
      {list.isPending ? (
        <PageSpinner />
      ) : (
        <>
          {[false, true].map((isPast) => (
            <ServiceCard
              key={String(isPast)}
              title={isPast ? "Past & cancelled" : "Upcoming"}
            >
              {!rows.some((a) => past(a) === isPast) ? (
                <EmptyState
                  icon={CalendarDays}
                  title={
                    isPast
                      ? "No past appointments."
                      : "No upcoming appointments."
                  }
                />
              ) : (
                <ul className="flex flex-col gap-4">
                  <AnimatePresence initial={false}>
                    {rows
                      .filter((a) => past(a) === isPast)
                      .map((a) => (
                        <motion.li
                          layout
                          variants={popIn}
                          key={a.appointment_id}
                          className="flex min-w-0 flex-col gap-3 rounded-lg border border-line p-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="text-title-m">
                                {facilities?.find(
                                  (f) => f.facility_id === a.facility_id
                                )?.name ?? "Requested facility"}
                              </h3>
                              <p className="mt-1 text-body-m text-ink-600">
                                {formatDate(a.slot_date)} · {a.slot_label}
                              </p>
                            </div>
                            <ServiceStatus>{a.status}</ServiceStatus>
                          </div>
                          {a.note && (
                            <p className="text-body-m whitespace-pre-wrap">
                              {a.note}
                            </p>
                          )}
                          {!isPast &&
                            (confirm === a.appointment_id ? (
                              <ConfirmAction
                                title="Cancel this visit request?"
                                confirmLabel="Cancel appointment"
                                onConfirm={() =>
                                  cancel.mutate(a.appointment_id)
                                }
                                onCancel={() => setConfirm(null)}
                                loading={cancel.isPending}
                              >
                                The facility will see this appointment as
                                cancelled.
                              </ConfirmAction>
                            ) : (
                              <Button
                                variant="secondary"
                                icon={X}
                                className="self-start"
                                disabled={!online}
                                onClick={() => setConfirm(a.appointment_id)}
                              >
                                Cancel visit
                              </Button>
                            ))}
                        </motion.li>
                      ))}
                  </AnimatePresence>
                </ul>
              )}
            </ServiceCard>
          ))}
        </>
      )}
    </ServicePage>
  )
}
