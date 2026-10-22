import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, motion } from "motion/react"
import { ArrowLeft, HeartHandshake, Plus, Trash2, Users, X } from "lucide-react"
import { profileApi } from "@/api/endpoints"
import { friendlyError } from "@/api/errors"
import type { HouseholdMember, Sex } from "@/api/types"
import { Button, IconButton, IconRouterLink } from "@/design/components/Button"
import { SyncStatus } from "@/design/components/AppChrome"
import { ChoiceCard, Field, Input, Select } from "@/design/components/Field"
import { ConfirmAction, Feedback } from "@/design/components/Feedback"
import {
  Avatar,
  EmptyState,
  PageHeader,
  PageSpinner,
} from "@/design/components/primitives"
import { popIn, SPRING, staggerOnMount } from "@/design/motion"
import { ageInMonths, describeAge } from "@/lib/format"
import { useNow, useOnline } from "@/lib/hooks"
import { useProfile } from "./useProfile"

const RELATIONSHIPS = [
  "Child",
  "Parent",
  "Spouse",
  "Sibling",
  "Neighbour",
  "Other",
]
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
        ...form,
        name: form.name.trim(),
        sex: form.sex as Sex,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["profile"] })
      onDone()
    },
  })
  const valid = Boolean(
    form.name.trim() &&
    form.dob &&
    form.dob <= today &&
    form.sex &&
    form.relationship &&
    attest
  )
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid && online) add.mutate()
      }}
    >
      <Field label="Name">
        {(id) => (
          <Input
            id={id}
            autoFocus
            required
            value={form.name}
            maxLength={100}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        )}
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Date of birth">
          {(id) => (
            <Input
              id={id}
              required
              type="date"
              max={today}
              value={form.dob}
              onChange={(e) => setForm({ ...form, dob: e.target.value })}
            />
          )}
        </Field>
        <Field label="Sex">
          {(id) => (
            <Select
              id={id}
              required
              value={form.sex}
              onChange={(e) => setForm({ ...form, sex: e.target.value as Sex })}
            >
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
          <Select
            id={id}
            required
            value={form.relationship}
            onChange={(e) => setForm({ ...form, relationship: e.target.value })}
          >
            <option value="" disabled>
              Choose…
            </option>
            {RELATIONSHIPS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        )}
      </Field>
      <label className="flex cursor-pointer items-start gap-3 rounded-md bg-cream p-4 text-body-m">
        <input
          type="checkbox"
          checked={attest}
          onChange={(e) => setAttest(e.target.checked)}
          className="size-6 shrink-0 accent-brand-700"
        />
        <span>
          I have this person's permission, or I am their parent or carer, to ask
          for care on their behalf.
        </span>
      </label>
      {!online && (
        <Feedback>
          Connect to add a household member. Your entries will stay here while
          this form is open.
        </Feedback>
      )}
      {add.isError && <Feedback error>{friendlyError(add.error)}</Feedback>}
      <Button
        type="submit"
        icon={Plus}
        disabled={!valid || !online}
        loading={add.isPending}
      >
        Add member
      </Button>
    </form>
  )
}

export default function Household() {
  const profile = useProfile()
  const queryClient = useQueryClient()
  const online = useOnline()
  const now = useNow(60_000)
  const [adding, setAdding] = useState(false)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [added, setAdded] = useState(false)
  const remove = useMutation({
    mutationFn: (m: HouseholdMember) => profileApi.removeMember(m.member_id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["profile"] })
      setConfirm(null)
    },
  })
  if (profile.isPending) return <PageSpinner />
  const members = profile.data?.on_behalf_profiles ?? []
  const full = members.length >= 10
  return (
    <motion.div
      variants={staggerOnMount()}
      initial="hidden"
      animate="show"
      className="flex min-w-0 flex-col gap-5"
    >
      <PageHeader
        eyebrow="Profile"
        title="Your household"
        subtitle={`${members.length} of 10 members`}
        back={
          <IconRouterLink
            to="/app/profile"
            icon={ArrowLeft}
            label="Back to Profile"
            variant="glass"
            className="mb-4"
          />
        }
      />
      <motion.section
        variants={popIn}
        className="flex items-start gap-4 shape-bl bg-mint p-5"
      >
        <HeartHandshake
          className="size-8 shrink-0 text-brand-700"
          aria-hidden
        />
        <div>
          <h2 className="text-headline-s">Care for someone you love</h2>
          <p className="mt-2 text-body-m text-ink-600">
            Ask for care for a child, parent or neighbour without a phone.
            Choose their name when you start a symptom check or consultation.
          </p>
        </div>
      </motion.section>
      <SyncStatus className="self-start" />
      {profile.isError && (
        <Feedback error>{friendlyError(profile.error)}</Feedback>
      )}
      {remove.isError && (
        <Feedback error>{friendlyError(remove.error)}</Feedback>
      )}
      {added && <Feedback success>Household member added.</Feedback>}
      {!online && (
        <Feedback>
          Saved members are available. Connect to add or remove someone.
        </Feedback>
      )}
      {members.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No household members yet. Add someone you help care for."
        />
      ) : (
        <motion.ul variants={staggerOnMount()} className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {members.map((m) => (
              <motion.li
                layout
                key={m.member_id}
                variants={popIn}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={SPRING.default}
                className="flex min-w-0 flex-col gap-4 rounded-xl bg-white p-5 shadow-[var(--shadow-elev-1)]"
              >
                <div className="flex min-w-0 items-center gap-4">
                  <Avatar name={m.name} />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-title-l break-words">{m.name}</h2>
                    <p className="mt-1 text-body-m text-ink-600">
                      {m.relationship} · {describeAge(ageInMonths(m.dob, now))}
                    </p>
                  </div>
                  <IconButton
                    icon={Trash2}
                    label={`Remove ${m.name}`}
                    variant="tonal"
                    disabled={!online || remove.isPending}
                    onClick={() => setConfirm(m.member_id)}
                  />
                </div>
                {confirm === m.member_id && (
                  <ConfirmAction
                    title={`Remove ${m.name}?`}
                    confirmLabel="Remove member"
                    onCancel={() => setConfirm(null)}
                    onConfirm={() => {
                      if (online) remove.mutate(m)
                    }}
                    loading={remove.isPending}
                  >
                    Remove this person from your household list? This cannot be
                    undone here.
                  </ConfirmAction>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
      )}
      <motion.section variants={popIn}>
        <ChoiceCard
          selected={adding}
          onClick={() => {
            if (!full && profile.data) {
              setAdding(!adding)
              setAdded(false)
            }
          }}
          title={full ? "Household is full" : "Add a household member"}
          description={
            full
              ? "You can have up to 10 members."
              : "Keep their care separate from yours."
          }
          icon={<Plus className="size-5" aria-hidden />}
        />
        <AnimatePresence initial={false}>
          {adding && !full && (
            <motion.div
              key="add-member"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={SPRING.default}
              className="overflow-hidden"
            >
              <div className="mt-4 rounded-xl bg-white p-5 shadow-[var(--shadow-elev-1)]">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="text-headline-s">Add a member</h2>
                  <IconButton
                    icon={X}
                    label="Cancel adding member"
                    variant="plain"
                    onClick={() => setAdding(false)}
                  />
                </div>
                <AddMemberForm
                  onDone={() => {
                    setAdding(false)
                    setAdded(true)
                  }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>
    </motion.div>
  )
}
