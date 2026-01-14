import SearchForm from './SearchForm'
import ReviewForm from './ReviewForm'
import CreateDriverForm from './CreateDriverForm'
import { supabase } from '@/lib/supabaseClient'
import Link from 'next/link'
import Image from 'next/image'

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const sp = await searchParams
  const raw = (sp.q ?? '').trim()

  // normalize: "8841 mike" → "8841-mike"
  const q = raw.toLowerCase().replace(/\s+/g, '-')

  let driver: any = null
  let reviews: any[] = []

  // Trait aggregation structures
  const traitCounts = { positive: 0, neutral: 0, negative: 0 }
  const tagFreq: Record<
    string,
    { id: string; label: string; category: string; slug: string; count: number }
  > = {}

  // Derived lists for dropdowns
  const tagsByCategory = {
    positive: [] as { label: string; count: number }[],
    neutral: [] as { label: string; count: number }[],
    negative: [] as { label: string; count: number }[],
  }

  if (q) {
    const { data: d, error: driverErr } = await supabase
      .from('drivers')
      .select('*')
      .eq('driver_handle', q)
      .maybeSingle()

    if (driverErr) console.log('driverErr', driverErr)
    driver = d

    if (driver?.id) {
      const { data: r, error: reviewsErr } = await supabase
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
        .order('created_at', { ascending: false })

      if (reviewsErr) console.log('reviewsErr', reviewsErr)
      reviews = r ?? []

      // Aggregate trait totals + tag frequencies
      for (const rev of reviews as any[]) {
        for (const rt of rev.review_tags ?? []) {
          const tag = rt?.tag
          if (!tag) continue

          const cat = String(tag.category || '').toLowerCase()
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

      // Convert frequency map into 3 sorted arrays (for dropdown lists)
      Object.values(tagFreq).forEach((t) => {
        if (
          t.category === 'positive' ||
          t.category === 'neutral' ||
          t.category === 'negative'
        ) {
          tagsByCategory[t.category].push({ label: t.label, count: t.count })
        }
      })

      tagsByCategory.positive.sort((a, b) => b.count - a.count)
      tagsByCategory.neutral.sort((a, b) => b.count - a.count)
      tagsByCategory.negative.sort((a, b) => b.count - a.count)
    }
  }

  const maxTrait = Math.max(
    traitCounts.positive,
    traitCounts.neutral,
    traitCounts.negative,
    1
  )

  return (
    <main className="min-h-screen bg-[#ffeed5] text-black p-8">
      {/* TOP BAR */}
      <div className="relative">
        {/* Centered brand block */}
        <div className="flex flex-col items-center gap-4 mt-12 mb-20">
          {/* IMPORTANT: z-10 + inline-block ensures nothing steals the click */}
         

          <h1 className="text-4xl font-bold">Community-powered driver reviews</h1>
          <p className="text-sm text-gray-600">
            Built for rider safety, not harassment
          </p>
        </div>

        
      </div>

      {/* HERO SEARCH */}
      <div className="flex flex-col items-center">
        <SearchForm initialQuery={raw.replace(/-/g, ' ')} />

        {!q && (
          <p className="mt-6 text-sm text-gray-600">Type a handle to search.</p>
        )}
      </div>

      {/* RESULTS */}
      {!q ? null : !driver ? (
        <div className="mt-8 rounded-lg border border-gray-300 p-4">
          <p className="text-gray-900">
            No driver found. Create <span className="font-semibold">@{q}</span>?
          </p>
          <CreateDriverForm initialRaw={raw} />
        </div>
      ) : (
        <section className="mt-8 space-y-6">
          {/* Driver card */}
          <div className="rounded-lg border border-gray-300 p-4">
            <div className="text-xl font-semibold">{driver.display_name}</div>
            <div className="text-gray-700">@{driver.driver_handle}</div>
            <div className="text-gray-600">
              {driver.city}, {driver.state}
            </div>
          </div>

          {/* Driver traits */}
          <div className="rounded-lg border border-gray-300 p-4">
            <div className="text-lg font-semibold">Driver traits</div>

            <div className="mt-4 space-y-5">
              {([
                ['positive', 'Positive'] as const,
                ['neutral', 'Neutral'] as const,
                ['negative', 'Negative'] as const,
              ]).map(([key, label]) => {
                const val = (traitCounts as any)[key] as number
                const pct = Math.round((val / maxTrait) * 100)

                return (
                  <div key={key} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-900">{label}</span>
                      <span className="text-gray-700">{val}</span>
                    </div>

                    <div className="h-2 w-full rounded bg-gray-800">
                      <div
                        className="h-2 rounded bg-green-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    <details className="text-sm">
                      {/* fixed hover color for cream bg */}
                      <summary className="cursor-pointer text-gray-700 hover:text-gray-900">
                        Show tags
                      </summary>

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

          {/* Reviews list */}
          <div className="rounded-lg border border-gray-300 p-4">
            <h2 className="text-lg font-semibold">Reviews</h2>

            {reviews.length === 0 ? (
              <p className="text-gray-700 mt-2">No reviews yet.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {reviews.map((rev: any) => (
                  <li
                    key={rev.id}
                    className="border border-gray-300 rounded-md p-3"
                  >
                    <div>Rating: {rev.stars}/5</div>

                    {rev.comment && (
                      <div className="text-gray-900 mt-1">{rev.comment}</div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}
    </main>
  )
}
