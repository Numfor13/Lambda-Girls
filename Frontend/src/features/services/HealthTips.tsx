import { useSearchParams } from "react-router-dom"
import { useInfiniteQuery } from "@tanstack/react-query"
import { motion } from "motion/react"
import { BookOpen, ExternalLink, ShieldCheck } from "lucide-react"
import { serviceApi } from "@/api/services"
import type { Locale } from "@/api/types"
import { env } from "@/config/env"
import { CardGrid, Panel } from "@/design/components/AppPage"
import { Button, ButtonA, ButtonLink } from "@/design/components/Button"
import { Chip, Field, Input, Select } from "@/design/components/Field"
import { ContentSkeleton } from "@/design/components/ContentSkeleton"
import { Feedback } from "@/design/components/Feedback"
import {
  PublicHero,
  FeatureCard,
  StatementBand,
} from "@/design/components/PublicHero"
import { ServiceError } from "@/design/components/ServicePage"
import { EmptyState } from "@/design/components/primitives"
import { popIn } from "@/design/motion"
import { formatDate } from "@/lib/format"
import { useOnline } from "@/lib/hooks"

export default function HealthTips() {
  const online = useOnline(),
    [params, setParams] = useSearchParams()
  const locale = (
    ["en", "fr", "pid"].includes(params.get("locale") ?? "")
      ? params.get("locale")
      : "en"
  ) as Locale
  const tag = params.get("tag") ?? "",
    search = params.get("q") ?? "",
    sort = params.get("sort") ?? "newest"
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const feed = useInfiniteQuery({
    queryKey: ["health-tips-feed", locale, tag],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      serviceApi.tips({
        locale,
        tag: tag || undefined,
        limit: "10",
        next_token: pageParam,
      }),
    getNextPageParam: (last) => last.next_token,
  })
  const tips = feed.data?.pages.flatMap((p) => p.tips) ?? []
  const rows = tips
    .filter((t) =>
      `${t.title} ${t.body} ${t.source_name}`
        .toLowerCase()
        .includes(search.toLowerCase())
    )
    .sort((a, b) =>
      sort === "oldest"
        ? a.published_date.localeCompare(b.published_date)
        : b.published_date.localeCompare(a.published_date)
    )
  const tags = [
    ...new Set([...(tag ? [tag] : []), ...tips.flatMap((t) => t.tags)]),
  ]
  const vignette = (
    <div className="rotate-3 shape-br border border-line bg-white p-5 shadow-[var(--shadow-elev-2)]">
      <div className="flex items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-md bg-mint text-brand-700">
          <BookOpen className="size-6" aria-hidden />
        </span>
        <div>
          <p className="eyebrow">Read with context</p>
          <p className="mt-1 text-title-l">A source for every tip</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-full bg-mint px-3 py-2 text-label-m">
          Named source
        </span>
        <span className="rounded-full bg-cream px-3 py-2 text-label-m">
          Publication date
        </span>
      </div>
    </div>
  )
  return (
    <>
      <PublicHero
        eyebrow="Care, every day"
        title={"Know more.\nCare better."}
        lede="Practical information, with the source in sight."
        body="Browse by topic or language, then read the source behind each tip."
        actions={
          <ButtonLink to="/app/triage" variant="primary">
            Check danger signs
          </ButtonLink>
        }
        card={
          <FeatureCard
            chips={["Read", "Source", "Ask"]}
            title="A little knowledge for everyday care."
            line="Tips support care. A clinician makes the diagnosis."
          >
            <Button
              variant="tonal"
              onClick={() =>
                document
                  .getElementById("tip-filters")
                  ?.scrollIntoView({ behavior: "instant", block: "start" })
              }
            >
              Explore health tips
            </Button>
          </FeatureCard>
        }
        breakout={vignette}
      >
        <StatementBand
          panel={{
            icon: ShieldCheck,
            title: "Check the source.",
            body: "Every tip includes its source and publication date. Open the original source when a link is available.",
          }}
          stat={{
            value: String(tips.length),
            label: "tips loaded in this view",
          }}
          statement="Information supports care."
          link={{ to: "/how-it-works#help", label: "Know when to get help" }}
        />
      </PublicHero>
      <section className="container-page flex flex-col gap-5 py-10">
        {env.useMockApi && (
          <Feedback>
            Demo content for interface review. This feed is not live medical
            advice.
          </Feedback>
        )}
        <div
          id="tip-filters"
          className="sticky top-24 z-20 scroll-mt-24 rounded-xl border border-line bg-white p-5 shadow-[var(--shadow-elev-1)]"
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Search tips">
              {(id) => (
                <Input
                  id={id}
                  type="search"
                  maxLength={100}
                  placeholder="Topic, title or source"
                  value={search}
                  onChange={(e) => update("q", e.target.value)}
                />
              )}
            </Field>
            <Field label="Tip language">
              {(id) => (
                <Select
                  id={id}
                  value={locale}
                  onChange={(e) => {
                    const next = new URLSearchParams(params)
                    next.set("locale", e.target.value)
                    next.delete("tag")
                    setParams(next, { replace: true })
                  }}
                >
                  <option value="en">English</option>
                  <option value="fr">Français</option>
                  <option value="pid">Pidgin</option>
                </Select>
              )}
            </Field>
            <Field label="Sort tips">
              {(id) => (
                <Select
                  id={id}
                  value={sort}
                  onChange={(e) => update("sort", e.target.value)}
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </Select>
              )}
            </Field>
          </div>
          <div
            className="mt-4 flex flex-wrap gap-2"
            aria-label="Filter tips by topic"
          >
            <Chip selected={!tag} onClick={() => update("tag", "")}>
              All topics · {tips.length}
            </Chip>
            {tags.map((t) => (
              <Chip
                key={t}
                selected={tag === t}
                onClick={() => update("tag", t)}
              >
                {t} · {tips.filter((tip) => tip.tags.includes(t)).length}
              </Chip>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-label-m text-ink-600" role="status">
              {rows.length} of {tips.length} loaded tips shown
            </p>
            {(search || tag || locale !== "en" || sort !== "newest") && (
              <Button variant="ghost" size="sm" onClick={() => setParams({})}>
                Clear filters
              </Button>
            )}
          </div>
        </div>
        {!online && (
          <Feedback>
            Offline · previously loaded tips may still be visible. Connect to
            load more.
          </Feedback>
        )}
        <ServiceError error={feed.error} />
        {feed.isPending ? (
          <ContentSkeleton />
        ) : !rows.length ? (
          <EmptyState
            icon={BookOpen}
            title="No tips match this view."
            action={
              <Button variant="tonal" onClick={() => setParams({})}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <CardGrid min={300}>
            {rows.map((t) => (
              <motion.li
                key={t.tip_id}
                variants={popIn}
                layout
                className="flex min-w-0 flex-col items-start gap-4 rounded-xl bg-white p-6 shadow-[var(--shadow-elev-1)]"
              >
                <p className="eyebrow">
                  {t.tags.join(" · ") || "Health information"}
                </p>
                <h2 className="text-headline-s">{t.title}</h2>
                <p className="text-body-l whitespace-pre-wrap">{t.body}</p>
                <p className="mt-auto text-body-m text-ink-600">
                  Source: {t.source_name} · {formatDate(t.published_date)}
                </p>
                {t.source_url && /^https?:\/\//i.test(t.source_url) && (
                  <ButtonA
                    href={t.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="tonal"
                    icon={ExternalLink}
                  >
                    Read source
                  </ButtonA>
                )}
              </motion.li>
            ))}
          </CardGrid>
        )}
        {feed.hasNextPage && (
          <Button
            variant="tonal"
            className="self-start"
            disabled={!online}
            loading={feed.isFetchingNextPage}
            onClick={() => void feed.fetchNextPage()}
          >
            Load more
          </Button>
        )}
        {feed.isError && (
          <Button
            variant="tonal"
            className="self-start"
            disabled={!online}
            onClick={() => void feed.refetch()}
          >
            Try again
          </Button>
        )}
        <Panel title="Need help with symptoms?">
          <p className="mb-4 text-body-l">
            Use the danger-sign check to decide your next step. In an emergency,
            call 15.
          </p>
          <ButtonLink to="/app/triage" variant="tonal">
            Check symptoms
          </ButtonLink>
        </Panel>
      </section>
    </>
  )
}
