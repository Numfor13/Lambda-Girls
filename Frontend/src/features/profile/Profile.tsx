import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useLiveQuery } from "dexie-react-hooks"
import { motion } from "motion/react"
import {
  Bell,
  Check,
  Database,
  Globe,
  LogOut,
  RefreshCw,
  Save,
  Shield,
  Trash2,
  Users,
} from "lucide-react"
import { profileApi } from "@/api/endpoints"
import { friendlyError } from "@/api/errors"
import type { Locale } from "@/api/types"
import { useAuth } from "@/auth/AuthProvider"
import { flags } from "@/config/flags"
import { Button, ButtonLink } from "@/design/components/Button"
import { SyncStatus } from "@/design/components/AppChrome"
import { Field, Input, Select } from "@/design/components/Field"
import { ConfirmAction, Feedback } from "@/design/components/Feedback"
import { Landscape } from "@/design/components/Landscape"
import {
  Avatar,
  Card,
  PageHeader,
  PageSpinner,
} from "@/design/components/primitives"
import { popIn, staggerOnMount } from "@/design/motion"
import { formatDate, formatPhone } from "@/lib/format"
import { useOnline } from "@/lib/hooks"
import { usePushSubscription } from "@/lib/usePushSubscription"
import { clearClinicalData, db } from "@/offline/db"
import { refreshFacilities, useFacilitiesSyncedAt } from "@/offline/facilities"
import { useProfile } from "./useProfile"

function DetailsForm({
  initialName,
  initialLocale,
}: {
  initialName: string
  initialLocale: Locale
}) {
  const queryClient = useQueryClient()
  const online = useOnline()
  const [name, setName] = useState(initialName)
  const [locale, setLocale] = useState(initialLocale)
  const save = useMutation({
    mutationFn: () => profileApi.update({ display_name: name.trim(), locale }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profile"] }),
  })
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (online && name.trim()) save.mutate()
      }}
    >
      <Field label="Display name">
        {(id) => (
          <Input
            id={id}
            autoComplete="name"
            value={name}
            maxLength={100}
            required
            onChange={(e) => setName(e.target.value)}
          />
        )}
      </Field>
      <Field
        label="Language"
        hint="French and Pidgin interface translations are not enabled yet."
      >
        {(id) => (
          <Select
            id={id}
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
          >
            <option value="en">English</option>
            <option
              value="fr"
              disabled={!flags.i18n_fr && initialLocale !== "fr"}
            >
              Français
            </option>
            <option
              value="pid"
              disabled={!flags.i18n_pid && initialLocale !== "pid"}
            >
              Pidgin
            </option>
          </Select>
        )}
      </Field>
      {!online && (
        <Feedback>
          Your saved profile is available. Connect to save changes to your
          details.
        </Feedback>
      )}
      {save.isError && <Feedback error>{friendlyError(save.error)}</Feedback>}
      {save.isSuccess && <Feedback success>Profile saved.</Feedback>}
      <Button
        icon={Save}
        type="submit"
        className="self-start"
        loading={save.isPending}
        disabled={
          !online ||
          !name.trim() ||
          (name.trim() === initialName && locale === initialLocale)
        }
      >
        Save details
      </Button>
    </form>
  )
}

