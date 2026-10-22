import { useState } from "react"
import { Link } from "react-router-dom"
import { motion } from "motion/react"
import { ArrowRight, ArrowUpRight, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { hoverZoomTrigger, zoomVariants } from "@/design/motion"

const MotionLink = motion.create(Link)

/**
 * Photo card with a bottom gradient and caption. Real photography goes in
 * public/images/<name>; until a file exists, an illustrated fallback is shown.
 */
export function ImageCard({
  to,
  image,
  fallbackIcon: Icon,
  fallbackTone = "from-[#3d6b55] via-[#2b5443] to-[#163a2b]",
  title,
  subtitle,
  chip = "external",
  className,
}: {
  to: string
  image: string
  fallbackIcon: LucideIcon
  fallbackTone?: string
  title: string
  subtitle: string
  chip?: "external" | "arrow-bottom"
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  return (
    <MotionLink
      to={to}
      className={cn(
        "group relative block overflow-hidden rounded-[16px] bg-brand-900 shadow-[var(--shadow-float)]",
        className,
      )}
      {...hoverZoomTrigger}
    >
      {failed ? (
        <motion.div
          className={cn(
            "absolute inset-0 flex items-start justify-center bg-gradient-to-br pt-[18%]",
            fallbackTone,
          )}
          aria-hidden
          variants={zoomVariants}
        >
          <span className="flex size-28 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20">
            <Icon className="size-14 text-white/80" strokeWidth={1.25} />
          </span>
        </motion.div>
      ) : (
        <motion.img
          src={image}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="absolute inset-0 size-full object-cover"
          variants={zoomVariants}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
      {chip === "external" && (
        <span className="absolute top-4 right-4 flex size-9 items-center justify-center rounded-full bg-white text-ink-900">
          <ArrowUpRight className="size-4" aria-hidden />
        </span>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-5">
        <div>
          <p className="font-display text-[19px] leading-tight font-bold text-white">{title}</p>
          <p className="mt-1 text-[13px] leading-5 text-white/85">{subtitle}</p>
        </div>
        {chip === "arrow-bottom" && (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-ink-900">
            <ArrowRight className="size-4" aria-hidden />
          </span>
        )}
      </div>
    </MotionLink>
  )
}
