import { motion } from "motion/react"
import type { LucideIcon } from "lucide-react"
import { Landscape } from "@/design/components/Landscape"
import { LinkArrow } from "@/design/components/Button"
import { Reveal, SPRING } from "@/design/motion"
import { cn } from "@/lib/utils"

/*
 * Public page composition, taken from the owner's inspiration (RANTY landing; path in
 * docs/REDESIGN_BUILD.md §0). Rules it encodes:
 *  - Full-bleed scene: the landscape runs edge to edge; content sits on the scene, not in a box.
 *  - One huge, confident headline on the left. Nothing else competes with it.
 *  - On the right, a SOLID white feature card (chips row → title → line) with an object that
 *    breaks out of its bottom edge (`breakout`): a phone, an illustration, a UI vignette.
 *  - Optional bottom band: an edge-flush panel (only its inner top corner rounded), a stat,
 *    and an uppercase statement with an underlined link. Every column of the canvas is used.
 */

const group = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.12 } },
}
const rise = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: SPRING.default },
}

export function PublicHero({
  eyebrow,
  title,
  lede,
  body,
  actions,
  card,
  breakout,
  size = "page",
  children,
}: {
  eyebrow: string
  /** Keep it short: 2–5 words, it is set at display size. Use \n for a deliberate break. */
  title: string
  lede?: string
  body?: React.ReactNode
  actions?: React.ReactNode
  /** Content of the white feature card on the right (FeatureCard is the usual choice). */
  card?: React.ReactNode
  /** Object that overlaps the card's bottom edge. */
  breakout?: React.ReactNode
  /** `full` = landing-height scene; `page` = content pages (shorter, still full-bleed). */
  size?: "full" | "page"
  /** Rendered under the hero grid, still on the scene (e.g. <StatementBand>). */
  children?: React.ReactNode
}) {
  return (
    <section className="relative isolate -mt-[76px] overflow-hidden bg-mint-200 lg:-mt-[92px]">
      <Landscape className="top-[34%] -z-10 fade-top sm:top-[26%] lg:top-[30%]" />
      <div
        className={cn(
          "container-page grid grid-cols-[minmax(0,1fr)] items-center gap-10 pt-[112px] lg:grid-cols-[1.05fr_0.95fr] lg:gap-14",
          size === "full"
            ? "pb-16 lg:min-h-[min(100svh,900px)] lg:pt-[clamp(108px,17svh,140px)] lg:pb-[clamp(56px,10svh,112px)]"
            : "pb-14 lg:min-h-[min(78svh,720px)] lg:pt-[clamp(112px,16svh,136px)] lg:pb-[clamp(48px,8svh,88px)]"
        )}
      >
        <motion.div
          variants={group}
          initial="hidden"
          animate="show"
          className="max-w-[680px]"
        >
          <motion.p variants={rise} className="eyebrow">
            {eyebrow}
          </motion.p>
          <motion.h1
            variants={rise}
            className="mt-4 text-display-l whitespace-pre-line lg:mt-5 lg:text-display-xl"
          >
            {title}
          </motion.h1>
          {lede && (
            <motion.p
              variants={rise}
              className="mt-5 text-headline-s text-brand-800"
            >
              {lede}
            </motion.p>
          )}
          {body && (
            <motion.div
              variants={rise}
              className="mt-4 max-w-[540px] text-body-l text-ink-900"
            >
              {body}
            </motion.div>
          )}
          {actions && (
            <motion.div
              variants={rise}
              className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap"
            >
              {actions}
            </motion.div>
          )}
        </motion.div>

        {card && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ ...SPRING.slow, delay: 0.25 }}
            className={cn(
              "relative w-full max-w-[560px] justify-self-center lg:justify-self-end",
              breakout && "pb-16"
            )}
          >
            <div className="relative rounded-2xl bg-white p-6 shadow-[var(--shadow-elev-2)] sm:p-8">
              {card}
            </div>
            {breakout && (
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...SPRING.bouncy, delay: 0.5 }}
                className="absolute right-6 bottom-0 left-6 sm:right-10 sm:left-auto sm:w-[70%]"
              >
                {breakout}
              </motion.div>
            )}
          </motion.div>
        )}
      </div>
      {children}
    </section>
  )
}

/** Chips row + title + line, the content of the hero's white card. */
export function FeatureCard({
  chips,
  activeChip = 0,
  title,
  line,
  children,
}: {
  chips?: string[]
  activeChip?: number
  title: string
  line?: string
  children?: React.ReactNode
}) {
  return (
    <div>
      {chips && (
        <div className="flex flex-wrap gap-2">
          {chips.map((c, i) => (
            <span
              key={c}
              className={cn(
                "inline-flex h-9 items-center rounded-full px-4 text-label-l",
                i === activeChip
                  ? "bg-brand-900 text-white"
                  : "border border-line text-ink-900"
              )}
            >
              {c}
            </span>
          ))}
        </div>
      )}
      <p className="mt-5 text-headline-m text-ink-900 lg:text-headline-l">
        {title}
      </p>
      {line && <p className="mt-2 text-body-l text-ink-600">{line}</p>}
      {children && <div className="mt-5">{children}</div>}
    </div>
  )
}

/**
 * Bottom band from the inspiration: an edge-flush panel on the left (only its inner top
 * corner rounded), a stat in the middle, an uppercase statement with an underlined link.
 * Sits on `bg-ground`. Pass only true facts (counts from data/config, never invented).
 */
export function StatementBand({
  panel,
  stat,
  statement,
  link,
}: {
  panel: { icon?: LucideIcon; title: string; body: string }
  stat?: { value: string; label: string }
  statement: string
  link?: { to: string; label: string }
}) {
  const Icon = panel.icon
  return (
    <div className="bg-ground text-white">
      <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,0.5fr)_minmax(0,1fr)] lg:items-center">
        <Reveal className="flex flex-col gap-3 rounded-tr-2xl bg-brand-800 px-6 py-8 sm:px-10 lg:py-12 lg:pl-[max(2.5rem,calc((100vw-1280px)/2+2.5rem))]">
          {Icon && <Icon className="size-8 text-mint-200" aria-hidden />}
          <p className="text-headline-l text-white">{panel.title}</p>
          <p className="max-w-[46ch] text-body-m text-white/80">{panel.body}</p>
        </Reveal>
        {stat ? (
          <Reveal className="flex flex-col items-start gap-1 px-6 py-8 sm:px-10 lg:items-center lg:py-0">
            <p className="text-display-m font-display text-white">
              {stat.value}
            </p>
            <p className="text-body-m text-white/75">{stat.label}</p>
          </Reveal>
        ) : (
          <span className="hidden lg:block" />
        )}
        <Reveal
          variant="right"
          className="flex flex-col items-start gap-5 px-6 pb-10 sm:px-10 lg:py-12 lg:pr-[max(2.5rem,calc((100vw-1280px)/2+2.5rem))]"
        >
          <p className="text-headline-l text-white uppercase lg:text-display-m">
            {statement}
          </p>
          {link && (
            <LinkArrow to={link.to} light>
              {link.label}
            </LinkArrow>
          )}
        </Reveal>
      </div>
    </div>
  )
}
