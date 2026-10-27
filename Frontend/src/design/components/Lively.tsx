import { useEffect, useRef } from "react"
import { animate, motion, useInView, useReducedMotion } from "motion/react"
import { Avatar } from "@/design/components/primitives"
import { SPRING } from "@/design/motion"
import { cn } from "@/lib/utils"

/**
 * Small "lively" pieces that make real data feel alive without decoration for its own sake
 * (patterns from Magic UI, Oura, Apple Health). Every one respects prefers-reduced-motion and
 * renders its final state straight away when motion is reduced.
 */

/** Counts up to `value` the first time it scrolls into view. */
export function NumberTicker({
  value,
  className,
  format = (n: number) => Math.round(n).toLocaleString("en-GB"),
}: {
  value: number
  className?: string
  format?: (n: number) => string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.6 })
  const reduce = useReducedMotion()
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (reduce || !inView) {
      el.textContent = format(reduce ? value : 0)
      return
    }
    const controls = animate(0, value, {
      duration: Math.min(1.2, 0.5 + value / 400),
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (n) => (el.textContent = format(n)),
    })
    return () => controls.stop()
  }, [value, inView, reduce, format])
  return (
    <span ref={ref} className={cn("tabular", className)} aria-label={format(value)}>
      {format(value)}
    </span>
  )
}

/** Circular progress (0..1) that sweeps in; children sit in the middle. */
export function ProgressRing({
  value,
  size = 56,
  stroke = 5,
  tone = "brand",
  children,
  label,
}: {
  value: number
  size?: number
  stroke?: number
  tone?: "brand" | "light"
  children?: React.ReactNode
  label?: string
}) {
  const r = (size - stroke) / 2
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className={tone === "light" ? "stroke-white/15" : "stroke-ink-900/8"}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className={tone === "light" ? "stroke-mint-200" : "stroke-brand-600"}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: Math.max(0.001, Math.min(1, value)) }}
          transition={{ ...SPRING.slow, delay: 0.15 }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">{children}</span>
    </span>
  )
}

/** A status dot; `live` adds a soft ring breathing out of it (online, waiting). */
export function PulseDot({
  live = true,
  tone = "green",
  className,
}: {
  live?: boolean
  tone?: "green" | "brand" | "muted" | "light"
  className?: string
}) {
  const reduce = useReducedMotion()
  const fill = {
    green: "bg-urgent-green",
    brand: "bg-brand-600",
    muted: "bg-ink-400",
    light: "bg-mint-200",
  }[tone]
  return (
    <span className={cn("relative inline-flex size-2.5 shrink-0", className)} aria-hidden>
      {live && !reduce && (
        <motion.span
          className={cn("absolute inset-0 rounded-full", fill)}
          animate={{ scale: [1, 2.4], opacity: [0.45, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      <span className={cn("relative size-2.5 rounded-full", fill)} />
    </span>
  )
}

/** Overlapping avatars with a "+N" chip; each one settles in after the last. */
export function AvatarStack({
  names,
  max = 4,
  className,
}: {
  names: string[]
  max?: number
  className?: string
}) {
  const shown = names.slice(0, max)
  const rest = names.length - shown.length
  return (
    <span className={cn("flex items-center", className)}>
      {shown.map((n, i) => (
        <motion.span
          key={`${n}-${i}`}
          className="-ml-2 rounded-full ring-2 ring-white first:ml-0"
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ ...SPRING.default, delay: 0.1 + i * 0.06 }}
        >
          <Avatar name={n} size="sm" />
        </motion.span>
      ))}
      {rest > 0 && (
        <span className="-ml-2 flex size-9 items-center justify-center rounded-full bg-cream text-label-m text-ink-600 ring-2 ring-white">
          +{rest}
        </span>
      )}
    </span>
  )
}

/**
 * A heartbeat trace that draws itself across a dark hero, then rests. Decoration only
 * (aria-hidden); it does not loop, so it never competes with the content for attention.
 */
export function PulseLine({ className }: { className?: string }) {
  const reduce = useReducedMotion()
  const d =
    "M0 60 H220 L236 60 L248 30 L262 92 L276 14 L292 76 L304 60 H520 L534 60 L544 44 L556 74 L568 60 H800"
  return (
    <svg
      viewBox="0 0 800 110"
      preserveAspectRatio="none"
      className={cn("pointer-events-none", className)}
      aria-hidden
    >
      <motion.path
        d={d}
        fill="none"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-mint-200/45"
        initial={{ pathLength: reduce ? 1 : 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 2.2, ease: [0.22, 1, 0.36, 1], delay: 0.35 }}
      />
      {!reduce && (
        <motion.circle
          r={4}
          className="fill-mint-200"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1, 0] }}
          transition={{ duration: 2.4, delay: 0.35, times: [0, 0.05, 0.9, 1] }}
        >
          <animateMotion dur="2.2s" begin="0.35s" fill="freeze" path={d} />
        </motion.circle>
      )}
    </svg>
  )
}

/**
 * A short horizontal progress track: finished segments fill, the current one fills partway,
 * each sweeping in after the last. Labels under it from sm up (the aria-label says it all).
 */
export function StepTrack({ steps, at, label }: { steps: string[]; at: number; label: string }) {
  return (
    <div>
      <div className="flex gap-1" role="img" aria-label={`${label}: step ${Math.min(at + 1, steps.length)} of ${steps.length}`}>
        {steps.map((s, i) => (
          <span key={s} className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-ink-900/8">
            <motion.span
              className={cn("absolute inset-y-0 left-0 rounded-full", i < at ? "bg-brand-600" : "bg-brand-600/60")}
              initial={{ width: "0%" }}
              animate={{ width: i < at ? "100%" : i === at ? "45%" : "0%" }}
              transition={{ ...SPRING.slow, delay: 0.2 + i * 0.12 }}
            />
          </span>
        ))}
      </div>
      <div className="mt-1.5 hidden justify-between text-label-m text-ink-400 sm:flex" aria-hidden>
        {steps.map((s, i) => (
          <span key={s} className={cn(i <= at && "text-ink-600")}>
            {s}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Content-shaped loading block with a light sweep (Airbnb/Doctolib skeletons). */
export function Skeleton({ className }: { className?: string }) {
  return <span className={cn("block rounded-md skeleton", className)} aria-hidden />
}
