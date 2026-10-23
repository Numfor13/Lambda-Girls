import { useCallback, useMemo, useRef, useState } from "react"

/**
 * Small form layer (no dependency, low-end Android first).
 * - Rules return an error message or `undefined`.
 * - Errors show after a field is blurred, or for every field after a submit attempt.
 * - `submit` validates everything and focuses the first invalid field.
 */
export type Rule<V> = (value: V[keyof V], values: V) => string | undefined
export type Rules<V> = Partial<{ [K in keyof V]: Rule<V>[] }>

export const rules = {
  required:
    (msg = "This is required.") =>
    (v: unknown) =>
      v === undefined ||
      v === null ||
      (typeof v === "string" && !v.trim()) ||
      (Array.isArray(v) && !v.length)
        ? msg
        : undefined,
  minLength: (n: number, msg?: string) => (v: unknown) =>
    typeof v === "string" && v.trim() && v.trim().length < n
      ? (msg ?? `Use at least ${n} characters.`)
      : undefined,
  maxLength: (n: number, msg?: string) => (v: unknown) =>
    typeof v === "string" && v.length > n
      ? (msg ?? `Keep it under ${n} characters.`)
      : undefined,
  /** Cameroon mobile money numbers: 6XX XXX XXX, optionally with +237. Other countries allowed with + prefix. */
  phone:
    (msg = "Enter a mobile number, for example 677 000 000.") =>
    (v: unknown) => {
      if (typeof v !== "string" || !v.trim()) return undefined
      const d = v.replace(/[\s-]/g, "")
      if (/^(\+?237)?6\d{8}$/.test(d)) return undefined
      if (/^\+\d{9,15}$/.test(d)) return undefined
      return msg
    },
  intRange: (min: number, max: number, msg?: string) => (v: unknown) => {
    if (v === "" || v === undefined || v === null) return undefined
    const n = Number(v)
    return Number.isInteger(n) && n >= min && n <= max
      ? undefined
      : (msg ?? `Enter a whole number from ${min} to ${max}.`)
  },
  /** YYYY-MM-DD, today or later (local time). */
  notPast:
    (msg = "Choose today or a later date.") =>
    (v: unknown) => {
      if (typeof v !== "string" || !v) return undefined
      return v < todayIso() ? msg : undefined
    },
  /** YYYY-MM-DD, not in the future. */
  notFuture:
    (msg = "This date can't be in the future.") =>
    (v: unknown) => {
      if (typeof v !== "string" || !v) return undefined
      return v > todayIso() ? msg : undefined
    },
}

export function todayIso(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Normalise a phone entry to the E.164-ish form Fapshi and SMS expect (+2376XXXXXXXX). */
export function normalisePhone(v: string) {
  const d = v.replace(/[\s-]/g, "")
  if (/^6\d{8}$/.test(d)) return `+237${d}`
  if (/^237\d{9}$/.test(d)) return `+${d}`
  return d
}

export function useForm<V extends Record<string, unknown>>(
  initial: V,
  ruleset: Rules<V> = {}
) {
  const [values, setValues] = useState<V>(initial)
  const [touched, setTouched] = useState<Partial<Record<keyof V, boolean>>>({})
  const [submitted, setSubmitted] = useState(false)
  const refs = useRef<Partial<Record<keyof V, HTMLElement | null>>>({})

  const errorsAll = useMemo(() => {
    const out: Partial<Record<keyof V, string>> = {}
    for (const key of Object.keys(ruleset) as (keyof V)[]) {
      for (const rule of ruleset[key] ?? []) {
        const msg = rule(values[key], values)
        if (msg) {
          out[key] = msg
          break
        }
      }
    }
    return out
  }, [values, ruleset])

  const visible = (key: keyof V) =>
    submitted || touched[key] ? errorsAll[key] : undefined
  const valid = Object.keys(errorsAll).length === 0
  const dirty = (Object.keys(values) as (keyof V)[]).some(
    (k) => values[k] !== initial[k]
  )

  const set = useCallback(<K extends keyof V>(key: K, value: V[K]) => {
    setValues((v) => ({ ...v, [key]: value }))
  }, [])

  /** Spread onto Input / Textarea / Select. */
  const bind = <K extends keyof V>(key: K) => ({
    name: String(key),
    value: (values[key] ?? "") as string,
    ref: (el: HTMLElement | null) => {
      refs.current[key] = el
    },
    "aria-invalid": visible(key) ? true : undefined,
    onChange: (e: { target: { value: string } }) =>
      set(key, e.target.value as V[K]),
    onBlur: () => setTouched((t) => ({ ...t, [key]: true })),
  })

  /** Validates everything; returns true when the form may be sent. Focuses the first problem. */
  const check = () => {
    setSubmitted(true)
    const first = (Object.keys(ruleset) as (keyof V)[]).find(
      (k) => errorsAll[k]
    )
    if (first) refs.current[first]?.focus()
    return !first
  }

  const reset = (next: V = initial) => {
    setValues(next)
    setTouched({})
    setSubmitted(false)
  }

  return {
    values,
    set,
    bind,
    error: visible,
    errors: errorsAll,
    valid,
    dirty,
    submitted,
    check,
    reset,
  }
}
