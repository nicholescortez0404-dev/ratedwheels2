// app/search/page.tsx
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

/* -------------------- types -------------------- */

type DriverStat = {
  driver_id: string
  avg_stars: number | null
  review_count: number | null
}

type DriverRow = {
  id: string
  driver_handle: string
  display_name: string | null
  state: string | null
  car_make: string | null
}

type TagRow = {
  id: string
  label: string
  category: string
  slug: string
}

type ReviewTagJoin = { tag: TagRow | null }

type ReviewRow = {
  id: string
  driver_id: string
  reviewer_id: string | null
  stars: number
  comment: string | null
  created_at: string | null
  review_tags: ReviewTagJoin[] | null
}

/* -------------------- helpers -------------------- */

function formatAvg(avg: number | null | undefined) {
  if (avg === null || avg === undefined || Number.isNaN(avg)) return '—'
  return Number(avg).toFixed(1)
}

// DB constraint: ^[a-z0-9]{1,4}-[a-z]{2,24}$
const HANDLE_RE = /^[a-z0-9]{1,4}-[a-z]{2,24}$/
const PLATE_LEADING_RE = /^(\d{4})(?:-([a-z]{1,24}))?$/

function normalizeQuery(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-')
}

function parsePlateLeading(norm: string) {
  const m = norm.match(PLATE_LEADING_RE)
  if (!m) return null
  return { plate: m[1], namePrefix: (m[2] ?? '').trim() }
}

function escapeIlikeLiteral(s: string) {
  // escape %, _, and \ for Supabase ilike patterns
  return s.replace(/[%_\\]/g, (m) => `\\${m}`)
}

/**
 * Builds an ilike prefix pattern safely:
 *   input "2222-t" => "2222-t%"
 */
function safePrefixIlike(q: string) {
  return `${escapeIlikeLiteral(q)}%`
}

function hasAnyDisambiguator(params: { state?: string; car_make?: string }) {
  return Boolean((params.state ?? '').trim() || (params.car_make ?? '').trim())
}

function buildContainsIlike(v: string) {
  return `%${escapeIlikeLiteral(v.trim())}%`
}

