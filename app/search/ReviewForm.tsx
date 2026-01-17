'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import { supabase } from '@/lib/supabaseClient'

type TagRow = {
  id: string
  label: string
  slug: string
  category: 'positive' | 'neutral' | 'negative' | string
  is_active?: boolean
}

const MAX_COMMENT_CHARS = 500

// ✅ Ordering: safety/comfort first (by slug). Anything not listed falls to the bottom (alphabetical).
const TAG_PRIORITY: Record<string, number> = {
  // NEGATIVE
  'reckless-driving': 1,
  'felt-uncomfortable': 2,
  'ignored-accommodations': 3,
  'unprofessional-behavior': 4,
  unfriendly: 5,
  'car-not-clean': 6,
  'late-pickup': 7,
  'excessive-talking': 8,

  // NEUTRAL
  'charger-available': 1,
  'water-snacks-provided': 2,
  'tissues-available': 3,

  // POSITIVE
  'safe-driving': 1,
  'felt-comfortable': 2,
  respectful: 3,
  professional: 4,
  friendly: 5,
  'clean-car': 6,
  'smooth-ride': 7,
  'good-navigation': 8,
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function scrollToReviewId(reviewId: string) {
  const targetId = `review-${reviewId}`
  const started = Date.now()

  while (Date.now() - started < 2000) {
    const el = document.getElementById(targetId)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return true
    }
    await sleep(50)
  }
  return false
}

