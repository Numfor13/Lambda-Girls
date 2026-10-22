import { useId } from "react"
import { ArrowLeft, Menu, MapPin, Paperclip, Play, Search, SendHorizontal } from "lucide-react"
import { LogoMark } from "@/design/components/Logo"
import { cn } from "@/lib/utils"

function PhoneFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-[44px] bg-[#16181a] p-[10px] shadow-[var(--shadow-phone)] ring-1 ring-black/40",
        className,
      )}
    >
      <div className="relative overflow-hidden rounded-[36px] bg-white">
        <div className="absolute top-2 left-1/2 z-10 h-[22px] w-[86px] -translate-x-1/2 rounded-full bg-[#16181a]" />
        {children}
      </div>
    </div>
  )
}

function Wave() {
  const h = [5, 9, 14, 8, 12, 18, 10, 6, 13, 16, 9, 7, 11, 15, 8, 5, 10, 13, 7, 4]
  return (
    <span className="flex h-4 items-center gap-[2px]" aria-hidden>
      {h.map((v, i) => (
        <span key={i} className="w-[2px] rounded-full bg-ink-600" style={{ height: v }} />
      ))}
    </span>
  )
}

export function DoctorPortrait({ className, skin = "#6b3f26" }: { className?: string; skin?: string }) {
  const clip = useId()
  return (
    <svg viewBox="0 0 84 84" className={className} aria-hidden>
      <circle cx="42" cy="42" r="42" fill="#cfe6d7" />
      <clipPath id={clip}>
        <circle cx="42" cy="42" r="42" />
      </clipPath>
      <g clipPath={`url(#${clip})`}>
        <path d="M14 84c2-16 12-25 28-25s26 9 28 25Z" fill="#ffffff" />
        <path d="M36 59l6 9 6-9" fill="#9ccbb2" />
        <rect x="36" y="46" width="12" height="13" rx="5" fill={skin} />
        <ellipse cx="42" cy="34" rx="13" ry="15" fill={skin} />
        <path d="M28 31c0-11 6-17 14-17s14 6 14 17c-3-6-8-9-14-9s-11 3-14 9Z" fill="#1f130c" />
        <path d="M27 66c0 8 5 12 10 12M57 66c0 8-5 12-10 12" stroke="#2e8b5e" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <circle cx="42" cy="78" r="3" fill="#2e8b5e" />
      </g>
    </svg>
  )
}

/** Hero illustration: the doctor consultation chat (marketing only). */
export function HeroPhone() {
  return (
    <PhoneFrame className="w-[270px] sm:w-[300px]">
      <div className="px-4 pt-10 pb-4 text-ink-900">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1">
            <LogoMark className="h-5" />
            <span className="font-display text-[13px] font-extrabold">
              <span className="text-brand-700">Care</span>
              <span className="text-brand-500">Bridge</span>
            </span>
          </span>
          <Menu className="size-4" aria-hidden />
        </div>
        <p className="mt-5 font-display text-[15px] font-bold">Doctor consultation</p>
        <p className="mt-0.5 flex items-center gap-1 text-[10px] text-ink-600">
          <span className="size-1.5 rounded-full bg-brand-500" />
          Dr. Ambe T., General Practitioner
        </p>
        <DoctorPortrait className="mt-3 size-[84px]" />

        <div className="mt-4 space-y-3">
          <div className="max-w-[80%] rounded-[14px] rounded-bl-[4px] bg-cream px-3 py-2">
            <p className="text-[11px]">How can I help you today?</p>
            <p className="mt-0.5 text-[8px] text-ink-400">10:24 AM</p>
          </div>
          <div className="ml-auto max-w-[80%] rounded-[14px] rounded-br-[4px] bg-brand-700 px-3 py-2 text-white">
            <p className="text-[11px]">I would like to discuss my symptoms.</p>
            <p className="mt-0.5 text-right text-[8px] text-white/70">10:25 AM</p>
          </div>
          <div className="flex max-w-[86%] items-center gap-2 rounded-[14px] bg-cream px-3 py-2">
            <span className="flex size-6 items-center justify-center rounded-full bg-ink-900 text-white">
              <Play className="ml-px size-3" fill="currentColor" aria-hidden />
            </span>
            <Wave />
            <span className="text-[9px] text-ink-600">0:24</span>
          </div>
          <p className="text-right text-[8px] text-ink-400">10:27 AM</p>
        </div>

        <div className="mt-2 flex items-center gap-2 rounded-full border border-line px-2 py-1.5">
          <Paperclip className="size-3.5 text-ink-400" aria-hidden />
          <span className="flex-1 text-[10px] text-ink-400">Type a message...</span>
          <span className="flex size-6 items-center justify-center rounded-full bg-brand-700 text-white">
            <SendHorizontal className="size-3" aria-hidden />
          </span>
        </div>
      </div>
    </PhoneFrame>
  )
}

