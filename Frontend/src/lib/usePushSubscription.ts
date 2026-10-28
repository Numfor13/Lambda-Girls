import { useCallback, useEffect, useState } from "react"
import { pushApi } from "@/api/endpoints"
import type { PushSubscriptionJSON } from "@/api/types"
import { useAuth } from "@/auth/AuthProvider"

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = window.atob(b64)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

export function usePushSubscription() {
  const { session } = useAuth()
  const supported =
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window

  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supported || !session) return
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(Boolean(sub)))
      .catch(() => undefined)
  }, [supported, session])

  const subscribe = useCallback(async () => {
    if (!supported) return
    setLoading(true)
    setError(null)
    try {
      const { vapid_public_key: public_key } = await pushApi.vapidPublicKey()
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(public_key),
      })
      await pushApi.subscribe(sub.toJSON() as PushSubscriptionJSON)
      setSubscribed(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not enable notifications")
    } finally {
      setLoading(false)
    }
  }, [supported])

  const unsubscribe = useCallback(async () => {
    if (!supported) return
    setLoading(true)
    setError(null)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) await sub.unsubscribe()
      await pushApi.unsubscribe()
      setSubscribed(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not disable notifications")
    } finally {
      setLoading(false)
    }
  }, [supported])

  return { supported, subscribed, loading, error, subscribe, unsubscribe }
}
