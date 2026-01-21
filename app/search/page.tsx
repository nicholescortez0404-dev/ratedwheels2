export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

import { unstable_noStore as noStore } from 'next/cache'
import Link from 'next/link'
import SearchForm from './SearchForm'
import ReviewForm from './ReviewForm'
import CreateDriverForm from './CreateDriverForm'
import SortSelect from './SortSelect'
import { createSupabaseServerClient } from '@/lib/supabaseServer'

type DriverStat = {
  driver_id: string
  avg_stars: number | null
  review_count: number | null
}

type DriverRow = {
  id: string
  driver_handle: string
  display_name: string | null
  city: string | null
  state: string | null
  car_color: string | null
  car_make: string | null
  car_model: string | null
}

type TagRow = {
  id: string
  label: string
  category: string
  slug: string
}

type ReviewTagJoin = {
  tag: TagRow | null
}

type ReviewRow = {
  id: string
  driver_id: string
  reviewer_id: string | null
  stars: number
  comment: string | null
  created_at: string | null
  review_tags: ReviewTagJoin[] | null
}

function formatAvg(avg: number | null | undefined) {
  if (avg === null || avg === undefined || Number.isNaN(avg)) return '—'
  return Number(avg).toFixed(1)
}

function normalizeHandle(raw: string) {
  return raw.trim().toLowerCase().replace(/\s+/g, '-')
}

function isPlateLeadingQuery(q: string) {
  return /^\d{4}($|[-].*)/.test(q)
}

function escapeIlikeLiteral(s: string) {
  // Escape %, _, and \ for ilike patterns
  return s.replace(/[%_\\]/g, (m) => `\\${m}`)
}