/** "Useful, even offline" card: nearby facilities list. */
export function FacilitiesPhone() {
  const rows = [
    ["Buea Regional Hospital", "2.4 km"],
    ["Molyko Health Centre", "3.1 km"],
    ["Great Soppo Clinic", "4.8 km"],
  ]
  return (
    <div className="w-[176px] rounded-t-[30px] bg-[#16181a] px-[7px] pt-[7px]">
      <div className="rounded-t-[24px] bg-white px-3 pt-6 pb-4">
        <p className="flex items-center gap-2 text-[10px] font-semibold">
          <ArrowLeft className="size-3" aria-hidden /> Nearby facilities
        </p>
        <p className="mt-3 flex items-center gap-1.5 rounded-md bg-cream px-2 py-1.5 text-[8px] text-ink-400">
          <Search className="size-2.5" aria-hidden /> Search in Buea
        </p>
        <ul className="mt-2 space-y-2">
          {rows.map(([name, dist]) => (
            <li key={name} className="flex items-start gap-2 rounded-md border border-line p-2">
              <MapPin className="mt-0.5 size-3.5 shrink-0 text-brand-700" aria-hidden />
              <span>
                <span className="block text-[8px] leading-tight font-semibold">{name}</span>
                <span className="text-[7px] text-ink-400">{dist}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/** Stylised anatomical heart for the symptom guidance section. */
export function HeartIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 360" className={className} role="img" aria-label="Illustration of a human heart">
      <defs>
        <radialGradient id="hb" cx="40%" cy="35%" r="75%">
          <stop offset="0%" stopColor="#ff6b5e" />
          <stop offset="45%" stopColor="#e2382c" />
          <stop offset="100%" stopColor="#8f1712" />
        </radialGradient>
        <linearGradient id="hv" x1="0" x2="1">
          <stop offset="0%" stopColor="#c8261d" />
          <stop offset="100%" stopColor="#ff7a6b" />
        </linearGradient>
        <linearGradient id="hs" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* great vessels */}
      <path d="M150 70c0-26 8-50 24-58l18 8c-12 10-16 28-16 52Z" fill="url(#hv)" />
      <path d="M176 76c-2-38 22-62 58-60 22 2 34 14 34 30l-20 4c-2-12-10-16-20-16-20 0-28 18-26 46Z" fill="url(#hv)" />
      <path d="M232 46c6-12 14-18 22-18l4 18c-6 0-10 4-12 10Z" fill="#d93a2f" />
      <path d="M118 84c-6-30-2-54 12-64l16 10c-10 10-12 30-8 56Z" fill="#b8231b" />
      <path d="M84 100c-14-12-22-26-20-40l18-2c0 10 6 20 16 28Z" fill="#a91f18" />
      <path d="M262 92c14-6 26-4 34 6l-10 14c-6-6-14-6-22-2Z" fill="#c9302a" />
      {/* main body */}
      <path
        d="M96 96c30-22 78-26 112-10 34 14 70 22 82 60 14 46-10 92-44 130-26 30-54 52-74 70-10 9-22 8-30-2-30-38-80-80-96-132-14-46 10-90 50-116Z"
        fill="url(#hb)"
      />
      {/* right atrium bulge */}
      <path d="M64 128c-18 10-28 34-18 56 6 14 20 16 30 8-10-20-12-44-12-64Z" fill="#c62a20" />
      {/* coronary vessels */}
      <g fill="none" strokeLinecap="round">
        <path d="M168 118c-8 40-6 84 4 132 4 22 6 44 0 62" stroke="#7d140f" strokeWidth="6" />
        <path d="M168 118c-8 40-6 84 4 132 4 22 6 44 0 62" stroke="#ff8a7c" strokeWidth="2" opacity=".6" />
        <path d="M172 170c22 6 44 18 60 40M174 220c18 4 34 16 44 32M164 200c-20 10-36 26-46 46M160 150c-22 2-42 12-56 28" stroke="#8a1a14" strokeWidth="3.5" />
        <path d="M232 210c8 14 12 30 10 44M118 246c-4 14-4 28 2 40" stroke="#8a1a14" strokeWidth="2.5" />
      </g>
      {/* highlight */}
      <path d="M110 120c24-18 56-22 82-12-28 2-56 14-74 34-14 16-22 34-24 48-6-26 0-54 16-70Z" fill="url(#hs)" />
    </svg>
  )
}
