'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
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

type InsertedDriver = { id: string; driver_handle: string }

type Props = {
  initialRaw: string
  initialState?: string | null
  initialCarMake?: string | null
}

type JsonObject = Record<string, unknown>

/* -------------------- constants -------------------- */

const MAX_COMMENT_CHARS = 500

// DB constraint: ^[a-z0-9]{1,4}-[a-z]{2,24}$
const HANDLE_RE = /^[a-z0-9]{1,4}-[a-z]{2,24}$/

const STATES: { code: string; name: string }[] = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'DC', name: 'District of Columbia' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
]

// ✅ Ordering: safety/comfort first (by slug). Anything not listed falls to bottom (alphabetical).
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

function titleCaseName(s: string) {
  return s
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function displayNameFromHandle(normalizedHandle: string) {
  const m = normalizedHandle.match(/^([a-z0-9]{1,4})-([a-z]{2,24})$/)
  if (!m) return normalizedHandle
  const plate = m[1]
  const name = titleCaseName(m[2])
  return `${name} (${plate})`
}

/**
 * What the user *sees* while typing:
 * - ensure "2222tommy" becomes "2222 tommy"
 * - ensure "2222-tommy" / "2222_tommy" becomes "2222 tommy"
 * - auto-space after 4 digits when the 5th char is a letter
 */
function formatHandleDisplayInput(nextRaw: string) {
  let v = nextRaw.replace(/\s+/g, ' ')
  v = v.replace(/^(\d{4})([A-Za-z])/, '$1 $2')
  v = v.replace(/^(\d{4})[-_]+/, '$1 ')
  return v
}

/**
 * Normalize anything into canonical DB handle:
 * - lowercase
 * - remove punctuation
 * - spaces/underscores -> dash
 * - supports:
 *    "2222 tommy" -> "2222-tommy"
 *    "tommy 2222" -> "2222-tommy"
 *    "2222tommy"  -> "2222-tommy"
 *    "2222-tommy" -> "2222-tommy"
 */
function normalizeToHandle(raw: string) {
  const s = raw.trim().toLowerCase()
  if (!s) return ''

  const cleaned = s.replace(/[^a-z0-9\s_-]/g, ' ').replace(/\s+/g, ' ').trim()
  if (HANDLE_RE.test(cleaned)) return cleaned

  let m = cleaned.match(/^(\d{1,4})[\s_-]+([a-z]{2,24})$/)
  if (m) return `${m[1]}-${m[2]}`

  m = cleaned.match(/^([a-z]{2,24})[\s_-]+(\d{1,4})$/)
  if (m) return `${m[2]}-${m[1]}`

  m = cleaned.match(/^(\d{1,4})([a-z]{2,24})$/)
  if (m) return `${m[1]}-${m[2]}`

  return cleaned.replace(/[_\s]+/g, '-').replace(/-+/g, '-')
}

function bestStateMatches(qRaw: string, limit = 60) {
  const q = qRaw.trim().toLowerCase()
  if (!q) return STATES

  const starts: typeof STATES = []
  const contains: typeof STATES = []

  for (const s of STATES) {
    const code = s.code.toLowerCase()
    const name = s.name.toLowerCase()
    if (code.startsWith(q) || name.startsWith(q)) starts.push(s)
    else if (code.includes(q) || name.includes(q)) contains.push(s)
  }

  return [...starts, ...contains].slice(0, limit)
}

function HighlightMatch({ text, q }: { text: string; q: string }) {
  const query = q.trim()
  if (!query) return <>{text}</>

  const lower = text.toLowerCase()
  const qLower = query.toLowerCase()
  const idx = lower.indexOf(qLower)
  if (idx === -1) return <>{text}</>

  return (
    <>
      {text.slice(0, idx)}
      <span className="font-semibold underline underline-offset-2">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  )
}

function chipClass(category: string, selected: boolean) {
  const base =
    'rounded-full border px-3 py-1 text-sm font-medium transition select-none ' +
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-black/30'

  if (!selected) return `${base} bg-transparent border-gray-300 text-gray-900 hover:border-gray-600`

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

export default function CreateDriverForm({ initialRaw, initialState, initialCarMake }: Props) {
  const router = useRouter()

  /* -------------------- handle (editable) -------------------- */
  const handleRef = useRef<HTMLInputElement | null>(null)
  const [handleInput, setHandleInput] = useState(() => formatHandleDisplayInput(initialRaw))

  // canonical handle used for DB + URLs
  const handle = useMemo(() => normalizeToHandle(handleInput), [handleInput])
  const handleValid = useMemo(() => HANDLE_RE.test(handle), [handle])
  const displayLabel = useMemo(
    () => displayNameFromHandle(handle || normalizeToHandle(initialRaw) || ''),
    [handle, initialRaw]
  )

  /* -------------------- refs for enter-to-next -------------------- */
  const carMakeRef = useRef<HTMLInputElement | null>(null)
  const stateRef = useRef<HTMLInputElement | null>(null)
  const starsRef = useRef<HTMLSelectElement | null>(null)
  const commentRef = useRef<HTMLTextAreaElement | null>(null)
  const submitRef = useRef<HTMLButtonElement | null>(null)

  const enterNext = useEnterToNext([handleRef, carMakeRef, stateRef, starsRef, commentRef, submitRef])

  /* -------------------- fields -------------------- */
  const [carMake, setCarMake] = useState(initialCarMake ?? '')

  /* -------------------- state typeahead (required) -------------------- */
  const initialStateCode = (initialState ?? '').toString().trim().toUpperCase()
  const initialStateIsValid = STATES.some((s) => s.code === initialStateCode)

  const [stateInput, setStateInput] = useState(initialStateIsValid ? initialStateCode : '')
  const [state, setState] = useState(initialStateIsValid ? initialStateCode : '')
  const [stateOpen, setStateOpen] = useState(false)
  const [stateActiveIndex, setStateActiveIndex] = useState(-1)

  const stateBoxRef = useRef<HTMLDivElement | null>(null)
  const stateListRef = useRef<HTMLDivElement | null>(null)

  const stateMatches = useMemo(() => bestStateMatches(stateInput, 60), [stateInput])
  const statePicked = state.trim().length === 2

  /* -------------------- review fields -------------------- */
  const [stars, setStars] = useState<number>(5)
  const [comment, setComment] = useState('')
  const [tags, setTags] = useState<TagRow[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set())

  /* -------------------- ui -------------------- */
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const commentCount = comment.length
  const overLimit = commentCount > MAX_COMMENT_CHARS

  /* -------------------- mobile tap vs scroll guard -------------------- */
  const touchStartYRef = useRef(0)
  const touchMovedRef = useRef(false)

  const optionPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') {
      touchStartYRef.current = e.clientY
      touchMovedRef.current = false
    }
  }, [])

  const optionPointerMove = useCallback((e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return
    if (Math.abs(e.clientY - touchStartYRef.current) > 8) touchMovedRef.current = true
  }, [])

  function isTouchTap(e: React.PointerEvent) {
    return e.pointerType === 'touch' && !touchMovedRef.current
  }

  function scrollActiveStateIntoView(nextIdx: number) {
    if (!stateListRef.current) return
    const el = stateListRef.current.querySelector<HTMLElement>(`[data-state-idx="${nextIdx}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }

  /* -------------------- outside click close -------------------- */
  useEffect(() => {
    function onDocPointerDown(e: PointerEvent) {
      const target = e.target as Node
      if (stateBoxRef.current && !stateBoxRef.current.contains(target)) {
        setStateOpen(false)
        setStateActiveIndex(-1)
      }
    }

    document.addEventListener('pointerdown', onDocPointerDown)
    return () => document.removeEventListener('pointerdown', onDocPointerDown)
  }, [])

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

  /* -------------------- state interactions -------------------- */

  const pickState = useCallback(
    (code: string) => {
      const up = code.toUpperCase().trim()
      const match = STATES.find((s) => s.code === up)
      if (!match) return

      setState(up)
      setStateInput(up)
      setStateOpen(false)
      setStateActiveIndex(-1)

      if (error) setError(null)

      setTimeout(() => {
        starsRef.current?.focus()
      }, 0)
    },
    [error]
  )

  function onStateChange(v: string) {
    const cleaned = v.toUpperCase().replace(/[^A-Z ]/g, '')
    setStateInput(cleaned)
    setStateOpen(true)
    setStateActiveIndex(-1)

    const maybeCode = cleaned.trim().slice(0, 2)
    if (STATES.some((s) => s.code === maybeCode) && cleaned.trim().length <= 2) {
      setState(maybeCode)
    } else {
      setState('')
    }
  }

  // ✅ FIX: Tab should not push focus into the dropdown options.
  // We intercept Tab like Enter to "pick" the best match.
  function onStateKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (loading) return

    const anyResults = stateMatches.length > 0
    const maxIdx = anyResults ? stateMatches.length - 1 : -1

    if (e.key === 'Escape') {
      if (stateOpen) {
        e.preventDefault()
        setStateOpen(false)
        setStateActiveIndex(-1)
      }
      return
    }

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!stateOpen) {
        setStateOpen(true)
        setStateActiveIndex(-1)
        return
      }

      setStateActiveIndex((prev) => {
        let next = prev
        if (e.key === 'ArrowDown') next = prev < maxIdx ? prev + 1 : -1
        else next = prev === -1 ? maxIdx : prev - 1
        setTimeout(() => scrollActiveStateIntoView(next), 0)
        return next
      })
      return
    }

    if (e.key === 'Enter' || e.key === 'Tab') {
      const raw = stateInput.trim()

      // If dropdown is open OR they typed something, Tab should "pick" instead of moving focus.
      const shouldInterceptTab = e.key === 'Tab' && (stateOpen || raw.length > 0)
      if (shouldInterceptTab) e.preventDefault()

      if (!raw) return

      const upper = raw.toUpperCase()

      const exactCode = STATES.find((s) => s.code === upper)
      if (exactCode) {
        e.preventDefault()
        pickState(exactCode.code)
        return
      }

      const exactName = STATES.find((s) => s.name.toUpperCase() === upper)
      if (exactName) {
        e.preventDefault()
        pickState(exactName.code)
        return
      }

      if (stateActiveIndex >= 0 && stateMatches[stateActiveIndex]) {
        e.preventDefault()
        pickState(stateMatches[stateActiveIndex].code)
        return
      }

      const best = stateMatches[0]
      if (best) {
        e.preventDefault()
        pickState(best.code)
      }
    }
  }

  /* -------------------- create driver -------------------- */

  async function createDriver(): Promise<InsertedDriver> {
    if (!statePicked) throw new Error('Please select a state.')

    const normalizedHandle = handle

    if (!HANDLE_RE.test(normalizedHandle)) {
      throw new Error('Driver handle format is invalid. Use: last 4 digits + first name (example: 8841-mike).')
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('drivers')
      .insert({
        driver_handle: normalizedHandle,
        display_name: displayNameFromHandle(normalizedHandle),
        state,
        car_make: carMake.trim() || null,
      })
      .select('id, driver_handle')
      .single()

    if (!insertErr) return inserted as InsertedDriver

    const msg = String(insertErr.message || '').toLowerCase()
    if (msg.includes('duplicate') || msg.includes('unique')) {
      const { data: existing } = await supabase
        .from('drivers')
        .select('id, driver_handle')
        .eq('driver_handle', normalizedHandle)
        .maybeSingle()

      if (existing?.id) return existing as InsertedDriver
    }

    throw new Error(insertErr.message)
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
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to create driver.'))
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
      const row = await createDriver()
      const nextHandle = row?.driver_handle ?? handle

      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId: row.id, stars, comment, tagIds }),
      })

      const jsonUnknown: unknown = await res.json().catch(() => ({}))
      const json: JsonObject = isJsonObject(jsonUnknown) ? jsonUnknown : {}

      if (!res.ok) {
        const apiErr = typeof json.error === 'string' ? json.error : 'Driver created, but review failed to post.'
        setError(apiErr)
        setLoading(false)
        return
      }

      const reviewObj = isJsonObject(json.review) ? json.review : null
      const newReviewId = typeof reviewObj?.id === 'string' ? reviewObj.id : undefined
      if (newReviewId) sessionStorage.setItem('rw:lastPostedReviewId', newReviewId)

      router.push(`/search?q=${encodeURIComponent(nextHandle)}`)
      router.refresh()
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to create driver and post review.'))
    } finally {
      setLoading(false)
    }
  }

  /* -------------------- styles -------------------- */

  const inputClass =
    'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder:text-gray-500 ' +
    'focus:outline-none focus:ring-2 focus:ring-black/20'

  const dropdownClass = 'absolute z-20 mt-2 w-full overflow-hidden rounded-md border border-gray-300 bg-white shadow-lg'
  const dropdownScrollClass = 'max-h-56 overflow-auto overscroll-contain'

  const itemClass = (active: boolean) =>
    [
      'w-full text-left px-3 py-2 text-sm transition',
      active ? 'bg-gray-100 text-gray-900' : 'text-gray-900 hover:bg-gray-100',
    ].join(' ')

  /* -------------------- render -------------------- */

  return (
    <form
      onSubmit={onCreateAndReview}
      className="space-y-4"
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return
        const el = e.target as Element | null
        if (el instanceof HTMLTextAreaElement) return
        if (el instanceof HTMLButtonElement && el.type === 'submit') return
        e.preventDefault()
      }}
    >
      <p className="text-gray-900">
        We couldn’t find this driver yet. Be the first to create and review <span className="font-semibold">{displayLabel}</span>.
      </p>

      <div className="text-xs text-gray-600">
        <Link href="/search" className="underline underline-offset-2 hover:text-gray-900">
          Back to search
        </Link>
      </div>

      {!handleValid && (
        <p className="text-sm text-red-600">
          This driver handle format is invalid. It must look like <strong>8841-mike</strong>.
        </p>
      )}

      <div className="space-y-3">
        {/* handle */}
        <input
          ref={handleRef}
          value={handleInput}
          onChange={(e) => {
            setHandleInput(formatHandleDisplayInput(e.target.value))
            if (error) setError(null)
          }}
          onBlur={() => {
            setHandleInput((prev) => formatHandleDisplayInput(prev.trim()))
          }}
          onKeyDown={enterNext}
          placeholder='Last 4 + first name (ex: "8841 mike")'
          className={inputClass}
          disabled={loading}
          inputMode="text"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />

        {/* state + make */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* state (required) */}
          <div ref={stateBoxRef} className="relative">
            <input
              ref={stateRef}
              value={stateInput}
              onChange={(e) => onStateChange(e.target.value)}
              onFocus={() => setStateOpen(true)}
              onKeyDown={onStateKeyDown}
              placeholder="State (required) — ex: IL"
              disabled={loading}
              className={[inputClass, loading ? 'opacity-60 cursor-not-allowed' : ''].join(' ')}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
            />

            {stateOpen && !loading && (
              <div className={dropdownClass}>
                <div
                  ref={stateListRef}
                  className={dropdownScrollClass}
                  style={{ touchAction: 'pan-y' }}
                  onPointerDown={optionPointerDown}
                  onPointerMove={optionPointerMove}
                >
                  {stateMatches.map((s, idx) => (
                    <button
                      key={s.code}
                      type="button"
                      tabIndex={-1} // ✅ FIX: keep dropdown options out of tab order
                      data-state-idx={idx}
                      onMouseEnter={() => setStateActiveIndex(idx)}
                      onMouseDown={(e) => e.preventDefault()}
                      onKeyDown={(e) => {
                        // ✅ FIX: if focus somehow lands here, Enter/Space should still select
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          e.stopPropagation()
                          pickState(s.code)
                        }
                      }}
                      onPointerDown={optionPointerDown}
                      onPointerMove={optionPointerMove}
                      onPointerUp={(e) => {
                        if (isTouchTap(e)) pickState(s.code)
                      }}
                      onClick={(e) => {
                        e.preventDefault()
                        pickState(s.code)
                      }}
                      className={itemClass(stateActiveIndex === idx)}
                    >
                      <span className="font-semibold">{s.code}</span>
                      <span className="ml-2 text-gray-600">
                        <HighlightMatch text={s.name} q={stateInput} />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!statePicked && <div className="mt-1 text-xs text-gray-600">State is required</div>}
          </div>

          {/* car make (optional) */}
          <input
            ref={carMakeRef}
            value={carMake}
            onChange={(e) => setCarMake(e.target.value)}
            onKeyDown={enterNext}
            placeholder="Car make (optional) — ex: Toyota"
            className={inputClass}
            disabled={loading}
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
      </div>

      {/* review fields */}
      <div className="space-y-4 pt-2">
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
              Your comment is too long. Please shorten it to <strong>{MAX_COMMENT_CHARS} characters or less</strong> to continue.
            </p>
          )}

          <p className="text-xs text-gray-600">Note: some language may be automatically censored. Hate speech/slurs are not allowed.</p>
        </div>
      </div>

      {error && <p className="text-red-600">{error}</p>}

      <button
        ref={submitRef}
        type="submit"
        disabled={loading || overLimit || !statePicked || !handleValid}
        className="inline-flex h-11 items-center justify-center rounded-lg bg-green-600 px-5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        title={!statePicked ? 'Select a state to continue' : !handleValid ? 'Enter a valid handle (ex: 8841-mike)' : undefined}
      >
        {loading ? 'Posting…' : 'Create driver & post review'}
      </button>

      <div className="pt-1">
        <button
          type="button"
          onClick={onCreateOnly}
          disabled={loading || !statePicked || !handleValid}
          className="text-xs text-gray-600 underline underline-offset-2 hover:text-gray-900 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          Create driver only
        </button>
      </div>
    </form>
  )
}
