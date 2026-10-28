import { useId } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Check, CircleAlert } from "lucide-react"
import { SPRING } from "@/design/motion"
import { cn } from "@/lib/utils"

const control =
  "w-full rounded-md border border-ink-900/15 bg-white px-4 text-body-l text-ink-900 shadow-[0_1px_2px_rgb(15_31_23/0.04)] transition-[border-color,box-shadow] duration-150 placeholder:text-ink-400 hover:border-ink-900/30 focus:border-brand-600 focus:ring-4 focus:ring-brand-500/15 focus:outline-none disabled:bg-cream aria-invalid:border-urgent-red aria-invalid:focus:ring-urgent-red/15"

export function Field({
  label,
  hint,
  error,
  required,
  count,
  max,
  children,
}: {
  label: string
  hint?: string
  error?: string
  /** Shows a quiet "Required" marker; validation itself lives in `useForm` (lib/form.ts). */
  required?: boolean
  /** Current length, shown as a counter when `max` is set. */
  count?: number
  max?: number
  children: (id: string) => React.ReactNode
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-label-l text-ink-900">
          {label}
          {required && (
            <span className="ml-1.5 text-label-m font-normal text-ink-600">
              Required
            </span>
          )}
        </label>
        {max !== undefined && count !== undefined && (
          <span
            className={cn(
              "text-label-m tabular-nums",
              count > max ? "text-urgent-red" : "text-ink-600"
            )}
            aria-live="polite"
          >
            {count}/{max}
          </span>
        )}
      </div>
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
          <motion.p
            key="hint"
            className="text-body-m text-ink-600"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
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

export function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>
) {
  return (
    <textarea
      {...props}
      className={cn(control, "min-h-28 py-3", props.className)}
    />
  )
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cn(control, "h-12 pr-8", props.className)} />
  )
}

/** Large selectable card (NHS 111 answer pattern): whole row is the target, check on select. */
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
      whileTap={{ scale: 0.99 }}
      transition={SPRING.fast}
      className={cn(
        "flex min-h-16 w-full items-center gap-4 rounded-lg px-4 py-3 text-left transition-[background-color,box-shadow] duration-150",
        selected
          ? "bg-mint shadow-[inset_0_0_0_2px_var(--color-brand-700)]"
          : "bg-white shadow-[var(--shadow-elev-1)] hover:shadow-[inset_0_0_0_1px_var(--color-brand-500),var(--shadow-elev-1)]"
      )}
    >
      {icon && (
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full transition-colors",
            selected ? "bg-brand-700 text-white" : "bg-mint text-brand-700"
          )}
        >
          {icon}
        </span>
      )}
      <span className="flex-1">
        <span className="block text-title-m text-ink-900">{title}</span>
        {description && (
          <span className="block text-body-m text-ink-600">{description}</span>
        )}
      </span>
      <AnimatePresence>
        {selected && (
          <motion.span
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-700 text-white"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
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

/** Filter chip. Selected = brand/900 with a check. */
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
        "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-label-l transition-colors duration-150",
        selected
          ? "bg-brand-900 text-white"
          : "bg-white text-ink-900 ring-1 ring-ink-900/12 ring-inset hover:bg-cream hover:ring-ink-900/25",
        className
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
