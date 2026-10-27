import { useState } from "react"
import { Navigate, useNavigate, useSearchParams } from "react-router-dom"
import { ArrowRight, Headphones, LogIn, ShieldCheck, Smartphone, Stethoscope, User, Users, WifiOff } from "lucide-react"
import { useAuth } from "@/auth/AuthProvider"
import { authConfigured } from "@/config/env"
import { flags } from "@/config/flags"
import type { Role } from "@/auth/session"
import { Button, ButtonLink } from "@/design/components/Button"
import { ContentSkeleton } from "@/design/components/ContentSkeleton"
import { Feedback } from "@/design/components/Feedback"
import { Logo } from "@/design/components/Logo"
import { PublicHero, FeatureCard } from "@/design/components/PublicHero"
import { authDestination, safeReturn } from "./destination"

export default function SignIn() {
  const [params]=useSearchParams(), {session,isLoading,signIn,signInDemo}=useAuth(), navigate=useNavigate()
  const [busy,setBusy]=useState(false),[error,setError]=useState(false)
  const returnTo=safeReturn(params.get("returnTo")),denied=params.get("denied")==="1"
  if(session&&!denied)return <Navigate to={authDestination(session,returnTo)} replace/>
  const demo=(role:Role)=>{try{const next=signInDemo(role);navigate(authDestination(next,returnTo),{replace:true})}catch{setError(true)}}
  const roles=[{role:"Patient" as const,label:"Continue as a patient",icon:User},{role:"Doctor" as const,label:"Continue as a doctor",icon:Stethoscope},...(flags.operator_console?[{role:"Operator" as const,label:"Continue as an operator",icon:Headphones},{role:"Admin" as const,label:"Continue as an administrator",icon:ShieldCheck}]:[])]
  const panel=<FeatureCard title={authConfigured?"Your care, together.":"Try CareBridge."} line={authConfigured?"Sign in securely to keep track of your care.":"Choose a role to explore the app with demo data."}><div className="flex flex-col gap-4"><Logo size="lg"/>{denied&&<Feedback>This account cannot open that workspace. Choose the appropriate demo role or sign in with another account.</Feedback>}{error&&<Feedback error>Could not open sign-in. Please try again.</Feedback>}{isLoading?<ContentSkeleton rows={1}/>:authConfigured?<Button full size="lg" icon={LogIn} loading={busy} onClick={async()=>{setBusy(true);setError(false);try{await signIn(returnTo??"/app")}catch{setBusy(false);setError(true)}}}>Sign in or create account</Button>:roles.map((item,i)=><Button key={item.role} full icon={item.icon} variant={i===0?"primary":"secondary"} onClick={()=>demo(item.role)}>{item.label}</Button>)}<ButtonLink to="/app/facilities" icon={ArrowRight} variant="ghost">Explore without an account</ButtonLink><p className="text-label-m text-ink-600">Advisory, not a diagnosis. For urgent help, call 15.</p></div></FeatureCard>
  return <PublicHero eyebrow="Health within reach" title={"Welcome\nback."} lede="Care for you and your household." body={<ul className="flex flex-col gap-5">{[{icon:WifiOff,title:"Keep care within reach",text:"Find saved facilities and check danger signs even offline."},{icon:Users,title:"Bring your household",text:"Ask for someone who does not have their own phone."},{icon:Smartphone,title:"Pay with Mobile Money",text:"Consultation payments are handled through Fapshi."}].map(r=><li key={r.title} className="flex items-start gap-4"><span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-white text-brand-700"><r.icon className="size-5" aria-hidden/></span><div><p className="text-title-l">{r.title}</p><p className="mt-1 text-body-m text-ink-600">{r.text}</p></div></li>)}</ul>} card={panel}/>
}