export default function ReviewForm({ driverId }: { driverId: string }) {
  const router = useRouter()

  const [stars, setStars] = useState<number>(5)
  const [comment, setComment] = useState<string>('')

  const [tags, setTags] = useState<TagRow[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set())

  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  // derived
  const commentCount = comment.length
  const overLimit = commentCount > MAX_COMMENT_CHARS

  // Load tag options (safe client-side)
  useEffect(() => {
    let mounted = true

    ;(async () => {
      const { data, error } = await supabase
        .from('tags')
        .select('id,label,slug,category,is_active')
        .or('is_active.is.null,is_active.eq.true')
        .order('category', { ascending: true })
        .order('label', { ascending: true })

      if (!mounted) return

      if (error) {
        setError(error.message)
        return
      }

      setTags((data ?? []) as TagRow[])
    })()

    return () => {
      mounted = false
    }
  }, [])

  // After refresh: scroll to last posted review
  useEffect(() => {
    const last = sessionStorage.getItem('rw:lastPostedReviewId')
    if (!last) return

    ;(async () => {
      await scrollToReviewId(last)
      sessionStorage.removeItem('rw:lastPostedReviewId')
    })()
  }, [])

  // Toast auto-hide
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(t)
  }, [toast])

  // ✅ group + sort by priority within each category
  const grouped = useMemo(() => {
    const byCat: Record<string, TagRow[]> = {
      negative: [],
      neutral: [],
      positive: [],
    }

    for (const t of tags) {
      const cat = String(t.category || '').trim().toLowerCase()
      if (!byCat[cat]) byCat[cat] = []
      byCat[cat].push(t)
    }

    for (const cat of Object.keys(byCat)) {
      byCat[cat].sort((a, b) => {
        const pa = TAG_PRIORITY[a.slug] ?? 999
        const pb = TAG_PRIORITY[b.slug] ?? 999
        if (pa !== pb) return pa - pb
        return a.label.localeCompare(b.label)
      })
    }

    return byCat
  }, [tags])

  function toggleTag(id: string) {
    setSelectedTagIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Chip styling: readable on cream + category colors when selected
  function chipClass(category: string, selected: boolean) {
    const base =
      'rounded-full border px-3 py-1 text-sm font-medium transition select-none ' +
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-black/30'

    if (!selected) {
      return `${base} bg-transparent border-gray-300 text-gray-900 hover:border-gray-600`
    }

    switch (String(category || '').toLowerCase()) {
      case 'positive':
        return `${base} bg-green-200 border-green-600 text-green-900`
      case 'neutral':
        return `${base} bg-yellow-200 border-yellow-600 text-yellow-900`
      case 'negative':
        return `${base} bg-red-200 border-red-600 text-red-900`
      default:
        return `${base} bg-gray-200 border-gray-600 text-gray-900`
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    // If over limit, do not submit.
    if (overLimit) {
      setError(`Please shorten your comment to ${MAX_COMMENT_CHARS} characters or less to submit.`)
      return
    }

    setLoading(true)
    setError(null)

    const tagIds = Array.from(selectedTagIds)

    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverId,
          stars,
          comment,
          tagIds,
        }),
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        setLoading(false)
        setError(json?.error || 'Failed to post review.')
        return
      }

      const newReviewId = json?.review?.id as string | undefined

      // Reset form immediately
      setComment('')
      setStars(5)
      setSelectedTagIds(new Set())

      // Toast
      setToast('Review posted!')

      // Store id so we can scroll after router.refresh renders the new review
      if (newReviewId) {
        sessionStorage.setItem('rw:lastPostedReviewId', newReviewId)
      }

      setLoading(false)

      // Refresh server data
      router.refresh()

      // Optional: attempt immediate scroll too
      if (newReviewId) {
        scrollToReviewId(newReviewId)
      }
    } catch (err: any) {
      setLoading(false)
      setError(err?.message || 'Failed to post review.')
    }
  }

  const TagGroup = ({ title, list }: { title: string; list: TagRow[] }) => {
    if (!list || list.length === 0) return null

    return (
      <div className="space-y-2">
        <div className="text-xs tracking-widest text-gray-600 uppercase">{title}</div>

        <div className="flex flex-wrap gap-2">
          {list.map((t) => {
            const selected = selectedTagIds.has(t.id)
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => toggleTag(t.id)}
                className={chipClass(t.category, selected)}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Toast */}
      {toast && (
        <div className="fixed left-1/2 top-6 z-50 -translate-x-1/2 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm">
          {toast}
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <div className="flex items-center gap-3">
          <label className="text-gray-900 font-medium">Rating</label>
          <select
            value={stars}
            onChange={(e) => setStars(Number(e.target.value))}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black/20"
          >
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-4">
          <div className="text-gray-900 font-medium">Tags</div>
          <TagGroup title="Negative" list={grouped.negative ?? []} />
          <TagGroup title="Neutral" list={grouped.neutral ?? []} />
          <TagGroup title="Positive" list={grouped.positive ?? []} />
        </div>

        {/* Comment box with counter + red state when over */}
        <div className="space-y-2">
          <div className="relative">
            <textarea
              value={comment}
              onChange={(e) => {
                const v = e.target.value
                setComment(v)
                if (v.length <= MAX_COMMENT_CHARS && error?.includes('shorten your comment')) {
                  setError(null)
                }
              }}
              placeholder="Write what happened…"
              rows={3}
              className={[
                'w-full rounded-md border bg-white px-3 py-2 text-gray-900 placeholder:text-gray-500 outline-none transition',
                overLimit
                  ? 'border-red-500 ring-1 ring-red-500 focus:ring-2 focus:ring-red-500'
                  : 'border-gray-300 focus:ring-2 focus:ring-black/20',
              ].join(' ')}
            />

            <div
              className={[
                'absolute bottom-2 right-3 text-xs tabular-nums',
                overLimit ? 'text-red-600' : 'text-gray-600',
              ].join(' ')}
            >
              {commentCount}/{MAX_COMMENT_CHARS}
            </div>
          </div>

          {overLimit && (
            <p className="text-sm text-red-600">
              Your comment is too long. Please shorten it to{' '}
              <strong>{MAX_COMMENT_CHARS} characters or less</strong> to continue.
            </p>
          )}

          <p className="text-xs text-gray-600">
            Note: some language may be automatically censored. Hate speech/slurs are not allowed.
          </p>
        </div>

        {error && <p className="text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading || overLimit}
          className="inline-flex h-11 items-center justify-center rounded-lg bg-green-600 px-5 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          title={overLimit ? `Shorten comment to ${MAX_COMMENT_CHARS} chars to submit` : undefined}
        >
          {loading ? 'Posting…' : 'Post review'}
        </button>
      </form>
    </>
  )
}
