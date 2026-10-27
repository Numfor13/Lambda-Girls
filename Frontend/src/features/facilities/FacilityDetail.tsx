import { Link, useParams } from "react-router-dom"
import { motion } from "motion/react"
import { ArrowLeft, Building2, Clock, CreditCard, Navigation, Phone, Wallet, Zap } from "lucide-react"
import { ButtonA } from "@/design/components/Button"
import { CAPABILITY_ICON, hoursLabel, primaryCapability } from "@/design/components/FacilityRow"
import { EmptyState, PageSpinner } from "@/design/components/primitives"
import { popIn, staggerOnMount } from "@/design/motion"
import { useFacilities, useFacility } from "@/offline/facilities"
import { FacilityMap } from "@/design/components/FacilityMap"
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
      <p className="flex items-center gap-2 text-label-l text-ink-600">
        <span className="flex size-8 items-center justify-center rounded-full bg-mint">
          <Icon className="size-4 text-brand-700" aria-hidden />
        </span>
        {label}
      </p>
      <div className="mt-3 text-title-m text-ink-900">{children}</div>
    </motion.div>
  )
}

export default function FacilityDetail() {
  const { id } = useParams()
  const facility = useFacility(id)
  const all = useFacilities()
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

  const isAllDay = hoursLabel(facility.opening_hours) === "Open 24/7"

  return (
    <motion.div variants={staggerOnMount(0.06)} initial="hidden" animate="show" className="flex flex-col gap-6 lg:gap-8">
      {/* Editorial header: back, identity, status, actions (Airbnb/One Medical listing). */}
      <motion.header variants={popIn} className="flex flex-col gap-5">
        <Link
          to="/app/facilities"
          className="inline-flex h-10 w-fit items-center gap-1.5 rounded-full pr-3 pl-2 text-label-l text-ink-600 hover:bg-ink-900/5 hover:text-ink-900"
        >
          <ArrowLeft className="size-4" aria-hidden /> All facilities
        </Link>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span
              className={cn(
                "flex size-14 shrink-0 items-center justify-center rounded-lg lg:size-16",
                facility.capabilities.includes("emergency") ? "bg-brand-900 text-white" : "bg-mint text-brand-700",
              )}
            >
              <CapIcon className="size-7" strokeWidth={1.8} aria-hidden />
            </span>
            <div className="min-w-0">
              <h1 className="text-headline-l lg:text-display-m">{facility.name}</h1>
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-body-l text-ink-600">
                <span>{facility.address}</span>
                {distance !== null && (
                  <>
                    <span className="text-ink-400" aria-hidden>·</span>
                    <span className="font-semibold text-brand-700">{formatDistance(distance)} away</span>
                  </>
                )}
              </p>
              <p className="mt-3 flex flex-wrap gap-2">
                {isAllDay && (
                  <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-mint px-3 text-label-m text-brand-900">
                    <Clock className="size-3.5" aria-hidden /> Open 24/7
                  </span>
                )}
                {facility.has_backup_power && (
                  <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-white px-3 text-label-m text-ink-900 ring-1 ring-ink-900/10">
                    <Zap className="size-3.5 fill-current text-brand-600" aria-hidden /> Backup power
                  </span>
                )}
                {facility.accepts_csu_card && (
                  <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-white px-3 text-label-m text-ink-900 ring-1 ring-ink-900/10">
                    <CreditCard className="size-3.5 text-brand-600" aria-hidden /> CSU card
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:shrink-0">
            <ButtonA href={telHref(facility.phone)} icon={Phone} size="lg">
              Call {formatPhone(facility.phone)}
            </ButtonA>
            <ButtonA
              href={directions}
              target={online ? "_blank" : undefined}
              rel="noreferrer"
              icon={Navigation}
              variant="secondary"
              size="lg"
            >
              Directions
            </ButtonA>
          </div>
        </div>
      </motion.header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-7">
        <div className="flex min-w-0 flex-col gap-5">
          <motion.section variants={popIn} className="rounded-xl bg-white p-5 shadow-[var(--shadow-elev-1)] lg:p-6">
            <h2 className="text-headline-s">What they offer</h2>
            <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
              {facility.capabilities.map((c) => {
                const Icon = CAPABILITY_ICON[c]
                return (
                  <li key={c} className="flex items-center gap-3 rounded-lg bg-cream p-3">
                    <span
                      className={cn(
                        "flex size-9 items-center justify-center rounded-full",
                        c === "emergency" ? "bg-brand-900 text-white" : "bg-white text-brand-700",
                      )}
                    >
                      <Icon className="size-[18px]" aria-hidden />
                    </span>
                    <span className="text-label-l">{CAPABILITY_LABELS[c] ?? c}</span>
                  </li>
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
                    <dd className="font-semibold tabular">{v}</dd>
                  </div>
                ))}
              </dl>
            </Fact>
            <Fact icon={Wallet} label="Consultation fee">
              {facility.consultation_fee_xaf > 0 ? (
                <span className="tabular">{formatXaf(facility.consultation_fee_xaf)}</span>
              ) : (
                <span className="text-ink-600">Not listed. Ask when you call.</span>
              )}
            </Fact>
          </motion.div>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
          {all && facility && (
            <motion.div variants={popIn}>
              <FacilityMap
                all={all}
                shown={[facility]}
                highlight={facility.facility_id}
                origin={coords ?? null}
                className="shadow-[var(--shadow-elev-1)]"
              />
            </motion.div>
          )}
          <motion.section variants={popIn} className="rounded-xl bg-mint p-5 lg:p-6">
            <p className="eyebrow">Getting there</p>
            <p className="mt-2 text-title-l">{facility.quarter}</p>
            <p className="mt-1 text-body-m text-ink-600">{facility.address}</p>
            <p className="mt-3 text-code text-ink-600">
              {facility.latitude.toFixed(4)}, {facility.longitude.toFixed(4)}
            </p>
            <ButtonA
              href={directions}
              target={online ? "_blank" : undefined}
              rel="noreferrer"
              icon={Navigation}
              variant="light"
              full
              className="mt-4"
            >
              {online ? "Open directions" : "Open in maps app"}
            </ButtonA>
          </motion.section>
          <motion.section variants={popIn} className="rounded-xl bg-white p-5 shadow-[var(--shadow-elev-1)]">
            <p className="text-title-m">Not sure this is the right place?</p>
            <p className="mt-1 text-body-m text-ink-600">
              A 1-minute check tells you how urgent it is and which kind of care you need.
            </p>
            <Link to="/app/triage" className="mt-2 inline-flex min-h-10 items-center gap-1 text-label-l text-brand-700 hover:underline">
              Check symptoms first →
            </Link>
          </motion.section>
          <p className="px-1 text-body-m text-ink-600">
            Saved on your phone and available offline. Call ahead to confirm opening times.
          </p>
        </aside>
      </div>
    </motion.div>
  )
}
