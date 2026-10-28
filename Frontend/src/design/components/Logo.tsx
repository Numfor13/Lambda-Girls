import { Link } from "react-router-dom"
import { cn } from "@/lib/utils"

const MARK = { src: "/brand/carebridge-mark.png", width: 322, height: 256 }

export function LogoMark({ className }: { className?: string }) {
  return (
    <img
      src={MARK.src}
      width={MARK.width}
      height={MARK.height}
      alt=""
      aria-hidden
      draggable={false}
      className={cn("h-9 w-auto select-none", className)}
    />
  )
}

/**
 * Mark + live wordmark. The raster lockup's wordmark and tagline were unreadable at nav
 * sizes, so the name is set in the display serif instead (crisp at any size, translatable).
 */
export function Logo({
  light = false,
  size = "md",
  to = "/",
}: {
  light?: boolean
  size?: "md" | "lg"
  to?: string
}) {
  return (
    <Link to={to} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md" aria-label="CareBridge home">
      <LogoMark className={size === "lg" ? "h-10" : "h-7"} />
      <span
        className={cn(
          "font-display leading-none font-[560] tracking-[-0.02em]",
          size === "lg" ? "text-[28px]" : "text-[21px]",
          light ? "text-white" : "text-brand-900",
        )}
      >
        CareBridge
      </span>
    </Link>
  )
}
