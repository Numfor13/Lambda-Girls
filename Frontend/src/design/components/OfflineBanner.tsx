import { Link, useLocation } from "react-router-dom"
import { useLiveQuery } from "dexie-react-hooks"
import { useAuth } from "@/auth/AuthProvider"
import { RefreshCw, WifiOff } from "lucide-react"
import { db } from "@/offline/db"
import { syncOutbox } from "@/offline/sync"
import { useOnline } from "@/lib/hooks"

export function OfflineBanner() {
  const online = useOnline()
  const { session } = useAuth()
  const { pathname } = useLocation()
  const queued = useLiveQuery(() => db.outbox.count(), [], 0)

  if (online && queued === 0) return null

  if (!online) {
    return (
      <div
        role="status"
        className="flex items-center justify-center gap-2 bg-brand-900 px-4 py-2 text-center text-[13px] text-white"
      >
        <WifiOff className="size-4 shrink-0" aria-hidden />
        <span>
          You're offline — changes will sync when you're back
          {queued > 0 && <strong className="ml-1">· {queued} waiting</strong>}
        </span>
      </div>
    )
  }

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-3 bg-mint px-4 py-2 text-[13px] text-brand-900"
    >
      <span>
        {queued} item{queued === 1 ? "" : "s"} {session ? "waiting to send" : "saved on this phone"}
      </span>
      {session ? (
        <button
          type="button"
          onClick={() => void syncOutbox()}
          className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"
        >
          <RefreshCw className="size-3.5" aria-hidden />
          Sync now
        </button>
      ) : (
        <Link
          to={`/sign-in?returnTo=${encodeURIComponent(pathname)}`}
          className="font-semibold underline underline-offset-2"
        >
          Log in to send
        </Link>
      )}
    </div>
  )
}
