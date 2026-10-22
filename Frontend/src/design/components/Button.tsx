import { forwardRef } from "react"
import { Link, type LinkProps } from "react-router-dom"
import { ArrowRight, ArrowUpRight, LoaderCircle } from "lucide-react"
import { cn } from "@/lib/utils"

type Variant = "primary" | "secondary" | "light" | "ghost" | "danger" | "outline-light"
type Size = "sm" | "md" | "lg"
type Trailing = "arrow" | "external" | null

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand-700 text-white hover:bg-brand-800 active:bg-brand-900",
  secondary:
    "bg-white text-brand-900 border-[1.5px] border-brand-700 hover:bg-mint active:bg-mint-200",
  light: "bg-white text-brand-900 hover:bg-cream",
  ghost: "bg-transparent text-brand-700 hover:bg-mint",
  danger: "bg-urgent-red text-white hover:bg-[#a51f1f]",
  "outline-light": "bg-transparent text-white border-[1.5px] border-white/70 hover:bg-white/10",
}

const SIZES: Record<Size, string> = {
  sm: "h-10 px-4 text-sm",
  md: "h-12 px-5 text-[15px]",
  lg: "h-14 px-7 text-base",
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
    "inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold whitespace-nowrap transition-colors select-none",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
    full && "w-full",
    className,
  )
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
}

export const Button = forwardRef<
  HTMLButtonElement,
  CommonProps & React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }
>(function Button(
  { variant, size, full, trailing = null, loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={buttonClass({ variant, size, full, className })}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <LoaderCircle className="size-[18px] animate-spin" aria-hidden />}
      {children}
      <TrailingIcon trailing={trailing} />
    </button>
  )
})

export function ButtonLink({
  variant,
  size,
  full,
  trailing = null,
  className,
  children,
  ...rest
}: CommonProps & LinkProps) {
  return (
    <Link className={buttonClass({ variant, size, full, className })} {...rest}>
      {children}
      <TrailingIcon trailing={trailing} />
    </Link>
  )
}

export function ButtonA({
  variant,
  size,
  full,
  trailing = null,
  className,
  children,
  ...rest
}: CommonProps & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a className={buttonClass({ variant, size, full, className })} {...rest}>
      {children}
      <TrailingIcon trailing={trailing} />
    </a>
  )
}

export function LinkArrow({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="group inline-flex items-center gap-2 border-b-[1.5px] border-brand-700 pb-1 text-[17px] font-semibold text-ink-900 hover:text-brand-700"
    >
      {children}
      <ArrowUpRight
        className="size-[18px] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
        aria-hidden
      />
    </Link>
  )
}
