import { useState } from "react"
import { Link } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLiveQuery } from "dexie-react-hooks"
import { motion } from "motion/react"
import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  Droplet,
  FlaskConical,
  History,
  LogOut,
  Plus,
  RefreshCw,
  Save,
  Shield,
  Trash2,
  type LucideIcon,
} from "lucide-react"
import { consultApi, profileApi, triageApi } from "@/api/endpoints"
import { friendlyError } from "@/api/errors"
import type { Locale } from "@/api/types"
import { useAuth } from "@/auth/AuthProvider"
import { flags } from "@/config/flags"
import { AppPage, Panel } from "@/design/components/AppPage"
import { Button } from "@/design/components/Button"
import { Field, Input, Select } from "@/design/components/Field"
import { ConfirmAction, Feedback } from "@/design/components/Feedback"
import { FormGuard } from "@/design/components/FormGuard"
import { NumberTicker, Skeleton } from "@/design/components/Lively"
import { Avatar } from "@/design/components/primitives"
import { toast } from "@/design/components/Toast"
import { SPRING, popIn, staggerOnMount } from "@/design/motion"
import { ageInMonths, describeAge, formatDate, formatPhone } from "@/lib/format"
import { rules, useForm } from "@/lib/form"
import { useNow, useOnline } from "@/lib/hooks"
import { humanize, plural } from "@/lib/labels"
import { usePushSubscription } from "@/lib/usePushSubscription"
import { cn } from "@/lib/utils"
import { clearClinicalData, db } from "@/offline/db"
import { refreshFacilities, useFacilitiesSyncedAt } from "@/offline/facilities"
import { useProfile } from "./useProfile"

function DetailsForm({ initialName, initialLocale }: { initialName: string; initialLocale: Locale }) {
  const qc = useQueryClient()
  const online = useOnline()
  const form = useForm(
    { display_name: initialName, locale: initialLocale },
    {
      display_name: [rules.required("Enter your display name."), rules.minLength(2), rules.maxLength(100)],
      locale: [rules.required()],
    },
  )
  const save = useMutation({
    mutationFn: () => profileApi.update({ display_name: form.values.display_name.trim(), locale: form.values.locale }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["profile"] })
      toast("Profile saved")
    },
  })
  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (form.check() && online && !save.isPending) save.mutate()
      }}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Display name" required error={form.error("display_name")} count={form.values.display_name.length} max={100}>
          {(id) => <Input id={id} autoComplete="name" maxLength={100} disabled={save.isPending} {...form.bind("display_name")} />}
        </Field>
        <Field label="Language" required error={form.error("locale")} hint="French and Pidgin are coming soon.">
          {(id) => (
            <Select id={id} disabled={save.isPending} {...form.bind("locale")}>
              <option value="en">English</option>
              <option value="fr" disabled={!flags.i18n_fr && initialLocale !== "fr"}>
                Français
              </option>
              <option value="pid" disabled={!flags.i18n_pid && initialLocale !== "pid"}>
                Pidgin
              </option>
            </Select>
          )}
        </Field>
      </div>
      {!online && <Feedback>You&apos;re offline. Connect to save changes to your details.</Feedback>}
      {save.isError && <Feedback error>{friendlyError(save.error)}</Feedback>}
      <div className="flex items-center gap-3">
        <Button type="submit" icon={Save} loading={save.isPending} disabled={!online || !form.dirty}>
          Save details
        </Button>
        {!form.dirty && <span className="text-body-m text-ink-600">No changes</span>}
      </div>
      <FormGuard when={form.dirty && !save.isPending} />
    </form>
  )
}

const SERVICES: { enabled: boolean; to: string; title: string; sub: string; icon: LucideIcon }[] = [
  { enabled: flags.appointments, to: "/app/appointments", title: "Appointments", sub: "Request and track visits", icon: CalendarDays },
  { enabled: flags.lab_tests, to: "/app/labs", title: "Lab tests", sub: "Request and follow each step", icon: FlaskConical },
  { enabled: flags.blood, to: "/app/blood", title: "Blood request", sub: "Reach blood banks", icon: Droplet },
  {
    enabled: flags.consult_history || flags.receipts,
    to: "/app/history",
    title: "History & receipts",
    sub: "Checks, consults, payments",
    icon: History,
  },
  { enabled: flags.health_tips, to: "/tips", title: "Health tips", sub: "With named sources", icon: BookOpen },
]

