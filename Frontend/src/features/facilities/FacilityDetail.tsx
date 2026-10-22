import { Link, useNavigate, useParams } from "react-router-dom"
import { motion } from "motion/react"
import { ArrowLeft, Building2, Clock, CreditCard, Navigation, Phone, Wallet, Zap } from "lucide-react"
import { ButtonA, IconButton } from "@/design/components/Button"
import { CAPABILITY_ICON, primaryCapability } from "@/design/components/FacilityRow"
import { Landscape } from "@/design/components/Landscape"
import { EmptyState, PageSpinner } from "@/design/components/primitives"
import { SPRING, popIn, staggerOnMount } from "@/design/motion"
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
    <motion.div variants={popIn} className="rounded-xl bg-white p-5 shadow-[var(--shadow-elev-1)]">
      <p className="flex items-center gap-2 text-label-m tracking-[0.1em] text-ink-600 uppercase">
        <span className="flex size-8 items-center justify-center rounded-full bg-mint">
          <Icon className="size-4 text-brand-700" aria-hidden />
        </span>
        {label}
      </p>
      <div className="mt-3 text-title-m text-ink-900">{children}</div>
    </motion.div>
  )
}

function YesNo({ value }: { value: boolean }) {
  return <span className={cn(value ? "text-urgent-green" : "text-ink-600")}>{value ? "Yes" : "No"}</span>
}

export default function FacilityDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
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
          <Link to="/app/facilities" className="text-label-l text-brand-700">
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
  const CapIcon = CAPABILITY_ICON[primaryCapability(facility.capabilities)]

  return (
    <motion.div variants={staggerOnMount(0.06)} initial="hidden" animate="show" className="flex flex-col gap-5">
      <motion.section variants={popIn} className="relative isolate overflow-hidden rounded-xl lg:rounded-2xl">
        <Landscape className="-z-10" preserve="xMidYMid slice" />
        <div className="flex min-h-[300px] flex-col justify-between gap-6 p-4 sm:p-6">
          <IconButton icon={ArrowLeft} label="All facilities" variant="glass" onClick={() => navigate("/app/facilities")} />
          <motion.div
            className="glass-strong flex items-start gap-4 p-5 shape-bl"
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ ...SPRING.bouncy, delay: 0.1 }}
          >
            <span className="flex size-14 shrink-0 items-center justify-center rounded-md bg-mint">
              <CapIcon className="size-7 text-brand-700" aria-hidden />
            </span>
            <div className="min-w-0">
              <h1 className="text-headline-m lg:text-headline-l">{facility.name}</h1>
              <p className="mt-1 text-body-l text-ink-900">
                {facility.address}
                {distance !== null && <span className="text-label-l text-brand-700"> · {formatDistance(distance)} away</span>}
              </p>
            </div>
          </motion.div>
        </div>
      </motion.section>

      <motion.div variants={popIn} className="grid gap-3 sm:grid-cols-2">
        <ButtonA href={telHref(facility.phone)} icon={Phone} size="lg" full>
          Call {formatPhone(facility.phone)}
        </ButtonA>
        <ButtonA href={directions} target={online ? "_blank" : undefined} rel="noreferrer" icon={Navigation} variant="glass" size="lg" full>
          Directions
        </ButtonA>
      </motion.div>

      <motion.section variants={popIn}>
        <h2 className="text-headline-s">What they offer</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {facility.capabilities.map((c, i) => {
            const Icon = CAPABILITY_ICON[c]
            return (
              <motion.li
                key={c}
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ ...SPRING.bouncy, delay: 0.15 + i * 0.04 }}
                className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-full px-4 text-label-l",
                  c === "emergency" ? "bg-urgent-red-50 text-urgent-red" : "bg-mint text-brand-900",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {CAPABILITY_LABELS[c] ?? c}
              </motion.li>
            )
          })}
        </ul>
      </motion.section>

      <motion.div variants={staggerOnMount(0.05)} className="grid gap-3 sm:grid-cols-2">
        <Fact icon={Clock} label="Opening hours">
          <dl className="space-y-1">
            {hours.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 text-body-l">
                <dt className="text-ink-600">{k}</dt>
                <dd className="font-semibold">{v}</dd>
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
      </motion.div>

      <motion.p variants={popIn} className="text-body-m text-ink-600">
        Details are saved on your phone and work offline. Call ahead to confirm opening times.
      </motion.p>
    </motion.div>
  )
}
