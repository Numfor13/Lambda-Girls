import { Link, useParams } from "react-router-dom"
import { Building2, ChevronLeft, Clock, CreditCard, Navigation, Phone, Wallet, Zap } from "lucide-react"
import { ButtonA } from "@/design/components/Button"
import { EmptyState, PageSpinner } from "@/design/components/primitives"
import { useFacility } from "@/offline/facilities"
import { useGeolocation, useOnline } from "@/lib/hooks"
import { formatDistance, haversineKm } from "@/lib/geo"
import { CAPABILITY_LABELS, formatPhone, formatXaf, telHref } from "@/lib/format"
import { cn } from "@/lib/utils"

function Fact({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Clock
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-[14px] border border-line bg-white p-4">
      <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-ink-600 uppercase">
        <Icon className="size-4 text-brand-700" aria-hidden />
        {label}
      </p>
      <div className="mt-2 text-[15px] font-medium text-ink-900">{children}</div>
    </div>
  )
}

function YesNo({ value }: { value: boolean }) {
  return (
    <span className={cn("font-semibold", value ? "text-urgent-green" : "text-ink-600")}>
      {value ? "Yes" : "No"}
    </span>
  )
}

export default function FacilityDetail() {
  const { id } = useParams()
  const facility = useFacility(id)
  const { coords } = useGeolocation()
  const online = useOnline()

  if (facility === undefined) return <PageSpinner />
  if (facility === null) {
    return (
      <EmptyState
        icon={Building2}
        title="We couldn't find this facility."
        action={
          <Link to="/app/facilities" className="font-semibold text-brand-700">
            Back to all facilities
          </Link>
        }
      />
    )
  }

  const distance = coords ? haversineKm(coords, facility) : null
  const directions = online
    ? `https://www.openstreetmap.org/directions?to=${facility.latitude},${facility.longitude}`
    : `geo:${facility.latitude},${facility.longitude}?q=${facility.latitude},${facility.longitude}(${encodeURIComponent(facility.name)})`
  const hours =
    typeof facility.opening_hours === "string"
      ? [["Hours", facility.opening_hours]]
      : Object.entries(facility.opening_hours).map(([k, v]) => [
          k.replace("mon_fri", "Mon–Fri").replace("_", " "),
          v,
        ])

  return (
    <div>
      <Link
        to="/app/facilities"
        className="mb-4 inline-flex h-11 items-center gap-1 text-[15px] font-semibold text-brand-700"
      >
        <ChevronLeft className="size-5" aria-hidden /> All facilities
      </Link>

      <div className="flex h-36 items-center justify-center rounded-[16px] bg-gradient-to-br from-brand-500 to-brand-900">
        <Building2 className="size-14 text-white/85" strokeWidth={1.25} aria-hidden />
      </div>

      <h1 className="mt-6 text-[28px] leading-tight font-extrabold">{facility.name}</h1>
      <p className="mt-1 text-[15px] text-ink-600">
        {facility.address}
        {distance !== null && (
          <span className="font-semibold text-brand-700"> · {formatDistance(distance)} away</span>
        )}
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <ButtonA href={telHref(facility.phone)} size="lg" full>
          <Phone className="size-5" aria-hidden />
          Call {formatPhone(facility.phone)}
        </ButtonA>
        <ButtonA
          href={directions}
          target={online ? "_blank" : undefined}
          rel="noreferrer"
          variant="secondary"
          size="lg"
          full
        >
          <Navigation className="size-5" aria-hidden />
          Directions
        </ButtonA>
      </div>

      <h2 className="mt-8 text-[18px] font-bold">What they offer</h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {facility.capabilities.map((c) => (
          <li
            key={c}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-semibold",
              c === "emergency" ? "bg-urgent-red-50 text-urgent-red" : "bg-mint text-brand-900",
            )}
          >
            {CAPABILITY_LABELS[c] ?? c}
          </li>
        ))}
      </ul>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Fact icon={Clock} label="Opening hours">
          <dl className="space-y-1">
            {hours.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt className="text-ink-600">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </Fact>
        <Fact icon={Wallet} label="Consultation fee (indicative)">
          {facility.consultation_fee_xaf > 0 ? formatXaf(facility.consultation_fee_xaf) : "Free"}
        </Fact>
        <Fact icon={Zap} label="Backup power">
          <YesNo value={facility.has_backup_power} />
        </Fact>
        <Fact icon={CreditCard} label="Accepts CSU card">
          <YesNo value={facility.accepts_csu_card} />
        </Fact>
      </div>

      <p className="mt-6 text-xs text-ink-600">
        Details are saved on your phone and work offline. Call ahead to confirm opening times.
      </p>
    </div>
  )
}
