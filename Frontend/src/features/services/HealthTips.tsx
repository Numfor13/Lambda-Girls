import { useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useInfiniteQuery } from "@tanstack/react-query"
import { AnimatePresence, motion } from "motion/react"
import { Activity, BookOpen, ExternalLink, Phone, Search, ShieldCheck } from "lucide-react"
import { serviceApi } from "@/api/services"
import type { HealthTip, Locale } from "@/api/types"
import { env } from "@/config/env"
import { Button, ButtonLink } from "@/design/components/Button"
import { Chip } from "@/design/components/Field"
import { Feedback } from "@/design/components/Feedback"
import { Skeleton } from "@/design/components/Lively"
import { ServiceError } from "@/design/components/ServicePage"
import { EmptyState } from "@/design/components/primitives"
import { SPRING, popIn, staggerOnMount } from "@/design/motion"
import { formatDate } from "@/lib/format"
import { useOnline } from "@/lib/hooks"
import { humanize } from "@/lib/labels"
import { cn } from "@/lib/utils"

/*
 * Health tips, from the "health tips app" study (Headspace, Flo, NHS Health A–Z and ~10
 * Dribbble feeds): the tips are the page (QA P2). Language as a segmented control, topics as
 * real filter chips, the newest tip featured, each card with its source and reading time.
 */

const LOCALES: { code: Locale; label: string }[] = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "pid", label: "Pidgin" },
]

const readMinutes = (t: HealthTip) => Math.max(1, Math.round(t.body.split(/\s+/).length / 200))
const safeUrl = (u: string | null) => (u && /^https?:\/\//i.test(u) ? u : null)

function TipCard({ tip, featured = false }: { tip: HealthTip; featured?: boolean }) {
  const [open, setOpen] = useState(featured)
  const long = tip.body.length > 220
  const url = safeUrl(tip.source_url)
  return (
    <motion.li
      variants={popIn}
      layout
      className={cn(
        "flex min-w-0 flex-col gap-4 rounded-2xl p-6",
        featured ? "bg-brand-900 text-white md:col-span-2 lg:p-8" : "bg-white shadow-[var(--shadow-elev-1)]",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {featured && <span className="eyebrow text-mint-200">Newest</span>}
        {tip.tags.map((t) => (
          <span
            key={t}
            className={cn(
              "inline-flex h-7 items-center rounded-full px-2.5 text-label-m",
              featured ? "bg-white/12 text-white" : "bg-mint text-brand-900",
            )}
          >
            {humanize(t)}
          </span>
        ))}
        <span className={cn("ml-auto text-label-m", featured ? "text-white/70" : "text-ink-600")}>{readMinutes(tip)} min read</span>
      </div>
      <h2 className={cn("font-display font-[460] tracking-[-0.012em]", featured ? "text-[28px] leading-[1.15] text-white lg:text-[34px]" : "text-[22px] leading-[1.2]")}>
        {tip.title}
      </h2>
      <div className="relative">
        <p
          id={`tip-${tip.tip_id}`}
          className={cn(
            "text-body-l whitespace-pre-wrap",
            featured ? "text-white/85" : "text-ink-900",
            !open && long && "line-clamp-4",
          )}
        >
          {tip.body}
        </p>
      </div>
      {long && !featured && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`tip-${tip.tip_id}`}
          onClick={() => setOpen((o) => !o)}
          className="-mt-1 inline-flex h-10 items-center self-start rounded-full px-1 text-label-l text-brand-700 hover:underline"
        >
          {open ? "Show less" : "Read all"}
        </button>
      )}
      <div
        className={cn(
          "mt-auto flex flex-wrap items-center justify-between gap-3 border-t pt-4",
          featured ? "border-white/15" : "border-line",
        )}
      >
        <p className={cn("flex items-center gap-2 text-body-m", featured ? "text-white/75" : "text-ink-600")}>
          <ShieldCheck className={cn("size-4 shrink-0", featured ? "text-mint-200" : "text-brand-600")} aria-hidden />
          {tip.source_name} · {formatDate(tip.published_date)}
        </p>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-label-l",
              featured ? "bg-white/10 text-white hover:bg-white/20" : "text-brand-700 hover:bg-mint",
            )}
          >
            Source <ExternalLink className="size-4" aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
      </div>
    </motion.li>
  )
}

