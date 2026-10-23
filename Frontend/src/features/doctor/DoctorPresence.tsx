import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Radio } from "lucide-react"
import { serviceApi } from "@/api/services"
import { useAuth } from "@/auth/AuthProvider"
import { flags } from "@/config/flags"
import { Button } from "@/design/components/Button"
import { ServiceError } from "@/design/components/ServicePage"
import { useOnline, useVisible } from "@/lib/hooks"
import { formatTime } from "@/lib/format"

export function DoctorPresence() {
  const { session } = useAuth(),
    online = useOnline(),
    visible = useVisible()
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
  return (
    <section
      aria-label="Doctor availability"
      className="flex flex-col items-start gap-3 rounded-xl bg-white p-5 shadow-[var(--shadow-elev-1)]"
    >
      <div className="flex w-full flex-wrap items-center justify-between gap-3">
        <h2 className="text-title-l">Your availability</h2>
        <Button
          icon={Radio}
          variant={available ? "tonal" : "secondary"}
          role="switch"
          aria-checked={available}
          aria-label="Available for consultations"
          onClick={() => setAvailable(!available)}
        >
          {available ? "Available" : "Away"}
        </Button>
      </div>
      <p role="status" className="text-body-m text-ink-600">
        {available
          ? !online
            ? "Offline · availability updates paused."
            : !visible
              ? "Updates pause while this tab is hidden."
              : heartbeat.data
                ? `Last heartbeat ${formatTime(heartbeat.data.last_seen)}. Updates every 2½ minutes while visible.`
                : "Updating your availability…"
          : "No new heartbeats are sent while away. You may remain listed for up to five minutes after the last heartbeat."}
      </p>
      <ServiceError error={heartbeat.error} />
      {heartbeat.isError && available && (
        <Button
          variant="tonal"
          disabled={!online}
          onClick={() => void heartbeat.refetch()}
        >
          Retry availability update
        </Button>
      )}
    </section>
  )
}
