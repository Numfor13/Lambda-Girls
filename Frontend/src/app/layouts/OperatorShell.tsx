import {
  ClipboardList,
  Droplet,
  FlaskConical,
  MapPin,
  Send,
} from "lucide-react"
import type { NavDest } from "@/design/components/AppChrome"
import { StaffShell } from "./StaffShell"
const dests: NavDest[] = [
  {
    to: "/operator",
    label: "Callbacks",
    icon: ClipboardList,
    match: (p) => p === "/operator" || p === "/operator/",
  },
  {
    to: "/operator/dispatch",
    label: "Dispatch",
    icon: Send,
    match: (p) => p === "/operator/dispatch",
  },
  {
    to: "/operator/emergencies",
    label: "Locations",
    icon: MapPin,
    match: (p) => p === "/operator/emergencies",
  },
  {
    to: "/operator/blood",
    label: "Blood",
    icon: Droplet,
    match: (p) => p === "/operator/blood",
  },
  {
    to: "/operator/labs",
    label: "Labs",
    icon: FlaskConical,
    match: (p) => p === "/operator/labs",
  },
]
export function OperatorShell() {
  return <StaffShell home="/operator" dests={dests} role="Operator" />
}
