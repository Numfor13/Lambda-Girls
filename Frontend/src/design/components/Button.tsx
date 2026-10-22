import { forwardRef } from "react"
import { Link, type LinkProps } from "react-router-dom"
import { motion, type HTMLMotionProps } from "motion/react"
import { ArrowRight, ArrowUpRight, LoaderCircle, type LucideIcon } from "lucide-react"
import { SPRING } from "@/design/motion"
import { cn } from "@/lib/utils"

/**
 * Pill button (Figma: Button). One `primary` (Filled) per view.
 * primary = Filled · tonal = Tonal · glass = Glass (over imagery/tints) · secondary = Outline
 * light = solid white on dark/tinted surfaces · ghost = text · danger = emergency (call 15) only.
 */
type Variant =
  | "primary"
  | "tonal"
  | "glass"
  | "secondary"
  | "light"
  | "ghost"
  | "danger"
  | "outline-light"
type Size = "sm" | "md" | "lg"
type Trailing = "arrow" | "external" | null

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand-700 text-white shadow-[var(--shadow-elev-1)] hover:bg-brand-800",
  tonal: "bg-mint text-brand-900 hover:bg-mint-200",
  glass: "glass text-brand-900",
  secondary: "bg-white text-brand-900 ring-[1.5px] ring-brand-700/35 ring-inset hover:bg-mint",
  light: "bg-white text-brand-900 shadow-[var(--shadow-elev-1)] hover:bg-cream",
  ghost: "bg-transparent text-brand-700 hover:bg-mint",
  danger: "bg-urgent-red text-white shadow-[var(--shadow-elev-1)] hover:brightness-110",
  "outline-light": "bg-transparent text-white ring-[1.5px] ring-white/60 ring-inset hover:bg-white/10",
}

const SIZES: Record<Size, string> = {
  sm: "h-11 px-5 text-label-l",
  md: "h-12 px-6 text-title-m",
  lg: "h-14 px-7 text-title-m",
}

/** Resting radius = half height (pill); pressed radius morphs to a rounded square. */
const RADIUS: Record<Size, number> = { sm: 22, md: 24, lg: 28 }

export function buttonClass({
  variant = "primary",
  size = "md",
  full = false,
  className,
}: {
  variant?: Variant
  size?: Size
  full?: boolean
  className?: string
}) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-full whitespace-nowrap transition-colors select-none",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
    full && "w-full",
    className,
  )
}

function motionProps(size: Size = "md") {
  return {
    style: { borderRadius: RADIUS[size] },
    whileHover: { scale: 1.02 },
    whileTap: { scale: 0.96, borderRadius: 14 },
    transition: SPRING.fast,
  }
}

function TrailingIcon({ trailing }: { trailing: Trailing }) {
  if (trailing === "arrow") return <ArrowRight className="size-[18px]" aria-hidden />
  if (trailing === "external") return <ArrowUpRight className="size-[18px]" aria-hidden />
  return null
}

interface CommonProps {
  variant?: Variant
  size?: Size
  full?: boolean
  trailing?: Trailing
  icon?: LucideIcon
}

function Leading({ icon: Icon, size }: { icon?: LucideIcon; size?: Size }) {
  return Icon ? <Icon className={size === "sm" ? "size-[18px]" : "size-5"} aria-hidden /> : null
}

export const Button = forwardRef<
  HTMLButtonElement,
  CommonProps &
    Omit<HTMLMotionProps<"button">, "children"> & { loading?: boolean; children?: React.ReactNode }
>(function Button(
  { variant, size, full, trailing = null, icon, loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      type="button"
      className={buttonClass({ variant, size, full, className })}
      disabled={disabled || loading}
      {...motionProps(size)}
      {...rest}
    >
      {loading ? (
        <LoaderCircle className="size-[18px] animate-spin" aria-hidden />
      ) : (
        <Leading icon={icon} size={size} />
      )}
      {children}
      <TrailingIcon trailing={trailing} />
    </motion.button>
  )
})

