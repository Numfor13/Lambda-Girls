import { useSyncExternalStore } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "motion/react"
import { Check, CircleAlert, Info, X } from "lucide-react"
import { SPRING } from "@/design/motion"
import { cn } from "@/lib/utils"

/**
 * Snackbar-style feedback after an action (saved, sent, removed, copied).
 * Floating glass pill (chrome, so glass is allowed), springs in above the tab bar.
 * Call `toast("Saved")` from anywhere; `<Toaster />` is mounted once per shell.
 * Pass `action` for Undo. Errors that block the user belong inline, not in a toast.
 */
type Tone = "success" | "info" | "error"
interface Item {
  id: number
  message: string
  tone: Tone
  action?: { label: string; onClick: () => void }
}

let items: Item[] = []
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function toast(
  message: string,
  opts: { tone?: Tone; action?: Item["action"]; duration?: number } = {}
) {
  const id = nextId++
  items = [
    ...items.slice(-2),
    { id, message, tone: opts.tone ?? "success", action: opts.action },
  ]
  emit()
  window.setTimeout(
    () => dismiss(id),
    opts.duration ?? (opts.action ? 6000 : 3500)
  )
  return id
}

export function dismiss(id: number) {
  items = items.filter((i) => i.id !== id)
  emit()
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

const ICON = { success: Check, info: Info, error: CircleAlert }

export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => items)
  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[112px] z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6"
      aria-live="polite"
      role="status"
    >
      <AnimatePresence initial={false}>
        {list.map((t) => {
          const Icon = ICON[t.tone]
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 24, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.95 }}
              transition={SPRING.bouncy}
              className="pointer-events-auto flex max-w-md items-center gap-3 rounded-full py-2 pr-2 pl-3 glass-strong"
            >
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full",
                  t.tone === "error"
                    ? "bg-urgent-red text-white"
                    : "bg-brand-700 text-white"
                )}
              >
                <Icon className="size-4" aria-hidden />
              </span>
              <p className="text-label-l text-ink-900">{t.message}</p>
              {t.action && (
                <button
                  type="button"
                  className="h-9 rounded-full px-3 text-label-l text-brand-700 hover:bg-mint"
                  onClick={() => {
                    t.action!.onClick()
                    dismiss(t.id)
                  }}
                >
                  {t.action.label}
                </button>
              )}
              <button
                type="button"
                aria-label="Dismiss"
                className="flex size-9 items-center justify-center rounded-full text-ink-600 hover:bg-white/60"
                onClick={() => dismiss(t.id)}
              >
                <X className="size-4" aria-hidden />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>,
    document.body
  )
}
