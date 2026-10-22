import { useId } from "react"
import { cn } from "@/lib/utils"

const control =
  "w-full rounded-[10px] border border-line bg-white px-4 text-[16px] text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none disabled:bg-cream"

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
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-ink-900">
        {label}
      </label>
      {children(id)}
      {hint && !error && <p className="text-xs text-ink-600">{hint}</p>}
      {error && (
        <p className="text-xs font-medium text-urgent-red" role="alert">
          {error}
        </p>
      )}
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
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex min-h-16 w-full items-center gap-4 rounded-[14px] border-[1.5px] px-4 py-3 text-left transition-colors",
        selected
          ? "border-brand-700 bg-mint"
          : "border-line bg-white hover:border-brand-500 hover:bg-cream",
      )}
    >
      {icon && (
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full",
            selected ? "bg-brand-700 text-white" : "bg-mint text-brand-700",
          )}
        >
          {icon}
        </span>
      )}
      <span className="flex-1">
        <span className="block text-[16px] font-semibold text-ink-900">{title}</span>
        {description && <span className="block text-sm text-ink-600">{description}</span>}
      </span>
    </button>
  )
}

export function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors",
        selected
          ? "border-brand-700 bg-brand-700 text-white"
          : "border-line bg-white text-ink-900 hover:border-brand-500",
      )}
    >
      {children}
    </button>
  )
}
