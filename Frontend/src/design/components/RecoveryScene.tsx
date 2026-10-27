import { Link, useNavigate } from "react-router-dom"
import { motion, useReducedMotion } from "motion/react"
import { Activity, ArrowLeft, ChevronRight, HelpCircle, House, MapPin, RefreshCw, type LucideIcon } from "lucide-react"
import { Button, ButtonLink } from "@/design/components/Button"
import { SPRING } from "@/design/motion"

/*
 * Not found / something went wrong, from the "404 page" study (Linear, Vercel, Notion and ~10
 * Dribbble pages): one friendly picture, one sentence of what happened, one obvious way back,
 * then a few familiar places. Works inside any shell (it's a card, not a full-bleed hero).
 */

/** A path that wanders up to a signpost with two blank boards: "you took a wrong turn". */
function Signpost() {
  const reduce = useReducedMotion()
  const draw = reduce ? { pathLength: 1 } : { pathLength: [0, 1] }
  return (
    <svg viewBox="0 0 320 180" className="mx-auto block h-auto w-full max-w-[360px] [mask-image:linear-gradient(to_right,transparent,black_22%,black_78%,transparent)]" aria-hidden>
      <path d="M0 150 Q80 110 160 140 T320 128 V180 H0Z" className="fill-mint-200" />
      <path d="M0 165 Q110 140 200 160 T320 158 V180 H0Z" className="fill-brand-700/15" />
      <motion.path
        d="M18 168 C70 160 90 150 120 152 S170 156 196 150"
        fill="none"
        className="stroke-brand-600"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="2 9"
        initial={false}
        animate={draw}
        transition={{ duration: 1.4, ease: "easeOut" }}
      />
      <rect x="206" y="58" width="8" height="96" rx="3" className="fill-brand-800" />
      <motion.g
        initial={reduce ? false : { opacity: 0, x: -14 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ ...SPRING.default, delay: reduce ? 0 : 0.9 }}
      >
        <path d="M150 64 H246 L262 78 L246 92 H150Z" className="fill-white stroke-brand-700" strokeWidth="2" strokeLinejoin="round" />
        <rect x="164" y="74" width="52" height="5" rx="2.5" className="fill-brand-700/30" />
      </motion.g>
      <motion.g
        initial={reduce ? false : { opacity: 0, x: 14 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ ...SPRING.default, delay: reduce ? 0 : 1.05 }}
      >
        <path d="M274 100 H178 L162 114 L178 128 H274Z" className="fill-mint stroke-brand-700" strokeWidth="2" strokeLinejoin="round" />
        <rect x="196" y="110" width="44" height="5" rx="2.5" className="fill-brand-700/30" />
      </motion.g>
      <motion.circle
        cx="196"
        cy="150"
        r="6"
        className="fill-brand-700"
        initial={reduce ? false : { scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ ...SPRING.default, delay: reduce ? 0 : 1.3 }}
      />
    </svg>
  )
}

const PLACES: { to: string; icon: LucideIcon; title: string; text: string }[] = [
  { to: "/app/triage", icon: Activity, title: "Check symptoms", text: "Works offline" },
  { to: "/app/facilities", icon: MapPin, title: "Find a facility", text: "Saved on this phone" },
  { to: "/how-it-works#help", icon: HelpCircle, title: "Get help", text: "Short answers" },
]

export function RecoveryScene({
  eyebrow,
  title,
  children,
  home = "/",
  retry,
}: {
  eyebrow: string
  title: string
  children: React.ReactNode
  home?: string
  /** Show "Try again" as the main action (errors) instead of "Go home" (not found). */
  retry?: () => void
}) {
  const navigate = useNavigate()
  const back = () => (window.history.length > 1 ? navigate(-1) : navigate(home))
  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-mint to-cream px-5 py-10 text-center sm:px-10 lg:py-14 short:py-8">
      <Signpost />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SPRING.default, delay: 0.15 }}
        className="mx-auto mt-6 flex max-w-xl flex-col items-center gap-4"
      >
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="text-headline-l lg:text-display-m">{title}</h1>
        <p className="text-body-l text-ink-600">{children}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-3">
          {retry ? (
            <Button icon={RefreshCw} onClick={retry}>
              Try again
            </Button>
          ) : (
            <ButtonLink to={home} icon={House}>
              Go home
            </ButtonLink>
          )}
          <Button variant="secondary" icon={ArrowLeft} onClick={back}>
            Go back
          </Button>
        </div>
      </motion.div>
      <nav aria-label="Familiar places" className="mx-auto mt-10 grid max-w-3xl gap-2 text-left sm:grid-cols-3">
        {PLACES.map((p) => (
          <Link
            key={p.to}
            to={p.to}
            className="group flex items-center gap-3 rounded-xl bg-white p-3.5 shadow-[var(--shadow-elev-1)] transition-shadow hover:shadow-[var(--shadow-elev-2)]"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-mint text-brand-700">
              <p.icon className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-label-l text-ink-900">{p.title}</span>
              <span className="block text-label-m font-normal text-ink-600">{p.text}</span>
            </span>
            <ChevronRight className="size-4 text-ink-400 group-hover:text-brand-700" aria-hidden />
          </Link>
        ))}
      </nav>
    </section>
  )
}
