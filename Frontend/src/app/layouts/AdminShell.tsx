import {
  BookOpen,
  Building2,
  CalendarDays,
  ClipboardCheck,
  FlaskConical,
} from "lucide-react"
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
  {
    to: "/admin/payments",
    label: "Demo payments",
    icon: FlaskConical,
    match: (p) => p === "/admin/payments",
  },
  {
    to: "/admin/applications",
    label: "Applications",
    icon: ClipboardCheck,
    match: (p) => p === "/admin/applications",
  },
]
export function AdminShell() {
  return <StaffShell home="/admin" dests={dests} role="Administrator" />
}