export default function Profile() {
  const { session, signOut } = useAuth()
  const profile = useProfile()
  const online = useOnline()
  const syncedAt = useFacilitiesSyncedAt()
  const push = usePushSubscription()
  const queued = useLiveQuery(() => db.outbox.count(), [], 0)
  const [refreshing, setRefreshing] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [cleared, setCleared] = useState(false)
  const [storageError, setStorageError] = useState<string | null>(null)
  if (profile.isPending) return <PageSpinner />
  const p = profile.data
  const name = p?.display_name || session?.name || "Your profile"
  const members = p?.on_behalf_profiles?.length ?? 0
  return (
    <motion.div
      variants={staggerOnMount()}
      initial="hidden"
      animate="show"
      className="flex min-w-0 flex-col gap-5"
    >
      <PageHeader
        eyebrow="Your account"
        title="Profile"
        subtitle="Your details, your household and this phone."
      />
      <motion.section
        variants={popIn}
        className="relative isolate overflow-hidden rounded-xl p-4 lg:rounded-2xl lg:p-6"
        aria-label="Your account"
      >
        <Landscape className="-z-10" preserve="xMidYMid slice" />
        <div className="flex flex-wrap items-center gap-4 shape-bl p-5 glass-strong">
          <Avatar name={name} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-headline-m break-words">{name}</p>
            {(session?.phone || p?.phone) && (
              <p className="mt-1 text-body-m text-ink-600">
                {formatPhone(session?.phone ?? p?.phone ?? "")}
              </p>
            )}
          </div>
          <div className="w-full sm:w-auto"><SyncStatus /></div>
        </div>
      </motion.section>
      {profile.isError && (
        <Feedback error>{friendlyError(profile.error)}</Feedback>
      )}
      <motion.section
        variants={popIn}
        className="rounded-xl bg-white p-5 shadow-[var(--shadow-elev-1)]"
      >
        <h2 className="mb-4 flex items-center gap-3 text-title-l">
          <Globe className="size-5 text-brand-700" aria-hidden />
          Your details
        </h2>
        {p && (
          <DetailsForm
            key={`${p.display_name}-${p.locale}`}
            initialName={p.display_name ?? ""}
            initialLocale={p.locale ?? "en"}
          />
        )}
        {(p?.date_of_birth || p?.sex) && (
          <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5 text-body-m">
            <div>
              <dt className="text-ink-600">Date of birth · read only</dt>
              <dd>
                {p.date_of_birth ? formatDate(p.date_of_birth) : "Not recorded"}
              </dd>
            </div>
            <div>
              <dt className="text-ink-600">Sex · read only</dt>
              <dd className="capitalize">{p.sex ?? "Not recorded"}</dd>
            </div>
          </dl>
        )}
      </motion.section>
      <motion.section variants={popIn}>
        <Card className="flex flex-col items-start gap-4 shape-br bg-mint p-5">
          <Users className="size-7 text-brand-700" aria-hidden />
          <div>
            <h2 className="text-headline-s">Care for your household</h2>
            <p className="mt-2 text-body-m text-ink-600">
              {members} of 10 members. Ask for care on behalf of someone without
              a phone.
            </p>
          </div>
          <ButtonLink
            to="/app/profile/household"
            icon={Users}
            variant="secondary"
            trailing="arrow"
          >
            Household members
          </ButtonLink>
        </Card>
      </motion.section>
      <motion.section
        variants={popIn}
        className="flex flex-col gap-4 rounded-xl bg-white p-5 shadow-[var(--shadow-elev-1)]"
      >
        <h2 className="flex items-center gap-3 text-title-l">
          <Bell className="size-5 text-brand-700" aria-hidden />
          Notifications
        </h2>
        <p className="text-body-m text-ink-600">
          Check Consults for doctor replies. Push delivery is not active yet.
        </p>
        <Button
          variant="tonal"
          icon={push.subscribed ? Check : Bell}
          role="switch"
          aria-checked={push.subscribed}
          className="self-start"
          disabled={!flags.push || !push.supported || !online || !session}
          loading={push.loading}
          onClick={() =>
            void (push.subscribed ? push.unsubscribe() : push.subscribe())
          }
        >
          {push.subscribed ? "Notifications on" : "Notifications off"}
        </Button>
        {push.error && <Feedback error>{push.error}</Feedback>}
      </motion.section>
      <motion.section
        variants={popIn}
        className="flex flex-col gap-4 rounded-xl bg-white p-5 shadow-[var(--shadow-elev-1)]"
      >
        <h2 className="flex items-center gap-3 text-title-l">
          <Database className="size-5 text-brand-700" aria-hidden />
          Saved on this phone
        </h2>
        <p className="text-body-m text-ink-600">
          Facilities:{" "}
          {syncedAt
            ? `updated ${formatDate(syncedAt)}`
            : "built-in list available"}
          . {queued} item{queued === 1 ? "" : "s"} waiting to send.
        </p>
        <Button
          variant="tonal"
          icon={RefreshCw}
          className="self-start"
          disabled={!online}
          loading={refreshing}
          onClick={async () => {
            setRefreshing(true)
            setStorageError(null)
            try {
              await refreshFacilities()
            } catch (error) {
              setStorageError(friendlyError(error))
            } finally {
              setRefreshing(false)
            }
          }}
        >
          Refresh facilities
        </Button>
        {storageError && <Feedback error>{storageError}</Feedback>}
        {cleared && (
          <Feedback success>
            Health data saved on this phone was cleared.
          </Feedback>
        )}
        {confirmClear ? (
          <ConfirmAction
            title="Clear health data on this phone?"
            confirmLabel="Clear local data"
            onCancel={() => setConfirmClear(false)}
            onConfirm={async () => {
              try {
                await clearClinicalData()
                setCleared(true)
                setConfirmClear(false)
              } catch {
                setStorageError("Could not clear local data. Please try again.")
              }
            }}
          >
            {queued > 0 ? `${queued} unsent item(s) will be lost. ` : ""}This
            removes locally saved symptom checks, consultations, messages and
            voice notes.
          </ConfirmAction>
        ) : (
          <Button
            variant="secondary"
            icon={Trash2}
            className="self-start"
            onClick={() => setConfirmClear(true)}
          >
            Clear local data
          </Button>
        )}
      </motion.section>
      <motion.div variants={popIn} className="flex flex-wrap gap-3">
        <ButtonLink to="/about#privacy" icon={Shield} variant="ghost">
          Privacy & terms
        </ButtonLink>
        <Button
          variant="secondary"
          icon={LogOut}
          onClick={() => void signOut()}
        >
          Sign out
        </Button>
      </motion.div>
    </motion.div>
  )
}
