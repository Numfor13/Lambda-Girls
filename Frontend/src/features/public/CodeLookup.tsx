import { useNavigate, useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { ArrowRight, FileText, RefreshCw } from "lucide-react"
import { doctorApi, facilityApi } from "@/api/endpoints"
import { Panel } from "@/design/components/AppPage"
import { Button } from "@/design/components/Button"
import { Field, Input } from "@/design/components/Field"
import { ContentSkeleton } from "@/design/components/ContentSkeleton"
import { CopyReference } from "@/design/components/CopyReference"
import { Feedback } from "@/design/components/Feedback"
import { PublicHero, FeatureCard, StatementBand } from "@/design/components/PublicHero"
import { ServiceError, ServiceStatus } from "@/design/components/ServicePage"
import { StageProgress } from "@/design/components/StageProgress"
import { formatDateTime } from "@/lib/format"
import { rules, useForm } from "@/lib/form"
import { useOnline } from "@/lib/hooks"

function LookupForm({code,kind}:{code:string;kind:"rx"|"ref"}) {
  const navigate=useNavigate(),form=useForm({code},{code:[rules.required("Enter the eight-character code."),v=>typeof v==="string"&&/^[A-Za-z0-9]{8}$/.test(v.trim())?undefined:"Use exactly eight letters or numbers."]})
  return <form noValidate className="flex flex-col gap-4" onSubmit={e=>{e.preventDefault();if(form.check())navigate(`/${kind}/${encodeURIComponent(form.values.code.trim())}`)}}><Field label={kind==="rx"?"Prescription code":"Referral code"} required error={form.error("code")} hint="Letters are case-sensitive. Keep the code exactly as given.">{id=><Input id={id} maxLength={8} autoCapitalize="off" autoCorrect="off" spellCheck={false} autoComplete="off" className="font-mono" {...form.bind("code")}/>}</Field><Button type="submit" icon={ArrowRight} variant="tonal">Look up code</Button></form>
}
export default function CodeLookup({kind}:{kind:"rx"|"ref"}) {
  const {code=""}=useParams(),online=useOnline(),valid=/^[A-Za-z0-9]{8}$/.test(code)
  const rx=useQuery({queryKey:["public-rx",code],queryFn:()=>doctorApi.prescription(code),enabled:valid&&kind==="rx",retry:false})
  const referral=useQuery({queryKey:["public-ref",code],queryFn:()=>doctorApi.referral(code),enabled:valid&&kind==="ref",retry:false})
  const query=kind==="rx"?rx:referral,data=query.data
  const facility=useQuery({queryKey:["public-ref-facility",referral.data?.target_facility_id],queryFn:()=>facilityApi.get(referral.data!.target_facility_id),enabled:kind==="ref"&&Boolean(referral.data?.target_facility_id),retry:false})
  const terminal=kind==="rx"?"dispensed":"used",status=data?.status??"active",issued=data?.issued_at
  const vignette=<div className="rotate-3 shape-br border border-line bg-white p-5 shadow-[var(--shadow-elev-2)]"><FileText className="mb-4 size-8 text-brand-700" aria-hidden/><p className="eyebrow">{kind==="rx"?"Prescription":"Referral"} reference</p><p className="mt-3 text-display-m break-all font-mono">{valid?code:"••••••••"}</p><p className="mt-3 text-label-m text-ink-600">Show the code at the pharmacy or facility.</p></div>
  return <><PublicHero eyebrow={kind==="rx"?"Prescription lookup":"Referral lookup"} title={valid?code:"Your care\nreference."} lede={kind==="rx"?"Prescription details, when you need them.":"A reference for your next place of care."} body={<p>Use the exact eight-character code issued in the consultation. This view keeps patient identifiers out of the page.</p>} card={<FeatureCard chips={[kind==="rx"?"Prescription":"Referral","Public lookup"]} title="Find the right reference." line="No account is needed to look up a code."><LookupForm key={`${kind}:${code}`} code={code} kind={kind}/></FeatureCard>} breakout={vignette}><StatementBand panel={{icon:FileText,title:"Keep the exact code.",body:"Codes use upper- and lower-case letters and numbers. Changing a character can open the wrong reference or no reference at all."}} stat={{value:"8",label:"characters per care code"}} statement="A reference you can carry." link={{to:"/how-it-works",label:"How care codes work"}}/></PublicHero>
    <section className="container-page flex flex-col gap-5 py-10">{!valid?<Feedback>Check the code and use the lookup form above.</Feedback>:query.isPending?<ContentSkeleton rows={2}/>:<><ServiceError error={query.error}/>{query.isError&&<Button variant="tonal" className="self-start" disabled={!online} onClick={()=>void query.refetch()}>Retry lookup</Button>}{data&&<div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2"><Panel title={kind==="rx"?"Prescription details":"Referral details"}><div className="flex flex-col gap-4">{kind==="rx"&&rx.data?<><h2 className="text-title-l">Medication details</h2><p className="whitespace-pre-wrap text-body-l">{rx.data.medication_details}</p>{rx.data.instructions&&<><h3 className="text-title-l">Instructions</h3><p className="whitespace-pre-wrap text-body-l">{rx.data.instructions}</p></>}</>:referral.data&&<><h2 className="text-title-l">Destination</h2><p className="text-body-l">{facility.data?.name??"Facility details unavailable"}</p>{facility.isError&&<p className="text-body-m text-ink-600">Show this referral to your clinician if you need help identifying the destination.</p>}{referral.data.reason&&<><h3 className="text-title-l">Reason</h3><p className="whitespace-pre-wrap text-body-l">{referral.data.reason}</p></>}</>}</div></Panel><Panel title="Reference status"><div className="flex flex-col items-start gap-4"><ServiceStatus>{status}</ServiceStatus><StageProgress steps={[{key:"active",label:"Issued"},{key:terminal,label:kind==="rx"?"Dispensed":"Used"}]} current={status}/>{issued&&<p className="text-body-m text-ink-600">Issued {formatDateTime(issued)}</p>}<p className="text-body-m break-all font-mono">{code}</p><CopyReference value={code} label="Copy code"/><p className="text-label-m text-ink-600">Lookup updated {formatDateTime(query.dataUpdatedAt)}</p><Button variant="tonal" icon={RefreshCw} disabled={!online} loading={query.isFetching} onClick={()=>void query.refetch()}>Refresh status</Button></div></Panel></div>}</>}</section>
  </>
}