function safeIlikePatternPrefix(q: string) {
  return `${escapeIlikeLiteral(q)}%`
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    sort?: string
    state?: string
    city?: string
    car_color?: string
    car_make?: string
    car_model?: string
  }>
}) {
  noStore()
  const supabase = createSupabaseServerClient()
  const sp = await searchParams

  const raw = (sp.q ?? '').trim()
  const q = normalizeHandle(raw)

  const initialState = String(sp.state ?? '').trim().toUpperCase()
  const initialCity = String(sp.city ?? '').trim()
  const initialCarColor = String(sp.car_color ?? '').trim()
  const initialCarMake = String(sp.car_make ?? '').trim()
  const initialCarModel = String(sp.car_model ?? '').trim()

  const hasDisambiguator =
    Boolean(initialState) ||
    Boolean(initialCity) ||
    Boolean(initialCarColor) ||
    Boolean(initialCarMake) ||
    Boolean(initialCarModel)

  const allowedSorts = new Set(['newest', 'oldest', 'highest', 'lowest'])
  const sortParam = String(sp.sort ?? 'newest').toLowerCase()
  const sortMode = allowedSorts.has(sortParam) ? sortParam : 'newest'

  let driver: DriverRow | null = null
  let reviews: ReviewRow[] = []
  let avgStars: number | null = null
  let reviewCount = 0

  const traitCounts: Record<'positive' | 'neutral' | 'negative', number> = {
    positive: 0,
    neutral: 0,
    negative: 0,
  }

  const tagFreq: Record<
    string,
    { id: string; label: string; category: string; slug: string; count: number }
  > = {}

  const tagsByCategory: Record<'positive' | 'neutral' | 'negative', { label: string; count: number }[]> = {
    positive: [],
    neutral: [],
    negative: [],
  }

  // Suggestions for plate-leading partial searches:
  // ONLY when exact not found AND disambiguator present
  let suggestions: DriverRow[] = []

  // This message is shown when user typed plate-leading but gave NO disambiguators
  // (and exact match failed)
  let shouldPromptForDisambiguator = false

  if (q) {
    // 1) Exact match first
    const { data: d } = await supabase
      .from('drivers')
      .select('*')
      .eq('driver_handle', q)
      .maybeSingle()

    driver = (d as DriverRow | null) ?? null

    // decide prompt AFTER we know exact didn't match
    shouldPromptForDisambiguator = Boolean(q) && !driver && isPlateLeadingQuery(q) && !hasDisambiguator

    // 2) Suggestions only if plate-leading AND has disambiguator
    if (!driver && isPlateLeadingQuery(q) && hasDisambiguator) {
      let sq = supabase
        .from('drivers')
        .select('id,driver_handle,display_name,city,state,car_color,car_make,car_model')
        .ilike('driver_handle', safeIlikePatternPrefix(q))
        .limit(25)

      if (initialState) sq = sq.eq('state', initialState)
      if (initialCity) sq = sq.ilike('city', `%${escapeIlikeLiteral(initialCity)}%`)
      if (initialCarColor) sq = sq.ilike('car_color', `%${escapeIlikeLiteral(initialCarColor)}%`)
      if (initialCarMake) sq = sq.ilike('car_make', `%${escapeIlikeLiteral(initialCarMake)}%`)
      if (initialCarModel) sq = sq.ilike('car_model', `%${escapeIlikeLiteral(initialCarModel)}%`)

      const { data: s } = await sq
      suggestions = (s as DriverRow[] | null) ?? []
    }

    // 3) If found driver -> stats + reviews + tags
    if (driver?.id) {
      const { data: statRow } = await supabase
        .from('driver_stats')
        .select('driver_id,avg_stars,review_count')
        .eq('driver_id', driver.id)
        .maybeSingle()

      avgStars = (statRow as DriverStat | null)?.avg_stars ?? null
      reviewCount = (statRow as DriverStat | null)?.review_count ?? 0

      let rq = supabase
        .from('reviews')
        .select(
          `
          id,
          driver_id,
          reviewer_id,
          stars,
          comment,
          created_at,
          review_tags (
            tag:tags (
              id,
              label,
              category,
              slug
            )
          )
        `
        )
        .eq('driver_id', driver.id)

      if (sortMode === 'highest') {
        rq = rq.order('stars', { ascending: false }).order('created_at', { ascending: false })
      } else if (sortMode === 'lowest') {
        rq = rq.order('stars', { ascending: true }).order('created_at', { ascending: false })
      } else if (sortMode === 'oldest') {
        rq = rq.order('created_at', { ascending: true })
      } else {
        rq = rq.order('created_at', { ascending: false })
      }

      const { data: r } = await rq
      reviews = (r as ReviewRow[] | null) ?? []

      for (const rev of reviews) {
        for (const rt of rev.review_tags ?? []) {
          const tag = rt?.tag
          if (!tag) continue

          const cat = String(tag.category ?? '').trim().toLowerCase()
          if (cat === 'positive' || cat === 'neutral' || cat === 'negative') {
            traitCounts[cat]++
          }

          if (!tagFreq[tag.id]) {
            tagFreq[tag.id] = {
              id: tag.id,
              label: tag.label,
              category: cat,
              slug: tag.slug,
              count: 0,
            }
          }
          tagFreq[tag.id].count++
        }
      }

      for (const t of Object.values(tagFreq)) {
        if (t.category === 'positive' || t.category === 'neutral' || t.category === 'negative') {
          tagsByCategory[t.category].push({ label: t.label, count: t.count })
        }
      }

      tagsByCategory.positive.sort((a, b) => b.count - a.count)
      tagsByCategory.neutral.sort((a, b) => b.count - a.count)
      tagsByCategory.negative.sort((a, b) => b.count - a.count)
    }
  }

  const maxTrait = Math.max(traitCounts.positive, traitCounts.neutral, traitCounts.negative, 1)

  return (
    <main className="min-h-screen bg-[#ffeed5] text-black p-8">
      {/* HERO */}
      <div className="relative">
        <div className="flex flex-col items-center gap-4 mt-12 mb-10">
          <h1 className="text-4xl font-bold">Community-powered driver reviews</h1>
          <p className="text-sm text-gray-600">Built for rider safety, not harassment</p>
        </div>
      </div>

      {/* SEARCH */}
      <div className="flex flex-col items-center">
        <SearchForm
          initialQuery={raw.replace(/-/g, ' ')}
          initialState={initialState}
          initialCity={initialCity}
          initialCarColor={initialCarColor}
          initialCarMake={initialCarMake}
          initialCarModel={initialCarModel}
        />
        {!q && <p className="mt-6 text-sm text-gray-600">Type a handle to search.</p>}
      </div>

      {/* RESULTS */}
      {!q ? null : driver ? (
        <section className="mt-8 space-y-6">
          {/* Driver card */}
          <div className="rounded-lg border border-gray-300 p-4">
            <div className="flex items-start justify-between gap-6">
              <div>
                <div className="text-xl font-semibold">{driver.display_name}</div>
                <div className="text-gray-700">@{driver.driver_handle}</div>

                <div className="text-gray-600">
                  {driver.city ?? '—'}
                  {driver.state ? `, ${driver.state}` : ''}
                </div>

                {(driver.car_color || driver.car_make || driver.car_model) && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {driver.car_color && (
                      <span className="rounded-full border border-gray-300 bg-white/70 px-3 py-1 text-xs text-gray-900">
                        {driver.car_color}
                      </span>
                    )}
                    {driver.car_make && (
                      <span className="rounded-full border border-gray-300 bg-white/70 px-3 py-1 text-xs text-gray-900">
                        {driver.car_make}
                      </span>
                    )}
                    {driver.car_model && (
                      <span className="rounded-full border border-gray-300 bg-white/70 px-3 py-1 text-xs text-gray-900">
                        {driver.car_model}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="text-right">
                <div className="text-sm text-gray-600">Avg rating</div>
                <div className="text-2xl font-bold">
                  {formatAvg(avgStars)}
                  <span className="text-sm font-normal text-gray-600">/5</span>
                </div>
                <div className="text-xs text-gray-600">
                  {reviewCount} review{reviewCount === 1 ? '' : 's'}
                </div>
              </div>
            </div>
          </div>

          {/* Traits */}
          <div className="rounded-lg border border-gray-300 p-4">
            <div className="text-lg font-semibold">Driver traits</div>

            <div className="mt-4 space-y-5">
              {(
                [
                  ['positive', 'Positive'] as const,
                  ['neutral', 'Neutral'] as const,
                  ['negative', 'Negative'] as const,
                ] as const
              ).map(([key, label]) => {
                const val = traitCounts[key]
                const pct = Math.round((val / maxTrait) * 100)

                return (
                  <div key={key} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-900">{label}</span>
                      <span className="text-gray-700">{val}</span>
                    </div>

                    <div className="h-2 w-full rounded bg-gray-300">
                      <div
                        className={[
                          'h-2 rounded',
                          key === 'positive'
                            ? 'bg-green-500'
                            : key === 'neutral'
                            ? 'bg-yellow-500'
                            : 'bg-red-500',
                        ].join(' ')}
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    <details className="text-sm">
                      <summary className="cursor-pointer text-gray-700 hover:text-gray-900">Show tags</summary>

                      {tagsByCategory[key].length === 0 ? (
                        <div className="mt-2 text-gray-600">No tags yet.</div>
                      ) : (
                        <ul className="mt-2 space-y-1 text-gray-900">
                          {tagsByCategory[key].slice(0, 15).map((t) => (
                            <li key={t.label} className="flex justify-between">
                              <span>{t.label}</span>
                              <span className="text-gray-600">{t.count}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </details>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Write a review */}
          <div className="rounded-lg border border-gray-300 p-4">
            <h2 className="text-lg font-semibold">Write a review</h2>
            <ReviewForm driverId={driver.id} />
          </div>

          {/* Reviews */}
          <div className="rounded-lg border border-gray-300 p-4">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold">Reviews</h2>
              <SortSelect />
            </div>

            {reviews.length === 0 ? (
              <p className="text-gray-700 mt-2">No reviews yet.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {reviews.map((r) => {
                  const tagList = (r.review_tags ?? [])
                    .map((rt) => rt?.tag)
                    .filter((t): t is TagRow => Boolean(t))

                  return (
                    <li
                      key={r.id}
                      id={`review-${r.id}`}
                      className="rounded-2xl border border-gray-300 bg-transparent p-5"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="text-sm font-semibold">Rating: {r.stars}/5</div>
                        <div className="text-xs text-gray-600">
                          {r.created_at ? new Date(r.created_at).toLocaleString() : ''}
                        </div>
                      </div>

                      {r.comment ? (
                        <p className="mt-2 text-gray-900 whitespace-pre-wrap">{r.comment}</p>
                      ) : (
                        <p className="mt-2 text-gray-600 italic">No comment.</p>
                      )}

                      {tagList.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {tagList.map((t) => (
                            <span
                              key={t.id}
                              className="rounded-full border border-gray-300 bg-white/50 px-3 py-1 text-xs text-gray-900"
                            >
                              {t.label}
                            </span>
                          ))}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>
      ) : suggestions.length > 0 ? (
        <section className="mt-8 space-y-4">
          <div className="rounded-lg border border-gray-300 p-4">
            <div className="text-lg font-semibold">Did you mean one of these?</div>
            <p className="text-sm text-gray-600 mt-1">
              No exact match for <span className="font-semibold">{raw}</span>, but we found drivers that start with it —
              narrowed using your optional details.
            </p>

            <div className="mt-4 grid gap-3">
              {suggestions.map((d) => (
                <Link
                  key={d.id}
                  href={`/search?q=${encodeURIComponent(d.driver_handle)}`}
                  className="rounded-lg border border-gray-300 bg-white/40 p-4 hover:bg-white/60 transition"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-base font-semibold">{d.display_name ?? d.driver_handle}</div>
                      <div className="text-sm text-gray-700">@{d.driver_handle}</div>
                      <div className="text-sm text-gray-600">
                        {d.city ?? '—'}
                        {d.state ? `, ${d.state}` : ''}
                      </div>

                      {(d.car_color || d.car_make || d.car_model) && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {d.car_color && (
                            <span className="rounded-full border border-gray-300 bg-white/70 px-3 py-1 text-xs text-gray-900">
                              {d.car_color}
                            </span>
                          )}
                          {d.car_make && (
                            <span className="rounded-full border border-gray-300 bg-white/70 px-3 py-1 text-xs text-gray-900">
                              {d.car_make}
                            </span>
                          )}
                          {d.car_model && (
                            <span className="rounded-full border border-gray-300 bg-white/70 px-3 py-1 text-xs text-gray-900">
                              {d.car_model}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="text-sm text-gray-600">Open</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-gray-300 p-4">
            <CreateDriverForm
              initialRaw={raw}
              initialState={initialState}
              initialCity={initialCity}
              initialCarColor={initialCarColor}
              initialCarMake={initialCarMake}
              initialCarModel={initialCarModel}
            />
          </div>
        </section>
      ) : (
        <section className="mt-8 space-y-4">
          {shouldPromptForDisambiguator && (
            <div className="rounded-lg border border-gray-300 bg-white/40 p-4">
              <div className="text-lg font-semibold">Add one more detail</div>
              <p className="mt-1 text-sm text-gray-700">
                To avoid showing the wrong driver, partial searches like{' '}
                <span className="font-semibold">{raw}</span> only show matches when you add at least one optional detail
                (state/city/car). Or finish the full handle like <span className="font-semibold">7483-mike</span>.
              </p>
            </div>
          )}

          <div className="rounded-lg border border-gray-300 p-4">
            <CreateDriverForm
              initialRaw={raw}
              initialState={initialState}
              initialCity={initialCity}
              initialCarColor={initialCarColor}
              initialCarMake={initialCarMake}
              initialCarModel={initialCarModel}
            />
          </div>
        </section>
      )}
    </main>
  )
}
