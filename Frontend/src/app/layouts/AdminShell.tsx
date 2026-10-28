import { BookOpen, Building2, CalendarDays } from "lucide-react"
import type { NavDest } from "@/design/components/AppChrome"
import { StaffShell } from "./StaffShell"
const dests: NavDest[] = [
  {
    to: "/admin",
    label: "Facilities",
    icon: Building2,
    match: (p) => p === "/admin" || p === "/admin/",
  },
  {
    to: "/admin/tips",
    label: "Tips",
    icon: BookOpen,
    match: (p) => p === "/admin/tips",
  },
  {
    to: "/admin/appointments",
    label: "Visits",
    icon: CalendarDays,
    match: (p) => p === "/admin/appointments",
  },
]
export function AdminShell() {
  return <StaffShell home="/admin" dests={dests} role="Administrator" />
}
