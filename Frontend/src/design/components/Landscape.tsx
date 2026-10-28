import { useId, useRef } from "react"
import { createPortal } from "react-dom"
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react"
import { cn } from "@/lib/utils"

/**
 * Mount Cameroon above Buea, drawn as layered ridges in the brand greens (Figma: Landscape).
 * Each ridge drifts at its own speed while the page scrolls, so the glass above it refracts
 * real movement. Pure SVG: no network, cheap on low-end phones.
 */
const RIDGES = [
  {
    d: "M0 560C200 520 380 470 560 400C680 350 760 300 830 282C880 270 920 272 960 292C1060 342 1180 420 1440 470L1440 1100L0 1100Z",
    className: "fill-land-far",
    speed: 40,
  },
  {
    d: "M0 640C160 600 300 612 460 572C620 532 720 560 860 542C1020 518 1180 562 1440 540L1440 1100L0 1100Z",
    className: "fill-land-mid",
    speed: 70,
  },
  {
    d: "M0 730C200 690 380 722 560 702C760 678 940 722 1120 702C1260 688 1360 702 1440 692L1440 1100L0 1100Z",
    className: "fill-land-near",
    speed: 100,
  },
  {
    d: "M0 800C300 782 600 812 900 792C1150 777 1300 797 1440 787L1440 1100L0 1100Z",
    className: "fill-ground",
    speed: 120,
  },
]

function Ridge({
  d,
  className,
  speed,
  progress,
  index,
}: {
  d: string
  className: string
  speed: number
  progress: ReturnType<typeof useScroll>["scrollYProgress"]
  index: number
}) {
  const y = useTransform(progress, [0, 1], [0, -speed])
  return (
    <motion.path
      d={d}
      className={className}
      style={{ y }}
      initial={{ opacity: 0, translateY: 60 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: "spring", stiffness: 120, damping: 22, delay: 0.1 + index * 0.08 }}
    />
  )
}

export function Landscape({
  className,
  sky = true,
  preserve = "xMidYMax slice",
  viewBox = "0 0 1440 900",
}: {
  className?: string
  sky?: boolean
  preserve?: string
  /** Crop the scene, e.g. "0 250 1440 650" shows only the ridges (for a landscape band). */
  viewBox?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] })
  // Per-instance gradient ids: two landscapes on one page must not share `cb-sky`/`cb-sun`.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "")
  const skyId = `cb-sky-${uid}`
  const sunId = `cb-sun-${uid}`
  return (
    <div ref={ref} className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden>
      <svg viewBox={viewBox} preserveAspectRatio={preserve} className="size-full overflow-visible">
        <defs>
          <linearGradient id={skyId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: "var(--color-mint-200)" }} />
            <stop
              offset="0.55"
              style={{ stopColor: "color-mix(in srgb, var(--color-mint-200) 30%, var(--color-cream))" }}
            />
            <stop offset="0.82" style={{ stopColor: "var(--color-land-haze)" }} />
          </linearGradient>
          <radialGradient id={sunId} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="white" stopOpacity="0.9" />
            <stop offset="1" stopColor="white" stopOpacity="0" />
          </radialGradient>
        </defs>
        {sky && <rect width="1440" height="900" fill={`url(#${skyId})`} />}
        <motion.circle
          cx="1000"
          cy="360"
          r="320"
          fill={`url(#${sunId})`}
          animate={reduce ? undefined : { scale: [1, 1.06, 1], opacity: [0.85, 1, 0.85] }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: "1000px 360px" }}
        />
        {RIDGES.slice(0, 1).map((r, i) => (
          <Ridge key={r.d} {...r} progress={scrollYProgress} index={i} />
        ))}
        <path
          d="M0 600C300 570 600 600 900 575C1150 555 1300 585 1440 570L1440 640L0 660Z"
          fill="white"
          fillOpacity="0.45"
          className="animate-mist"
        />
        {RIDGES.slice(1).map((r, i) => (
          <Ridge key={r.d} {...r} progress={scrollYProgress} index={i + 1} />
        ))}
      </svg>
    </div>
  )
}

/**
 * Page ground behind app chrome. v2: a still, paper-like cream with a faint brand glow at the
 * top (no drifting blobs: they made every screen look murky and cost GPU on low-end phones).
 * Urgency tones tint the glow only; the clinical colour itself lives in the result hero.
 */
const GLOW: Record<"brand" | "red" | "amber" | "green", string> = {
  brand: "rgb(207 230 215 / 0.6)",
  red: "rgb(253 236 234 / 0.95)",
  amber: "rgb(253 244 225 / 0.95)",
  green: "rgb(232 243 233 / 0.95)",
}

export function Backdrop({ tone = "brand", className }: { tone?: "brand" | "red" | "amber" | "green"; className?: string }) {
  // Portalled to <body>: page transitions transform their content, which would trap `fixed`.
  return createPortal(
    <div
      className={cn("pointer-events-none fixed inset-0 -z-10 bg-cream", className)}
      style={{
        background: `radial-gradient(110% 55% at 15% -5%, ${GLOW[tone]}, transparent 62%), radial-gradient(80% 45% at 100% 0%, rgb(243 239 228 / 0.85), transparent 60%), var(--color-cream)`,
      }}
      aria-hidden
    />,
    document.body,
  )
}
