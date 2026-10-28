import { Link } from "react-router-dom"
import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Droplet,
  FlaskConical,
  History,
  MessageCircle,
} from "lucide-react"
import { flags } from "@/config/flags"
import { ServiceCard } from "./ServicePage"

export function ServiceLinks() {
  const links = [
    {
      enabled: flags.appointments,
      to: "/app/appointments",
      title: "Appointments",
      description: "Request a visit and check its confirmation.",
      icon: CalendarDays,
    },
    {
      enabled: flags.lab_tests,
      to: "/app/labs",
      title: "Lab tests",
      description: "Request a test and follow each step.",
      icon: FlaskConical,
    },
    {
      enabled: flags.blood,
      to: "/app/blood",
      title: "Blood request",
      description: "Send a clinical request and find blood-bank contacts.",
      icon: Droplet,
    },
    {
      enabled: flags.consult_history || flags.receipts,
      to: "/app/history",
      title: "History & receipts",
      description: "Review symptom checks, consultations and payments.",
      icon: History,
    },
    {
      enabled: flags.health_tips,
      to: "/tips",
      title: "Health tips",
      description: "Read health information with named sources.",
      icon: BookOpen,
    },
    {
      enabled: flags.anonymous,
      to: "/ask",
      title: "Ask anonymously",
      description: "Text a doctor with a seven-day session on this phone.",
      icon: MessageCircle,
    },
  ].filter((l) => l.enabled)
  if (!links.length) return null
  return (
    <ServiceCard title="Services">
      <ul className="divide-y divide-line">
        {links.map((l) => (
          <li key={l.to}>
            <Link
              className="flex items-center gap-4 rounded-lg py-4 focus-visible:outline-brand-700"
              to={l.to}
            >
              <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-mint text-brand-700">
                <l.icon className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-title-m">{l.title}</h3>
                <p className="mt-1 text-body-m text-ink-600">{l.description}</p>
              </div>
              <ArrowUpRight
                className="size-5 shrink-0 text-brand-700"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ul>
    </ServiceCard>
  )
}
