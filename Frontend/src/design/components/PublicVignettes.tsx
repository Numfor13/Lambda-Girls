import { Activity, ArrowRight, MapPin, MessageCircle, ShieldCheck } from "lucide-react"
import type { Facility } from "@/api/types"

export function CareStepsVignette() {
  return <div className="rotate-3 shape-br border border-line bg-white p-5 shadow-[var(--shadow-elev-2)]"><p className="eyebrow">Your next step</p><ol className="mt-4 flex flex-col gap-3">{[{icon:Activity,label:"Check danger signs"},{icon:MapPin,label:"Find a facility"},{icon:MessageCircle,label:"Ask a doctor"}].map((s,i)=><li key={s.label} className="flex items-center gap-3 rounded-lg bg-mint p-3"><s.icon className="size-5 text-brand-700" aria-hidden/><span className="flex-1 text-label-l">{i+1}. {s.label}</span><ArrowRight className="size-4" aria-hidden/></li>)}</ol></div>
}
export function BueaDirectoryVignette({ facilities }: { facilities: Facility[] }) {
  const points=facilities.filter(f=>Number.isFinite(f.latitude)&&Number.isFinite(f.longitude))
  const lats=points.map(f=>f.latitude),lngs=points.map(f=>f.longitude),minLat=Math.min(...lats),maxLat=Math.max(...lats),minLng=Math.min(...lngs),maxLng=Math.max(...lngs)
  return <div className="-rotate-3 shape-br border border-line bg-white p-4 shadow-[var(--shadow-elev-2)]"><div className="flex items-center gap-2"><MapPin className="size-5 text-brand-700" aria-hidden/><p className="text-title-m">Around Buea</p></div><svg role="img" aria-label="Overview of built-in facility locations, not a navigation map" viewBox="0 0 300 140" className="mt-3 w-full rounded-lg bg-mint"><path d="M0 110Q80 20 150 80T300 25M30 140Q110 60 150 90T300 110" fill="none" className="stroke-mint-200" strokeWidth="20"/>{points.map(f=><circle key={f.facility_id} cx={20+(f.longitude-minLng)/Math.max(maxLng-minLng,0.001)*260} cy={120-(f.latitude-minLat)/Math.max(maxLat-minLat,0.001)*100} r="3" className="fill-brand-700"/>)}</svg><p className="mt-3 text-label-m text-ink-600">Built-in directory locations · check details before travelling</p></div>
}
export function PrivateChatVignette() {
  return <div className="rotate-3 shape-br border border-line bg-white p-5 shadow-[var(--shadow-elev-2)]"><div className="flex items-center gap-2"><ShieldCheck className="size-5 text-brand-700" aria-hidden/><p className="text-title-m">Text, without an account</p></div><div className="mt-4 ml-8 shape-br bg-mint p-4 text-label-l">Your message</div><div className="mt-3 mr-8 shape-bl bg-cream p-4 text-label-l">Doctor reply</div><p className="mt-4 text-label-m text-ink-600">A seven-day session on this phone</p></div>
}
