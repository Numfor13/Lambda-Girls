import { ClipboardList } from "lucide-react"
import type { NavDest } from "@/design/components/AppChrome"
import { StaffShell } from "./StaffShell"

const dests: NavDest[] = [{ to: "/doctor", label: "Queue", icon: ClipboardList, match: (p) => p.startsWith("/doctor") }]

export function DoctorShell() {
  return <StaffShell home="/doctor" dests={dests} role="Doctor" />
}
