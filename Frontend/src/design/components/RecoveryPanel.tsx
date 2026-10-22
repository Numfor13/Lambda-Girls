import { useNavigate } from "react-router-dom"
import { motion } from "motion/react"
import { ArrowLeft, House, RefreshCw, Search } from "lucide-react"
import { Button, ButtonLink } from "./Button"
import { StatusMark } from "./primitives"
import { popIn } from "@/design/motion"

export function RecoveryPanel({
  title,
  children,
  home = "/",
  retry,
}: {
  title: string
  children: React.ReactNode
  home?: string
  retry?: () => void
}) {
  const navigate = useNavigate()
  return (
    <motion.section
      variants={popIn}
      initial="hidden"
      animate="show"
      className="mx-auto flex w-full max-w-2xl flex-col items-center gap-5 rounded-xl bg-white p-6 text-center shadow-[var(--shadow-elev-1)] sm:p-10"
    >
      <StatusMark state="info" icon={Search} />
      <h1 className="text-headline-l lg:text-display-m">{title}</h1>
      <p className="max-w-md text-body-l text-ink-600">{children}</p>
      <div className="flex flex-wrap justify-center gap-3">
        {retry ? (
          <Button icon={RefreshCw} onClick={retry}>
            Try again
          </Button>
        ) : (
          <ButtonLink icon={House} to={home}>
            Go home
          </ButtonLink>
        )}
        <Button
          icon={ArrowLeft}
          variant="secondary"
          onClick={() => {
            if (window.history.length > 1) navigate(-1)
            else navigate(home)
          }}
        >
          Go back
        </Button>
        {retry && (
          <ButtonLink to={home} icon={House} variant="ghost">
            Go home
          </ButtonLink>
        )}
      </div>
    </motion.section>
  )
}
