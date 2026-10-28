import { motion } from "motion/react"
import { SPRING, popIn, staggerOnMount } from "@/design/motion"
import { cn } from "@/lib/utils"

/**
 * The one in-app page layout (patient, doctor, operator, admin). Uses the whole content
 * area at every width: no centred 768px column with empty gutters.
 *
 *   header  — eyebrow, title, subtitle on the left; page actions on the right (wrap below on mobile)
 *   body    — `split`: main + sticky context column on desktop (stacks: main, then aside, on mobile)
 *             `full`:  children own the width (use <CardGrid> for lists of cards)
 *
 * Put the thing the user came to do in `children`; put context (status, summary, help,
 * related actions) in `aside`. Same content and order on every breakpoint.
 */
export function AppPage({
  eyebrow,
  title,
  subtitle,
  actions,
  back,
  aside,
  asideFirst = false,
  layout = aside ? "split" : "full",
  children,
  className,
}: {
  eyebrow?: string
  title: string
  subtitle?: React.ReactNode
  actions?: React.ReactNode
  back?: React.ReactNode
  aside?: React.ReactNode
  /** Mobile only: show the aside before the main column (e.g. a summary that frames a form). */
  asideFirst?: boolean
  layout?: "split" | "full"
  children: React.ReactNode
  className?: string
}) {
  return (
    <motion.div
      variants={staggerOnMount(0.06)}
      initial="hidden"
      animate="show"
      className={cn("flex flex-col gap-5 lg:gap-7 short:gap-5", className)}
    >
      <motion.header
        variants={popIn}
        className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
        transition={SPRING.default}
      >
        <div className="min-w-0">
          {back && <div className="mb-3">{back}</div>}
          {eyebrow && <p className="mb-2 eyebrow">{eyebrow}</p>}
          <h1 className="text-headline-l lg:text-display-m">{title}</h1>
          {subtitle && (
            <p className="mt-2 max-w-[68ch] text-body-l text-ink-600">
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </motion.header>

      {layout === "split" && aside ? (
        <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] xl:gap-7 2xl:grid-cols-[minmax(0,1fr)_400px]">
          <motion.div
            variants={staggerOnMount(0.06)}
            className={cn(
              "flex min-w-0 flex-col gap-5",
              asideFirst && "order-2 lg:order-none"
            )}
          >
            {children}
          </motion.div>
          <motion.aside
            variants={staggerOnMount(0.06)}
            className={cn(
              "flex flex-col gap-4 lg:sticky lg:top-6",
              asideFirst && "order-1 lg:order-none"
            )}
          >
            {aside}
          </motion.aside>
        </div>
      ) : (
        <motion.div
          variants={staggerOnMount(0.06)}
          className="flex min-w-0 flex-col gap-5"
        >
          {children}
        </motion.div>
      )}
    </motion.div>
  )
}

/** Responsive card grid that fills the row at every width (no fixed column counts). */
export function CardGrid({
  children,
  min = 300,
  className,
}: {
  children: React.ReactNode
  /** Minimum card width in px before wrapping. */
  min?: 240 | 280 | 300 | 340
  className?: string
}) {
  const cols = {
    240: "grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))]",
    280: "grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))]",
    300: "grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))]",
    340: "grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))]",
  }[min]
  return (
    <motion.ul
      variants={staggerOnMount(0.05)}
      className={cn("grid gap-4", cols, className)}
    >
      {children}
    </motion.ul>
  )
}

/** Solid section card used inside AppPage (reading surface: never glass). */
export function Panel({
  title,
  action,
  children,
  className,
  tone = "white",
}: {
  title?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  tone?: "white" | "mint"
}) {
  return (
    <motion.section
      variants={popIn}
      className={cn(
        "rounded-xl p-5 lg:p-6",
        tone === "white" ? "bg-white shadow-[var(--shadow-elev-1)]" : "bg-mint",
        className
      )}
    >
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-headline-s">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </motion.section>
  )
}
