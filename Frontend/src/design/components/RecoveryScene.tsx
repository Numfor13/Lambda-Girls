import type { ReactNode } from "react"
import { Activity, ArrowRight, HelpCircle, MapPin } from "lucide-react"
import { Landscape } from "./Landscape"
import { ButtonLink } from "./Button"

export function RecoveryScene({ children }: { children: ReactNode }) {
  return <section className="relative isolate overflow-hidden rounded-xl bg-mint-200"><Landscape className="top-1/3 -z-10 fade-top"/><div className="container-page grid grid-cols-[minmax(0,1fr)] items-start gap-6 py-8 lg:grid-cols-2"><div className="min-w-0">{children}</div><div className="flex flex-col gap-4"><p className="eyebrow">Choose a familiar route</p>{[{to:"/app/facilities",title:"Find a facility",body:"Open the directory saved on this phone.",icon:MapPin},{to:"/app/triage",title:"Check symptoms",body:"Start with a check for danger signs.",icon:Activity},{to:"/how-it-works#help",title:"Get practical help",body:"Read how CareBridge works.",icon:HelpCircle}].map(link=><div key={link.to} className="flex items-start gap-4 shape-br bg-white p-5 shadow-[var(--shadow-elev-1)]"><link.icon className="mt-1 size-6 shrink-0 text-brand-700" aria-hidden/><div className="min-w-0 flex-1"><h2 className="text-title-l">{link.title}</h2><p className="mt-2 text-body-m text-ink-600">{link.body}</p><ButtonLink className="mt-3" variant="tonal" icon={ArrowRight} to={link.to}>{link.title}</ButtonLink></div></div>)}</div></div></section>
}
