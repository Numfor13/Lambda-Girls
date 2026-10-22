import { useState } from "react"
import { Link } from "react-router-dom"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useLiveQuery } from "dexie-react-hooks"
import { ChevronRight, Database, LogOut, Shield, Users } from "lucide-react"
import { profileApi } from "@/api/endpoints"
import { friendlyError } from "@/api/errors"
import { useAuth } from "@/auth/AuthProvider"
import { Button } from "@/design/components/Button"
import { Field, Input, Select } from "@/design/components/Field"
import { Avatar, Card, Notice, PageSpinner } from "@/design/components/primitives"
import { flags } from "@/config/flags"
import { formatDate, formatPhone } from "@/lib/format"
import { clearClinicalData, db } from "@/offline/db"
import { refreshFacilities, useFacilitiesSyncedAt } from "@/offline/facilities"
import { useOnline } from "@/lib/hooks"
import { usePushSubscription } from "@/lib/usePushSubscription"
import { useProfile } from "./useProfile"

function NameForm({ initial }: { initial: string }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(initial)
  const save = useMutation({
    mutationFn: () => profileApi.update({ display_name: name.trim() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profile"] }),
  })
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <Field label="Display name">
        {(id) => (
          <Input id={id} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
        )}
      </Field>
      {save.isError && <Notice tone="error">{friendlyError(save.error)}</Notice>}
      {save.isSuccess && <Notice tone="success">Saved.</Notice>}
      <Button
        type="submit"
        size="sm"
        className="self-start"
        loading={save.isPending}
        disabled={!name.trim() || name.trim() === initial}
      >
        Save
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
  const [cleared, setCleared] = useState(false)

  if (profile.isPending) return <PageSpinner />

  const p = profile.data
  const displayName = p?.display_name ?? session?.name ?? ""

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-4">
        <Avatar name={displayName || "?"} size="lg" />
        <div>
          <h1 className="text-headline-l">{displayName}</h1>
          {(session?.phone || p?.phone) && (
            <p className="text-body-l text-ink-600">{formatPhone(session?.phone ?? p?.phone ?? "")}</p>
          )}
        </div>
      </header>

      {profile.isError && <Notice tone="error">{friendlyError(profile.error)}</Notice>}

      <Card className="p-5">
        <h2 className="text-[17px] font-bold">Your details</h2>
        <div className="mt-4">
          <NameForm key={displayName} initial={displayName} />
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-4 text-body-l">
          <div>
            <dt className="text-body-m text-ink-600">Date of birth</dt>
            <dd className="font-medium">{p?.date_of_birth ? formatDate(p.date_of_birth) : "—"}</dd>
          </div>
          <div>
            <dt className="text-body-m text-ink-600">Sex</dt>
            <dd className="font-medium capitalize">{p?.sex ?? "—"}</dd>
          </div>
        </dl>
        <div className="mt-5">
          <Field label="Language" hint="Français and Pidgin are coming soon.">
            {(id) => (
              <Select id={id} value="en" onChange={() => undefined}>
                <option value="en">English</option>
                <option value="fr" disabled={!flags.i18n_fr}>
                  Français
                </option>
                <option value="pid" disabled={!flags.i18n_pid}>
                  Pidgin
                </option>
              </Select>
            )}
          </Field>
        </div>
      </Card>

      <nav aria-label="Profile" className="flex flex-col overflow-hidden rounded-xl bg-white shadow-[var(--shadow-elev-1)]">
        {[
          { to: "/app/profile/household", label: "Household members", icon: Users },
          { to: "/about#privacy", label: "Privacy & terms", icon: Shield },
        ].map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className="flex h-14 items-center gap-3 border-b border-line px-4 font-medium last:border-0 hover:bg-cream"
          >
            <l.icon className="size-5 text-brand-700" aria-hidden />
            <span className="flex-1">{l.label}</span>
            <ChevronRight className="size-5 text-ink-400" aria-hidden />
          </Link>
        ))}
      </nav>

      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-[17px] font-bold">
          <Database className="size-5 text-brand-700" aria-hidden /> Saved on this phone
        </h2>
        <ul className="mt-3 space-y-2 text-body-l">
          <li className="flex flex-wrap items-center justify-between gap-2">
            <span>
              Facilities {syncedAt ? `updated ${formatDate(syncedAt)}` : "(built-in list)"}
            </span>
            {online && (
              <button
                type="button"
                className="text-body-m font-semibold text-brand-700"
                disabled={refreshing}
                onClick={async () => {
                  setRefreshing(true)
                  await refreshFacilities().catch(() => undefined)
                  setRefreshing(false)
                }}
              >
                {refreshing ? "Refreshing…" : "Refresh now"}
              </button>
            )}
          </li>
          <li>
            {queued} item{queued === 1 ? "" : "s"} waiting to send
          </li>
          {push.supported && session && (
            <li className="flex flex-wrap items-center justify-between gap-2">
              <span>Doctor reply notifications</span>
              <button
                type="button"
                className="text-body-m font-semibold text-brand-700 disabled:opacity-50"
                disabled={push.loading}
                onClick={push.subscribed ? push.unsubscribe : push.subscribe}
              >
                {push.loading ? "…" : push.subscribed ? "Turn off" : "Turn on"}
              </button>
            </li>
          )}
        </ul>
        {push.error && <Notice tone="error" className="mt-3 text-body-m">{push.error}</Notice>}
        {cleared && (
          <Notice tone="success" className="mt-3">
            Health data on this phone was cleared.
          </Notice>
        )}
        <Button
          variant="secondary"
          size="sm"
          className="mt-4"
          onClick={async () => {
            const warn =
              queued > 0
                ? `${queued} item(s) haven't been sent yet and will be lost. Clear anyway?`
                : "Remove symptom checks, messages and voice notes saved on this phone?"
            if (!window.confirm(warn)) return
            await clearClinicalData()
            setCleared(true)
          }}
        >
          Clear local data
        </Button>
      </Card>

      <Button variant="ghost" className="self-start" onClick={() => void signOut()}>
        <LogOut className="size-5" aria-hidden />
        Log out
      </Button>
    </div>
  )
}
