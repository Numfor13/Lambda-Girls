import { useEffect, useRef } from "react"
import { useInView, useMotionValue, useSpring } from "motion/react"

export function NumberTicker({
  value,
  decimals = 0,
  className,
}: {
  value: number
  decimals?: number
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const motionVal = useMotionValue(0)
  const spring = useSpring(motionVal, { stiffness: 80, damping: 24 })
  const inView = useInView(ref, { once: true, margin: "-20% 0px" })

  useEffect(() => {
    if (inView) motionVal.set(value)
  }, [inView, motionVal, value])

  useEffect(
    () =>
      spring.on("change", (v) => {
        if (ref.current) ref.current.textContent = v.toFixed(decimals)
      }),
    [spring, decimals],
  )

  return (
    <span ref={ref} className={className}>
      0
    </span>
  )
}
