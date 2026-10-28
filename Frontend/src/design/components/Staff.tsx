import type { ReactNode } from "react"
import { useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { AnimatePresence, motion } from "motion/react"
import { ChevronRight, RefreshCw, Search, type LucideIcon } from "lucide-react"
import type { Urgency } from "@/api/types"
import { useAuth } from "@/auth/AuthProvider"
import { NumberTicker } from "@/design/components/Lively"
import { SPRING, popIn, staggerOnMount } from "@/design/motion"
import { formatTime } from "@/lib/format"
import { useOnline, useVisible } from "@/lib/hooks"
import { cn } from "@/lib/utils"

/*
 * Staff workspace pieces (doctor, operator, admin), from the staff study (patient-queue
 * dashboards, dispatch consoles, CRUD admin tables): counters that are also filters, one
 * list that reads the same on a phone and a desk, a detail panel beside it, and a single
 * "Updated 14:25" indicator per page (QA C4).
 */

/** Polls every 20 s while the tab is visible and online; keyed per signed-in user. */
export function useConsoleQuery<T>(key: string, queryFn: () => Promise<T>, enabled = true) {
  const { session } = useAuth()
  const online = useOnline()
  const visible = useVisible()
  return useQuery({
    queryKey: [key, session?.sub],
    queryFn,
    enabled,
    refetchInterval: visible && online ? 20_000 : false,
  })
}

/** List state in the URL, so a refresh or a shared link keeps the view. */
export function useRecordParams() {
  const [params, setParams] = useSearchParams()
  return {
    params,
    q: params.get("q") ?? "",
    filter: params.get("filter") ?? "",
    selected: params.get("selected") ?? "",
    set: (key: string, value: string) => {
      const next = new URLSearchParams(params)
      if (value) next.set(key, value)
      else next.delete(key)
      setParams(next, { replace: true })
    },
    /** Several keys in one history entry ("" removes a key). */
    setMany: (values: Record<string, string>) => {
      const next = new URLSearchParams(params)
      for (const [k, v] of Object.entries(values)) {
        if (v) next.set(k, v)
        else next.delete(k)
      }
      setParams(next, { replace: true })
    },
  }
}

/** The one sync indicator on a staff page: "Updated 14:25" + a small refresh button. */
export function UpdatedAt({ updated, refresh, loading }: { updated: number; refresh: () => void; loading: boolean }) {
  const online = useOnline()
  return (
    <div className="flex items-center gap-1 rounded-full bg-white py-1 pr-1 pl-3.5 shadow-[var(--shadow-elev-1)]">
      <span role="status" className="text-label-m text-ink-600 tabular">
        {!online ? "Offline · showing saved" : updated ? `Updated ${formatTime(updated)}` : "Loading…"}
      </span>
      <button
        type="button"
        onClick={refresh}
        disabled={!online || loading}
        aria-label="Refresh now"
        className="flex size-10 items-center justify-center rounded-full text-brand-700 hover:bg-mint disabled:opacity-40"
      >
        <RefreshCw className={cn("size-4", loading && "animate-spin motion-reduce:animate-none")} aria-hidden />
      </button>
    </div>
  )
}

const TONE: Record<Urgency | "none", { dot: string; ring: string }> = {
  RED: { dot: "bg-urgent-red", ring: "shadow-[inset_0_0_0_2px_var(--color-urgent-red)]" },
  AMBER: { dot: "bg-urgent-amber", ring: "shadow-[inset_0_0_0_2px_var(--color-urgent-amber)]" },
  GREEN: { dot: "bg-urgent-green", ring: "shadow-[inset_0_0_0_2px_var(--color-urgent-green)]" },
  none: { dot: "bg-ink-400", ring: "shadow-[inset_0_0_0_2px_var(--color-ink-600)]" },
}

export type Tile = { key: string; label: string; count: number; tone?: Urgency | "none"; icon?: LucideIcon }

/** Counters that are also filters. Pressing one shows only those rows; pressing it again clears. */
export function FilterTiles({ tiles, value, onChange, label }: { tiles: Tile[]; value: string; onChange: (k: string) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))] sm:gap-3">
      {tiles.map((t) => {
        const on = value === t.key
        const tone = t.tone ? TONE[t.tone] : null
        return (
          <motion.button
            key={t.key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? "" : t.key)}
            whileTap={{ scale: 0.98 }}
            transition={SPRING.fast}
            className={cn(
              "flex flex-col items-start gap-2 rounded-xl p-4 text-left transition-[background-color,box-shadow] duration-150",
              on ? cn("bg-white", tone?.ring ?? "shadow-[inset_0_0_0_2px_var(--color-brand-700)]") : "bg-white shadow-[var(--shadow-elev-1)] hover:bg-cream",
            )}
          >
            <span className="flex items-center gap-2 text-label-l text-ink-600">
              {tone && <span className={cn("size-2.5 rounded-full", tone.dot)} aria-hidden />}
              {t.icon && <t.icon className="size-4 text-brand-600" aria-hidden />}
              {t.label}
            </span>
            <NumberTicker value={t.count} className="font-display text-[30px] leading-none font-[460] text-ink-900 tabular short:text-[26px]" />
          </motion.button>
        )
      })}
    </div>
  )
}

