import { useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, motion } from "motion/react"
import { Activity, ArrowLeft, MessageCircle, Plus, Search, Trash2, Users } from "lucide-react"
import { profileApi } from "@/api/endpoints"
import { friendlyError } from "@/api/errors"
import type { HouseholdMember, Sex } from "@/api/types"
import { AppPage, Panel } from "@/design/components/AppPage"
import { Button, ButtonLink } from "@/design/components/Button"
import { Chip, Field, Input, Select } from "@/design/components/Field"
import { ConfirmAction, Feedback } from "@/design/components/Feedback"
import { FormGuard } from "@/design/components/FormGuard"
import { Skeleton } from "@/design/components/Lively"
import { Avatar, EmptyState } from "@/design/components/primitives"
import { toast } from "@/design/components/Toast"
import { SPRING, popIn, staggerOnMount } from "@/design/motion"
import { ageInMonths, describeAge } from "@/lib/format"
import { rules, todayIso, useForm } from "@/lib/form"
import { useNow, useOnline } from "@/lib/hooks"
import { humanize, plural } from "@/lib/labels"
import { useProfile } from "./useProfile"

const RELATIONSHIPS = ["Child", "Parent", "Spouse", "Sibling", "Neighbour", "Other"]
const SEXES: { value: Sex; label: string }[] = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "other", label: "Other" },
]
const LIMIT = 10
/** Search, sort and filters only earn their space once the list is long (QA C1). */
const TOOLS_FROM = 6

function ChoiceRow({
  legend,
  error,
  options,
  value,
  onChange,
}: {
  legend: string
  error?: string
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <fieldset aria-invalid={error ? true : undefined}>
      <legend className="mb-2 text-label-l text-ink-900">
        {legend}
        <span className="ml-1.5 text-label-m font-normal text-ink-600">Required</span>
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Chip key={o.value} selected={value === o.value} onClick={() => onChange(o.value)}>
            {o.label}
          </Chip>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-label-m text-urgent-red">
          {error}
        </p>
      )}
    </fieldset>
  )
}

function AddMemberForm({ atLimit }: { atLimit: boolean }) {
  const qc = useQueryClient()
  const online = useOnline()
  const form = useForm(
    { name: "", dob: "", sex: "", relationship: "", permission: false },
    {
      name: [rules.required("Enter a name."), rules.minLength(2), rules.maxLength(100)],
      dob: [rules.required("Enter a date of birth."), rules.notFuture()],
      sex: [rules.required("Choose one.")],
      relationship: [rules.required("Choose how you're related.")],
      permission: [(v) => (v ? undefined : "Confirm you have permission before adding this person.")],
    },
  )
  const add = useMutation({
    mutationFn: () =>
      profileApi.addMember({
        name: form.values.name.trim(),
        dob: form.values.dob,
        sex: form.values.sex as Sex,
        relationship: form.values.relationship,
      }),
    onSuccess: async () => {
      const added = form.values.name.trim()
      form.reset()
      await qc.invalidateQueries({ queryKey: ["profile"] })
      toast(`${added} added to your household`)
    },
  })
  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (form.check() && online && !atLimit && !add.isPending) add.mutate()
      }}
    >
      <Field label="Name" required error={form.error("name")} count={form.values.name.length} max={100}>
        {(id) => <Input id={id} maxLength={100} autoComplete="off" placeholder="For example: Amara" {...form.bind("name")} />}
      </Field>
      <Field label="Date of birth" required error={form.error("dob")}>
        {(id) => <Input id={id} type="date" max={todayIso()} {...form.bind("dob")} />}
      </Field>
      <ChoiceRow
        legend="Sex"
        error={form.error("sex")}
        options={SEXES}
        value={form.values.sex}
        onChange={(v) => form.set("sex", v)}
      />
      <ChoiceRow
        legend="Relationship"
        error={form.error("relationship")}
        options={RELATIONSHIPS.map((r) => ({ value: r, label: r }))}
        value={form.values.relationship}
        onChange={(v) => form.set("relationship", v)}
      />
      <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-cream p-3 text-body-m">
        <input
          type="checkbox"
          className="mt-0.5 size-5 shrink-0 accent-brand-700"
          checked={form.values.permission}
          onChange={(e) => form.set("permission", e.target.checked)}
          aria-invalid={Boolean(form.error("permission"))}
        />
        <span>I have their permission, or I am their parent or carer, to ask for care on their behalf.</span>
      </label>
      {form.error("permission") && <Feedback error>{form.error("permission")}</Feedback>}
      {!online && <Feedback>You&apos;re offline. What you type stays here; connect to add them.</Feedback>}
      {atLimit && <Feedback>Your household has reached the {LIMIT}-person limit.</Feedback>}
      {add.error && <Feedback error>{friendlyError(add.error)}</Feedback>}
      <Button icon={Plus} type="submit" disabled={!online || atLimit} loading={add.isPending} full>
        Add to household
      </Button>
      <FormGuard when={form.dirty && !add.isPending} />
    </form>
  )
}

