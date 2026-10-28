import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { serviceApi } from "@/api/services"
import { useAuth } from "@/auth/AuthProvider"
import { flags } from "@/config/flags"
import { PulseDot } from "@/design/components/Lively"
import { Switch } from "@/design/components/Staff"
import { useOnline, useVisible } from "@/lib/hooks"

/**
 * "Available for new cases" (QA K2). While on, a heartbeat every 2½ minutes keeps the doctor
 * listed as online for patients; it pauses when the tab is hidden or offline.
 */
export function DoctorPresence() {
  const { session } = useAuth()
  const online = useOnline()
  const visible = useVisible()
  const [available, setAvailable] = useState(false)
  const heartbeat = useQuery({
    queryKey: ["doctor-presence", session?.sub],
    queryFn: serviceApi.presence,
    enabled: flags.doctors_available && available && online && visible,
    refetchInterval: available && online && visible ? 150_000 : false,
    retry: false,
    staleTime: 0,
  })
  if (!flags.doctors_available) return null

  const status = !available
    ? "Patients don't see you as online"
    : !online
      ? "You're offline · paused"
      : !visible
        ? "Paused while this tab is hidden"
        : heartbeat.isError
          ? "Couldn't update · retrying soon"
          : "Patients see you as online"

  return (
    <section aria-label="Your availability" className="flex items-center gap-3 rounded-full bg-white py-1 pr-1 pl-4 shadow-[var(--shadow-elev-1)]">
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-label-l text-ink-900">
          <PulseDot tone={available && online && visible && !heartbeat.isError ? "green" : "muted"} live={available && online && visible} />
          Available for new cases
        </span>
        <span role="status" className="block text-label-m font-normal text-ink-600">
          {status}
        </span>
      </span>
      <Switch checked={available} onChange={setAvailable} label="Available for new cases" />
    </section>
  )
}
