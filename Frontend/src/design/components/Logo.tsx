import { Link } from "react-router-dom"
import { cn } from "@/lib/utils"

export function LogoMark({ className, light = false }: { className?: string; light?: boolean }) {
  return (
    <svg viewBox="0 0 64 56" className={className} aria-hidden="true">
      <path
        d="M32 52C20 43 6 33 6 19.5 6 11 12.5 5 20.5 5c5 0 9 2.6 11.5 6.5C34.5 7.6 38.5 5 43.5 5 51.5 5 58 11 58 19.5 58 33 44 43 32 52Z"
        fill={light ? "#ffffff" : "#0f5a3c"}
      />
      <path
        d="M6.5 23c3 9 11 17 19 23-6-1.5-13-6-17.5-12.5C5.5 30 5 26.5 6.5 23Z"
        fill={light ? "#cfe6d7" : "#2e8b5e"}
      />
      <path
        d="M57.5 23c-3 9-11 17-19 23 6-1.5 13-6 17.5-12.5 2.5-3.5 3-7 1.5-10.5Z"
        fill={light ? "#cfe6d7" : "#2e8b5e"}
      />
      <path
        d="M27.5 14h9v8h8v9h-8v8h-9v-8h-8v-9h8z"
        fill={light ? "#0b3d2c" : "#ffffff"}
      />
    </svg>
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
    <Link to={to} className="inline-flex items-center gap-2" aria-label="CareBridge home">
      <LogoMark light={light} className={size === "lg" ? "h-12 w-14" : "h-9 w-10"} />
      <span className="flex flex-col leading-none">
        <span
          className={cn(
            "font-display font-extrabold tracking-tight",
            size === "lg" ? "text-[30px]" : "text-[22px]",
          )}
        >
          <span className={light ? "text-white" : "text-brand-700"}>Care</span>
          <span className={light ? "text-mint-200" : "text-brand-500"}>Bridge</span>
        </span>
        <span
          className={cn(
            "mt-0.5 self-end font-semibold tracking-[0.06em]",
            size === "lg" ? "text-[12px]" : "text-[9px]",
            light ? "text-mint" : "text-brand-900",
          )}
        >
          Health Within Reach
        </span>
      </span>
    </Link>
  )
}