function MemberCard({ m, now }: { m: HouseholdMember; now: number }) {
  const qc = useQueryClient()
  const online = useOnline()
  const [confirm, setConfirm] = useState(false)
  const remove = useMutation({
    mutationFn: () => profileApi.removeMember(m.member_id),
    onSuccess: async () => {
      setConfirm(false)
      await qc.invalidateQueries({ queryKey: ["profile"] })
      toast(`${m.name} removed from your household`, { tone: "info" })
    },
  })
  return (
    <motion.li
      variants={popIn}
      layout
      exit={{ opacity: 0, scale: 0.97 }}
      transition={SPRING.default}
      className="flex min-w-0 flex-col gap-4 rounded-xl bg-white p-5 shadow-[var(--shadow-elev-1)]"
    >
      <div className="flex items-center gap-4">
        <Avatar name={m.name} size="lg" />
        <div className="min-w-0">
          <h2 className="truncate text-title-l">{m.name}</h2>
          <p className="mt-0.5 text-body-m text-ink-600">
            {humanize(m.relationship)} · {describeAge(ageInMonths(m.dob, now))} · {humanize(m.sex)}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ButtonLink to={`/app/triage?for=${encodeURIComponent(m.member_id)}`} variant="tonal" size="sm" icon={Activity}>
          Check
        </ButtonLink>
        <ButtonLink to={`/app/consult/new?member=${encodeURIComponent(m.member_id)}`} variant="tonal" size="sm" icon={MessageCircle}>
          Message
        </ButtonLink>
      </div>
      {confirm ? (
        <ConfirmAction
          title={`Remove ${m.name}?`}
          confirmLabel="Remove"
          loading={remove.isPending}
          onCancel={() => setConfirm(false)}
          onConfirm={() => remove.mutate()}
        >
          They leave your household. Past consultations for them stay in your history.
        </ConfirmAction>
      ) : (
        <button
          type="button"
          disabled={!online}
          onClick={() => setConfirm(true)}
          className="-mb-1 inline-flex h-10 items-center gap-1.5 self-start rounded-full px-3 text-label-l text-urgent-red transition-colors hover:bg-urgent-red-50 disabled:opacity-40"
        >
          <Trash2 className="size-4" aria-hidden /> Remove
        </button>
      )}
      {remove.error && <Feedback error>{friendlyError(remove.error)}</Feedback>}
    </motion.li>
  )
}

