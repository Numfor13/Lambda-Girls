import { useServiceDraft } from "@/design/components/ServicePage"
import { useState } from "react"
import { useForm, type Rules } from "./form"

/** useForm validation with immediate, identity-scoped draft persistence on every edit. */
export function useDraftForm<V extends Record<string, unknown>>(
  kind: string,
  initial: V,
  ruleset: Rules<V>
) {
  const draft = useServiceDraft(kind, initial)
  const [initialValues] = useState(() => draft.value)
  const form = useForm(initialValues, ruleset)
  const set = <K extends keyof V>(key: K, value: V[K]) => {
    form.set(key, value)
    draft.setValue({ ...form.values, [key]: value })
  }
  const bind = <K extends keyof V>(key: K) => ({
    ...form.bind(key),
    onChange: (e: { target: { value: string } }) =>
      set(key, e.target.value as V[K]),
  })
  const reset = (next = initial) => {
    form.reset(next)
    draft.setValue(next)
  }
  return { ...form, set, bind, reset, saved: draft.saved }
}
