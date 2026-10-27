import type { ReactNode } from "react"
import { useSearchParams } from "react-router-dom"
import { motion } from "motion/react"
import { AppPage, CardGrid, Panel } from "./AppPage"
import { Button } from "./Button"
import { Chip, Field, Input, Select } from "./Field"
import { ConsoleTable, PollStatus } from "./ConsoleData"
import { ContentSkeleton } from "./ContentSkeleton"
import { ServiceError, ServiceStatus } from "./ServicePage"
import { EmptyState } from "./primitives"
import { popIn } from "@/design/motion"

export function useRecordParams() {
  const [params,setParams]=useSearchParams()
  return { params, q:params.get("q")??"", sort:params.get("sort")??"oldest", filter:params.get("filter")??"", selected:params.get("selected")??"", set:(key:string,value:string)=>{const next=new URLSearchParams(params);if(value)next.set(key,value);else next.delete(key);setParams(next,{replace:true})}, clear:()=>{const next=new URLSearchParams();const selected=params.get("selected");if(selected)next.set("selected",selected);setParams(next,{replace:true})} }
}
export function RecordTools({label,total,shown,filters=[],view}: {label:string;total:number;shown:number;filters?:{key:string;label:string;count:number}[];view:ReturnType<typeof useRecordParams>}) {
  return <Panel title={label}><div className="grid gap-4 sm:grid-cols-2"><Field label={`Search ${label.toLowerCase()}`}>{id=><Input id={id} type="search" maxLength={100} value={view.q} onChange={e=>view.set("q",e.target.value)} placeholder="Search loaded records"/>}</Field><Field label="Sort records">{id=><Select id={id} value={view.sort} onChange={e=>view.set("sort",e.target.value)}><option value="oldest">Oldest first</option><option value="newest">Newest first</option></Select>}</Field></div>{filters.length>0&&<div className="mt-4 flex flex-wrap gap-2"><Chip selected={!view.filter} onClick={()=>view.set("filter","")}>All · {total}</Chip>{filters.map(f=><Chip key={f.key} selected={view.filter===f.key} onClick={()=>view.set("filter",f.key)}>{f.label} · {f.count}</Chip>)}</div>}<div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p role="status" className="text-label-m text-ink-600">{shown} of {total} loaded records shown</p>{(view.q||view.filter||view.sort!=="oldest")&&<Button variant="ghost" size="sm" onClick={view.clear}>Clear filters</Button>}</div></Panel>
}
export function ResponsiveRecords<T>({rows,id,columns,card,selected,onSelect,caption}:{rows:T[];id:(row:T)=>string;columns:{label:string;content:(row:T)=>ReactNode}[];card:(row:T)=>ReactNode;selected:string;onSelect:(row:T)=>void;caption:string}) {
  return <><div className="hidden lg:block"><ConsoleTable caption={caption} columns={[...columns.map(c=>c.label),"Details"]}>{rows.map(row=><tr key={id(row)} className={selected===id(row)?"bg-mint":"hover:bg-cream"}>{columns.map(c=><td key={c.label} className="p-4 align-top">{c.content(row)}</td>)}<td className="p-4 align-top"><Button variant="tonal" size="sm" aria-pressed={selected===id(row)} onClick={()=>onSelect(row)}>View details</Button></td></tr>)}</ConsoleTable></div><div className="lg:hidden"><CardGrid min={280}>{rows.map(row=><motion.li key={id(row)} variants={popIn} layout className="flex min-w-0 flex-col items-start gap-4 rounded-xl bg-white p-5 shadow-[var(--shadow-elev-1)]">{card(row)}<Button variant="tonal" aria-pressed={selected===id(row)} onClick={()=>onSelect(row)}>View details</Button></motion.li>)}</CardGrid></div></>
}
export function RecordPage({title,subtitle,children,aside,actions,updated,refresh,loading,error,pending,empty,stats=[]}:{title:string;subtitle:string;children:ReactNode;aside?:ReactNode;actions?:ReactNode;updated:number;refresh:()=>void;loading:boolean;error:unknown;pending:boolean;empty:boolean;stats?:{label:string;value:number}[]}) {
  return <AppPage eyebrow="Workspace" title={title} subtitle={subtitle} aside={aside} actions={actions}><div className="flex flex-wrap gap-2">{stats.map(s=><ServiceStatus key={s.label}>{s.value} {s.label}</ServiceStatus>)}</div><PollStatus updated={updated} refresh={refresh} loading={loading}/><ServiceError error={error}/>{pending?<ContentSkeleton/>:<>{children}{empty&&<EmptyState title="No records match this view." action={<Button variant="tonal" onClick={refresh}>Refresh records</Button>}/>}{Boolean(error)&&<Button variant="tonal" onClick={refresh}>Retry loading</Button>}</>}</AppPage>
}
