import { useEffect, useRef, useState } from "react"
import { Timer } from "lucide-react"
import { Button } from "@/design/components/Button"
import { Input } from "@/design/components/Field"

const SECONDS = 60

export function BreathCounter({
  value,
  onChange,
}: {
  value: number | undefined
  onChange: (rate: number | undefined) => void
}) {
  const [phase, setPhase] = useState<"idle" | "counting" | "done">(value ? "done" : "idle")
  const [remaining, setRemaining] = useState(SECONDS)
  const [count, setCount] = useState(0)
  const countRef = useRef(0)
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })

  useEffect(() => {
    if (phase !== "counting") return
    const startedAt = performance.now()
    const id = window.setInterval(() => {
      const left = Math.max(0, SECONDS - Math.floor((performance.now() - startedAt) / 1000))
      setRemaining(left)
      if (left === 0) {
        window.clearInterval(id)
        setPhase("done")
        if (countRef.current > 0) onChangeRef.current(countRef.current)
      }
    }, 200)
    return () => window.clearInterval(id)
  }, [phase])

  const tap = () => {
    countRef.current += 1
    setCount(countRef.current)
  }

  if (phase === "counting") {
    return (
      <div className="flex flex-col items-center gap-5 rounded-[16px] bg-mint p-6 text-center">
        <p className="font-display text-[44px] leading-none font-extrabold tabular-nums">
          0:{String(remaining).padStart(2, "0")}
        </p>
        <button
          type="button"
          onClick={tap}
          className="flex size-44 flex-col items-center justify-center rounded-full bg-brand-700 text-white shadow-[var(--shadow-float)] active:scale-95"
        >
          <span className="font-display text-[48px] leading-none font-extrabold">{count}</span>
          <span className="mt-2 text-sm font-semibold">Tap each breath</span>
        </button>
        <p className="text-sm text-ink-600">Watch the chest or belly rise. Tap once for each breath in.</p>
        <Button variant="ghost" size="sm" onClick={() => setPhase("idle")}>
          Stop
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[16px] border border-line p-5">
        <p className="flex items-center gap-2 font-semibold">
          <Timer className="size-5 text-brand-700" aria-hidden /> Count breaths for one minute
        </p>
        <p className="mt-1 text-sm text-ink-600">
          The child should be calm and not crying. We'll time 60 seconds for you.
        </p>
        <Button
          className="mt-4"
          onClick={() => {
            countRef.current = 0
            setCount(0)
            setRemaining(SECONDS)
            setPhase("counting")
          }}
        >
          {phase === "done" ? "Count again" : "Start counting"}
        </Button>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Or type the number of breaths per minute</span>
        <Input
          type="number"
          inputMode="numeric"
          min={5}
          max={150}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
          className="max-w-40"
        />
      </label>
      {value !== undefined && (
        <p className="rounded-[12px] bg-cream px-4 py-3 text-[15px]" role="status">
          Breathing rate: <strong>{value} breaths per minute</strong>
        </p>
      )}
    </div>
  )
}
