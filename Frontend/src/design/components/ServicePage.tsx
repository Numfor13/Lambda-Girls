import { useState, type ReactNode } from "react"
import { motion } from "motion/react"
import { useAuth } from "@/auth/AuthProvider"
import { ApiError, friendlyError } from "@/api/errors"
import { useOnline } from "@/lib/hooks"
import { useFacilities } from "@/offline/facilities"
import { SyncStatus } from "./AppChrome"
import { Feedback } from "./Feedback"
import { Field, Select } from "./Field"
import { PageHeader } from "./primitives"
import { popIn, staggerOnMount } from "@/design/motion"
import { SERVICE_DRAFT_PREFIX } from "@/lib/serviceDrafts"
import type { Capability } from "@/api/types"

export function ServicePage({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <motion.div
      variants={staggerOnMount()}
      initial="hidden"
      animate="show"
      className="flex min-w-0 flex-col gap-5"
    >
      <PageHeader eyebrow="Care services" title={title} subtitle={subtitle} />
      <div>
        <SyncStatus />
      </div>
      {children}
    </motion.div>
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
    <motion.section
      variants={popIn}
      className="flex min-w-0 flex-col gap-4 rounded-xl bg-white p-5 shadow-[var(--shadow-elev-1)]"
    >
      <h2 className="text-headline-s">{title}</h2>
      {children}
    </motion.section>
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
}: {
  value: string
  onChange: (id: string) => void
  capability?: Capability
}) {
  const facilities = useFacilities()
  const available =
    facilities?.filter(
      (f) => f.is_active && (!capability || f.capabilities.includes(capability))
    ) ?? []
  return (
    <Field
      label="Facility"
      error={
        value && facilities && !available.some((f) => f.facility_id === value)
          ? "The saved facility is unavailable. Choose another facility."
          : undefined
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
          value={available.some((f) => f.facility_id === value) ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Choose a facility</option>
          {available.map((f) => (
            <option key={f.facility_id} value={f.facility_id}>
              {f.name}
            </option>
          ))}
        </Select>
      )}
    </Field>
  )
}
export function ConnectionNote() {
  const online = useOnline()
  return (
    <p role="status" className="text-body-m text-ink-600">
      {online
        ? "Connected · requests send when you submit."
        : "Offline · keep your draft here. Connect to submit."}{" "}
      These requests are not sent automatically.
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
      {saved
        ? "Draft saved on this phone. Sign out to clear service drafts."
        : "Draft storage unavailable. Keep this page open until you submit."}
    </p>
  )
}