export default function HealthTips() {
  const online = useOnline()
  const [params, setParams] = useSearchParams()
  const locale = (LOCALES.some((l) => l.code === params.get("locale")) ? params.get("locale") : "en") as Locale
  const tag = params.get("tag") ?? ""
  const search = params.get("q") ?? ""
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key === "locale") next.delete("tag")
    setParams(next, { replace: true })
  }

  const feed = useInfiniteQuery({
    queryKey: ["health-tips-feed", locale, tag],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => serviceApi.tips({ locale, tag: tag || undefined, limit: "10", next_token: pageParam }),
    getNextPageParam: (last) => last.next_token,
  })
  const tips = (feed.data?.pages.flatMap((p) => p.tips) ?? []).sort((a, b) => b.published_date.localeCompare(a.published_date))
  const needle = search.trim().toLowerCase()
  const rows = needle ? tips.filter((t) => `${t.title} ${t.body} ${t.source_name} ${t.tags.join(" ")}`.toLowerCase().includes(needle)) : tips
  const tags = [...new Set([...(tag ? [tag] : []), ...tips.flatMap((t) => t.tags)])]
  const filtered = Boolean(tag || needle)

  return (
    <div className="container-page flex flex-col gap-6 pt-4 pb-14 lg:gap-8 lg:pt-8 lg:pb-20 short:gap-5 short:pt-4">
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING.default}
        className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"
      >
        <div className="max-w-[640px]">
          <p className="eyebrow">Health tips</p>
          <h1 className="mt-3 text-headline-l lg:text-display-m">
            Everyday health, <em className="accent">in plain words.</em>
          </h1>
          <p className="mt-2 text-body-l text-ink-600">Short advice, each with the health source it comes from. Tips help; they don&apos;t diagnose.</p>
        </div>
        <div role="radiogroup" aria-label="Language of the tips" className="inline-flex self-start rounded-full bg-white p-1 shadow-[var(--shadow-elev-1)] lg:self-auto">
          {LOCALES.map((l) => {
            const on = l.code === locale
            return (
              <button
                key={l.code}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => update("locale", l.code === "en" ? "" : l.code)}
                className={cn("relative h-10 rounded-full px-4 text-label-l transition-colors", on ? "text-white" : "text-ink-600 hover:text-ink-900")}
              >
                {on && <motion.span layoutId="tips-locale" className="absolute inset-0 rounded-full bg-brand-900" transition={SPRING.default} />}
                <span className="relative">{l.label}</span>
              </button>
            )
          })}
        </div>
      </motion.header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {tags.length > 0 && (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0" aria-label="Filter by topic">
            <Chip selected={!tag} onClick={() => update("tag", "")}>
              All topics
            </Chip>
            {tags.map((t) => (
              <Chip key={t} selected={tag === t} onClick={() => update("tag", tag === t ? "" : t)}>
                {humanize(t)}
              </Chip>
            ))}
          </div>
        )}
        {(tips.length > 6 || needle) && (
          <label className="relative sm:ml-auto sm:w-72">
            <span className="sr-only">Search tips</span>
            <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-400" aria-hidden />
            <input
              type="search"
              value={search}
              maxLength={100}
              onChange={(e) => update("q", e.target.value)}
              placeholder="Search tips"
              className="h-11 w-full rounded-full border border-ink-900/15 bg-white pr-4 pl-12 text-body-l focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 focus:outline-none"
            />
          </label>
        )}
      </div>

      {env.useMockApi && <Feedback>Sample tips for the demo. They are not live medical advice.</Feedback>}
      {!online && <Feedback>You&apos;re offline. Tips you&apos;ve already opened still show; connect to load more.</Feedback>}
      <ServiceError error={feed.error} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-5">
          {feed.isPending ? (
            <div className="grid gap-4 md:grid-cols-2" role="status" aria-label="Loading tips">
              <Skeleton className="h-64 rounded-2xl md:col-span-2" />
              <Skeleton className="h-56 rounded-2xl" />
              <Skeleton className="h-56 rounded-2xl" />
            </div>
          ) : !rows.length ? (
            <EmptyState
              icon={BookOpen}
              title={filtered ? "No tips match." : "No tips in this language yet."}
              action={
                filtered ? (
                  <Button variant="tonal" onClick={() => setParams(locale === "en" ? {} : { locale })}>
                    Show all topics
                  </Button>
                ) : locale !== "en" ? (
                  <Button variant="tonal" onClick={() => update("locale", "")}>
                    Read in English
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              <motion.ul
                key={`${locale}:${tag}:${needle}`}
                variants={staggerOnMount(0.05)}
                initial="hidden"
                animate="show"
                className="grid gap-4 md:grid-cols-2"
              >
                {rows.map((t, i) => (
                  <TipCard key={t.tip_id} tip={t} featured={i === 0 && !filtered} />
                ))}
              </motion.ul>
            </AnimatePresence>
          )}
          {feed.hasNextPage && (
            <Button variant="tonal" className="self-center" disabled={!online} loading={feed.isFetchingNextPage} onClick={() => void feed.fetchNextPage()}>
              Load more tips
            </Button>
          )}
          {feed.isError && (
            <Button variant="tonal" className="self-start" disabled={!online} onClick={() => void feed.refetch()}>
              Try again
            </Button>
          )}
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-28">
          <div className="rounded-2xl bg-white p-6 shadow-[var(--shadow-elev-1)]">
            <span className="flex size-11 items-center justify-center rounded-md bg-mint text-brand-700">
              <Activity className="size-5" aria-hidden />
            </span>
            <p className="mt-4 text-title-l">Worried about symptoms?</p>
            <p className="mt-1 text-body-m text-ink-600">A one-minute check of the danger signs tells you what to do next.</p>
            <ButtonLink className="mt-4" to="/app/triage" icon={Activity} full>
              Check symptoms
            </ButtonLink>
          </div>
          <div className="rounded-2xl bg-urgent-red-50 p-5">
            <p className="text-body-m text-ink-900">
              <span className="font-semibold text-urgent-red">Emergency?</span> Don&apos;t read on. Call now.
            </p>
            <a
              href="tel:15"
              className="mt-3 inline-flex h-10 items-center gap-2 rounded-full bg-urgent-red px-4 text-label-l text-white hover:brightness-110"
            >
              <Phone className="size-4" aria-hidden /> Call 15
            </a>
          </div>
        </aside>
      </div>
    </div>
  )
}
