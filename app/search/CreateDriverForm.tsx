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

function normalizeHandle(raw: string) {
  return raw.trim().toLowerCase().replace(/\s+/g, '-')
}

type InsertedDriver = {
  id: string
  driver_handle: string
}

export default function CreateDriverForm({ initialRaw }: { initialRaw: string }) {
  const router = useRouter()

  const handle = normalizeHandle(initialRaw)

  // driver fields
  const [displayName, setDisplayName] = useState(initialRaw.trim())
  const [city, setCity] = useState('')
  const [state, setState] = useState('')

  // review fields
  const [stars, setStars] = useState<number>(5)
  const [comment, setComment] = useState<string>('')
  const [tags, setTags] = useState<TagRow[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set())

  // ui state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const commentCount = comment.length
  const overLimit = commentCount > MAX_COMMENT_CHARS

  // Load tag options
  useEffect(() => {
    let mounted = true

    ;(async () => {
      const { data, error } = await supabase
        .from('tags')
        .select('id,label,slug,category,is_active')
        .eq('is_active', true)
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

  const grouped = useMemo(() => {
    const byCat: Record<string, TagRow[]> = {
      negative: [],
      neutral: [],
      positive: [],
    }

    for (const t of tags) {
      const cat = String(t.category || '').toLowerCase()
      if (!byCat[cat]) byCat[cat] = []
      byCat[cat].push(t)
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

  async function createDriver(): Promise<InsertedDriver> {
    const { data: inserted, error: insertErr } = await supabase
      .from('drivers')
      .insert({
        driver_handle: handle,
        display_name: displayName.trim() || handle,
        city: city.trim() || null,
        state: state.trim() || null,
      })
      .select('id, driver_handle')
      .single()

    if (insertErr) throw new Error(insertErr.message)
    return inserted as InsertedDriver
  }

  async function onCreateOnly() {
    if (loading) return

    setLoading(true)
    setError(null)

    try {
      const row = await createDriver()
      const nextHandle = row?.driver_handle ?? handle

      router.push(`/search?q=${encodeURIComponent(nextHandle)}`)
      router.refresh()
    } catch (err: any) {
      setError(err?.message || 'Failed to create driver.')
    } finally {
      setLoading(false)
    }
  }

  async function onCreateAndReview(e: React.FormEvent<HTMLFormElement>) {
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
      // 1) create driver
      const row = await createDriver()
      const nextHandle = row?.driver_handle ?? handle

      // 2) post review (moderation API)
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverId: row.id,
          stars,
          comment,
          tagIds,
        }),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json?.error || 'Driver created, but review failed to post.')
        setLoading(false)
        return
      }

      const newReviewId = json?.review?.id as string | undefined
      if (newReviewId) {
        sessionStorage.setItem('rw:lastPostedReviewId', newReviewId)
      }

      router.push(`/search?q=${encodeURIComponent(nextHandle)}`)
      router.refresh()
    } catch (err: any) {
      setError(err?.message || 'Failed to create driver and post review.')
    } finally {
      setLoading(false)
    }
  }

  const disablePrimary = loading || overLimit

  // ✅ SAME INPUT THEME AS YOUR REGULAR REVIEW FORM
  const inputClass =
    'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder:text-gray-500 ' +
    'focus:outline-none focus:ring-2 focus:ring-black/20'

  return (
    <form onSubmit={onCreateAndReview} className="space-y-4">
      <p className="text-gray-900">
        We couldn’t find this driver yet. Be the first to create and review{' '}
        <span className="font-semibold">@{handle}</span>.
      </p>

      {/* Driver fields (now matching your site theme) */}
      <div className="space-y-3">
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Display name (ex: Tom (4839))"
          className={inputClass}
        />

        <div className="flex gap-3">
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="City"
            className={inputClass}
          />
          <input
            value={state}
            onChange={(e) => setState(e.target.value)}
            placeholder="State (IL)"
            className={'w-32 ' + inputClass}
          />
        </div>
      </div>

      {/* Review fields */}
      <div className="space-y-4 pt-2">
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
      </div>

      {error && <p className="text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={disablePrimary}
        className="inline-flex h-11 items-center justify-center rounded-lg bg-green-600 px-5 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        title={overLimit ? `Shorten comment to ${MAX_COMMENT_CHARS} chars to submit` : undefined}
      >
        {loading ? 'Posting…' : 'Create driver & post review'}
      </button>

      <div className="pt-1">
        <button
          type="button"
          onClick={onCreateOnly}
          disabled={loading}
          className="text-xs text-gray-600 underline underline-offset-2 hover:text-gray-900 disabled:opacity-60"
        >
          Create driver only
        </button>
      </div>
    </form>
  )
}
