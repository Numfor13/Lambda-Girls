import { useRef, useState } from "react"
import { MapPin } from "lucide-react"
import { serviceApi, type Emergency } from "@/api/services"
import { friendlyError } from "@/api/errors"
import { flags } from "@/config/flags"
import { useAuth } from "@/auth/AuthProvider"
import { useOnline } from "@/lib/hooks"
import { formatTime } from "@/lib/format"
import { Button, ButtonLink } from "./Button"
import { Feedback } from "./Feedback"
import { StatusMark } from "./primitives"

/** Explicit live action: location is never cached or silently queued. Claude wires into RED results. */
export function EmergencyShare({
  triageResultId,
}: {
  triageResultId?: string
}) {
  const online = useOnline(),
    { session } = useAuth()
  const pending = useRef(false)
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [sent, setSent] = useState<Emergency | null>(null)
  if (!flags.emergency) return null
  const share = async () => {
    if (pending.current || sent || !online || !session) return
    pending.current = true
    setBusy(true)
    setError(null)
    try {
      if (!navigator.geolocation)
        throw new Error(
          "Location is unavailable on this device. Call 15 or ask someone nearby for help."
        )
      const p = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 15_000,
        })
      )
      if (!navigator.onLine)
        throw new Error(
          "You are offline. Your location was not shared. Connect and try again."
        )
      setSent(
        await serviceApi.emergency({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          ...(triageResultId ? { triage_result_id: triageResultId } : {}),
        })
      )
    } catch (e) {
      setError(
        e && typeof e === "object" && "code" in e && e.code === 1
          ? "Location permission was denied. Enable location in browser settings or call 15 for help."
          : e instanceof Error && !("status" in e)
            ? e.message
            : friendlyError(e)
      )
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  return (
    <section
      className="flex flex-col items-start gap-4 rounded-xl bg-white p-5 shadow-[var(--shadow-elev-1)]"
      aria-label="Share emergency location"
    >
      <h2 className="text-headline-s">Help the operator find you</h2>
      <p className="text-body-m text-ink-600">
        Your precise location will be shared with CareBridge operators. This
        does not replace calling 15 or guarantee a response.
      </p>
      {sent ? (
        <>
          <StatusMark state="done" icon={MapPin} />
          <p role="status" className="text-title-m">
            Location shared at {formatTime(sent.timestamp)}
          </p>
          <p className="text-body-m">Operators can see this for 24 hours.</p>
          {!sent.alert_sent && (
            <Feedback>
              The location was saved, but the operator alert could not be sent.
              Call 15 for urgent help.
            </Feedback>
          )}
        </>
      ) : !session ? (
        <ButtonLink to="/sign-in" variant="tonal">
          Sign in to share location
        </ButtonLink>
      ) : (
        <>
          <p role="status" className="text-label-m text-ink-600">
            {online
              ? "Connection required · shared only when you press the button"
              : "Offline · connect to share your location"}
          </p>
          <Button
            full
            icon={MapPin}
            variant="danger"
            disabled={!online}
            loading={busy}
            onClick={() => void share()}
          >
            <span className="whitespace-normal">
              Share my location with the operator
            </span>
          </Button>
        </>
      )}
      {error && (
        <Feedback error>
          {error} If the connection failed after sending, check with the
          operator before retrying.
        </Feedback>
      )}
    </section>
  )
}
