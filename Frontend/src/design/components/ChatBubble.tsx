import { motion } from "motion/react"
import type { SyncState } from "@/offline/db"
import { SPRING } from "@/design/motion"
import { formatTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import { SyncChip } from "./SyncChip"
import { VoiceNotePlayer, type VoiceSource } from "./VoiceNotePlayer"

export interface ChatItem {
  key: string
  mine: boolean
  content_type: "text" | "voice_note"
  text_body: string | null
  duration_seconds: number | null
  created_at: number
  sync_state?: SyncState
  voice?: VoiceSource
}

export function ChatBubble({ item }: { item: ChatItem }) {
  return (
    <motion.li
      layout="position"
      className={cn("flex", item.mine ? "justify-end" : "justify-start")}
      initial={{
        opacity: 0,
        y: 16,
        scale: 0.92,
        originX: item.mine ? 1 : 0,
        originY: 1,
      }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={SPRING.bouncy}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-4 py-2.5 sm:max-w-[70%]",
          item.mine
            ? "rounded-br-sm bg-brand-700 text-white"
            : "rounded-bl-sm bg-mint text-ink-900",
          item.content_type === "voice_note" && "min-w-[240px]"
        )}
      >
        {item.content_type === "voice_note" && item.voice ? (
          <VoiceNotePlayer
            source={item.voice}
            duration={item.duration_seconds ?? 0}
            light={item.mine}
          />
        ) : (
          <p className="text-body-l break-words whitespace-pre-wrap">
            {item.text_body}
          </p>
        )}
        <div
          className={cn(
            "mt-1 flex items-center justify-end gap-2 text-label-m",
            item.mine ? "text-white/75" : "text-ink-400"
          )}
        >
          <time dateTime={new Date(item.created_at).toISOString()}>
            {formatTime(item.created_at)}
          </time>
          {item.mine && item.sync_state && (
            <SyncChip state={item.sync_state} refId={item.key} light iconOnly />
          )}
        </div>
      </div>
    </motion.li>
  )
}
