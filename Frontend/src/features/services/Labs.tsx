import { useMutation, useQuery } from "@tanstack/react-query"
import { useNavigate, useParams } from "react-router-dom"
import { motion } from "motion/react"
import { Check, FlaskConical, Send } from "lucide-react"
import { LAB_STEPS, serviceApi, type LabRequest } from "@/api/services"
import { useAuth } from "@/auth/AuthProvider"
import { Button, ButtonLink } from "@/design/components/Button"
import { Field, Input, Textarea } from "@/design/components/Field"
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
import { SPRING } from "@/design/motion"
import { formatDateTime } from "@/lib/format"
import { useOnline, useVisible } from "@/lib/hooks"
import { useFacilities } from "@/offline/facilities"

export function LabTimeline({ lab }: { lab: LabRequest }) {
  const step = LAB_STEPS.indexOf(lab.status)
  return (
    <ol aria-label="Lab request progress" className="flex flex-col gap-4">
      {LAB_STEPS.map((s, i) => (
        <li
          key={s}
          aria-current={i === step ? "step" : undefined}
          className="flex items-center gap-4"
        >
          <motion.span
            initial={{ scale: 0.8 }}
            animate={{ scale: i === step ? 1.08 : 1 }}
            transition={SPRING.bouncy}
            className={`flex size-12 shrink-0 items-center justify-center rounded-full text-label-l ${i <= step ? "bg-brand-700 text-white" : "bg-cream text-ink-600"}`}
          >
            {i < step ? <Check className="size-5" aria-hidden /> : i + 1}
          </motion.span>
          <span
            className={`text-title-m capitalize ${i > step ? "text-ink-600" : "text-brand-900"}`}
          >
            {s.replaceAll("_", " ")}
            {i === step && <span className="sr-only"> · Current status</span>}
          </span>
        </li>
      ))}
    </ol>
  )
}
export default function Labs() {
  const { session } = useAuth(),
    online = useOnline(),
    visible = useVisible(),
    navigate = useNavigate()
  const draft = useServiceDraft("lab", {
    test_type: "",
    facility_id: "",
    collection_address: "",
  })
  const list = useQuery({
    queryKey: ["labs", session?.sub],
    queryFn: serviceApi.labs,
    refetchInterval: online && visible ? 20_000 : false,
  })
  const create = useMutation({
    mutationFn: () => serviceApi.requestLab(draft.value),
    onSuccess: (l) => {
      draft.reset()
      navigate(`/app/labs/${l.request_id}`)
    },
  })
  const update = (v: Partial<typeof draft.value>) =>
    draft.setValue({ ...draft.value, ...v })
  return (
    <ServicePage
      title="Lab tests"
      subtitle="Request the test advised by your clinician and follow its progress."
    >
      <ServiceCard title="Request a lab test">
        <form
          className="flex flex-col items-start gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_320px]"
          onSubmit={(e) => {
            e.preventDefault()
            if (online && !create.isPending) create.mutate()
          }}
        >
          <div className="flex w-full min-w-0 flex-col gap-4">
            <Field
              label="Test type"
              hint="Enter the test name from your clinician."
            >
              {(id) => (
                <Input
                  id={id}
                  value={draft.value.test_type}
                  onChange={(e) => update({ test_type: e.target.value })}
                  required
                  maxLength={200}
                />
              )}
            </Field>
            <FacilitySelect
              capability="laboratory"
              value={draft.value.facility_id}
              onChange={(facility_id) => update({ facility_id })}
            />
            <Field
              label="Collection address (optional)"
              hint="The facility will need to arrange collection. This is not a confirmed home visit."
            >
              {(id) => (
                <Textarea
                  id={id}
                  value={draft.value.collection_address}
                  onChange={(e) =>
                    update({ collection_address: e.target.value })
                  }
                  maxLength={1000}
                />
              )}
            </Field>
          </div>
          <aside className="contents lg:sticky lg:top-6 lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
            <ConnectionNote />
            <DraftNote saved={draft.saved} />
            <ServiceError error={create.error} />
            <Button
              type="submit"
              icon={Send}
              className="self-start"
              disabled={
                !online ||
                !draft.value.test_type.trim() ||
                !draft.value.facility_id
              }
              loading={create.isPending}
            >
              Request lab test
            </Button>
          </aside>
        </form>
      </ServiceCard>
      <ServiceCard title="Your requests">
        <ServiceError error={list.error} />
        {list.isPending ? (
          <PageSpinner />
        ) : !list.data?.lab_requests.length ? (
          <EmptyState icon={FlaskConical} title="No lab requests to show." />
        ) : (
          <ul className="flex flex-col gap-4">
            {list.data.lab_requests.map((l) => (
              <li
                key={l.request_id}
                className="flex flex-col items-start gap-3 rounded-lg border border-line p-4"
              >
                <h3 className="text-title-l">{l.test_type}</h3>
                <ServiceStatus>{l.status.replaceAll("_", " ")}</ServiceStatus>
                <p className="text-body-m text-ink-600">
                  Requested {formatDateTime(l.created_at)}
                </p>
                <ButtonLink variant="tonal" to={`/app/labs/${l.request_id}`}>
                  Track request
                </ButtonLink>
              </li>
            ))}
          </ul>
        )}
        {list.isError && (
          <Button variant="tonal" onClick={() => void list.refetch()}>
            Try again
          </Button>
        )}
      </ServiceCard>
    </ServicePage>
  )
}
export function LabDetail() {
  const { id = "" } = useParams(),
    { session } = useAuth(),
    visible = useVisible(),
    online = useOnline()
  const facilities = useFacilities()
  const query = useQuery({
    queryKey: ["lab", session?.sub, id],
    queryFn: () => serviceApi.lab(id),
    refetchInterval: online && visible ? 20_000 : false,
  })
  return (
    <ServicePage
      title="Lab request"
      subtitle="Follow each step from request to delivery."
    >
      <ButtonLink to="/app/labs" variant="secondary" className="self-start">
        All lab requests
      </ButtonLink>
      <ServiceError error={query.error} />
      {query.isPending ? (
        <PageSpinner />
      ) : (
        query.data && (
          <>
            <ServiceCard title={query.data.test_type}>
              <p className="text-body-m text-ink-600">
                {facilities?.find(
                  (f) => f.facility_id === query.data.facility_id
                )?.name ?? "Requested facility"}
              </p>
              <p className="text-body-m break-all">
                Request ID: {query.data.request_id}
              </p>
              <LabTimeline lab={query.data} />
              <p className="text-label-m text-ink-600">
                Updated {formatDateTime(query.data.updated_at)}
              </p>
            </ServiceCard>
            {query.data.result_summary && (
              <ServiceCard title="Result summary">
                <p className="text-body-l whitespace-pre-wrap">
                  {query.data.result_summary}
                </p>
                <p className="text-body-m text-ink-600">
                  Ask your clinician to explain these results.
                </p>
              </ServiceCard>
            )}
          </>
        )
      )}
      {query.isError && (
        <Button variant="tonal" onClick={() => void query.refetch()}>
          Try again
        </Button>
      )}
    </ServicePage>
  )
}