/** Search box shown only when the list is long enough to need it (QA C1). */
export function ListSearch({ value, onChange, placeholder, total, min = 6 }: { value: string; onChange: (v: string) => void; placeholder: string; total: number; min?: number }) {
  if (total < min && !value) return null
  return (
    <label className="relative block">
      <span className="sr-only">{placeholder}</span>
      <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-400" aria-hidden />
      <input
        type="search"
        value={value}
        maxLength={100}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-full border border-ink-900/15 bg-white pr-4 pl-12 text-body-l focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 focus:outline-none"
      />
    </label>
  )
}

/** One list for every width: rows are buttons that open the detail panel. */
export function RecordList<T>({
  rows,
  id,
  selected,
  onSelect,
  label,
  render,
  urgency,
}: {
  rows: T[]
  id: (row: T) => string
  selected: string
  onSelect: (row: T) => void
  label: string
  render: (row: T) => ReactNode
  /** Optional left stripe colour per row. */
  urgency?: (row: T) => Urgency | null
}) {
  return (
    <motion.ul variants={staggerOnMount(0.04)} initial="hidden" animate="show" className="flex flex-col gap-2" aria-label={label}>
      <AnimatePresence initial={false}>
        {rows.map((row) => {
          const key = id(row)
          const on = key === selected
          const u = urgency?.(row)
          return (
            <motion.li key={key} variants={popIn} layout exit={{ opacity: 0, height: 0 }} transition={SPRING.default}>
              <button
                type="button"
                aria-current={on ? "true" : undefined}
                onClick={() => {
                  onSelect(row)
                  // Phones show the detail above the list; bring it into view.
                  if (window.matchMedia("(max-width: 1023px)").matches) window.scrollTo({ top: 0, behavior: "smooth" })
                }}
                className={cn(
                  "group relative flex w-full items-center gap-3 overflow-hidden rounded-xl bg-white py-3.5 pr-3 pl-5 text-left transition-[box-shadow,background-color] duration-150 sm:gap-4",
                  on ? "bg-mint shadow-[inset_0_0_0_2px_var(--color-brand-700)]" : "shadow-[var(--shadow-elev-1)] hover:bg-cream",
                )}
              >
                {u !== undefined && <span className={cn("absolute inset-y-0 left-0 w-1.5", TONE[u ?? "none"].dot)} aria-hidden />}
                <span className="min-w-0 flex-1">{render(row)}</span>
                <ChevronRight className="size-5 shrink-0 text-ink-400 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </button>
            </motion.li>
          )
        })}
      </AnimatePresence>
    </motion.ul>
  )
}

/** Labelled on/off switch (QA K2). */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("relative h-10 w-[68px] shrink-0 rounded-full transition-colors disabled:opacity-40", checked ? "bg-brand-700" : "bg-ink-900/15")}
    >
      <motion.span className="absolute top-1 left-1 size-8 rounded-full bg-white shadow" animate={{ x: checked ? 28 : 0 }} transition={SPRING.fast} />
    </button>
  )
}

/** Calendar-style date block for visit lists. */
export function DateTile({ iso }: { iso: string }) {
  const d = new Date(`${iso}T00:00:00`)
  return (
    <span className="flex size-14 shrink-0 flex-col items-center justify-center rounded-lg bg-brand-900 text-white">
      <span className="text-[11px] leading-none font-semibold tracking-[0.08em] text-mint-200 uppercase">
        {d.toLocaleDateString("en-GB", { month: "short" })}
      </span>
      <span className="mt-1 font-display text-[24px] leading-none font-[460] tabular">{d.getDate()}</span>
    </span>
  )
}

/** Detail panel placeholder: what selecting a row will let you do. */
export function PickHint({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <motion.section variants={popIn} className="rounded-xl bg-mint p-5 lg:p-6">
      <span className="flex size-11 items-center justify-center rounded-md bg-white text-brand-700">
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="mt-4 text-title-l text-brand-900">{title}</p>
      <div className="mt-2 text-body-m text-brand-900/80">{children}</div>
    </motion.section>
  )
}
