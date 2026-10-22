import { Check, Hourglass, RefreshCw, TriangleAlert } from "lucide-react"
import type { SyncState } from "@/offline/db"
import { retryFailed } from "@/offline/outbox"
import { syncOutbox } from "@/offline/sync"
import { cn } from "@/lib/utils"

const META: Record<SyncState, { label: string; icon: typeof Check; className: string }> = {
  queued: { label: "Waiting to send", icon: Hourglass, className: "text-ink-600" },
  syncing: { label: "Sending", icon: RefreshCw, className: "text-brand-700" },
  sent: { label: "Sent", icon: Check, className: "text-brand-700" },
  failed: { label: "Not sent — tap to retry", icon: TriangleAlert, className: "text-urgent-red" },
}

export function SyncChip({
  state,
  refId,
  light = false,
  iconOnly = false,
}: {
  state: SyncState
  refId?: string
  light?: boolean
  iconOnly?: boolean
}) {
  const meta = META[state]
  const Icon = meta.icon
  const content = (
    <>
      <Icon className={cn("size-3.5", state === "syncing" && "animate-spin")} aria-hidden />
      {iconOnly ? <span className="sr-only">{meta.label}</span> : meta.label}
    </>
  )
  const className = cn(
    "inline-flex items-center gap-1 text-[11px] font-medium",
    light ? "text-white/85" : meta.className,
  )

  if (state === "failed") {
    return (
      <button
        type="button"
        className={cn(className, "underline-offset-2 hover:underline")}
        onClick={async () => {
          await retryFailed(refId)
          await syncOutbox()
        }}
      >
        {content}
      </button>
    )
  }
  return (
    <span className={className} role="status">
      {content}
    </span>
  )
}
