import { forwardRef } from "react"
import { Link, type LinkProps } from "react-router-dom"
import { motion, type HTMLMotionProps } from "motion/react"
import { ArrowRight, ArrowUpRight, LoaderCircle, type LucideIcon } from "lucide-react"
import { SPRING } from "@/design/motion"
import { cn } from "@/lib/utils"

/**
 * Pill button. One `primary` per view. v2: colour-only hover, a small press-in, Inter 600.
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
  // Opaque disabled state: primary buttons often float (sticky) over content.
  primary:
    "bg-brand-700 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_1px_2px_rgb(11_61_44/0.3)] hover:bg-brand-800 disabled:bg-mint-200 disabled:text-ink-400 disabled:shadow-none disabled:opacity-100",
  tonal: "bg-mint text-brand-900 hover:bg-mint-200",
  glass: "glass text-brand-900 hover:bg-white/80",
  secondary: "bg-white text-ink-900 ring-1 ring-ink-900/12 ring-inset hover:bg-cream",
  light: "bg-white text-brand-900 shadow-[var(--shadow-elev-1)] hover:bg-mint",
  ghost: "bg-transparent text-brand-700 hover:bg-mint",
  danger:
    "bg-urgent-red text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_1px_2px_rgb(120_20_20/0.3)] hover:brightness-110",
  "outline-light": "bg-transparent text-white ring-1 ring-white/45 ring-inset hover:bg-white/10",
}

const SIZES: Record<Size, string> = {
  sm: "h-10 px-4 text-label-l",
  md: "h-12 px-5 text-title-m",
  lg: "h-[52px] px-6 text-title-m",
}

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
    "inline-flex items-center justify-center gap-2 rounded-full whitespace-nowrap transition-[background-color,color,box-shadow] duration-200 select-none",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
    full && "w-full",
    className,
  )
}

const PRESS = { whileTap: { scale: 0.97 }, transition: SPRING.fast }

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
      {...PRESS}
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
      {...PRESS}
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
    <motion.a className={buttonClass({ variant, size, full, className })} {...PRESS} {...rest}>
      <Leading icon={icon} size={size} />
      {children}
      <TrailingIcon trailing={trailing} />
    </motion.a>
  )
}

/** 44px circular icon button (48px touch target via padding-free hit area on mobile lists). */
type IconVariant = "glass" | "tonal" | "filled" | "danger" | "plain"
const ICON_VARIANTS: Record<IconVariant, string> = {
  glass: "glass text-brand-900",
  tonal: "bg-mint text-brand-800 hover:bg-mint-200",
  filled: "bg-brand-700 text-white hover:bg-brand-800",
  danger: "bg-urgent-red text-white hover:brightness-110",
  plain: "text-ink-600 hover:bg-ink-900/5 hover:text-ink-900",
}

export function iconButtonClass(variant: IconVariant = "tonal", className?: string) {
  return cn(
    "inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors duration-200",
    ICON_VARIANTS[variant],
    className,
  )
}

const iconMotion = { whileTap: { scale: 0.92 }, transition: SPRING.fast }

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
        "group inline-flex items-center gap-2 border-b pb-1 text-label-l",
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
