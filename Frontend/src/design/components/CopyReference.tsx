import { Copy } from "lucide-react"
import { useState } from "react"
import { Button } from "./Button"
import { Feedback } from "./Feedback"
import { toast } from "./Toast"

export function CopyReference({
  value,
  label = "Copy reference",
}: {
  value: string
  label?: string
}) {
  const [error, setError] = useState(false)
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        variant="tonal"
        icon={Copy}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value)
            setError(false)
            toast("Reference copied")
          } catch {
            setError(true)
          }
        }}
      >
        {label}
      </Button>
      {error && (
        <Feedback error>
          Copy is unavailable. Select and copy the reference shown above.
        </Feedback>
      )}
    </div>
  )
}
