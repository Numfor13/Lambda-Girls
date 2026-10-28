import { useState, type ReactNode, type Ref } from "react"
import { useAuth } from "@/auth/AuthProvider"
import { ApiError, friendlyError } from "@/api/errors"
import { useOnline } from "@/lib/hooks"
import { useFacilities } from "@/offline/facilities"
import { SyncStatus } from "./AppChrome"
import { Feedback } from "./Feedback"
import { Field, Input, Select } from "./Field"
import { AppPage, Panel } from "./AppPage"
import { SERVICE_DRAFT_PREFIX } from "@/lib/serviceDrafts"
import type { Capability } from "@/api/types"

export function ServicePage({
  title,
  subtitle,
  children,
  aside,
  actions,
  back,
}: {
  title: string
  subtitle: string
  children: ReactNode
  aside?: ReactNode
  actions?: ReactNode
  back?: ReactNode
}) {
  return (
    <AppPage
      eyebrow="Care services"
      title={title}
      subtitle={subtitle}
      actions={
        <>
          <SyncStatus />
          {actions}
        </>
      }
      aside={aside}
      back={back}
    >
      {children}
    </AppPage>
  )
}
export function ServiceCard({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <Panel title={title}>
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
    </Panel>
  )
}
export function ServiceStatus({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex self-start rounded-full bg-mint px-3 py-2 text-label-m text-brand-900">
      {children}
    </span>
  )
}
export function FacilitySelect({
  value,
  onChange,
  capability,
  searchable = false,
  error,
  onBlur,
  inputRef,
}: {
  value: string
  onChange: (id: string) => void
  capability?: Capability
  searchable?: boolean
  error?: string
  onBlur?: () => void
  inputRef?: Ref<HTMLSelectElement>
}) {
  const facilities = useFacilities()
  const [search, setSearch] = useState("")
  const available =
    facilities?.filter(
      (f) => f.is_active && (!capability || f.capabilities.includes(capability))
    ) ?? []
  const matching = available.filter(
    (f) =>
      f.facility_id === value ||
      `${f.name} ${f.quarter}`.toLowerCase().includes(search.toLowerCase())
  )
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {searchable && (
        <Field label="Search facilities">
          {(id) => (
            <Input
              id={id}
              type="search"
              maxLength={100}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or quarter"
            />
          )}
        </Field>
      )}
      <Field
        label="Facility"
        required
        error={
          error ??
          (value &&
          facilities &&
          !available.some((f) => f.facility_id === value)
            ? "The saved facility is unavailable. Choose another facility."
            : undefined)
        }
        hint={
          available.length
            ? undefined
            : "No matching facilities in the saved directory. Refresh facilities in Profile when connected."
        }
      >
        {(id) => (
          <Select
            id={id}
            required
            {...{ ref: inputRef }}
            onBlur={onBlur}
            aria-invalid={Boolean(error)}
            value={available.some((f) => f.facility_id === value) ? value : ""}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">Choose a facility</option>
            {matching.map((f) => (
              <option key={f.facility_id} value={f.facility_id}>
                {f.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
    </div>
  )
}
/** Only says something when it matters: offline, the request waits for a connection (QA C5). */
export function ConnectionNote() {
  const online = useOnline()
  if (online) return null
  return (
    <p role="status" className="text-body-m text-ink-600">
      You&apos;re offline. Your draft is kept here; send it when you&apos;re back online.
    </p>
  )
}
export function ServiceError({ error }: { error: unknown }) {
  if (!error) return null
  const message =
    error instanceof ApiError && error.status === 0
      ? "Connection interrupted. Connect and refresh to check the latest status before submitting again."
      : error instanceof ApiError && error.status === 409
        ? "The status changed or this request already exists. Refresh before trying again."
        : error instanceof ApiError && error.status === 400
          ? error.message
          : error instanceof ApiError && error.status === 401
            ? "This session is no longer authorized. Sign in again, or start a new anonymous session."
            : friendlyError(error)
  return <Feedback error>{message}</Feedback>
}

/** Drafts only: the server has no deduplication contract for these POSTs. */
export function useServiceDraft<T>(kind: string, initial: T) {
  const { session } = useAuth()
  const key = `${SERVICE_DRAFT_PREFIX}${session?.sub ?? "public"}:${kind}`
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : initial
    } catch {
      return initial
    }
  })
  const [saved, setSaved] = useState(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
      return true
    } catch {
      return false
    }
  })
  const update = (next: T) => {
    try {
      localStorage.setItem(key, JSON.stringify(next))
      setSaved(true)
    } catch {
      setSaved(false)
    }
    setValue(next)
  }
  return { value, setValue: update, saved, reset: () => update(initial) }
}

export function DraftNote({ saved }: { saved: boolean }) {
  return (
    <p className="text-label-m text-ink-600">
      {saved ? "Your draft is saved on this phone." : "Keep this page open until you send it."}
    </p>
  )
}
