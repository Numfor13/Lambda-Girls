import { motion } from "motion/react"
import { Reveal, SPRING } from "@/design/motion"
import { cn } from "@/lib/utils"

/*
 * Public content pages (How it works, About), v2. Replaces the v1 PublicHero template
 * (QA P1): an editorial intro on the Landing's mint→cream wash with a *working* product
 * fragment beside it, then plain sections. Tool pages (sign-in, tips, ask, code lookup)
 * skip the intro and open with the tool itself.
 */

const rise = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: SPRING.default },
}

export function PublicIntro({
  eyebrow,
  title,
  lede,
  actions,
  aside,
  children,
}: {
  eyebrow: string
  title: React.ReactNode
  lede?: React.ReactNode
  actions?: React.ReactNode
  /** A live product fragment (not a picture). Sits right on desktop, below on phones. */
  aside?: React.ReactNode
  /** Under the intro grid, still on the wash (e.g. a trust row). */
  children?: React.ReactNode
}) {
  return (
    <section className="relative isolate -mt-[76px] overflow-hidden bg-gradient-to-b from-mint via-cream to-cream lg:-mt-[92px]">
      <div className="container-page grid grid-cols-[minmax(0,1fr)] items-center gap-10 pt-[112px] pb-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-16 lg:pt-[clamp(124px,17svh,160px)] lg:pb-20 short:pb-12">
        <motion.div
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.08 } } }}
          initial="hidden"
          animate="show"
          className="max-w-[640px]"
        >
          <motion.p variants={rise} className="eyebrow">
            {eyebrow}
          </motion.p>
          <motion.h1 variants={rise} className="mt-4 text-display-l lg:mt-5">
            {title}
          </motion.h1>
          {lede && (
            <motion.p variants={rise} className="mt-5 max-w-[540px] text-[18px] leading-[30px] text-ink-600">
              {lede}
            </motion.p>
          )}
          {actions && (
            <motion.div variants={rise} className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap short:mt-6">
              {actions}
            </motion.div>
          )}
        </motion.div>
        {aside && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING.slow, delay: 0.2 }}
            className="w-full max-w-[520px] justify-self-center lg:justify-self-end"
          >
            {aside}
          </motion.div>
        )}
      </div>
      {children}
    </section>
  )
}

/** A plain page section with an eyebrow + serif heading. `dark` = the ground band. */
export function PublicSection({
  id,
  eyebrow,
  title,
  lede,
  action,
  dark = false,
  className,
  children,
}: {
  id?: string
  eyebrow?: string
  title: React.ReactNode
  lede?: React.ReactNode
  action?: React.ReactNode
  dark?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className={cn("scroll-mt-24", dark && "bg-ground text-white", className)}>
      <div className="container-page py-14 lg:py-20 short:py-12">
        <Reveal className="mb-8 flex flex-col gap-4 lg:mb-10 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-[720px]">
            {eyebrow && <p className={cn("eyebrow", dark && "text-mint-200")}>{eyebrow}</p>}
            <h2 className={cn("mt-3 text-display-m", dark && "text-white")}>{title}</h2>
            {lede && <p className={cn("mt-4 max-w-[60ch] text-body-l", dark ? "text-white/75" : "text-ink-600")}>{lede}</p>}
          </div>
          {action}
        </Reveal>
        {children}
      </div>
    </section>
  )
}

/** "Example" tag for sample UI fragments on public pages (platform truth). */
export function ExampleTag({ dark = false }: { dark?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full px-2 text-label-m",
        dark ? "bg-white/12 text-white/80" : "bg-ink-900/[0.05] text-ink-600",
      )}
    >
      Example
    </span>
  )
}
