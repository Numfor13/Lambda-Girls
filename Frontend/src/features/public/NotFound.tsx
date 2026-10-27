import { homeFor, useAuth } from "@/auth/AuthProvider"
import { RecoveryPanel } from "@/design/components/RecoveryPanel"
import { RecoveryScene } from "@/design/components/RecoveryScene"
import { useOnline } from "@/lib/hooks"
export default function NotFound() {
  const { session } = useAuth()
  const online = useOnline()
  return (
    <RecoveryScene>
      <RecoveryPanel title="We couldn't find that page" home={homeFor(session)}>
        {online
          ? "The link may have changed. Return home or go back to the previous page."
          : "You are offline. This link is unavailable, but you can still open the facilities saved on this phone."}
      </RecoveryPanel>
    </RecoveryScene>
  )
}
