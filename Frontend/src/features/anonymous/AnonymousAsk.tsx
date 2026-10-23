import { useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useNavigate, useParams } from "react-router-dom"
import { MessageCircle, Send, Shield } from "lucide-react"
import {
  anonymousApi,
  forgetAnonymousSession,
  readAnonymousSession,
  storeAnonymousSession,
  type AnonymousSession,
} from "@/api/anonymous"
import { env } from "@/config/env"
import { Button, ButtonA, ButtonLink } from "@/design/components/Button"
import { Field, Input, Textarea } from "@/design/components/Field"
import { ConfirmAction, Feedback } from "@/design/components/Feedback"
import { Landscape } from "@/design/components/Landscape"
import { ChatBubble } from "@/design/components/ChatBubble"
import {
  DraftNote,
  ServiceCard,
  ServiceError,
  ServiceStatus,
  useServiceDraft,
} from "@/design/components/ServicePage"
import { EmptyState, PageSpinner } from "@/design/components/primitives"
import { formatDateTime, formatXaf } from "@/lib/format"
import { useNow, useOnline, useVisible } from "@/lib/hooks"
import { useAnonymousOutbox } from "./useAnonymousOutbox"

function AnonymousFlow({
  session,
  id,
}: {
  session: AnonymousSession
  id?: string
}) {
  const online = useOnline(),
    visible = useVisible(),
    navigate = useNavigate(),
    now = useNow()
  const expired = now >= session.expires_at * 1000,
    token = session.session_token
  const draft = useServiceDraft(`anonymous:${token}:complaint`, {
    complaint: "",
  })
  const list = useQuery({
    queryKey: ["anonymous-list", token],
    queryFn: () => anonymousApi.list(token),
    enabled: !expired && !id,
    refetchInterval: online && visible ? 20_000 : false,
  })
  const create = useMutation({
    mutationFn: () => anonymousApi.create(token, draft.value.complaint.trim()),
    onSuccess: (c) => {
      draft.reset()
      navigate(`/ask/${c.consultation_id}`)
    },
  })
  return (
    <>
      <Feedback>
        Session on this phone until {formatDateTime(session.expires_at * 1000)}.
        Keep this browser’s data to return to your messages.
      </Feedback>
      {expired ? (
        <Feedback error>
          This session has expired. Previous conversations can no longer be
          opened with this session.
        </Feedback>
      ) : id ? (
        <AnonymousChat key={id} session={session} id={id} />
      ) : (
        <>
          <ServiceCard title="Ask a doctor">
            <form
              className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start"
              onSubmit={(e) => {
                e.preventDefault()
                if (online && !create.isPending) create.mutate()
              }}
            >
              <Field
                label="What would you like help with?"
                hint="Avoid names, addresses or other identifying details. Text only, up to 2000 characters."
              >
                {(field) => (
                  <Textarea
                    id={field}
                    value={draft.value.complaint}
                    onChange={(e) =>
                      draft.setValue({ complaint: e.target.value })
                    }
                    maxLength={2000}
                    required
                    rows={5}
                  />
                )}
              </Field>
              <aside className="contents lg:sticky lg:top-6 lg:flex lg:flex-col lg:gap-4">
                <DraftNote saved={draft.saved} />
                <p role="status" className="text-body-m text-ink-600">
                  {online
                    ? "Connected · creating a consultation requires payment before doctor review."
                    : "Offline · your draft stays on this phone. Connect to create the consultation."}
                </p>
                <ServiceError error={create.error} />
                <Button
                  type="submit"
                  icon={Send}
                  className="self-start"
                  disabled={!online || !draft.value.complaint.trim()}
                  loading={create.isPending}
                >
                  Create consultation
                </Button>
              </aside>
            </form>
          </ServiceCard>
          <ServiceCard title="Your conversations">
            <ServiceError error={list.error} />
            {list.isPending ? (
              <PageSpinner />
            ) : !list.data?.consultations.length ? (
              <EmptyState
                icon={MessageCircle}
                title="No conversations in this session."
              />
            ) : (
              <ul className="flex flex-col gap-4">
                {list.data.consultations.map((c) => (
                  <li
                    key={c.consultation_id}
                    className="flex flex-col items-start gap-3 rounded-lg border border-line p-4"
                  >
                    <h3 className="text-title-m">{c.complaint}</h3>
                    <ServiceStatus>
                      {c.status.replaceAll("_", " ")}
                    </ServiceStatus>
                    <ButtonLink
                      to={`/ask/${c.consultation_id}`}
                      variant="tonal"
                    >
                      Open conversation
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
        </>
      )}
    </>
  )
}
function AnonymousChat({
  session,
  id,
}: {
  session: AnonymousSession
  id: string
}) {
  const token = session.session_token,
    online = useOnline(),
    visible = useVisible()
  const query = useQuery({
    queryKey: ["anonymous-case", token, id],
    queryFn: () => anonymousApi.get(token, id),
    refetchInterval: online && visible ? 20_000 : false,
  })
  const [phone, setPhone] = useState(""),
    [text, setText] = useState(""),
    [localError, setLocalError] = useState<string | null>(null)
  const queue = useAnonymousOutbox(token, session.expires_at)
  const pay = useMutation({
    mutationFn: () => anonymousApi.pay(token, id, phone.trim()),
  })
  const c = query.data?.consultation,
    pending = queue.items.filter((m) => m.consultation_id === id)
  return (
    <>
      <ButtonLink to="/ask" variant="secondary" className="self-start">
        All conversations
      </ButtonLink>
      <ServiceError error={query.error} />
      {query.isPending ? (
        <PageSpinner />
      ) : (
        c && (
          <>
            <ServiceCard title="Your consultation">
              <p className="text-body-l">{c.complaint}</p>
              <ServiceStatus>{c.status.replaceAll("_", " ")}</ServiceStatus>
              <p className="text-label-m text-ink-600">
                {query.dataUpdatedAt
                  ? `Last updated ${formatDateTime(query.dataUpdatedAt)}`
                  : "Waiting for an update"}
              </p>
              {c.status === "pending_payment" && (
                <form
                  className="flex flex-col items-start gap-4"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (online && !pay.isPending && !pay.data) pay.mutate()
                  }}
                >
                  <p className="text-title-m">
                    Consultation fee · {formatXaf(env.consultationFeeXaf)}
                  </p>
                  <p className="text-body-m text-ink-600">
                    Payment is handled by Fapshi. A mobile-money phone number
                    may identify you to the payment provider.
                  </p>
                  <Field label="Mobile-money phone (optional)">
                    {(field) => (
                      <Input
                        id={field}
                        type="tel"
                        autoComplete="off"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                      />
                    )}
                  </Field>
                  <ServiceError error={pay.error} />
                  {pay.data ? (
                    <>
                      <ButtonA
                        href={
                          /^https:\/\//.test(pay.data.payment_url) ||
                          pay.data.payment_url.startsWith(
                            window.location.origin + "/"
                          )
                            ? pay.data.payment_url
                            : "#"
                        }
                        variant="tonal"
                      >
                        Open payment page
                      </ButtonA>
                      <Feedback>
                        {env.useMockApi
                          ? "Demo payment confirms after a few seconds. No money is charged."
                          : "Waiting for payment confirmation. Return here after payment. In the development backend, payments need manual webhook confirmation."}
                      </Feedback>
                      <Button
                        variant="secondary"
                        onClick={() => void query.refetch()}
                      >
                        Check confirmation
                      </Button>
                      <Button variant="ghost" onClick={() => pay.reset()}>
                        Start a new payment attempt
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="submit"
                      disabled={!online}
                      loading={pay.isPending}
                    >
                      Continue to payment
                    </Button>
                  )}
                </form>
              )}
            </ServiceCard>
            <ServiceCard title="Messages">
              {!query.data?.messages.length && !pending.length && (
                <EmptyState icon={MessageCircle} title="No messages yet." />
              )}
              <ul className="flex flex-col gap-4">
                {query.data?.messages.map((m) => (
                  <ChatBubble
                    key={m.message_id}
                    item={{
                      key: m.message_id,
                      mine: m.sender_role === "patient",
                      content_type: m.content_type,
                      text_body: m.text_body,
                      duration_seconds: m.duration_seconds,
                      created_at: m.created_at,
                    }}
                  />
                ))}
                {pending.map((m) => (
                  <li
                    key={m.client_message_id}
                    className="ml-5 rounded-lg bg-mint p-4"
                  >
                    <p className="text-body-l whitespace-pre-wrap">
                      {m.text_body}
                    </p>
                    <p className="mt-2 text-label-m">
                      {m.blocked
                        ? "Could not send · needs attention"
                        : "Saved on this phone · waiting to send"}
                    </p>
                  </li>
                ))}
              </ul>
            </ServiceCard>
            {c.status === "closed" ? (
              <Feedback>This consultation is closed.</Feedback>
            ) : c.status === "pending_payment" ? (
              <Feedback>Pay before sending messages to the doctor.</Feedback>
            ) : (
              <section className="rounded-xl p-4 glass-strong">
                <form
                  className="flex flex-col gap-3"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (!text.trim()) return
                    try {
                      queue.enqueue(id, text.trim())
                      setText("")
                      setLocalError(null)
                    } catch {
                      setLocalError(
                        "Could not save this message on the phone. Keep your text and try again."
                      )
                    }
                  }}
                >
                  <Field
                    label="Message the doctor"
                    hint="Text only. Messages save on this phone and send when connected while this page is open."
                  >
                    {(field) => (
                      <Textarea
                        id={field}
                        maxLength={4000}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        required
                      />
                    )}
                  </Field>
                  <Button
                    icon={Send}
                    type="submit"
                    className="self-start"
                    disabled={!text.trim()}
                  >
                    {online ? "Send message" : "Save message to send"}
                  </Button>
                </form>
              </section>
            )}
            {queue.error && (
              <Feedback error>
                {queue.error} Unsent text stays on this phone.
              </Feedback>
            )}
            {localError && <Feedback error>{localError}</Feedback>}
          </>
        )
      )}
      {query.isError && (
        <Button variant="tonal" onClick={() => void query.refetch()}>
          Try again
        </Button>
      )}
    </>
  )
}
export default function AnonymousAsk() {
  const { id } = useParams(),
    online = useOnline(),
    navigate = useNavigate()
  const [session, setSession] = useState(readAnonymousSession),
    [forget, setForget] = useState(false)
  const start = useMutation({
    mutationFn: anonymousApi.start,
    onSuccess: (s) => {
      storeAnonymousSession(s)
      setSession(s)
      navigate("/ask", { replace: true })
    },
  })
  return (
    <>
      <section
        className={
          session
            ? "relative isolate overflow-hidden py-4"
            : "relative isolate overflow-hidden py-8"
        }
      >
        <Landscape className="-z-10" />
        <div className="container-page">
          <div
            className={
              session
                ? "max-w-2xl shape-bl p-5 glass-strong"
                : "max-w-2xl shape-bl p-6 glass-strong"
            }
          >
            {!session && (
              <Shield className="mb-4 size-8 text-brand-700" aria-hidden />
            )}
            <p className="eyebrow">Care without an account</p>
            <h1
              className={
                session ? "mt-3 text-headline-l" : "mt-3 text-display-m"
              }
            >
              Ask anonymously
            </h1>
            <p className={session ? "mt-3 text-body-m" : "mt-4 text-body-l"}>
              A seven-day session on this phone only. Consult by text, with no
              voice notes. Anyone with access to this browser may see the
              conversation.
            </p>
            {!session && (
              <Button
                className="mt-5"
                disabled={!online}
                loading={start.isPending}
                onClick={() => start.mutate()}
              >
                Start seven-day session
              </Button>
            )}
            <ServiceError error={start.error} />
          </div>
        </div>
      </section>
      <div
        className={
          session
            ? "container-page flex max-w-3xl flex-col gap-5 py-4"
            : "container-page flex max-w-3xl flex-col gap-5 py-6"
        }
      >
        <Feedback>
          For urgent help call 15. Anonymous consultations are not an emergency
          service.
        </Feedback>
        {session ? (
          <AnonymousFlow
            key={session.session_token}
            session={session}
            id={id}
          />
        ) : (
          <ServiceCard title="Start a private session">
            <p className="text-body-l">
              The server creates a seven-day session key stored in this browser.
              Clearing it removes your way back to these conversations; it does
              not delete server records.
            </p>
            {!online && <Feedback>Connect to start a session.</Feedback>}
          </ServiceCard>
        )}
        {session &&
          (forget ? (
            <ConfirmAction
              title="Forget this session on this phone?"
              confirmLabel="Forget session"
              onCancel={() => setForget(false)}
              onConfirm={() => {
                forgetAnonymousSession()
                setSession(null)
                setForget(false)
                navigate("/ask", { replace: true })
              }}
            >
              Unsent anonymous messages will be lost. You will not be able to
              reopen these conversations with this phone. Server records are not
              deleted.
            </ConfirmAction>
          ) : (
            <Button
              variant="secondary"
              className="self-start"
              onClick={() => setForget(true)}
            >
              Forget session on this phone
            </Button>
          ))}
      </div>
    </>
  )
}
