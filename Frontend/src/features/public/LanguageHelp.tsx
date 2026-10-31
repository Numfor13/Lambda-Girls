import { useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { BookOpen, Languages } from "lucide-react"
import { request } from "@/api/client"
import type { Locale } from "@/api/types"
import { AppPage, Panel } from "@/design/components/AppPage"
import { Button, ButtonLink } from "@/design/components/Button"
import { Field, Input, Chip } from "@/design/components/Field"
import { Feedback } from "@/design/components/Feedback"
import { Skeleton } from "@/design/components/Lively"
import { EmptyState } from "@/design/components/primitives"
import { ServiceError } from "@/design/components/ServicePage"

export interface LanguageBundle {
  triage: {
    title: string
    disclaimer: string
    symptoms: Record<string, string>
    questions: Record<string, string>
  }
  consultation: {
    new: string
    complaint_label: string
    anonymous_notice: string
  }
  common: { language: Record<Locale, string> }
}
const LOCALES: { value: Locale; label: string }[] = [
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
  { value: "pid", label: "Pidgin" },
]
const bundle = (locale: Locale) =>
  request<LanguageBundle>("i18n", "/i18n/" + locale, { auth: false })
export default function LanguageHelp() {
  const [params, setParams] = useSearchParams()
  const locale = LOCALES.some((l) => l.value === params.get("locale"))
    ? (params.get("locale") as Locale)
    : "en"
  const search = params.get("q") ?? ""
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const english = useQuery({
    queryKey: ["language-bundle", "en"],
    queryFn: () => bundle("en"),
    staleTime: 7 * 86400_000,
  })
  const translated = useQuery({
    queryKey: ["language-bundle", locale],
    queryFn: () => bundle(locale),
    staleTime: 7 * 86400_000,
  })
  const rows = Object.entries(english.data?.triage.symptoms ?? {}).filter(
    ([key, label]) =>
      (label + " " + (translated.data?.triage.symptoms[key] ?? ""))
        .toLowerCase()
        .includes(search.toLowerCase())
  )
  const error = english.error || translated.error
  return (
    <section className="container-page py-6 lg:py-10 short:py-5">
      <AppPage
        eyebrow="English · Français · Pidgin"
        title="Language help"
        subtitle="Compare the symptom wording used by CareBridge in your language."
        aside={
          <>
            <Panel tone="mint" title="Finding the words">
              <Languages className="mb-4 size-8 text-brand-700" aria-hidden />
              <p className="text-body-m text-brand-900">
                Use this guide when describing symptoms to a doctor. It does not
                run a symptom check or give a diagnosis.
              </p>
              <p className="mt-3 text-body-m text-brand-900">
                The wording on this page changes language. Other app screens
                currently remain in English.
              </p>
            </Panel>
            <Panel title="Ready for the next step?">
              <div className="flex flex-col items-start gap-3">
                <ButtonLink to="/app/triage">Check symptoms</ButtonLink>
                <ButtonLink to="/tips" variant="secondary">
                  Health tips by language
                </ButtonLink>
              </div>
            </Panel>
          </>
        }
      >
        <Panel>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Guide language"
          >
            {LOCALES.map((l) => (
              <Chip
                key={l.value}
                selected={locale === l.value}
                onClick={() => set("locale", l.value)}
              >
                {l.label}
              </Chip>
            ))}
          </div>
          <div className="mt-5">
            <Field label="Find a symptom">
              {(id) => (
                <Input
                  id={id}
                  type="search"
                  value={search}
                  maxLength={100}
                  onChange={(e) => set("q", e.target.value)}
                  placeholder="Search either language"
                />
              )}
            </Field>
          </div>
        </Panel>
        {error && (
          <>
            <ServiceError error={error} />
            <Button
              variant="secondary"
              onClick={() => {
                void english.refetch()
                void translated.refetch()
              }}
            >
              Try again
            </Button>
          </>
        )}
        {(english.isLoading || translated.isLoading) && (
          <Skeleton className="h-64 rounded-xl" />
        )}
        {english.data && translated.data && (
          <>
            <Panel title={translated.data.triage.title}>
              <p
                lang={locale === "pid" ? "wes" : locale}
                className="text-body-l text-ink-600"
              >
                {translated.data.triage.disclaimer}
              </p>
            </Panel>
            <Panel title="Symptom wording">
              <p className="mb-4 text-body-m text-ink-600">
                {rows.length} terms
                {search && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => set("q", "")}
                  >
                    Clear search
                  </Button>
                )}
              </p>
              <dl className="divide-y divide-line">
                {rows.map(([key, label]) => (
                  <div
                    key={key}
                    className="grid gap-1 py-4 sm:grid-cols-2 sm:gap-5"
                  >
                    <dt className="text-body-l text-ink-900">{label}</dt>
                    <dd
                      lang={locale === "pid" ? "wes" : locale}
                      className="text-body-l text-brand-900"
                    >
                      {translated.data?.triage.symptoms[key] ?? label}
                    </dd>
                  </div>
                ))}
              </dl>
              {!rows.length && (
                <EmptyState
                  icon={BookOpen}
                  title="No matching terms"
                  body="Try a shorter word or clear the search."
                />
              )}
            </Panel>
            <Panel title={translated.data.consultation.new}>
              <p
                lang={locale === "pid" ? "wes" : locale}
                className="text-body-l"
              >
                {translated.data.consultation.complaint_label}
              </p>
              <p
                lang={locale === "pid" ? "wes" : locale}
                className="mt-3 text-body-m text-ink-600"
              >
                {translated.data.consultation.anonymous_notice}
              </p>
            </Panel>
          </>
        )}
        {translated.isRefetchError && translated.data && (
          <Feedback>
            Showing the saved wording. Reconnect to check for updates.
          </Feedback>
        )}
      </AppPage>
    </section>
  )
}
