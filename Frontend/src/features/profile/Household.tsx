import { useState } from "react"
import { Link } from "react-router-dom"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ChevronLeft, HeartHandshake, Trash2, Users } from "lucide-react"
import { profileApi } from "@/api/endpoints"
import { friendlyError } from "@/api/errors"
import type { HouseholdMember, Sex } from "@/api/types"
import { Button } from "@/design/components/Button"
import { Field, Input, Select } from "@/design/components/Field"
import { Avatar, Card, EmptyState, Notice, PageHeader, PageSpinner } from "@/design/components/primitives"
import { ageInMonths, describeAge } from "@/lib/format"
import { useNow, useOnline } from "@/lib/hooks"
import { useProfile } from "./useProfile"

const RELATIONSHIPS = ["Child", "Parent", "Spouse", "Sibling", "Neighbour", "Other"]

const EMPTY = { name: "", dob: "", sex: "" as Sex | "", relationship: "" }

function AddMemberForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient()
  const online = useOnline()
  const [form, setForm] = useState(EMPTY)
  const [attest, setAttest] = useState(false)
  const now = useNow(3_600_000)
  const today = new Date(now).toISOString().slice(0, 10)

  const add = useMutation({
    mutationFn: () =>
      profileApi.addMember({
        name: form.name.trim(),
        dob: form.dob,
        sex: form.sex as Sex,
        relationship: form.relationship,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["profile"] })
      setForm(EMPTY)
      setAttest(false)
      onDone()
    },
  })

  const valid = form.name.trim() && form.dob && form.sex && form.relationship && attest

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) add.mutate()
      }}
    >
      <Field label="Name">
        {(id) => (
          <Input id={id} value={form.name} maxLength={100} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date of birth">
          {(id) => (
            <Input id={id} type="date" max={today} value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} />
          )}
        </Field>
        <Field label="Sex">
          {(id) => (
            <Select id={id} value={form.sex} onChange={(e) => setForm({ ...form, sex: e.target.value as Sex })}>
              <option value="" disabled>
                Choose…
              </option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </Select>
          )}
        </Field>
      </div>
      <Field label="Relationship to you">
        {(id) => (
          <Select id={id} value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })}>
            <option value="" disabled>
              Choose…
            </option>
            {RELATIONSHIPS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <label className="flex items-start gap-3 rounded-[12px] bg-cream p-4 text-sm">
        <input
          type="checkbox"
          checked={attest}
          onChange={(e) => setAttest(e.target.checked)}
          className="mt-0.5 size-5 accent-brand-700"
        />
        <span>
          I have this person's permission (or I am their parent or carer) to ask for care on their
          behalf.
        </span>
      </label>
      {!online && <Notice tone="warn">Adding a member needs a connection.</Notice>}
      {add.isError && <Notice tone="error">{friendlyError(add.error)}</Notice>}
      <Button type="submit" disabled={!valid || !online} loading={add.isPending}>
        Add member
      </Button>
    </form>
  )
}

export default function Household() {
  const profile = useProfile()
  const queryClient = useQueryClient()
  const now = useNow(60_000)
  const [adding, setAdding] = useState(false)
  const remove = useMutation({
    mutationFn: (m: HouseholdMember) => profileApi.removeMember(m.member_id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profile"] }),
  })

  if (profile.isPending) return <PageSpinner />
  const members = profile.data?.on_behalf_profiles ?? []

  return (
    <div>
      <PageHeader
        title="Household members"
        back={
          <Link to="/app/profile" className="mb-3 inline-flex h-11 items-center gap-1 font-semibold text-brand-700">
            <ChevronLeft className="size-5" aria-hidden /> Profile
          </Link>
        }
      />

      <div className="flex items-start gap-4 rounded-[16px] bg-gradient-to-br from-brand-700 to-brand-900 p-5 text-white">
        <HeartHandshake className="size-8 shrink-0" strokeWidth={1.5} aria-hidden />
        <div>
          <p className="font-display text-[18px] font-bold">Care for someone you love</p>
          <p className="mt-1 text-sm text-white/85">
            Check symptoms and ask a doctor for a child, parent or neighbour without a phone.
            Their records are kept separate from yours.
          </p>
        </div>
      </div>

      {profile.isError && (
        <Notice tone="error" className="mt-4">
          {friendlyError(profile.error)}
        </Notice>
      )}
      {remove.isError && (
        <Notice tone="error" className="mt-4">
          {friendlyError(remove.error)}
        </Notice>
      )}

      <section className="mt-6">
        {members.length === 0 ? (
          <EmptyState icon={Users} title="No household members yet." />
        ) : (
          <ul className="flex flex-col gap-3">
            {members.map((m) => (
              <li key={m.member_id} className="flex items-center gap-3 rounded-[16px] border border-line p-4">
                <Avatar name={m.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{m.name}</p>
                  <p className="text-sm text-ink-600">
                    {m.relationship} · {describeAge(ageInMonths(m.dob, now))}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${m.name}`}
                  className="flex size-11 items-center justify-center rounded-[10px] text-ink-600 hover:bg-urgent-red-50 hover:text-urgent-red"
                  onClick={() => {
                    if (window.confirm(`Remove ${m.name} from your household?`)) remove.mutate(m)
                  }}
                >
                  <Trash2 className="size-5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Card className="mt-6 p-5">
        {adding ? (
          <>
            <h2 className="mb-4 text-[17px] font-bold">Add a member</h2>
            <AddMemberForm onDone={() => setAdding(false)} />
          </>
        ) : (
          <Button full variant="secondary" onClick={() => setAdding(true)}>
            + Add a household member
          </Button>
        )}
      </Card>
    </div>
  )
}