export default function Profile() {
  const { session, signOut } = useAuth()
  const profile = useProfile()
  const online = useOnline()
  const now = useNow(3_600_000)
  const syncedAt = useFacilitiesSyncedAt()
  const push = usePushSubscription()
  const queued = useLiveQuery(() => db.outbox.count(), [], 0)
  // Server counts when we have them (a new phone has no local copies); this phone's otherwise.
  const localChecks = useLiveQuery(() => db.triage_results.count(), [], 0)
  const localConsults = useLiveQuery(() => db.consultations.count(), [], 0)
  const remoteChecks = useQuery({ queryKey: ["triage-results"], queryFn: triageApi.list, enabled: Boolean(session) })
  const remoteConsults = useQuery({ queryKey: ["consultations"], queryFn: consultApi.list, enabled: Boolean(session) })
  const checks = Math.max(localChecks, remoteChecks.data?.count ?? 0)
  const consults = Math.max(localConsults, remoteConsults.data?.consultations.length ?? 0)
  const [refreshing, setRefreshing] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [storageError, setStorageError] = useState<string | null>(null)

  const p = profile.data
  const name = p?.display_name || session?.name || "Your profile"
  const phone = session?.phone ?? p?.phone
  const members = p?.on_behalf_profiles ?? []

  const aside = (
    <>
      <Panel title="Notifications">
        <div className="flex items-start justify-between gap-4">
          <p className="text-body-m text-ink-600">
            {flags.push && push.supported
              ? "Get a notice on this phone when a doctor replies."
              : "Replies show in Consults. Phone notifications aren't available yet."}
          </p>
          <button
            type="button"
            role="switch"
            aria-checked={push.subscribed}
            aria-label="Notifications"
            disabled={!flags.push || !push.supported || !online || !session || push.loading}
            onClick={() => void (push.subscribed ? push.unsubscribe() : push.subscribe())}
            className={cn(
              "relative h-10 w-[68px] shrink-0 rounded-full transition-colors disabled:opacity-40",
              push.subscribed ? "bg-brand-700" : "bg-ink-900/15",
            )}
          >
            <motion.span
              className="absolute top-1 left-1 size-8 rounded-full bg-white shadow"
              animate={{ x: push.subscribed ? 28 : 0 }}
              transition={SPRING.fast}
            />
          </button>
        </div>
        {push.error && <Feedback error className="mt-3">{push.error}</Feedback>}
      </Panel>

      <Panel title="Saved on this phone">
        <dl className="flex flex-col gap-2 text-body-m">
          <div className="flex justify-between gap-4">
            <dt className="text-ink-600">Facility directory</dt>
            <dd>{syncedAt ? `Updated ${formatDate(syncedAt)}` : "Built in"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-600">Waiting to send</dt>
            <dd className="tabular">{queued ? plural(queued, "item") : "Nothing"}</dd>
          </div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="tonal"
            size="sm"
            icon={RefreshCw}
            disabled={!online}
            loading={refreshing}
            onClick={async () => {
              setRefreshing(true)
              setStorageError(null)
              try {
                await refreshFacilities()
                toast("Facility directory refreshed")
              } catch (error) {
                setStorageError(friendlyError(error))
              } finally {
                setRefreshing(false)
              }
            }}
          >
            Refresh facilities
          </Button>
          {!confirmClear && (
            <Button variant="ghost" size="sm" icon={Trash2} className="text-urgent-red hover:bg-urgent-red-50" onClick={() => setConfirmClear(true)}>
              Clear health data
            </Button>
          )}
        </div>
        {storageError && <Feedback error className="mt-3">{storageError}</Feedback>}
        {confirmClear && (
          <div className="mt-4">
            <ConfirmAction
              title="Clear health data on this phone?"
              confirmLabel="Clear local data"
              onCancel={() => setConfirmClear(false)}
              onConfirm={async () => {
                try {
                  await clearClinicalData()
                  setConfirmClear(false)
                  toast("Local health data cleared")
                } catch {
                  setStorageError("Could not clear local data. Please try again.")
                }
              }}
            >
              {queued > 0 ? `${plural(queued, "unsent item")} will be lost. ` : ""}Saved symptom checks, consultations,
              messages and voice notes will be removed from this phone. This cannot be undone.
            </ConfirmAction>
          </div>
        )}
      </Panel>

      <motion.div variants={popIn} className="flex flex-col gap-1 rounded-xl bg-white p-2 shadow-[var(--shadow-elev-1)]">
        <Link
          to="/about#privacy"
          className="flex min-h-12 items-center gap-3 rounded-lg px-3 text-label-l text-ink-900 hover:bg-cream"
        >
          <Shield className="size-5 text-brand-700" aria-hidden />
          <span className="flex-1">Privacy & terms</span>
          <ChevronRight className="size-4 text-ink-400" aria-hidden />
        </Link>
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex min-h-12 items-center gap-3 rounded-lg px-3 text-left text-label-l text-ink-900 hover:bg-cream"
        >
          <LogOut className="size-5 text-brand-700" aria-hidden />
          Sign out
        </button>
      </motion.div>
    </>
  )

  return (
    <AppPage eyebrow="Your account" title="Profile" aside={aside}>
      {/* Identity card: who this account is, and what it holds (Oura/Apple ID summary). */}
      <motion.section
        variants={popIn}
        className="relative isolate overflow-hidden rounded-2xl bg-brand-900 p-6 text-white sm:p-7"
        aria-label="Your account"
      >
        <div className="absolute -top-24 -right-16 -z-10 size-72 rounded-full bg-brand-500/30 blur-[80px]" aria-hidden />
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar name={name} size="lg" className="ring-4 ring-white/15" />
            <div className="min-w-0">
              <p className="truncate font-display text-[28px] leading-tight font-[460]">{name}</p>
              <p className="mt-1 text-body-m text-white/70">
                {[phone ? formatPhone(phone) : null, "Patient"].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
          <dl className="grid grid-cols-3 gap-2 sm:gap-6">
            {[
              { n: checks, l: "Checks" },
              { n: consults, l: "Consults" },
              { n: members.length, l: "Household" },
            ].map((s) => (
              <div key={s.l} className="flex flex-col-reverse rounded-lg bg-white/[0.07] px-3 py-2 sm:bg-transparent sm:p-0">
                <dt className="text-label-m text-white/65">{s.l}</dt>
                <dd className="font-display text-[28px] leading-none font-[440]">
                  <NumberTicker value={s.n} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </motion.section>

      {profile.isError && (
        <Feedback error>
          {friendlyError(profile.error)}{" "}
          <Button variant="tonal" size="sm" onClick={() => void profile.refetch()}>
            Try again
          </Button>
        </Feedback>
      )}

      <Panel title="Your details">
        {profile.isPending ? (
          <div className="grid gap-5 sm:grid-cols-2" role="status" aria-label="Loading your details">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : p ? (
          <DetailsForm key={`${p.display_name}-${p.locale}`} initialName={p.display_name ?? ""} initialLocale={p.locale ?? "en"} />
        ) : (
          <Feedback>Your profile could not be loaded.</Feedback>
        )}
        {(p?.date_of_birth || p?.sex) && (
          <dl className="mt-5 grid gap-4 border-t border-line pt-5 text-body-m sm:grid-cols-2">
            <div>
              <dt className="text-ink-600">Date of birth</dt>
              <dd className="mt-0.5 text-title-m">{p.date_of_birth ? formatDate(p.date_of_birth) : "Not recorded"}</dd>
            </div>
            <div>
              <dt className="text-ink-600">Sex</dt>
              <dd className="mt-0.5 text-title-m">{p.sex ? humanize(p.sex) : "Not recorded"}</dd>
            </div>
            <p className="text-body-m text-ink-600 sm:col-span-2">Recorded at sign-up. Ask support to correct them.</p>
          </dl>
        )}
      </Panel>

      <Panel
        title="Household"
        action={
          <Link
            to="/app/profile/household"
            className="-mr-2 inline-flex min-h-10 items-center rounded-full px-3 text-label-l text-brand-700 hover:bg-mint"
          >
            {members.length ? "Manage" : "Add someone"}
          </Link>
        }
      >
        <p className="text-body-m text-ink-600">
          {members.length
            ? `${plural(members.length, "person", "people")} of 10. You can check symptoms and message a doctor for them.`
            : "Add the people you care for. You can then ask for them without their own phone."}
        </p>
        <motion.ul className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(min(100%,200px),1fr))] gap-2" variants={staggerOnMount(0.05)}>
          {members.map((m) => (
            <motion.li key={m.member_id} variants={popIn}>
              <Link
                to="/app/profile/household"
                className="flex items-center gap-3 rounded-lg bg-cream p-3 transition-colors hover:bg-mint"
              >
                <Avatar name={m.name} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate text-label-l">{m.name}</span>
                  <span className="block truncate text-body-m text-ink-600">
                    {humanize(m.relationship)} · {describeAge(ageInMonths(m.dob, now))}
                  </span>
                </span>
              </Link>
            </motion.li>
          ))}
          {members.length < 10 && (
            <li>
              <Link
                to="/app/profile/household"
                className="flex h-full min-h-[60px] items-center gap-3 rounded-lg p-3 text-label-l text-brand-700 ring-1 ring-brand-500/30 ring-inset hover:bg-mint"
              >
                <span className="flex size-9 items-center justify-center rounded-full bg-mint">
                  <Plus className="size-4" aria-hidden />
                </span>
                Add someone
              </Link>
            </li>
          )}
        </motion.ul>
      </Panel>

      {SERVICES.some((s) => s.enabled) && (
        <Panel title="Care services">
          <motion.ul className="grid gap-2 sm:grid-cols-2" variants={staggerOnMount(0.04)}>
            {SERVICES.filter((s) => s.enabled).map(({ to, title, sub, icon: Icon }) => (
              <motion.li key={to} variants={popIn}>
                <Link to={to} className="group flex min-h-16 items-center gap-3 rounded-lg p-3 transition-colors hover:bg-cream">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-mint text-brand-700 transition-transform duration-200 group-hover:-translate-y-0.5">
                    <Icon className="size-5" strokeWidth={1.9} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-label-l">{title}</span>
                    <span className="block text-body-m text-ink-600">{sub}</span>
                  </span>
                  <ChevronRight className="size-4 text-ink-400 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </motion.li>
            ))}
          </motion.ul>
        </Panel>
      )}
    </AppPage>
  )
}
