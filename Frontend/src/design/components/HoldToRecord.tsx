import { useEffect, useRef, useState } from "react"
import { Mic, Square, X } from "lucide-react"
import { MAX_RECORDING_SECONDS, VoiceRecorder, voiceSupported, type Recording } from "@/offline/voiceRecorder"
import { formatDuration } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Button } from "./Button"

const MIC_OK_KEY = "cb_mic_explained"
const CANCEL_DISTANCE = 80

type Phase = "idle" | "explain" | "recording" | "error"

export function HoldToRecord({
  onRecorded,
  label = "Hold to record",
  size = "lg",
}: {
  onRecorded: (r: Recording) => void
  label?: string
  size?: "lg" | "md"
}) {
  const [phase, setPhase] = useState<Phase>("idle")
  const [elapsed, setElapsed] = useState(0)
  const [cancelling, setCancelling] = useState(false)
  const [errorText, setErrorText] = useState("")
  const recorder = useRef<VoiceRecorder | null>(null)
  const startX = useRef(0)
  const toggleMode = useRef(false)

  const finish = async () => {
    const rec = recorder.current
    recorder.current = null
    setPhase("idle")
    setElapsed(0)
    if (!rec) return
    if (cancelling) {
      rec.cancel()
      setCancelling(false)
      return
    }
    const result = await rec.stop()
    if (result.duration_seconds >= 1 && result.blob.size > 0) onRecorded(result)
  }

  const finishRef = useRef(finish)
  useEffect(() => {
    finishRef.current = finish
  })

  useEffect(() => {
    if (phase !== "recording") return
    const started = performance.now()
    const id = window.setInterval(() => {
      const secs = (performance.now() - started) / 1000
      setElapsed(secs)
      if (secs >= MAX_RECORDING_SECONDS) void finishRef.current()
    }, 250)
    return () => window.clearInterval(id)
  }, [phase])

  useEffect(() => () => recorder.current?.cancel(), [])

  const begin = async () => {
    if (!voiceSupported()) {
      setErrorText("Voice notes aren't supported on this browser. Please type instead.")
      setPhase("error")
      return
    }
    if (!localStorage.getItem(MIC_OK_KEY)) {
      setPhase("explain")
      return
    }
    const rec = new VoiceRecorder()
    try {
      await rec.start()
      recorder.current = rec
      setCancelling(false)
      setPhase("recording")
    } catch {
      setErrorText("We couldn't use the microphone. Check that CareBridge is allowed to use it.")
      setPhase("error")
    }
  }

  const allowMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((t) => t.stop())
      localStorage.setItem(MIC_OK_KEY, "1")
      setPhase("idle")
    } catch {
      setErrorText("Microphone access was blocked. You can still type your message.")
      setPhase("error")
    }
  }

  if (phase === "explain") {
    return (
      <div className="rounded-[14px] border border-line bg-cream p-4 text-sm text-ink-900">
        <p className="font-semibold">Record in your own words</p>
        <p className="mt-1 text-ink-600">
          CareBridge needs your microphone to record voice notes for the doctor. Recording works
          even when you're offline.
        </p>
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={allowMic}>
            Allow microphone
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPhase("idle")}>
            Not now
          </Button>
        </div>
      </div>
    )
  }

  const recording = phase === "recording"
  const big = size === "lg"

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        aria-label={recording ? "Release to send voice note" : label}
        aria-pressed={recording}
        onPointerDown={(e) => {
          if (e.button !== 0 || toggleMode.current) return
          e.currentTarget.setPointerCapture(e.pointerId)
          startX.current = e.clientX
          void begin()
        }}
        onPointerMove={(e) => {
          if (!recording || toggleMode.current) return
          setCancelling(startX.current - e.clientX > CANCEL_DISTANCE)
        }}
        onPointerUp={() => {
          if (!toggleMode.current) void finish()
        }}
        onPointerCancel={() => {
          setCancelling(true)
          void finish()
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return
          e.preventDefault()
          if (recording) {
            toggleMode.current = false
            void finish()
          } else {
            toggleMode.current = true
            void begin()
          }
        }}
        onContextMenu={(e) => e.preventDefault()}
        className={cn(
          "relative flex touch-none items-center justify-center rounded-full text-white transition-all select-none",
          big ? "size-[72px]" : "size-12",
          recording
            ? cancelling
              ? "scale-95 bg-ink-600"
              : "scale-110 bg-urgent-red shadow-[0_0_0_10px_rgba(198,40,40,0.15)]"
            : "bg-brand-700 hover:bg-brand-800",
        )}
      >
        {recording ? (
          cancelling ? (
            <X className={big ? "size-8" : "size-5"} aria-hidden />
          ) : (
            <Square className={big ? "size-7" : "size-4"} fill="currentColor" aria-hidden />
          )
        ) : (
          <Mic className={big ? "size-8" : "size-5"} aria-hidden />
        )}
      </button>
      {big && (
        <p className="text-center text-sm font-medium text-ink-900" aria-live="polite">
          {recording
            ? cancelling
              ? "Release to cancel"
              : `${formatDuration(elapsed)} · release to finish, slide left to cancel`
            : label}
        </p>
      )}
      {!big && recording && (
        <span className="text-xs font-semibold text-urgent-red" aria-live="polite">
          {formatDuration(elapsed)}
        </span>
      )}
      {phase === "error" && (
        <p className="max-w-xs text-center text-xs text-urgent-red" role="alert">
          {errorText}
        </p>
      )}
    </div>
  )
}