export default function Household() {
  const profile = useProfile()
  const now = useNow()
  const [params, setParams] = useSearchParams()
  const members = profile.data?.on_behalf_profiles ?? []
  const q = params.get("q") ?? ""
  const relationship = params.get("relationship") ?? ""
  const sort = params.get("sort") ?? "name"
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const tools = members.length >= TOOLS_FROM
  const filtered = members
    .filter((m) => !tools || (m.name.toLowerCase().includes(q.toLowerCase()) && (!relationship || m.relationship === relationship)))
    .sort((a, b) => (sort === "age" ? a.dob.localeCompare(b.dob) : a.name.localeCompare(b.name)))
  const empty = !profile.isPending && members.length === 0

  return (
    <AppPage
      title="Household"
      subtitle="The people you care for. Check symptoms or message a doctor for them, without their own phone."
      back={
        <ButtonLink to="/app/profile" variant="ghost" size="sm" icon={ArrowLeft}>
          Profile
        </ButtonLink>
      }
      asideFirst={empty}
      aside={
        <>
          <Panel title="Add someone">
            {/* Room left, as a quiet meter: 10 seats, filled ones solid. */}
            <div className="-mt-1 mb-5 flex items-center gap-3">
              <div className="flex flex-1 gap-1" role="img" aria-label={`${members.length} of ${LIMIT} places used`}>
                {Array.from({ length: LIMIT }, (_, i) => (
                  <motion.span
                    key={i}
                    className={i < members.length ? "h-1.5 flex-1 rounded-full bg-brand-600" : "h-1.5 flex-1 rounded-full bg-ink-900/8"}
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ ...SPRING.default, delay: 0.1 + i * 0.03 }}
                  />
                ))}
              </div>
              <span className="text-label-m text-ink-600 tabular">
                {members.length}/{LIMIT}
              </span>
            </div>
            <AddMemberForm atLimit={members.length >= LIMIT} />
          </Panel>
          <Panel tone="mint">
            <p className="text-title-m text-brand-900">Care with permission</p>
            <p className="mt-1 text-body-m text-brand-900/80">
              Only add people you look after or who have agreed. Their details stay in your account.
            </p>
          </Panel>
        </>
      }
    >
      {profile.error && (
        <Feedback error>
          {friendlyError(profile.error)}{" "}
          <Button variant="tonal" size="sm" onClick={() => void profile.refetch()}>
            Try again
          </Button>
        </Feedback>
      )}

      {tools && (
        <motion.div variants={popIn} className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
            <label className="relative">
              <span className="sr-only">Search household</span>
              <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-400" aria-hidden />
              <input
                type="search"
                value={q}
                maxLength={100}
                placeholder="Search by name"
                onChange={(e) => update("q", e.target.value)}
                className="h-12 w-full rounded-full border border-ink-900/15 bg-white pr-4 pl-12 text-body-l focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 focus:outline-none"
              />
            </label>
            <Select value={sort} onChange={(e) => update("sort", e.target.value)} aria-label="Sort members">
              <option value="name">Name, A–Z</option>
              <option value="age">Oldest first</option>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Relationship">
            <Chip selected={!relationship} onClick={() => update("relationship", "")}>
              Everyone
            </Chip>
            {[...new Set(members.map((m) => m.relationship))].map((r) => (
              <Chip key={r} selected={relationship === r} onClick={() => update("relationship", r)}>
                {humanize(r)}
              </Chip>
            ))}
          </div>
        </motion.div>
      )}

      {profile.isPending ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-4" role="status" aria-label="Loading household">
          {[0, 1].map((i) => (
            <div key={i} className="flex flex-col gap-4 rounded-xl bg-white p-5 shadow-[var(--shadow-elev-1)]">
              <div className="flex items-center gap-4">
                <Skeleton className="size-16 rounded-full" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
              <Skeleton className="h-10 rounded-full" />
            </div>
          ))}
        </div>
      ) : empty ? (
        <EmptyState icon={Users} title="No one in your household yet. Add the first person with the form." />
      ) : !filtered.length ? (
        <EmptyState
          icon={Search}
          title="No one matches."
          action={
            <Button variant="tonal" size="sm" onClick={() => setParams({})}>
              Show everyone
            </Button>
          }
        />
      ) : (
        <>
          <p role="status" className="text-label-l text-ink-900">
            {plural(filtered.length, "person", "people")}
            {tools && filtered.length !== members.length && <span className="font-normal text-ink-600"> of {members.length}</span>}
          </p>
          <motion.ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-4" variants={staggerOnMount(0.05)}>
            <AnimatePresence initial={false}>
              {filtered.map((m) => (
                <MemberCard key={m.member_id} m={m} now={now} />
              ))}
            </AnimatePresence>
          </motion.ul>
        </>
      )}
    </AppPage>
  )
}
