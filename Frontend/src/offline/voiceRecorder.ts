export const MAX_RECORDING_SECONDS = 120

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm", "audio/mp4"]

export interface Recording {
  blob: Blob
  duration_seconds: number
  mime: string
}

export function voiceSupported(): boolean {
  return typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia)
}

export class VoiceRecorder {
  private recorder: MediaRecorder | null = null
  private stream: MediaStream | null = null
  private chunks: Blob[] = []
  private startedAt = 0

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    })
    const mime = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? ""
    this.recorder = new MediaRecorder(this.stream, {
      mimeType: mime || undefined,
      audioBitsPerSecond: 16_000,
    })
    this.chunks = []
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data)
    }
    this.recorder.start(1000)
    this.startedAt = performance.now()
  }

  stop(): Promise<Recording> {
    return new Promise((resolve, reject) => {
      const rec = this.recorder
      if (!rec) return reject(new Error("Not recording"))
      rec.onstop = () => {
        const mime = rec.mimeType || "audio/webm"
        const duration = (performance.now() - this.startedAt) / 1000
        this.release()
        resolve({
          blob: new Blob(this.chunks, { type: mime }),
          duration_seconds: Math.min(MAX_RECORDING_SECONDS, Math.round(duration)),
          mime,
        })
      }
      rec.stop()
    })
  }

  cancel() {
    if (this.recorder && this.recorder.state !== "inactive") {
      this.recorder.onstop = null
      this.recorder.stop()
    }
    this.release()
  }

  private release() {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.recorder = null
  }
}
