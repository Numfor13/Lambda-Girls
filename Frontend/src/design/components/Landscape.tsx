import { useRef } from "react"
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
}: {
  className?: string
  sky?: boolean
  preserve?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] })
  return (
    <div ref={ref} className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden>
      <svg viewBox="0 0 1440 900" preserveAspectRatio={preserve} className="size-full overflow-visible">
        <defs>
          <linearGradient id="cb-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: "var(--color-mint-200)" }} />
            <stop
              offset="0.55"
              style={{ stopColor: "color-mix(in srgb, var(--color-mint-200) 30%, var(--color-cream))" }}
            />
            <stop offset="0.82" style={{ stopColor: "var(--color-land-haze)" }} />
          </linearGradient>
          <radialGradient id="cb-sun" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="white" stopOpacity="0.9" />
            <stop offset="1" stopColor="white" stopOpacity="0" />
          </radialGradient>
        </defs>
        {sky && <rect width="1440" height="900" fill="url(#cb-sky)" />}
        <motion.circle
          cx="1000"
          cy="360"
          r="320"
          fill="url(#cb-sun)"
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
 * Ambient backdrop behind app chrome (Figma: Backdrop/Ambient). Soft brand blobs that slowly
 * drift so the Liquid Glass rail, tab bar and top bars always have something to refract.
 */
export function Backdrop({ tone = "brand", className }: { tone?: "brand" | "red" | "amber" | "green"; className?: string }) {
  const blobs =
    tone === "red"
      ? ["bg-urgent-red/12", "bg-mint-200/80", "bg-urgent-red/6", "bg-brand-500/8"]
      : tone === "amber"
        ? ["bg-urgent-amber/16", "bg-mint-200/80", "bg-urgent-amber/8", "bg-brand-500/10"]
        : tone === "green"
          ? ["bg-urgent-green/12", "bg-mint-200/90", "bg-brand-500/10", "bg-land-far/40"]
          : ["bg-brand-500/14", "bg-mint-200/90", "bg-brand-700/8", "bg-land-far/40"]
  const base =
    tone === "red" ? "bg-urgent-red-50" : tone === "amber" ? "bg-urgent-amber-50" : tone === "green" ? "bg-urgent-green-50" : "bg-cream"
  // Portalled to <body>: page transitions transform their content, which would trap `fixed`.
  return createPortal(
    <div className={cn("pointer-events-none fixed inset-0 -z-10 overflow-hidden", base, className)} aria-hidden>
      <div className={cn("animate-drift absolute -top-[18%] -left-[10%] size-[60vmax] rounded-full blur-[120px]", blobs[0])} />
      <div
        className={cn("animate-drift absolute -top-[25%] -right-[15%] size-[55vmax] rounded-full blur-[120px]", blobs[1])}
        style={{ animationDelay: "-6s" }}
      />
      <div
        className={cn("animate-drift absolute top-[45%] left-[25%] size-[45vmax] rounded-full blur-[120px]", blobs[2])}
        style={{ animationDelay: "-11s" }}
      />
      <div
        className={cn("animate-drift absolute -right-[10%] -bottom-[20%] size-[40vmax] rounded-full blur-[120px]", blobs[3])}
        style={{ animationDelay: "-3s" }}
      />
    </div>,
    document.body,
  )
}
