import { homeFor, useAuth } from "@/auth/AuthProvider"
import { ButtonLink } from "@/design/components/Button"
import { RecoveryPanel } from "@/design/components/RecoveryPanel"
import { useOnline } from "@/lib/hooks"
import { MapPin } from "lucide-react"
export default function NotFound() {
  const { session } = useAuth()
  const online = useOnline()
  return (
    <div className="container-page flex flex-col items-center gap-5 py-14">
      <RecoveryPanel title="We couldn't find that page" home={homeFor(session)}>
        {online
          ? "The link may have changed. Return home or go back to the previous page."
          : "You are offline. This link is unavailable, but you can still open the facilities saved on this phone."}
      </RecoveryPanel>
      <ButtonLink to="/app/facilities" icon={MapPin} variant="tonal">
        Find a facility
      </ButtonLink>
    </div>
  )
}
