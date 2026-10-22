import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/auth/AuthProvider"
import { ensureFacilitiesSeeded, refreshFacilitiesIfStale } from "@/offline/facilities"
import { syncOutbox } from "@/offline/sync"

export function SyncManager() {
  const queryClient = useQueryClient()
  const { session } = useAuth()

  useEffect(() => {
    void ensureFacilitiesSeeded().then(refreshFacilitiesIfStale)
  }, [])

  useEffect(() => {
    const run = () => void syncOutbox()
    const onVisible = () => document.visibilityState === "visible" && run()
    const onSynced = () => void queryClient.invalidateQueries()
    const onOnline = () => {
      run()
      void refreshFacilitiesIfStale()
    }

    run()
    window.addEventListener("online", onOnline)
    window.addEventListener("carebridge:outbox", run)
    window.addEventListener("carebridge:synced", onSynced)
    document.addEventListener("visibilitychange", onVisible)
    const id = window.setInterval(run, 30_000)
    return () => {
      window.removeEventListener("online", onOnline)
      window.removeEventListener("carebridge:outbox", run)
      window.removeEventListener("carebridge:synced", onSynced)
      document.removeEventListener("visibilitychange", onVisible)
      window.clearInterval(id)
    }
  }, [queryClient, session])

  return null
}
