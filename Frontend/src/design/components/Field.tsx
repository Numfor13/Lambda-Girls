import { useId } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Check, CircleAlert } from "lucide-react"
import { SPRING } from "@/design/motion"
import { cn } from "@/lib/utils"

const control =
  "w-full rounded-md border-[1.5px] border-line bg-white px-4 text-body-l text-ink-900 transition-[border-color,box-shadow,border-radius] duration-200 placeholder:text-ink-400 hover:border-brand-500/50 focus:rounded-sm focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 focus:outline-none disabled:bg-cream"

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string
  children: (id: string) => React.ReactNode
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-label-l text-ink-900">
        {label}
      </label>
      {children(id)}
      <AnimatePresence initial={false} mode="wait">
        {error ? (
          <motion.p
            key="error"
            className="flex items-center gap-1.5 text-label-m text-urgent-red"
            role="alert"
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: [6, -4, 2, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
          >
            <CircleAlert className="size-3.5" aria-hidden />
            {error}
          </motion.p>
        ) : hint ? (
          <motion.p key="hint" className="text-body-m text-ink-600" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {hint}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(control, "h-12", props.className)} />
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(control, "min-h-28 py-3", props.className)} />
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(control, "h-12 pr-8", props.className)} />
}

/** Large selectable card. Selected state morphs to the expressive shape with a spring. */
export function ChoiceCard({
  selected,
  onClick,
  title,
  description,
  icon,
}: {
  selected: boolean
  onClick: () => void
  title: string
  description?: string
  icon?: React.ReactNode
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      animate={{ borderRadius: selected ? "28px 28px 28px 10px" : "20px 20px 20px 20px" }}
      whileTap={{ scale: 0.98 }}
      transition={SPRING.fast}
      className={cn(
        "flex min-h-16 w-full items-center gap-4 border-[1.5px] px-4 py-3 text-left transition-colors",
        selected
          ? "border-brand-700 bg-mint"
          : "border-line bg-white hover:border-brand-500/50 hover:bg-cream",
      )}
    >
      {icon && (
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full transition-colors",
            selected ? "bg-brand-700 text-white" : "bg-mint text-brand-700",
          )}
        >
          {icon}
        </span>
      )}
      <span className="flex-1">
        <span className="block text-title-m text-ink-900">{title}</span>
        {description && <span className="block text-body-m text-ink-600">{description}</span>}
      </span>
      <AnimatePresence>
        {selected && (
          <motion.span
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-700 text-white"
            initial={{ scale: 0, rotate: -90 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0 }}
            transition={SPRING.bouncy}
          >
            <Check className="size-4" aria-hidden />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  )
}

/** Figma: Chip. Selected = brand/900. */
export function Chip({
  selected,
  onClick,
  children,
  className,
}: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      layout
      whileTap={{ scale: 0.94 }}
      transition={SPRING.fast}
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-label-l transition-colors",
        selected
          ? "bg-brand-900 text-white"
          : "bg-white/70 text-ink-900 ring-1 ring-line ring-inset hover:bg-white",
        className,
      )}
    >
      <AnimatePresence initial={false}>
        {selected && (
          <motion.span
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "auto", opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={SPRING.fast}
            className="overflow-hidden"
          >
            <Check className="size-4" aria-hidden />
          </motion.span>
        )}
      </AnimatePresence>
      {children}
    </motion.button>
  )
}
