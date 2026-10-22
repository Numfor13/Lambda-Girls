import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Timer } from "lucide-react"
import { SPRING } from "@/design/motion"
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
    const R = 104
    const C = 2 * Math.PI * R
    return (
      <div className="flex flex-col items-center gap-5 bg-mint p-6 text-center shape-bl">
        <p className="text-display-m tabular-nums">0:{String(remaining).padStart(2, "0")}</p>
        <div className="relative flex size-56 items-center justify-center">
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 224 224" aria-hidden>
            <circle cx="112" cy="112" r={R} fill="none" strokeWidth="8" className="stroke-white" />
            <motion.circle
              cx="112"
              cy="112"
              r={R}
              fill="none"
              strokeWidth="8"
              strokeLinecap="round"
              className="stroke-brand-500"
              strokeDasharray={C}
              animate={{ strokeDashoffset: C * (1 - remaining / SECONDS) }}
              transition={{ duration: 0.25, ease: "linear" }}
            />
          </svg>
          <motion.button
            type="button"
            onClick={tap}
            whileTap={{ scale: 0.9, borderRadius: "40%" }}
            transition={SPRING.bouncy}
            style={{ borderRadius: "50%" }}
            className="relative flex size-44 flex-col items-center justify-center bg-brand-700 text-white shadow-[var(--shadow-elev-2)]"
          >
            <AnimatePresence>
              <motion.span
                key={count}
                className="absolute inset-0 rounded-full border-4 border-brand-500"
                initial={{ scale: 1, opacity: 0.7 }}
                animate={{ scale: 1.35, opacity: 0 }}
                transition={{ duration: 0.6 }}
              />
            </AnimatePresence>
            <motion.span
              key={`n-${count}`}
              initial={{ scale: 1.4, y: -6 }}
              animate={{ scale: 1, y: 0 }}
              transition={SPRING.bouncy}
              className="text-display-m text-white tabular-nums"
            >
              {count}
            </motion.span>
            <span className="mt-2 text-label-l">Tap each breath</span>
          </motion.button>
        </div>
        <p className="text-body-m text-ink-600">Watch the chest or belly rise. Tap once for each breath in.</p>
        <Button variant="ghost" size="sm" onClick={() => setPhase("idle")}>
          Stop
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-white p-5 shadow-[var(--shadow-elev-1)]">
        <p className="flex items-center gap-2 text-title-m">
          <Timer className="size-5 text-brand-700" aria-hidden /> Count breaths for one minute
        </p>
        <p className="mt-1 text-body-m text-ink-600">
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
        <span className="text-label-l">Or type the number of breaths per minute</span>
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
        <p className="rounded-md bg-mint px-4 py-3 text-body-l" role="status">
          Breathing rate: <strong>{value} breaths per minute</strong>
        </p>
      )}
    </div>
  )
}
