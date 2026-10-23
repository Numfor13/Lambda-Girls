import { useState, type ReactNode } from "react"
import { motion } from "motion/react"
import { useAuth } from "@/auth/AuthProvider"
import { friendlyError } from "@/api/errors"
import { useOnline } from "@/lib/hooks"
import { useFacilities } from "@/offline/facilities"
import { SyncStatus } from "./AppChrome"
import { Feedback } from "./Feedback"
import { Field, Select } from "./Field"
import { PageHeader } from "./primitives"
import { popIn, staggerOnMount } from "@/design/motion"
import { SERVICE_DRAFT_PREFIX } from "@/lib/serviceDrafts"

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
  capability?: string
}) {
  const facilities = useFacilities()
  const available =
    facilities?.filter(
      (f) =>
        f.is_active &&
        (!capability || f.capabilities.includes(capability as never))
    ) ?? []
  return (
    <Field
      label="Facility"
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
          value={value}
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
  return error ? <Feedback error>{friendlyError(error)} Check the latest saved status before resubmitting a request.</Feedback> : null
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
