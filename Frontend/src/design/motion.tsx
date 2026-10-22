import {
  AnimatePresence,
  motion,
  type HTMLMotionProps,
  type Transition,
  type Variants,
} from "motion/react"

export { AnimatePresence }

export const EASE_OUT = [0.22, 1, 0.36, 1] as const
export const EASE_IN_OUT = [0.4, 0, 0.2, 1] as const
export const SPRING = { type: "spring", stiffness: 420, damping: 32 } as const
export const SPRING_SOFT = { type: "spring", stiffness: 260, damping: 28 } as const

// ── Reveal variants ──────────────────────────────────────────────────────────

const reveal = (from: { x?: number; y?: number; scale?: number }, duration = 0.6): Variants => ({
  hidden: { opacity: 0, ...from },
  show: (delay = 0) => ({
    opacity: 1,
    x: 0,
    y: 0,
    scale: 1,
    transition: { duration, ease: EASE_OUT, delay },
  }),
})

export const revealVariants = {
  up:    reveal({ y: 36 }),
  down:  reveal({ y: -28 }),
  in:    reveal({}, 0.7),
  left:  reveal({ x: -40 }),
  right: reveal({ x: 40 }),
  pop:   reveal({ y: 20, scale: 0.92 }),
} satisfies Record<string, Variants>

export type RevealVariant = keyof typeof revealVariants

export const VIEWPORT = { once: true, amount: 0.18 } as const

type Tag = "div" | "section" | "header" | "ul" | "ol" | "li" | "nav" | "span" | "p" | "h1" | "h2"

const MOTION_TAGS = {
  div:     motion.div,
  section: motion.section,
  header:  motion.header,
  ul:      motion.ul,
  ol:      motion.ol,
  li:      motion.li,
  nav:     motion.nav,
  span:    motion.span,
  p:       motion.p,
  h1:      motion.h1,
  h2:      motion.h2,
} as Record<Tag, typeof motion.div>

type BaseProps = Omit<HTMLMotionProps<"div">, "variants" | "initial" | "whileInView">

/** Animate in once when ~18% of the element enters the viewport. */
export function Reveal({
  as = "div",
  variant = "up",
  delay = 0,
  ...rest
}: BaseProps & { as?: Tag; variant?: RevealVariant; delay?: number }) {
  const Comp = MOTION_TAGS[as]
  return (
    <Comp
      variants={revealVariants[variant]}
      initial="hidden"
      whileInView="show"
      viewport={VIEWPORT}
      custom={delay}
      {...rest}
    />
  )
}

/** Stagger children as they scroll into view. */
export function StaggerContainer({
  as = "div",
  stagger = 0.09,
  delayChildren = 0,
  amount = VIEWPORT.amount,
  ...rest
}: BaseProps & { as?: Tag; stagger?: number; delayChildren?: number; amount?: number }) {
  const Comp = MOTION_TAGS[as]
  return (
    <Comp
      variants={{ hidden: {}, show: { transition: { staggerChildren: stagger, delayChildren } } }}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount }}
      {...rest}
    />
  )
}

/** Child of StaggerContainer; inherits the parent stagger timing. */
export function StaggerItem({
  as = "div",
  variant = "up",
  ...rest
}: BaseProps & { as?: Tag; variant?: RevealVariant }) {
  const Comp = MOTION_TAGS[as]
  return <Comp variants={revealVariants[variant]} {...rest} />
}

// ── Hover zoom (image cards) ─────────────────────────────────────────────────

const ZOOM_TRANSITION: Transition = { duration: 0.45, ease: EASE_OUT }

export const zoomVariants: Variants = {
  rest:  { scale: 1,    transition: ZOOM_TRANSITION },
  hover: { scale: 1.08, transition: ZOOM_TRANSITION },
}

export const hoverZoomTrigger = { initial: "rest", whileHover: "hover", animate: "rest" } as const

// ── Tappable card — lift + scale on press ───────────────────────────────────

export const tapCardProps = {
  whileHover: { y: -3, boxShadow: "0 8px 24px rgba(0,0,0,.10)" },
  whileTap:   { scale: 0.975, y: 0 },
  transition: SPRING_SOFT,
} as const

// ── Fade-through (for status / tab content swaps) ───────────────────────────

export const fadeThroughVariants: Variants = {
  hidden: { opacity: 0, scale: 0.97, filter: "blur(4px)" },
  show:   { opacity: 1, scale: 1,    filter: "blur(0px)", transition: { duration: 0.25, ease: EASE_OUT } },
  exit:   { opacity: 0, scale: 0.97, filter: "blur(2px)", transition: { duration: 0.18, ease: EASE_IN_OUT } },
}

/** Wrap dynamic content that swaps in/out. */
export function FadeThrough({
  motionKey,
  children,
  className,
}: {
  motionKey: string | number
  children: React.ReactNode
  className?: string
}) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={motionKey}
        variants={fadeThroughVariants}
        initial="hidden"
        animate="show"
        exit="exit"
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

// ── Wizard step slide (directional) ─────────────────────────────────────────

export function SlideStep({
  stepKey,
  direction = 1,
  children,
  className,
}: {
  stepKey: string | number
  direction?: 1 | -1
  children: React.ReactNode
  className?: string
}) {
  const x = 60 * direction
  return (
    <AnimatePresence mode="wait" custom={direction}>
      <motion.div
        key={stepKey}
        custom={direction}
        initial={{ opacity: 0, x }}
        animate={{ opacity: 1, x: 0, transition: { duration: 0.32, ease: EASE_OUT } }}
        exit={{ opacity: 0, x: -x, transition: { duration: 0.22, ease: EASE_IN_OUT } }}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

// ── Float — gentle up-down idle animation ───────────────────────────────────

export function Float({
  children,
  amplitude = 10,
  duration = 3.4,
  className,
}: {
  children: React.ReactNode
  amplitude?: number
  duration?: number
  className?: string
}) {
  return (
    <motion.div
      className={className}
      animate={{ y: [0, -amplitude, 0] }}
      transition={{ duration, ease: "easeInOut", repeat: Infinity, repeatType: "loop" }}
    >
      {children}
    </motion.div>
  )
}

// ── Pulse ring — for icons that should draw attention ───────────────────────

export function PulseRing({
  children,
  color = "rgba(29,106,66,.22)",
  className,
}: {
  children: React.ReactNode
  color?: string
  className?: string
}) {
  return (
    <span className={`relative inline-flex ${className ?? ""}`}>
      <motion.span
        className="absolute inset-0 rounded-full"
        style={{ background: color }}
        animate={{ scale: [1, 1.55, 1], opacity: [0.7, 0, 0.7] }}
        transition={{ duration: 2.2, ease: "easeInOut", repeat: Infinity }}
      />
      {children}
    </span>
  )
}

// ── NumberTicker — animate a number counting up ──────────────────────────────

export { NumberTicker } from "./NumberTicker"
