import { useMutation } from "@tanstack/react-query"
import { Droplet, Minus, Phone, Plus, Send } from "lucide-react"
import { BLOOD_TYPES, serviceApi, type BloodRequest } from "@/api/services"
import { Button, IconButton, IconLink } from "@/design/components/Button"
import { Chip } from "@/design/components/Field"
import { Feedback } from "@/design/components/Feedback"
import { UrgencyBadge } from "@/design/components/UrgencyBadge"
import {
  ConnectionNote,
  DraftNote,
  FacilitySelect,
  ServiceCard,
  ServiceError,
  ServicePage,
  useServiceDraft,
} from "@/design/components/ServicePage"
import { telHref } from "@/lib/format"
import { useOnline } from "@/lib/hooks"

export default function Blood() {
  const online = useOnline()
  const draft = useServiceDraft("blood", {
    requesting_facility_id: "",
    blood_type: "O+" as BloodRequest["blood_type"],
    units: 1,
    urgency: "AMBER" as BloodRequest["urgency"],
  })
  const send = useMutation({
    mutationFn: () => serviceApi.requestBlood(draft.value),
  })
  const update = (change: Partial<typeof draft.value>) =>
    draft.setValue({ ...draft.value, ...change })
  return (
    <ServicePage
      title="Blood request"
      subtitle="Use the blood type, units and urgency given by the treating clinician."
    >
      <ServiceCard title={send.isSuccess ? "Request sent" : "Request blood"}>
        {send.isSuccess ? (
          <>
            <Feedback success>
              {send.data.units} unit(s) of {send.data.blood_type} requested.
              This does not confirm availability.
            </Feedback>
            <p className="text-body-m break-all">
              Request ID: {send.data.request_id}
            </p>
            <h3 className="text-title-l">Blood-bank contacts</h3>
            {!send.data.blood_bank_facilities.length ? (
              <Feedback>
                No blood-bank contacts were returned. Contact the treating
                facility directly.
              </Feedback>
            ) : (
              <ul className="flex flex-col gap-3">
                {send.data.blood_bank_facilities.map((f) => (
                  <li
                    key={f.facility_id}
                    className="flex items-center gap-3 rounded-lg border border-line p-4"
                  >
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-mint text-brand-700">
                      <Droplet aria-hidden className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-title-m">{f.name}</p>
                      <p className="text-body-m text-ink-600">
                        Call to check availability
                      </p>
                    </div>
                    {f.phone && (
                      <IconLink
                        variant="tonal"
                        icon={Phone}
                        label={`Call ${f.name}`}
                        href={telHref(f.phone)}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
            <Button
              variant="tonal"
              className="self-start"
              onClick={() => {
                send.reset()
                draft.reset()
              }}
            >
              New request
            </Button>
          </>
        ) : (
          <form
            className="flex flex-col items-start gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_320px]"
            onSubmit={(e) => {
              e.preventDefault()
              if (online && !send.isPending) send.mutate()
            }}
          >
            <div className="flex w-full min-w-0 flex-col gap-5">
              <FacilitySelect
                value={draft.value.requesting_facility_id}
                onChange={(requesting_facility_id) =>
                  update({ requesting_facility_id })
                }
              />
              <fieldset>
                <legend className="mb-3 text-label-l">Blood type</legend>
                <div className="flex flex-wrap gap-2">
                  {BLOOD_TYPES.map((t) => (
                    <Chip
                      key={t}
                      selected={draft.value.blood_type === t}
                      onClick={() => update({ blood_type: t })}
                    >
                      {t}
                    </Chip>
                  ))}
                </div>
              </fieldset>
              <div>
                <p className="mb-3 text-label-l" id="blood-units">
                  Units
                </p>
                <div
                  className="flex items-center gap-4"
                  role="group"
                  aria-labelledby="blood-units"
                >
                  <IconButton
                    variant="tonal"
                    icon={Minus}
                    label="Fewer units"
                    disabled={draft.value.units <= 1}
                    onClick={() =>
                      update({ units: Math.max(1, draft.value.units - 1) })
                    }
                  />
                  <output className="text-headline-m" aria-live="polite">
                    {draft.value.units}
                  </output>
                  <IconButton
                    variant="tonal"
                    icon={Plus}
                    label="More units"
                    disabled={draft.value.units >= 20}
                    onClick={() =>
                      update({ units: Math.min(20, draft.value.units + 1) })
                    }
                  />
                </div>
                <p className="mt-2 text-body-m text-ink-600">1–20 units</p>
              </div>
              <fieldset>
                <legend className="mb-3 text-label-l">Clinical urgency</legend>
                <div className="flex flex-wrap gap-2">
                  {(["RED", "AMBER", "GREEN"] as const).map((u) => (
                    <Button
                      key={u}
                      variant={
                        draft.value.urgency === u ? "tonal" : "secondary"
                      }
                      aria-pressed={draft.value.urgency === u}
                      onClick={() => update({ urgency: u })}
                    >
                      <UrgencyBadge urgency={u} short />
                    </Button>
                  ))}
                </div>
              </fieldset>
            </div>
            <aside className="contents lg:sticky lg:top-6 lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
              <ConnectionNote />
              <DraftNote saved={draft.saved} />
              <ServiceError error={send.error} />
              <Button
                type="submit"
                icon={Send}
                className="self-start"
                disabled={!online || !draft.value.requesting_facility_id}
                loading={send.isPending}
              >
                Send blood request
              </Button>
            </aside>
          </form>
        )}
      </ServiceCard>
    </ServicePage>
  )
}
