'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

type TagRow = {
  id: string
  label: string
  slug: string
  category: 'positive' | 'neutral' | 'negative' | string
  is_active?: boolean
}

export default function ReviewForm({ driverId }: { driverId: string }) {
  const router = useRouter()

  const [stars, setStars] = useState(5)
  const [comment, setComment] = useState('')

  const [tags, setTags] = useState<TagRow[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set())

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const trimmed = comment.trim()

    // 1) Insert review, return new review id
    const { data: created, error: reviewErr } = await supabase
      .from('reviews')
      .insert({
        driver_id: driverId,
        stars,
        comment: trimmed,
      })
      .select('id')
      .single()

    if (reviewErr) {
      setLoading(false)
      setError(reviewErr.message)
      return
    }

    // 2) Insert selected tags into review_tags
    const tagIds = Array.from(selectedTagIds)
    if (tagIds.length > 0) {
      const { error: tagErr } = await supabase.from('review_tags').insert(
        tagIds.map((tagId) => ({
          review_id: created.id,
          tag_id: tagId,
        }))
      )

      if (tagErr) {
        setLoading(false)
        setError(tagErr.message)
        return
      }
    }

    // Reset + refresh
    setComment('')
    setStars(5)
    setSelectedTagIds(new Set())
    setLoading(false)
    router.refresh()
  }

  const TagGroup = ({ title, list }: { title: string; list: TagRow[] }) => {
    if (!list || list.length === 0) return null

    return (
      <div className="space-y-2">
        <div className="text-xs tracking-widest text-gray-600 uppercase">
          {title}
        </div>

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

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Write what happened…"
        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-black/20"
        rows={3}
      />

      {error && <p className="text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="inline-flex h-11 items-center justify-center rounded-lg bg-green-600 px-5 text-sm font-semibold text-black hover:opacity-90 transition disabled:opacity-60"
      >
        {loading ? 'Posting…' : 'Post review'}
      </button>
    </form>
  )
}