/* -------------------- page -------------------- */

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    sort?: string
    state?: string
    car_make?: string
  }>
}) {
  noStore()
  const supabase = createSupabaseServerClient()
  const sp = await searchParams

  // raw query as user typed (for UI)
  const rawQ = String(sp.q ?? '').trim()

  // normalized query used for DB matching
  const q = normalizeQuery(rawQ)

  // optional filters (only the ones we still support)
  const initialState = String(sp.state ?? '').trim().toUpperCase()
  const initialCarMake = String(sp.car_make ?? '').trim()

  const disambiguatorPresent = hasAnyDisambiguator({
    state: initialState,
    car_make: initialCarMake,
  })

  // sort
  const allowedSorts = new Set(['newest', 'oldest', 'highest', 'lowest'])
  const sortParam = String(sp.sort ?? 'newest').toLowerCase()
  const sortMode = allowedSorts.has(sortParam) ? sortParam : 'newest'

  // results
  let driver: DriverRow | null = null
  let suggestions: DriverRow[] = []

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
    { id: string; label: string; category: 'positive' | 'neutral' | 'negative' | string; slug: string; count: number }
  > = {}

  const tagsByCategory: Record<'positive' | 'neutral' | 'negative', { label: string; count: number }[]> = {
    positive: [],
    neutral: [],
    negative: [],
  }

  // UI state messages
  let helperMessage: string | null = null
  let showCreateDriver = false

  const plateParsed = q ? parsePlateLeading(q) : null
  const isExactHandle = q ? HANDLE_RE.test(q) : false
  const isPlateLeading = Boolean(plateParsed)

  // ---- Search rules:
  // 1) "mike" (no plate) => no results + guidance (no create prompt)
  // 2) "2222" (plate only) => do NOT dump; require a disambiguator OR name letter
  // 3) "2222 t" => normalized to "2222-t" => prefix match driver_handle ILIKE "2222-t%"
  // 4) exact handle always checks exact first
  // 5) cap suggestions to 20-25

  if (q) {
    // ------------- EXACT LOOKUP -------------
    if (isExactHandle) {
      const { data: d, error } = await supabase
        .from('drivers')
        .select('id,driver_handle,display_name,state,car_make')
        .eq('driver_handle', q)
        .maybeSingle()

      if (!error) driver = (d as DriverRow | null) ?? null
    }

    // ------------- NOT FOUND => DECIDE NEXT -------------
    if (!driver) {
      // If it isn't plate-leading at all (like "mike"), we show guidance and stop.
      if (!isPlateLeading) {
        helperMessage = 'Search using the last 4 digits + first name (example: 8841-mike).'
        showCreateDriver = false
      } else {
        // plate-leading cases
        const { plate, namePrefix } = plateParsed!

        const typedOnlyPlate = q === plate

        // "2222" with no disambiguator => block suggestions, show helper
        if (typedOnlyPlate && !disambiguatorPresent) {
          helperMessage =
            'That’s only the plate. Add a first-name letter (example: 2222-t) or add a detail (state / car make) to narrow.'
          showCreateDriver = true
        } else {
          // Allowed to suggest:
          // - has name prefix: "2222-t" => prefix "2222-t%"
          // - OR plate only but disambiguator exists: prefix "2222-%"
          const prefix = namePrefix ? `${plate}-${namePrefix}` : `${plate}-`

          let sq = supabase
            .from('drivers')
            .select('id,driver_handle,display_name,state,car_make')
            .ilike('driver_handle', safePrefixIlike(prefix))
            .limit(25)

          if (initialState) sq = sq.eq('state', initialState)
          if (initialCarMake) sq = sq.ilike('car_make', buildContainsIlike(initialCarMake))

          const { data: s, error: sErr } = await sq
          if (!sErr) suggestions = (s as DriverRow[] | null) ?? []

          showCreateDriver = true
        }
      }
    }
  }

  // ------------- DRIVER FOUND => LOAD STATS + REVIEWS + TAGS -------------
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
        <SearchForm initialQuery={rawQ} initialState={initialState} initialCarMake={initialCarMake} />

        {!q && <p className="mt-6 text-sm text-gray-600">Type a handle to search.</p>}

        {/* Server-side helper (mirrors SearchForm gating rules) */}
        {helperMessage && (
          <div className="mt-6 w-full max-w-xl rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm text-yellow-900">
            {helperMessage}
          </div>
        )}
      </div>

      {/* RESULTS */}
      {!q ? null : driver ? (
        <section className="mt-8 space-y-6">
          {/* Driver card */}
          <div className="rounded-lg border border-gray-300 p-4">
            <div className="flex items-start justify-between gap-6">
              <div>
                <div className="text-xl font-semibold">{driver.display_name ?? driver.driver_handle}</div>

                {/* Minimal line: State + Car make */}
                <div className="mt-1 text-sm text-gray-700">
                  {driver.state ? `State: ${driver.state}` : 'State: —'}
                  {driver.car_make ? ` • Car make: ${driver.car_make}` : ''}
                </div>
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
              No exact match for <span className="font-semibold">{rawQ}</span>, but we found drivers that match your input.
            </p>

            <div className="mt-4 grid gap-3">
              {suggestions.slice(0, 20).map((d) => (
                <Link
                  key={d.id}
                  href={`/search?q=${encodeURIComponent(d.driver_handle)}`}
                  className="rounded-lg border border-gray-300 bg-white/40 p-4 hover:bg-white/60 transition"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-base font-semibold">{d.display_name ?? d.driver_handle}</div>

                      {/* Minimal line: State + Car make */}
                      <div className="mt-1 text-sm text-gray-700">
                        {d.state ? `State: ${d.state}` : 'State: —'}
                        {d.car_make ? ` • Car make: ${d.car_make}` : ''}
                      </div>
                    </div>

                    <div className="text-sm text-gray-600">Open</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {showCreateDriver && (
            <div className="rounded-lg border border-gray-300 p-4">
              <CreateDriverForm initialRaw={rawQ} initialState={initialState} initialCarMake={initialCarMake} />
            </div>
          )}
        </section>
      ) : (
        <section className="mt-8 space-y-4">
          {q && isPlateLeading && !driver && helperMessage && (
            <div className="rounded-lg border border-gray-300 bg-white/40 p-4">
              <div className="text-lg font-semibold">Need one more detail</div>
              <p className="mt-1 text-sm text-gray-700">{helperMessage}</p>
            </div>
          )}

          {showCreateDriver && (
            <div className="rounded-lg border border-gray-300 p-4">
              <CreateDriverForm initialRaw={rawQ} initialState={initialState} initialCarMake={initialCarMake} />
            </div>
          )}
        </section>
      )}
    </main>
  )
}
