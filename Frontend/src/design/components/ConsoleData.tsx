import type { ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { RefreshCw } from "lucide-react"
import { useAuth } from "@/auth/AuthProvider"
import { formatTime } from "@/lib/format"
import { useOnline, useVisible } from "@/lib/hooks"
import { Button } from "./Button"

export function useConsoleQuery<T>(
  key: string,
  queryFn: () => Promise<T>,
  enabled = true
) {
  const { session } = useAuth(),
    online = useOnline(),
    visible = useVisible()
  return useQuery({
    queryKey: [key, session?.sub],
    queryFn,
    enabled,
    refetchInterval: visible && online ? 20_000 : false,
  })
}
export function PollStatus({
  updated,
  refresh,
  loading,
}: {
  updated: number
  refresh: () => void
  loading: boolean
}) {
  const online = useOnline()
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p role="status" className="text-label-m text-ink-600">
        {!online
          ? "Offline · showing loaded data"
          : updated
            ? `Last updated ${formatTime(updated)} · refreshes while visible`
            : "Waiting for an update"}
      </p>
      <Button
        variant="tonal"
        size="sm"
        icon={RefreshCw}
        loading={loading}
        disabled={!online}
        onClick={refresh}
      >
        Refresh
      </Button>
    </div>
  )
}
export function ConsoleTable({
  columns,
  children,
  caption,
}: {
  columns: string[]
  children: ReactNode
  caption: string
}) {
  return (
    <div className="max-h-[min(70svh,720px)] min-w-0 overflow-auto rounded-xl bg-white shadow-[var(--shadow-elev-1)]">
      <table className="w-full text-left text-body-m">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-cream text-label-l text-ink-600">
          <tr>
            {columns.map((c) => (
              <th scope="col" className="p-4" key={c}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  )
}
