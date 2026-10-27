import { Check } from "lucide-react"
import { motion } from "motion/react"
import { SPRING } from "@/design/motion"

export function StageProgress({
  steps,
  current,
  label = "Progress",
}: {
  steps: { key: string; label: string }[]
  current: string
  label?: string
}) {
  const index = steps.findIndex((s) => s.key === current)
  return (
    <ol aria-label={label} className="flex flex-col gap-3">
      {steps.map((s, i) => (
        <li
          key={s.key}
          aria-current={i === index ? "step" : undefined}
          className="flex items-center gap-3"
        >
          <motion.span
            animate={{ scale: i === index ? 1.06 : 1 }}
            transition={SPRING.bouncy}
            className={`flex size-10 shrink-0 items-center justify-center rounded-full text-label-l ${i <= index ? "bg-brand-700 text-white" : "bg-cream text-ink-600"}`}
          >
            {i < index ? <Check className="size-4" aria-hidden /> : i + 1}
          </motion.span>
          <span className="text-label-l">
            {s.label}
            {i === index && <span className="sr-only"> · Current status</span>}
          </span>
        </li>
      ))}
    </ol>
  )
}
