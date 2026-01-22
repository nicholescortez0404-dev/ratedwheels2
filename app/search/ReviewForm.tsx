'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { useEnterToNext } from '@/lib/useEnterToNext'

/* -------------------- types -------------------- */

type TagRow = {
  id: string
  label: string
  slug: string
  category: 'positive' | 'neutral' | 'negative' | string
  is_active?: boolean
}

type JsonObject = Record<string, unknown>

/* -------------------- constants -------------------- */

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

/* -------------------- helpers -------------------- */

function isJsonObject(v: unknown): v is JsonObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function errorMessage(e: unknown, fallback: string) {
  return e instanceof Error ? e.message : fallback
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

function TagGroup({
  title,
  list,
  selectedTagIds,
  toggleTag,
}: {
  title: string
  list: TagRow[]
  selectedTagIds: Set<string>
  toggleTag: (id: string) => void
}) {
  if (!list || list.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="text-xs tracking-widest text-gray-600 uppercase">{title}</div>

      <div className="flex flex-wrap gap-2">
        {list.map((t) => {
          const selected = selectedTagIds.has(t.id)
          return (
            <button key={t.id} type="button" onClick={() => toggleTag(t.id)} className={chipClass(t.category, selected)}>
              {t.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* -------------------- component -------------------- */

export default function ReviewForm({ driverId }: { driverId: string }) {
  const router = useRouter()

  /* -------------------- enter-to-next -------------------- */
  const starsRef = useRef<HTMLSelectElement | null>(null)
  const commentRef = useRef<HTMLTextAreaElement | null>(null)
  const submitRef = useRef<HTMLButtonElement | null>(null)
  const enterNext = useEnterToNext([starsRef, commentRef, submitRef])

  /* -------------------- form state -------------------- */
  const [stars, setStars] = useState<number>(5)
  const [comment, setComment] = useState<string>('')

  const [tags, setTags] = useState<TagRow[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set())

  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  /* -------------------- derived -------------------- */
  const commentCount = comment.length
  const overLimit = commentCount > MAX_COMMENT_CHARS

  /* -------------------- load tag options -------------------- */
  useEffect(() => {
    let mounted = true

    ;(async () => {
      const { data, error: tagErr } = await supabase
        .from('tags')
        .select('id,label,slug,category,is_active')
        .or('is_active.is.null,is_active.eq.true')
        .order('sort_order', { ascending: true })

      if (!mounted) return

      if (tagErr) {
        setError(tagErr.message)
        return
      }

      setTags((data ?? []) as TagRow[])
    })()

    return () => {
      mounted = false
    }
  }, [])

  /* -------------------- toast + scroll after refresh -------------------- */
  useEffect(() => {
    const last = sessionStorage.getItem('rw:lastPostedReviewId')
    if (!last) return

    const t = setTimeout(() => setToast('Review posted!'), 0)

    ;(async () => {
      await scrollToReviewId(last)
      sessionStorage.removeItem('rw:lastPostedReviewId')
    })()

    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(t)
  }, [toast])

  /* -------------------- group + sort tags by priority -------------------- */
  const grouped = useMemo(() => {
    const byCat: Record<string, TagRow[]> = { negative: [], neutral: [], positive: [] }

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

  const toggleTag = useCallback((id: string) => {
    setSelectedTagIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  /* -------------------- submit -------------------- */
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (loading) return

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
        body: JSON.stringify({ driverId, stars, comment, tagIds }),
      })

      const jsonUnknown: unknown = await res.json().catch(() => ({}))
      const json: JsonObject = isJsonObject(jsonUnknown) ? jsonUnknown : {}

      if (!res.ok) {
        const apiErr = typeof json.error === 'string' ? json.error : 'Failed to post review.'
        setError(apiErr)
        setLoading(false)
        return
      }

      const reviewObj = isJsonObject(json.review) ? json.review : null
      const newReviewId = typeof reviewObj?.id === 'string' ? reviewObj.id : undefined

      // reset form
      setComment('')
      setStars(5)
      setSelectedTagIds(new Set())

      setToast('Review posted!')

      if (newReviewId) {
        sessionStorage.setItem('rw:lastPostedReviewId', newReviewId)
      }

      setLoading(false)

      router.refresh()

      // try immediate scroll too (best effort)
      if (newReviewId) scrollToReviewId(newReviewId)
    } catch (err: unknown) {
      setLoading(false)
      setError(errorMessage(err, 'Failed to post review.'))
    }
  }

  /* -------------------- render -------------------- */

  return (
    <>
      {toast && (
        <div className="fixed left-1/2 top-6 z-50 -translate-x-1/2 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm">
          {toast}
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <div className="flex items-center gap-3">
          <label className="text-gray-900 font-medium">Rating</label>
          <select
            ref={starsRef}
            value={stars}
            onChange={(e) => setStars(Number(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commentRef.current?.focus()
                return
              }
              enterNext(e)
            }}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black/20"
            disabled={loading}
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
          <TagGroup title="Positive" list={grouped.positive ?? []} selectedTagIds={selectedTagIds} toggleTag={toggleTag} />
          <TagGroup title="Neutral" list={grouped.neutral ?? []} selectedTagIds={selectedTagIds} toggleTag={toggleTag} />
          <TagGroup title="Negative" list={grouped.negative ?? []} selectedTagIds={selectedTagIds} toggleTag={toggleTag} />
        </div>

        <div className="space-y-2">
          <div className="relative">
            <textarea
              ref={commentRef}
              value={comment}
              onChange={(e) => {
                const v = e.target.value
                setComment(v)
                if (v.length <= MAX_COMMENT_CHARS && error?.includes('shorten your comment')) {
                  setError(null)
                }
              }}
              onKeyDown={(e) => {
                // let Enter create new lines in the textarea
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  // optional: Cmd/Ctrl+Enter to submit
                  e.preventDefault()
                  submitRef.current?.click()
                  return
                }
              }}
              placeholder="Write what happened…"
              rows={3}
              disabled={loading}
              className={[
                'w-full rounded-md border bg-white px-3 py-2 text-gray-900 placeholder:text-gray-500 outline-none transition',
                overLimit
                  ? 'border-red-500 ring-1 ring-red-500 focus:ring-2 focus:ring-red-500'
                  : 'border-gray-300 focus:ring-2 focus:ring-black/20',
                loading ? 'opacity-60 cursor-not-allowed' : '',
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
              Your comment is too long. Please shorten it to <strong>{MAX_COMMENT_CHARS} characters or less</strong> to
              continue.
            </p>
          )}

          <p className="text-xs text-gray-600">Note: some language may be automatically censored. Hate speech/slurs are not allowed.</p>
        </div>

        {error && <p className="text-red-600">{error}</p>}

        <button
          ref={submitRef}
          type="submit"
          disabled={loading || overLimit}
          className="inline-flex h-11 items-center justify-center rounded-lg bg-green-600 px-5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          title={overLimit ? `Shorten comment to ${MAX_COMMENT_CHARS} chars to submit` : undefined}
        >
          {loading ? 'Posting…' : 'Post review'}
        </button>

        <p className="text-xs text-gray-600">
          Tip: Press <span className="font-semibold">Cmd/Ctrl + Enter</span> to submit quickly.
        </p>
      </form>
    </>
  )
}
