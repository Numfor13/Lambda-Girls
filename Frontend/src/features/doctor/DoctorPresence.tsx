import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Radio } from "lucide-react"
import { serviceApi } from "@/api/services"
import { useAuth } from "@/auth/AuthProvider"
import { flags } from "@/config/flags"
import { Button } from "@/design/components/Button"
import { ServiceError } from "@/design/components/ServicePage"
import { useOnline, useVisible } from "@/lib/hooks"
import { formatTime } from "@/lib/format"

export function DoctorPresence({compact=false}:{compact?:boolean}) {
  const {session}=useAuth(),online=useOnline(),visible=useVisible(),[available,setAvailable]=useState(false)
  const heartbeat=useQuery({queryKey:["doctor-presence",session?.sub],queryFn:serviceApi.presence,enabled:flags.doctors_available&&available&&online&&visible,refetchInterval:available&&online&&visible?150_000:false,retry:false,staleTime:0})
  if(!flags.doctors_available)return null
  return <section aria-label="Doctor availability" className={compact?"flex max-w-sm flex-col items-start gap-2":"flex flex-col items-start gap-3 rounded-xl bg-white p-5 shadow-[var(--shadow-elev-1)]"}>{!compact&&<h2 className="text-title-l">Your availability</h2>}<Button icon={Radio} variant={available?"tonal":"secondary"} role="switch" aria-checked={available} aria-label="Available for consultations" onClick={()=>setAvailable(!available)}>{available?"Available":"Away"}</Button><p role="status" className="text-label-m text-ink-600">{available?!online?"Offline · availability updates paused.":!visible?"Updates pause while this tab is hidden.":heartbeat.data?`Last heartbeat ${formatTime(heartbeat.data.last_seen)} · updates every 2½ minutes while visible.`:"Updating availability…":"Away · you may remain listed for five minutes after the last heartbeat."}</p><ServiceError error={heartbeat.error}/>{heartbeat.isError&&available&&<Button variant="tonal" disabled={!online} onClick={()=>void heartbeat.refetch()}>Retry availability update</Button>}</section>
}
