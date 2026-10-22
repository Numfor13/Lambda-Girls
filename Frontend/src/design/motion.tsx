import { motion, type HTMLMotionProps, type Transition, type Variants } from "motion/react"

export const EASE_OUT = [0.22, 1, 0.36, 1] as const

/**
 * Material 3 Expressive motion physics. Spatial springs move things (position, size, shape);
 * effects springs change colour/opacity without overshoot. Use these, not ad-hoc durations.
 */
export const SPRING = {
  /** Small components: buttons, chips, toggles, nav indicators. */
  fast: { type: "spring", stiffness: 800, damping: 40, mass: 1 },
  /** Cards, sheets, page content. */
  default: { type: "spring", stiffness: 420, damping: 32, mass: 1 },
  /** Hero moments: a little overshoot, the "expressive" bounce. */
  bouncy: { type: "spring", stiffness: 380, damping: 20, mass: 1 },
  /** Large, slow surfaces: backdrops, landscape. */
  slow: { type: "spring", stiffness: 140, damping: 26, mass: 1 },
} satisfies Record<string, Transition>

/** Press feedback: squash + corner morph (M3 Expressive shape morph). */
export const pressable = {
  whileTap: { scale: 0.96 },
  whileHover: { scale: 1.02 },
  transition: SPRING.fast,
} as const

/** Entrance for content that pops in (cards, tiles). */
export const popIn: Variants = {
  hidden: { opacity: 0, y: 24, scale: 0.96 },
  show: { opacity: 1, y: 0, scale: 1, transition: SPRING.default },
}

/** Stagger parent for popIn children, used on mount (not scroll). */
export const staggerOnMount = (stagger = 0.06, delayChildren = 0.04): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger, delayChildren } },
})

/** Route-level transition: content rises in on a spring, fades out quickly. */
export function PageTransition({ children, id }: { children: React.ReactNode; id: string }) {
  return (
    <motion.div
      key={id}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0, transition: SPRING.default }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
    >
      {children}
    </motion.div>
  )
}

const reveal = (from: { x?: number; y?: number }, duration = 0.6): Variants => ({
  hidden: { opacity: 0, ...from },
  show: (delay = 0) => ({
    opacity: 1,
    x: 0,
    y: 0,
    transition: { duration, ease: EASE_OUT, delay },
  }),
})

export const revealVariants = {
  up: reveal({ y: 28 }),
  in: reveal({}, 0.7),
  left: reveal({ x: -32 }),
  right: reveal({ x: 32 }),
} satisfies Record<string, Variants>

export type RevealVariant = keyof typeof revealVariants

/** Reveal once, when roughly a fifth of the element is on screen. */
export const VIEWPORT = { once: true, amount: 0.2 } as const

type Tag = "div" | "section" | "header" | "ul" | "ol" | "li" | "nav"

// Pre-built map so we never create a component during render.
// All tags accept the same motion-prop surface we use; assert to the div type for uniformity.
const MOTION_TAGS = {
  div: motion.div,
  section: motion.section,
  header: motion.header,
  ul: motion.ul,
  ol: motion.ol,
  li: motion.li,
  nav: motion.nav,
} as Record<Tag, typeof motion.div>

type BaseProps = Omit<HTMLMotionProps<"div">, "variants" | "initial" | "whileInView">

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

export function StaggerContainer({
  as = "div",
  stagger = 0.1,
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

/** A child of StaggerContainer; it inherits the parent's hidden/show timing. */
export function StaggerItem({
  as = "div",
  variant = "up",
  ...rest
}: BaseProps & { as?: Tag; variant?: RevealVariant }) {
  const Comp = MOTION_TAGS[as]
  return <Comp variants={revealVariants[variant]} {...rest} />
}

const ZOOM_TRANSITION: Transition = { duration: 0.45, ease: EASE_OUT }

/**
 * Put `initial="rest" whileHover="hover"` on the hover target (e.g. the whole card)
 * and these variants on the image, so overlays above the image still trigger the zoom.
 */
export const zoomVariants: Variants = {
  rest: { scale: 1, transition: ZOOM_TRANSITION },
  hover: { scale: 1.08, transition: ZOOM_TRANSITION },
}

export const hoverZoomTrigger = { initial: "rest", whileHover: "hover", animate: "rest" } as const