const MotionLink = motion.create(Link)

export function ButtonLink({
  variant,
  size,
  full,
  trailing = null,
  icon,
  className,
  children,
  ...rest
}: CommonProps & LinkProps) {
  return (
    <MotionLink
      className={buttonClass({ variant, size, full, className })}
      {...motionProps(size)}
      {...(rest as object)}
    >
      <Leading icon={icon} size={size} />
      {children}
      <TrailingIcon trailing={trailing} />
    </MotionLink>
  )
}

export function ButtonA({
  variant,
  size,
  full,
  trailing = null,
  icon,
  className,
  children,
  ...rest
}: CommonProps & Omit<HTMLMotionProps<"a">, "children"> & { children?: React.ReactNode }) {
  return (
    <motion.a className={buttonClass({ variant, size, full, className })} {...motionProps(size)} {...rest}>
      <Leading icon={icon} size={size} />
      {children}
      <TrailingIcon trailing={trailing} />
    </motion.a>
  )
}

/** 48px circular icon button (Figma: IconButton). */
type IconVariant = "glass" | "tonal" | "filled" | "danger" | "plain"
const ICON_VARIANTS: Record<IconVariant, string> = {
  glass: "glass text-brand-900",
  tonal: "bg-mint text-brand-800 hover:bg-mint-200",
  filled: "bg-brand-700 text-white hover:bg-brand-800",
  danger: "bg-urgent-red text-white",
  plain: "text-ink-600 hover:bg-mint",
}

export function iconButtonClass(variant: IconVariant = "tonal", className?: string) {
  return cn(
    "inline-flex size-12 shrink-0 items-center justify-center rounded-full transition-colors",
    ICON_VARIANTS[variant],
    className,
  )
}

const iconMotion = { whileHover: { scale: 1.06 }, whileTap: { scale: 0.88 }, transition: SPRING.fast }

export function IconButton({
  icon: Icon,
  label,
  variant = "tonal",
  className,
  ...rest
}: { icon: LucideIcon; label: string; variant?: IconVariant } & Omit<
  HTMLMotionProps<"button">,
  "children"
>) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      className={iconButtonClass(variant, className)}
      {...iconMotion}
      {...rest}
    >
      <Icon className="size-5" aria-hidden />
    </motion.button>
  )
}

export function IconLink({
  icon: Icon,
  label,
  variant = "tonal",
  className,
  ...rest
}: { icon: LucideIcon; label: string; variant?: IconVariant } & Omit<
  HTMLMotionProps<"a">,
  "children"
>) {
  return (
    <motion.a aria-label={label} className={iconButtonClass(variant, className)} {...iconMotion} {...rest}>
      <Icon className="size-5" aria-hidden />
    </motion.a>
  )
}

export function IconRouterLink({
  icon: Icon,
  label,
  variant = "tonal",
  className,
  ...rest
}: { icon: LucideIcon; label: string; variant?: IconVariant } & LinkProps) {
  return (
    <MotionLink
      aria-label={label}
      className={iconButtonClass(variant, className)}
      {...iconMotion}
      {...(rest as object)}
    >
      <Icon className="size-5" aria-hidden />
    </MotionLink>
  )
}

export function LinkArrow({
  to,
  children,
  light = false,
}: {
  to: string
  children: React.ReactNode
  light?: boolean
}) {
  return (
    <Link
      to={to}
      className={cn(
        "group inline-flex items-center gap-2 border-b-[1.5px] pb-1 text-label-l tracking-wide uppercase",
        light
          ? "border-white/70 text-white hover:border-white"
          : "border-brand-700 text-ink-900 hover:text-brand-700",
      )}
    >
      {children}
      <ArrowUpRight
        className="size-[18px] transition-transform duration-300 ease-[var(--ease-emphasized)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
        aria-hidden
      />
    </Link>
  )
}
