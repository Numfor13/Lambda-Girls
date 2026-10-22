import { Link } from "react-router-dom"
import { MapPin, MessagesSquare, Stethoscope, WifiOff } from "lucide-react"
import { useOnline } from "@/lib/hooks"

const OFFLINE_PAGES = [
  { to: "/app/facilities", label: "Facilities", icon: MapPin },
  { to: "/app/triage", label: "Symptom check", icon: Stethoscope },
  { to: "/app/consults", label: "My consultations", icon: MessagesSquare },
]

export default function NotFound() {
  const online = useOnline()
  return (
    <div className="container-page flex flex-col items-center py-20 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-mint">
        <WifiOff className="size-8 text-brand-700" strokeWidth={1.5} aria-hidden />
      </span>
      <h1 className="mt-6 text-headline-l lg:text-display-m">
        {online ? "We couldn't find that page" : "This page needs a connection"}
      </h1>
      <p className="mt-2 max-w-md text-body-l text-ink-600">
        These pages work any time, even without a network:
      </p>
      <ul className="mt-8 grid w-full max-w-md gap-3">
        {OFFLINE_PAGES.map((p) => (
          <li key={p.to}>
            <Link
              to={p.to}
              className="flex h-14 items-center gap-3 rounded-md border border-line px-4 font-semibold hover:bg-cream"
            >
              <p.icon className="size-5 text-brand-700" aria-hidden />
              {p.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
