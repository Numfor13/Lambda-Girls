import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { FlaskConical } from "lucide-react"
import { request } from "@/api/client"
import { ApiError } from "@/api/errors"
import { AppPage, Panel } from "@/design/components/AppPage"
import { Button } from "@/design/components/Button"
import { Field, Input } from "@/design/components/Field"
import { ConfirmAction, Feedback } from "@/design/components/Feedback"
import { ServiceError } from "@/design/components/ServicePage"
import { CopyReference } from "@/design/components/CopyReference"
import { rules, useForm } from "@/lib/form"
import { useOnline } from "@/lib/hooks"

export default function AdminPaymentSimulation() {
  const online = useOnline()
  const form = useForm(
    { paymentId: "" },
    { paymentId: [rules.required(), rules.maxLength(128)] }
  )
  const [confirm, setConfirm] = useState("")
  const mutation = useMutation({
    mutationFn: (id: string) =>
      request<{
        payment_id: string
        result: "confirmed" | "already_confirmed" | "consultation_not_pending"
      }>("payment", "/payments/" + encodeURIComponent(id) + "/simulate", {
        method: "POST",
        body: {},
      }),
    retry: false,
    onSuccess: () => setConfirm(""),
  })
  const missing =
    mutation.error instanceof ApiError && mutation.error.status === 404
  return (
    <AppPage
      eyebrow="Administration · testing"
      title="Demo payments"
      subtitle="Confirm a simulated payment for an end-to-end demonstration."
      aside={
        <Panel tone="mint" title="Testing only">
          <FlaskConical className="mb-4 size-8 text-brand-700" aria-hidden />
          <p className="text-body-m text-brand-900">
            This tool works only when the backend allows payment simulation and
            has no live Fapshi credentials. It does not charge a Mobile Money
            account.
          </p>
          <p className="mt-3 text-body-m text-brand-900">
            Only an administrator can confirm a demo payment. Live payments must
            confirm through Fapshi.
          </p>
        </Panel>
      }
    >
      <Panel title="Payment to confirm">
        <p className="mb-5 text-body-m text-ink-600">
          Enter the payment ID from the demonstration checkout, rather than its
          Fapshi reference. There is no admin payment list.
        </p>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            if (form.check()) {
              mutation.reset()
              setConfirm(form.values.paymentId.trim())
            }
          }}
          className="flex flex-col gap-4"
        >
          <Field label="Payment ID" required error={form.error("paymentId")}>
            {(id) => (
              <Input
                id={id}
                required
                maxLength={128}
                autoCapitalize="none"
                spellCheck={false}
                {...form.bind("paymentId")}
              />
            )}
          </Field>
          <Button
            type="submit"
            className="self-start"
            disabled={!online || mutation.isPending}
          >
            Review confirmation
          </Button>
        </form>
      </Panel>
      {confirm && (
        <ConfirmAction
          title="Confirm this demo payment?"
          confirmLabel="Confirm demo payment"
          loading={mutation.isPending}
          onCancel={() => setConfirm("")}
          onConfirm={() => {
            if (online) mutation.mutate(confirm)
          }}
        >
          Payment ID: <span className="text-code break-all">{confirm}</span>.
          This changes the payment record and may move the consultation into the
          doctor queue.
        </ConfirmAction>
      )}
      {mutation.isError &&
        (missing ? (
          <Feedback error>
            Simulation is unavailable on this backend, or the payment ID was not
            found. Check that you are using a demo environment and the exact
            payment ID.
          </Feedback>
        ) : (
          <ServiceError error={mutation.error} />
        ))}
      {mutation.data && (
        <Panel
          title={
            mutation.data.result === "consultation_not_pending"
              ? "Consultation already progressed"
              : "Demo payment confirmed"
          }
        >
          <p role="status" className="mb-4 text-body-l text-ink-600">
            {mutation.data.result === "consultation_not_pending"
              ? "The demo payment was confirmed, but the consultation had already progressed. The payment is marked for refund review; the consultation was not changed."
              : "Refresh the patient conversation or doctor queue to see the updated status."}
          </p>
          <p className="mb-4 text-code break-all">{mutation.data.payment_id}</p>
          <CopyReference
            value={mutation.data.payment_id}
            label="Copy payment ID"
          />
        </Panel>
      )}
      {!online && <Feedback>Reconnect to confirm a demo payment.</Feedback>}
    </AppPage>
  )
}
