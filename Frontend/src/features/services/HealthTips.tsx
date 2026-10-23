import { useState } from "react"
import { useInfiniteQuery } from "@tanstack/react-query"
import { motion } from "motion/react"
import { BookOpen, ExternalLink } from "lucide-react"
import { serviceApi } from "@/api/services"
import type { Locale } from "@/api/types"
import { env } from "@/config/env"
import { Button, ButtonA } from "@/design/components/Button"
import { Chip, Field, Select } from "@/design/components/Field"
import { Landscape } from "@/design/components/Landscape"
import { Feedback } from "@/design/components/Feedback"
import { ServiceError } from "@/design/components/ServicePage"
import { EmptyState, PageSpinner } from "@/design/components/primitives"
import { popIn, staggerOnMount } from "@/design/motion"
import { formatDate } from "@/lib/format"
import { useOnline } from "@/lib/hooks"

export default function HealthTips() {
  const online = useOnline()
  const [locale, setLocale] = useState<Locale>("en")
  const [tag, setTag] = useState("")
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
  const tags = [...new Set(tips.flatMap((t) => t.tags))]
  return (
    <>
      <section className="relative isolate overflow-hidden py-14">
        <Landscape className="-z-10" />
        <motion.div
          variants={staggerOnMount()}
          initial="hidden"
          animate="show"
          className="container-page"
        >
          <motion.div
            variants={popIn}
            className="max-w-2xl shape-bl p-6 glass-strong lg:p-10"
          >
            <p className="eyebrow">Care, every day</p>
            <h1 className="mt-3 text-display-m">Health tips</h1>
            <p className="mt-4 text-body-l">
              Read practical information with a named source. For urgent
              symptoms, check danger signs or call 15.
            </p>
          </motion.div>
        </motion.div>
      </section>
      <section className="container-page py-10">
        <div className="flex flex-col gap-5">
          {env.useMockApi && (
            <Feedback>
              Demo content for interface review. This feed is not live medical
              advice.
            </Feedback>
          )}
          <div className="max-w-sm">
            <Field label="Tip language">
              {(id) => (
                <Select
                  id={id}
                  value={locale}
                  onChange={(e) => {
                    setLocale(e.target.value as Locale)
                    setTag("")
                  }}
                >
                  <option value="en">English</option>
                  <option value="fr">Français</option>
                  <option value="pid">Pidgin</option>
                </Select>
              )}
            </Field>
          </div>
          <div
            className="flex flex-wrap gap-2"
            aria-label="Filter tips by topic"
          >
            <Chip selected={!tag} onClick={() => setTag("")}>
              All topics
            </Chip>
            {[...new Set([...(tag ? [tag] : []), ...tags])].map((t) => (
              <Chip key={t} selected={tag === t} onClick={() => setTag(t)}>
                {t}
              </Chip>
            ))}
          </div>
          {!online && (
            <Feedback>
              Offline · previously loaded tips may still be visible. Connect to
              load more.
            </Feedback>
          )}
          <ServiceError error={feed.error} />
          {feed.isPending ? (
            <PageSpinner />
          ) : !tips.length && !feed.isError ? (
            <EmptyState
              icon={BookOpen}
              title="No tips for this language or topic yet."
            />
          ) : (
            <motion.ul
              variants={staggerOnMount()}
              initial="hidden"
              animate="show"
              className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2"
            >
              {tips.map((t) => (
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
            </motion.ul>
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
        </div>
      </section>
      <section className="bg-ground py-10 text-white">
        <div className="container-page">
          <p className="eyebrow text-mint">Know when to get help</p>
          <p className="mt-4 max-w-2xl text-headline-l">
            Information supports care. A clinician makes the diagnosis.
          </p>
        </div>
      </section>
    </>
  )
}
