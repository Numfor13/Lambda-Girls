import { Link } from "react-router-dom"
import { cn } from "@/lib/utils"

// Cut from public/brand/carebridge-logo.png (the official stacked logo).
const MARK = { src: "/brand/carebridge-mark.png", width: 322, height: 256 }
const WORDMARK = { src: "/brand/carebridge-wordmark.png", width: 640, height: 150 }
const WORDMARK_LIGHT = { ...WORDMARK, src: "/brand/carebridge-wordmark-light.png" }

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

export function Wordmark({ light = false, className }: { light?: boolean; className?: string }) {
  const img = light ? WORDMARK_LIGHT : WORDMARK
  return (
    <img
      src={img.src}
      width={img.width}
      height={img.height}
      alt=""
      aria-hidden
      draggable={false}
      className={cn("h-8 w-auto select-none", className)}
    />
  )
}

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
    <Link to={to} className="inline-flex shrink-0 items-center gap-2" aria-label="CareBridge home">
      <LogoMark className={size === "lg" ? "h-14" : "h-10"} />
      <Wordmark light={light} className={size === "lg" ? "h-11" : "h-[34px]"} />
    </Link>
  )
}
