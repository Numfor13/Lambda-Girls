import { useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowRight, ClipboardList, RefreshCw } from "lucide-react"
import { doctorApi } from "@/api/endpoints"
import type { Consultation } from "@/api/types"
import { useAuth } from "@/auth/AuthProvider"
import { AppPage, Panel } from "@/design/components/AppPage"
import { Button, ButtonLink } from "@/design/components/Button"
import { ContentSkeleton } from "@/design/components/ContentSkeleton"
import { Chip, Field, Input, Select } from "@/design/components/Field"
import { AdvisoryNote, EmptyState } from "@/design/components/primitives"
import { PollStatus } from "@/design/components/ConsoleData"
import { CopyReference } from "@/design/components/CopyReference"
import { ResponsiveRecords, useRecordParams } from "@/design/components/RecordBrowser"
import { ServiceError, ServiceStatus } from "@/design/components/ServicePage"
import { StageProgress } from "@/design/components/StageProgress"
import { UrgencyBadge } from "@/design/components/UrgencyBadge"
import { toast } from "@/design/components/Toast"
import { useNow, useOnline, useVisible } from "@/lib/hooks"
import { describeAge, timeAgo } from "@/lib/format"
import { DoctorPresence } from "./DoctorPresence"

const RANK={RED:0,AMBER:1,GREEN:2} as const
export function patientLabel(c:Consultation){return c.patient_id==="anonymous"||c.patient_id.startsWith("anon#")||c.patient_id.startsWith("anon:")?"Anonymous":c.on_behalf_member_id?"Household member":"Patient"}
export function sortQueue(items:Consultation[]){return [...items].sort((a,b)=>RANK[a.urgency??"GREEN"]-RANK[b.urgency??"GREEN"]||a.created_at-b.created_at)}
function chime(){try{const ctx=new AudioContext(),osc=ctx.createOscillator(),gain=ctx.createGain();osc.frequency.value=880;gain.gain.setValueAtTime(0.15,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.6);osc.connect(gain).connect(ctx.destination);osc.onended=()=>void ctx.close();osc.start();osc.stop(ctx.currentTime+0.6)}catch{/* Audio may be unavailable before interaction. */}}
export default function DoctorQueue(){
  const {session}=useAuth(),navigate=useNavigate(),qc=useQueryClient(),online=useOnline(),visible=useVisible(),now=useNow(),view=useRecordParams()
  const tab=view.params.get("tab")==="mine"?"mine":"waiting"
  const query=useQuery({queryKey:["doctor-queue"],queryFn:doctorApi.queue,refetchInterval:visible&&online?20_000:false})
  const seen=useRef<Set<string>|null>(null)
  useEffect(()=>{if(!query.data)return;const red=query.data.queue.filter(c=>c.urgency==="RED"&&c.status==="paid");if(seen.current&&red.some(c=>!seen.current!.has(c.consultation_id)))chime();seen.current=new Set(red.map(c=>c.consultation_id))},[query.data])
  const all=sortQueue(query.data?.queue??[]),waiting=all.filter(c=>c.status==="paid"),mine=all.filter(c=>c.status==="open"&&c.doctor_id===session?.sub)
  const eligible=[...waiting,...mine],rows=(tab==="mine"?mine:waiting).filter(c=>`${c.complaint} ${patientLabel(c)}`.toLowerCase().includes(view.q.toLowerCase())).sort((a,b)=>RANK[a.urgency??"GREEN"]-RANK[b.urgency??"GREEN"]||(view.sort==="newest"?b.created_at-a.created_at:a.created_at-b.created_at))
  const selected=eligible.find(c=>c.consultation_id===view.selected)
  const preview=useQuery({queryKey:["case-preview",session?.sub,selected?.consultation_id],queryFn:()=>doctorApi.getCase(selected!.consultation_id),enabled:Boolean(selected),refetchInterval:selected&&visible&&online?20_000:false})
  const claim=useMutation({mutationFn:doctorApi.claim,onSuccess:async c=>{await qc.invalidateQueries({queryKey:["doctor-queue"]});toast("Case claimed");navigate(`/doctor/case/${c.consultation_id}`)},onError:()=>void query.refetch()})
  const aside=selected?<Panel title="Selected case"><div className="flex flex-col items-start gap-4">{selected.urgency&&<UrgencyBadge urgency={selected.urgency}/>}<ServiceStatus>{selected.status}</ServiceStatus><p className="text-title-l">{patientLabel(selected)}</p><p className="whitespace-pre-wrap text-body-l">{selected.complaint}</p><p className="text-label-m text-ink-600">Waiting since {timeAgo(selected.created_at,now)}</p><StageProgress steps={[{key:"paid",label:"Paid · awaiting claim"},{key:"open",label:"In consultation"},{key:"closed",label:"Closed"}]} current={selected.status}/>{preview.isPending?<ContentSkeleton rows={1}/>:preview.data?.triage_result?<><p className="text-body-m">{describeAge(preview.data.triage_result.symptom_payload.age_months)} · linked symptom check</p><AdvisoryNote long/></>:<p className="text-body-m text-ink-600">No linked symptom check is available.</p>}<ServiceError error={preview.error||claim.error}/>{selected.status==="paid"?<Button icon={ArrowRight} disabled={!online} loading={claim.isPending} onClick={()=>claim.mutate(selected.consultation_id)}>Claim case</Button>:<ButtonLink icon={ArrowRight} to={`/doctor/case/${selected.consultation_id}`}>Continue case</ButtonLink>}<CopyReference value={selected.consultation_id}/></div></Panel>:<Panel title="Open a case" tone="mint"><ClipboardList className="mb-4 size-8 text-brand-700" aria-hidden/><p className="text-body-l">Choose a row to preview the complaint and linked symptom check. Claim a paid case before replying.</p></Panel>
  return <AppPage eyebrow="Doctor workspace" title="Care queue" subtitle="Most urgent first, then longest waiting. The age sort applies within each urgency level." actions={<><DoctorPresence compact/><Button variant="tonal" icon={RefreshCw} disabled={!online} loading={query.isFetching} onClick={()=>void query.refetch()}>Refresh</Button></>} aside={aside}>
    <div className="flex flex-wrap gap-3">{(["RED","AMBER","GREEN"] as const).map(u=><div key={u} className="flex items-center gap-3 rounded-full px-4 py-3 glass"><UrgencyBadge urgency={u} short/><span className="text-title-m">{waiting.filter(c=>c.urgency===u).length}</span></div>)}</div>
    <Panel title="Queue view"><div className="flex flex-wrap gap-2"><Chip selected={tab==="waiting"} onClick={()=>view.set("tab","")}>Waiting · {waiting.length}</Chip><Chip selected={tab==="mine"} onClick={()=>view.set("tab","mine")}>My open cases · {mine.length}</Chip></div><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Search queue">{id=><Input id={id} type="search" maxLength={100} placeholder="Complaint or care context" value={view.q} onChange={e=>view.set("q",e.target.value)}/>}</Field><Field label="Order within urgency">{id=><Select id={id} value={view.sort} onChange={e=>view.set("sort",e.target.value)}><option value="oldest">Longest waiting first</option><option value="newest">Most recent first</option></Select>}</Field></div><p role="status" className="mt-4 text-label-m text-ink-600">{rows.length} case(s) shown</p>{(view.q||view.sort!=="oldest"||tab==="mine")&&<Button variant="ghost" className="mt-3" onClick={view.clear}>Clear filters</Button>}</Panel>
    <PollStatus updated={query.dataUpdatedAt} refresh={()=>void query.refetch()} loading={query.isFetching}/><ServiceError error={query.error}/>{query.isError&&<Button variant="tonal" onClick={()=>void query.refetch()}>Retry queue</Button>}
    {query.isPending?<ContentSkeleton/>:!rows.length?<EmptyState icon={ClipboardList} title="No cases match this queue view." action={<Button variant="tonal" onClick={()=>void query.refetch()}>Refresh queue</Button>}/>:<ResponsiveRecords rows={rows} id={c=>c.consultation_id} selected={view.selected} onSelect={c=>view.set("selected",c.consultation_id)} caption="Doctor care queue" columns={[{label:"Urgency",content:c=>c.urgency?<UrgencyBadge urgency={c.urgency} short/>:<ServiceStatus>No check</ServiceStatus>},{label:"Complaint",content:c=><div><p className="line-clamp-2 text-title-m">{c.complaint}</p><p className="mt-2 text-label-m text-ink-600">{patientLabel(c)}</p></div>},{label:"Waiting",content:c=>timeAgo(c.created_at,now)},{label:"Status",content:c=><ServiceStatus>{c.status}</ServiceStatus>}]} card={c=><>{c.urgency&&<UrgencyBadge urgency={c.urgency} short/>}<h2 className="text-title-l">{c.complaint}</h2><p className="text-body-m text-ink-600">{patientLabel(c)} · waiting {timeAgo(c.created_at,now)}</p><ServiceStatus>{c.status}</ServiceStatus></>}/>}
  </AppPage>
}
