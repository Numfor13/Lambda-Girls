import { motion, type HTMLMotionProps, type Transition, type Variants } from "motion/react"

export const EASE_OUT = [0.22, 1, 0.36, 1] as const

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
