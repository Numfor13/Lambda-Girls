import { Link, useLocation } from "react-router-dom"
import { useLiveQuery } from "dexie-react-hooks"
import { AnimatePresence, motion } from "motion/react"
import { RefreshCw, WifiOff } from "lucide-react"
import { useAuth } from "@/auth/AuthProvider"
import { SPRING } from "@/design/motion"
import { db } from "@/offline/db"
import { syncOutbox } from "@/offline/sync"
import { useOnline } from "@/lib/hooks"
import { cn } from "@/lib/utils"

/** Offline / waiting-to-sync notice. Drops in as a floating pill so the page never jumps. */
export function OfflineBanner() {
  const online = useOnline()
  const { session } = useAuth()
  const { pathname } = useLocation()
  const queued = useLiveQuery(() => db.outbox.count(), [], 0)
  const show = !online || queued > 0

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -16, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.95 }}
          transition={SPRING.default}
          className="flex justify-center px-4 pt-3"
        >
          <div
            role="status"
            className={cn(
              "flex items-center gap-3 rounded-full px-4 py-2 text-label-m",
              online ? "glass text-brand-900" : "bg-brand-900 text-white shadow-[var(--shadow-elev-2)]",
            )}
          >
            {!online ? (
              <>
                <WifiOff className="size-4 shrink-0" aria-hidden />
                <span>
                  You're offline — changes sync when you're back
                  {queued > 0 && <strong className="ml-1">· {queued} waiting</strong>}
                </span>
              </>
            ) : (
              <>
                <span>
                  {queued} item{queued === 1 ? "" : "s"} {session ? "waiting to send" : "saved on this phone"}
                </span>
                {session ? (
                  <button
                    type="button"
                    onClick={() => void syncOutbox()}
                    className="inline-flex items-center gap-1 font-semibold text-brand-700 underline underline-offset-2"
                  >
                    <RefreshCw className="size-3.5" aria-hidden />
                    Sync now
                  </button>
                ) : (
                  <Link
                    to={`/sign-in?returnTo=${encodeURIComponent(pathname)}`}
                    className="font-semibold text-brand-700 underline underline-offset-2"
                  >
                    Log in to send
                  </Link>
                )}
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
