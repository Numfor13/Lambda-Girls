import { Link } from "react-router-dom"
import { cn } from "@/lib/utils"

const MARK = { src: "/brand/carebridge-mark.png", width: 322, height: 256 }
const FULL_LOGO = { src: "/CareBridge Healthcare Logo.png", width: 640, height: 256 }

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

export function Logo({
  size = "md",
  to = "/",
}: {
  light?: boolean
  size?: "md" | "lg"
  to?: string
}) {
  return (
    <Link to={to} className="inline-flex shrink-0 items-center" aria-label="CareBridge home">
      <img
        src={FULL_LOGO.src}
        width={FULL_LOGO.width}
        height={FULL_LOGO.height}
        alt="CareBridge"
        draggable={false}
        className={cn("w-auto select-none", size === "lg" ? "h-14" : "h-10")}
      />
    </Link>
  )
}
