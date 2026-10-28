import { useCallback, useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { anonymousApi } from "@/api/anonymous"
import { ApiError, friendlyError } from "@/api/errors"
import { useOnline, useVisible } from "@/lib/hooks"

interface PendingText {
  consultation_id: string
  text_body: string
  client_message_id: string
  created_at: number
  blocked?: boolean
}
function read(key: string): PendingText[] {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]") as PendingText[]
  } catch {
    return []
  }
}
export function useAnonymousOutbox(token: string, expiresAt: number) {
  const key = `cb_anonymous_outbox:${token}`,
    online = useOnline(),
    visible = useVisible(),
    qc = useQueryClient()
  const [items, setItems] = useState(() => read(key)),
    [error, setError] = useState<string | null>(null)
  const active = useRef(false)
  const flush = useCallback(async () => {
    if (
      active.current ||
      !navigator.onLine ||
      document.visibilityState !== "visible" ||
      Date.now() >= expiresAt * 1000
    )
      return
    active.current = true
    try {
      for (const m of read(key)) {
        if (m.blocked) continue
        try {
          const current = await anonymousApi.get(token, m.consultation_id)
          if (!["paid", "open"].includes(current.consultation.status))
            throw new ApiError(
              409,
              "This consultation is closed or still waiting for payment. The saved message was not sent."
            )
          await anonymousApi.message(token, m.consultation_id, {
            text_body: m.text_body,
            client_message_id: m.client_message_id,
          })
          const next = read(key).filter(
            (x) => x.client_message_id !== m.client_message_id
          )
          localStorage.setItem(key, JSON.stringify(next))
          setItems(next)
          setError(null)
          await qc.invalidateQueries({
            queryKey: ["anonymous-case", token, m.consultation_id],
          })
        } catch (e) {
          if (
            e instanceof ApiError &&
            [400, 401, 403, 404, 409].includes(e.status)
          ) {
            const next = read(key).map((x) =>
              x.client_message_id === m.client_message_id
                ? { ...x, blocked: true }
                : x
            )
            localStorage.setItem(key, JSON.stringify(next))
            setItems(next)
          }
          setError(
            e instanceof ApiError && [401, 409].includes(e.status)
              ? e.message
              : friendlyError(e)
          )
          break
        }
      }
    } finally {
      active.current = false
    }
  }, [expiresAt, key, qc, token])
  useEffect(() => {
    if (!online || !visible) return
    void flush()
    const interval = window.setInterval(() => void flush(), 20_000)
    return () => window.clearInterval(interval)
  }, [online, visible, flush, items.length])
  const enqueue = (consultationId: string, text: string) => {
    const next = [
      ...read(key),
      {
        consultation_id: consultationId,
        text_body: text,
        client_message_id: crypto.randomUUID(),
        created_at: Date.now(),
      },
    ]
    localStorage.setItem(key, JSON.stringify(next))
    setItems(next)
    void flush()
  }
  return { items, error, enqueue, flush }
}
