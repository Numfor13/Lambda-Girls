import { motion } from "motion/react"
import { Check, CircleAlert, Info } from "lucide-react"
import { Button, ButtonLink } from "./Button"
import { SPRING } from "@/design/motion"
import { cn } from "@/lib/utils"

/** Non-clinical feedback keeps urgency containers reserved for triage. */
export function Feedback({
  children,
  error = false,
  success = false,
  className,
}: {
  children: React.ReactNode
  error?: boolean
  success?: boolean
  className?: string
}) {
  const Icon = error ? CircleAlert : success ? Check : Info
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING.fast}
      role={error ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-md bg-mint p-4 text-body-m text-brand-900",
        className
      )}
    >
      <Icon
        className={cn("size-5 shrink-0", error && "text-urgent-red")}
        aria-hidden
      />
      <div className="min-w-0 flex-1 break-words">{children}</div>
    </motion.div>
  )
}
export function ConfirmAction({
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
  loading = false,
}: {
  title: string
  children: React.ReactNode
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING.fast}
      className="flex flex-col gap-4 rounded-lg border border-line bg-cream p-4"
      role="group"
      aria-label={title}
    >
      <div>
        <p className="text-title-m">{title}</p>
        <p className="mt-2 text-body-m text-ink-600">{children}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={onCancel}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button variant="tonal" size="sm" onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </div>
    </motion.div>
  )
}
export function CodeCard({
  kind,
  code,
  children,
}: {
  kind: "rx" | "ref"
  code: string
  children?: React.ReactNode
}) {
  return (
    <div
      className="flex flex-col items-start gap-3 shape-bl bg-mint p-5"
      role="status"
    >
      <p className="eyebrow">
        {kind === "rx" ? "Prescription" : "Referral"} code
      </p>
      <p className="max-w-full text-headline-m font-mono break-all text-brand-900">
        {code}
      </p>
      {children && <div className="text-body-m text-ink-600">{children}</div>}
      <ButtonLink
        to={`/${kind}/${code}`}
        variant="secondary"
        size="sm"
        trailing="arrow"
      >
        View details
      </ButtonLink>
    </div>
  )
}
