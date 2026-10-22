import { useRef, useState } from "react"
import { LoaderCircle, Pause, Play } from "lucide-react"
import { consultApi } from "@/api/endpoints"
import { db } from "@/offline/db"
import { formatDuration } from "@/lib/format"
import { cn } from "@/lib/utils"

export type VoiceSource =
  | { kind: "local"; clientMessageId: string }
  | { kind: "remote"; consultationId: string; messageId: string }

const urlCache = new Map<string, string>()

async function resolveUrl(src: VoiceSource): Promise<string> {
  const key = src.kind === "local" ? src.clientMessageId : src.messageId
  const cached = urlCache.get(key)
  if (cached) return cached

  let url: string
  if (src.kind === "local") {
    const v = await db.voice_blobs.get(src.clientMessageId)
    if (!v) throw new Error("missing")
    url = URL.createObjectURL(v.blob)
  } else {
    const { download_url } = await consultApi.voiceDownloadUrl(src.consultationId, src.messageId)
    if (download_url.startsWith("mock://")) {
      const f = await db.mock_files.get(download_url.slice("mock://".length))
      if (!f) throw new Error("missing")
      url = URL.createObjectURL(f.blob)
    } else {
      url = download_url
    }
  }
  urlCache.set(key, url)
  return url
}

function bars(seed: string) {
  let h = 0
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return Array.from({ length: 28 }, (_, i) => {
    h = (h * 1103515245 + 12345) >>> 0
    const base = 0.3 + ((h >>> 16) % 70) / 100
    return Math.min(1, base * (i % 7 === 3 ? 1.2 : 1))
  })
}

export function VoiceNotePlayer({
  source,
  duration,
  light = false,
}: {
  source: VoiceSource
  duration: number
  light?: boolean
}) {
  const audio = useRef<HTMLAudioElement | null>(null)
  const [state, setState] = useState<"idle" | "loading" | "playing" | "paused" | "error">("idle")
  const [progress, setProgress] = useState(0)
  const id = source.kind === "local" ? source.clientMessageId : source.messageId
  const heights = bars(id)

  const toggle = async () => {
    if (state === "playing") {
      audio.current?.pause()
      return
    }
    if (!audio.current) {
      setState("loading")
      try {
        const url = await resolveUrl(source)
        const el = new Audio(url)
        el.ontimeupdate = () =>
          setProgress(el.duration && isFinite(el.duration) ? el.currentTime / el.duration : 0)
        el.onplay = () => setState("playing")
        el.onpause = () => setState("paused")
        el.onended = () => {
          setState("idle")
          setProgress(0)
        }
        audio.current = el
      } catch {
        setState("error")
        return
      }
    }
    await audio.current.play().catch(() => setState("error"))
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={toggle}
        aria-label={state === "playing" ? "Pause voice note" : "Play voice note"}
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full",
          light ? "bg-white text-brand-700" : "bg-brand-700 text-white",
        )}
      >
        {state === "loading" ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
        ) : state === "playing" ? (
          <Pause className="size-4" fill="currentColor" aria-hidden />
        ) : (
          <Play className="ml-0.5 size-4" fill="currentColor" aria-hidden />
        )}
      </button>
      <div className="flex h-7 flex-1 items-center gap-[2px]" aria-hidden>
        {heights.map((h, i) => (
          <span
            key={i}
            className={cn(
              "w-[3px] rounded-full",
              i / heights.length < progress
                ? light
                  ? "bg-white"
                  : "bg-brand-700"
                : light
                  ? "bg-white/45"
                  : "bg-ink-400/50",
            )}
            style={{ height: `${Math.round(h * 100)}%` }}
          />
        ))}
      </div>
      <span className={cn("text-label-m tabular-nums", light ? "text-white/85" : "text-ink-600")}>
        {state === "error" ? "Unavailable" : formatDuration(duration)}
      </span>
    </div>
  )
}
