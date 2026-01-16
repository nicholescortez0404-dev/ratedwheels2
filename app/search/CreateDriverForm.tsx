'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

type TagRow = {
  id: string
  label: string
  slug: string
  category: 'positive' | 'neutral' | 'negative' | string
  is_active?: boolean
}

type CitySuggestionRow = { name: string }

const MAX_COMMENT_CHARS = 500

// DB constraint: ^[a-z0-9]{1,4}-[a-z]{2,24}$
const HANDLE_RE = /^[a-z0-9]{1,4}-[a-z]{2,24}$/

function normalizeHandle(raw: string) {
  return raw.trim().toLowerCase().replace(/\s+/g, '-')
}

function normalizeCityLabel(name: string) {
  return name.trim().replace(/\s+(city|town|village|borough|cdp)$/i, '')
}

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

function bestStateMatches(qRaw: string, limit = 8) {
  const q = qRaw.trim().toLowerCase()
  if (!q) return STATES.slice(0, limit)

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

type InsertedDriver = { id: string; driver_handle: string }

export default function CreateDriverForm({ initialRaw }: { initialRaw: string }) {
  const router = useRouter()
  const handle = normalizeHandle(initialRaw)
  const handleValid = HANDLE_RE.test(handle)

  // driver fields
  const [displayName, setDisplayName] = useState(initialRaw.trim())

  // State typeahead (required)
  const [stateInput, setStateInput] = useState('')
  const [state, setState] = useState('')
  const [stateOpen, setStateOpen] = useState(false)
  const stateBoxRef = useRef<HTMLDivElement | null>(null)

  // City typeahead (optional)
  const [cityInput, setCityInput] = useState('')
  const [cityValue, setCityValue] = useState<string | null>(null)
  const [cityNotListed, setCityNotListed] = useState(false)
  const [cityOpen, setCityOpen] = useState(false)
  const [cityLoading, setCityLoading] = useState(false)
  const [citySuggestions, setCitySuggestions] = useState<string[]>([])
  const [cityLimit, setCityLimit] = useState<number>(50)
  const cityBoxRef = useRef<HTMLDivElement | null>(null)
  const cityInputRef = useRef<HTMLInputElement | null>(null)
  const cityListRef = useRef<HTMLDivElement | null>(null)
  const cityFetchId = useRef(0)
  const [cityActiveIndex, setCityActiveIndex] = useState<number>(-1)

  // review fields
  const [stars, setStars] = useState<number>(5)
  const [comment, setComment] = useState<string>('')
  const [tags, setTags] = useState<TagRow[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set())

  // ui
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ---- City issue flow (push-down UI) ----
  type CityIssue = null | { type: 'not_found' }
  const [cityIssue, setCityIssue] = useState<CityIssue>(null)
  const [cityDecision, setCityDecision] = useState<null | 'enter_anyway' | 'leave_blank' | 'picked_from_list'>(null)
  const [cityTouched, setCityTouched] = useState(false)
  const [submitAttempted, setSubmitAttempted] = useState(false)

  const commentCount = comment.length
  const overLimit = commentCount > MAX_COMMENT_CHARS

  const statePicked = state.trim().length === 2
  const stateMatches = useMemo(() => bestStateMatches(stateInput, 8), [stateInput])

  const normalizedCityInput = cityInput.trim().toLowerCase()
  const cityLooksValid =
    !normalizedCityInput ||
    cityNotListed ||
    citySuggestions.some((c) => c.trim().toLowerCase() === normalizedCityInput)

  const isBrowsingCities = statePicked && !cityNotListed && cityOpen && cityInput.trim().length === 0

  // Banner appears ONLY when dropdown is closed and city is invalid, after blur/tab/click-away/submit attempt
  const showCityBanner =
    statePicked &&
    !loading &&
    !cityNotListed &&
    normalizedCityInput.length > 0 &&
    !cityLooksValid &&
    !cityOpen &&
    (cityTouched || submitAttempted) &&
    !cityDecision

  function resetCity() {
    setCityInput('')
    setCityValue(null)
    setCityNotListed(false)
    setCitySuggestions([])
    setCityOpen(false)
    setCityActiveIndex(-1)
    setCityLimit(50)

    setCityTouched(false)
    setSubmitAttempted(false)
    setCityIssue(null)
    setCityDecision(null)
  }

  function markCityNeedsDecision() {
    // only if there’s typed invalid city and they haven’t decided yet
    if (!statePicked) return
    if (cityNotListed) return
    const typed = cityInput.trim().length > 0
    if (!typed) return
    if (cityLooksValid) return
    if (cityDecision) return

    setCityIssue({ type: 'not_found' })
    setSubmitAttempted(true)
  }

  // Close dropdowns on outside click
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node
      if (stateBoxRef.current && !stateBoxRef.current.contains(target)) setStateOpen(false)

      if (cityBoxRef.current && !cityBoxRef.current.contains(target)) {
        if (cityOpen) {
          setCityOpen(false)
          setCityActiveIndex(-1)
          // if they click away with invalid city, show banner
          markCityNeedsDecision()
        }
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityOpen, statePicked, cityInput, cityNotListed, cityLooksValid, cityDecision])

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
    const byCat: Record<string, TagRow[]> = { negative: [], neutral: [], positive: [] }
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

  function pickState(code: string) {
    const up = code.toUpperCase().trim()
    const match = STATES.find((s) => s.code === up)
    if (!match) return

    setState(up)
    setStateInput(up)
    setStateOpen(false)

    resetCity()
    if (error) setError(null)
  }

  function commitState(code: string) {
    pickState(code)
    setTimeout(() => {
      cityInputRef.current?.focus()
      setCityOpen(true)
    }, 0)
  }

  function onStateChange(v: string) {
    const cleaned = v.toUpperCase().replace(/[^A-Z ]/g, '')
    setStateInput(cleaned)
    setStateOpen(true)

    const maybeCode = cleaned.trim().slice(0, 2)
    if (STATES.some((s) => s.code === maybeCode) && cleaned.trim().length <= 2) {
      setState(maybeCode)
    } else {
      setState('')
      resetCity()
    }
  }

  // Fetch city suggestions
  useEffect(() => {
    if (!statePicked) {
      setCitySuggestions([])
      setCityOpen(false)
      setCityLoading(false)
      setCityActiveIndex(-1)
      return
    }
    if (cityNotListed) return

    const q = cityInput.trim()
    const shouldFetchBrowse = cityOpen && q.length === 0
    const shouldFetchSearch = q.length > 0
    if (!shouldFetchBrowse && !shouldFetchSearch) return

    const myId = ++cityFetchId.current
    const t = setTimeout(async () => {
      setCityLoading(true)

      const { data, error } = await supabase.rpc('city_suggestions', {
        p_state: state,
        p_query: shouldFetchSearch ? q : '',
        p_limit: shouldFetchSearch ? 10 : cityLimit,
      })

      if (cityFetchId.current !== myId) return

      if (error) {
        setCitySuggestions([])
        setCityLoading(false)
        setCityActiveIndex(-1)
        return
      }

      const rows = (data ?? []) as CitySuggestionRow[]
      const names = rows.map((r) => normalizeCityLabel(r.name)).filter(Boolean)
      const uniq = Array.from(new Set(names))
      setCitySuggestions(uniq)
      setCityLoading(false)
      setCityOpen(true)
      setCityActiveIndex(-1)
    }, shouldFetchSearch ? 150 : 0)

    return () => clearTimeout(t)
  }, [statePicked, state, cityInput, cityNotListed, cityOpen, cityLimit])

  useEffect(() => {
    if (cityOpen && statePicked && !loading) setCityActiveIndex(-1)
  }, [cityOpen, statePicked, loading])

  // Update issue state (banner still depends on blur/submit attempt)
  useEffect(() => {
    if (!statePicked) return
    const typed = cityInput.trim().length > 0 && !cityNotListed
    if (!typed) {
      setCityIssue(null)
      setCityDecision(null)
      return
    }
    if (cityLooksValid) {
      setCityIssue(null)
      setCityDecision(null)
      return
    }
    setCityIssue({ type: 'not_found' })
  }, [statePicked, cityInput, cityNotListed, cityLooksValid])

  function onCityFocus() {
    if (!statePicked) return
    setCityOpen(true)
  }

  function onCityChange(v: string) {
    setCityInput(v)
    setCityValue(v.trim() ? v : null)
    setCityNotListed(false)

    // typing again resets decision and banner triggers
    setCityIssue(null)
    setCityDecision(null)
    setSubmitAttempted(false)
    setCityTouched(false)

    if (statePicked) setCityOpen(true)
  }

  function pickCitySuggestion(name: string) {
    setCityInput(name)
    setCityValue(name)
    setCityNotListed(false)
    setCityOpen(false)
    setCityActiveIndex(-1)

    setCityTouched(false)
    setSubmitAttempted(false)
    setCityIssue(null)
    setCityDecision(null)
  }

  function chooseNotListed() {
    setCityInput('')
    setCityValue(null)
    setCityNotListed(true)
    setCityOpen(false)
    setCityActiveIndex(-1)

    setCityTouched(false)
    setSubmitAttempted(false)
    setCityIssue(null)
    setCityDecision('leave_blank')
  }

  function scrollActiveCityIntoView(nextIdx: number) {
    if (!cityListRef.current) return
    const el = cityListRef.current.querySelector<HTMLElement>(`[data-city-idx="${nextIdx}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }

  // Banner actions
  function onCityEnterAnyway() {
    setCityDecision('enter_anyway')
    setCityIssue(null)
    setError(null)
    setSubmitAttempted(false)
    setCityTouched(false)
  }

  function onCityPickFromList() {
    setCityDecision('picked_from_list') // collapses banner
    setCityIssue(null)
    setCityTouched(false)
    setSubmitAttempted(false)
    setCityOpen(true)
    setTimeout(() => cityInputRef.current?.focus(), 0)
  }

  function onCityLeaveBlank() {
    chooseNotListed()
  }

  function onCityKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!statePicked || loading) return

    const hasMenu = cityOpen && !cityNotListed
    const anyResults = citySuggestions.length > 0
    const maxIdx = anyResults ? citySuggestions.length - 1 : -1

    // TAB: close menu and trigger banner if invalid (don’t prevent default so focus moves)
    if (e.key === 'Tab') {
      if (cityOpen) {
        setCityOpen(false)
        setCityActiveIndex(-1)
      }
      // treat tabbing out as "touched"
      if (cityInput.trim().length > 0 && !cityNotListed) setCityTouched(true)
      // if invalid, show banner
      markCityNeedsDecision()
      return
    }

    if (e.key === 'Escape') {
      if (cityOpen) {
        e.preventDefault()
        setCityOpen(false)
        setCityActiveIndex(-1)
        // if invalid, show banner
        markCityNeedsDecision()
      }
      return
    }

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!hasMenu) {
        setCityOpen(true)
        setCityActiveIndex(-1)
        return
      }

      setCityActiveIndex((prev) => {
        let next = prev
        if (e.key === 'ArrowDown') next = prev < maxIdx ? prev + 1 : -1
        else next = prev === -1 ? maxIdx : prev - 1
        setTimeout(() => scrollActiveCityIntoView(next), 0)
        return next
      })
      return
    }

    if (e.key === 'Enter') {
      // If menu is open:
      // - Enter selects highlighted city if one is highlighted
      // - Otherwise Enter behaves like "Enter anyway" (your request)
      if (hasMenu) {
        e.preventDefault()
        if (cityLoading) return

        if (cityActiveIndex >= 0) {
          const picked = citySuggestions[cityActiveIndex]
          if (picked) pickCitySuggestion(picked)
          return
        }

        // nothing highlighted → treat as "Enter anyway" if invalid
        setCityOpen(false)
        setCityActiveIndex(-1)

        if (cityInput.trim().length > 0 && !cityLooksValid) {
          onCityEnterAnyway()
        }
        return
      }

      // If menu is closed, allow normal form submit behavior
      return
    }
  }

  async function createDriver(): Promise<InsertedDriver> {
    if (!statePicked) throw new Error('Please select a state.')

    if (!handleValid) {
      throw new Error(
        'Driver handle format is invalid. It must look like "8841-mike" (1–4 letters/numbers, dash, 2–24 letters).'
      )
    }

    const typed = cityInput.trim()
    const allowAny = cityDecision === 'enter_anyway'

    const cityToSave = cityNotListed
      ? null
      : !typed
        ? null
        : allowAny
          ? typed
          : cityLooksValid
            ? (cityValue?.trim() || typed)
            : null

    const { data: inserted, error: insertErr } = await supabase
      .from('drivers')
      .insert({
        driver_handle: handle,
        display_name: displayName.trim() || handle,
        city: cityToSave,
        state,
      })
      .select('id, driver_handle')
      .single()

    if (insertErr) throw new Error(insertErr.message)
    return inserted as InsertedDriver
  }

  function cityGatePasses(): boolean {
    if (!statePicked) return true
    if (cityNotListed) return true

    const typed = cityInput.trim().length > 0
    if (!typed) return true

    if (cityLooksValid) return true
    if (cityDecision === 'enter_anyway') return true

    // block submit and show banner
    setCityOpen(false)
    setCityActiveIndex(-1)
    setCityTouched(true)
    setSubmitAttempted(true)
    setCityIssue({ type: 'not_found' })
    return false
  }

  async function onCreateOnly() {
    if (loading) return
    if (!cityGatePasses()) return

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

    if (!cityGatePasses()) return

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

      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json?.error || 'Driver created, but review failed to post.')
        setLoading(false)
        return
      }

      const newReviewId = json?.review?.id as string | undefined
      if (newReviewId) sessionStorage.setItem('rw:lastPostedReviewId', newReviewId)

      router.push(`/search?q=${encodeURIComponent(nextHandle)}`)
      router.refresh()
    } catch (err: any) {
      setError(err?.message || 'Failed to create driver and post review.')
    } finally {
      setLoading(false)
    }
  }

  const disablePrimary = loading || overLimit || !statePicked || !handleValid
  const disableCreateOnly = loading || !statePicked || !handleValid

  const inputClass =
    'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder:text-gray-500 ' +
    'focus:outline-none focus:ring-2 focus:ring-black/20'

  // STATE dropdown floats
  const stateDropdownClass =
    'absolute z-20 mt-2 w-full overflow-hidden rounded-md border border-gray-300 bg-white shadow-lg'

  // CITY dropdown pushes down
  const cityDropdownClass =
    'mt-2 w-full overflow-hidden rounded-md border border-gray-300 bg-white shadow-lg'

  const dropdownScrollClass = 'max-h-56 overflow-auto'

  const cityItemClass = (active: boolean) =>
    [
      'w-full text-left px-3 py-2 text-sm transition',
      active ? 'bg-gray-100 text-gray-900' : 'text-gray-900 hover:bg-gray-100',
    ].join(' ')

  return (
    <form onSubmit={onCreateAndReview} className="space-y-4">
      <p className="text-gray-900">
        We couldn’t find this driver yet. Be the first to create and review{' '}
        <span className="font-semibold">@{handle}</span>.
      </p>

      {!handleValid && (
        <p className="text-sm text-red-600">
          This driver handle format is invalid. It must look like <strong>8841-mike</strong> (1–4
          letters/numbers, a dash, then 2–24 letters).
        </p>
      )}

      <div className="space-y-3">
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Display name (ex: Tom (4839))"
          className={inputClass}
          disabled={loading}
        />

        <div className="flex gap-3">
          {/* STATE */}
          <div ref={stateBoxRef} className="relative w-40">
            <input
              value={stateInput}
              onChange={(e) => onStateChange(e.target.value)}
              onFocus={() => setStateOpen(true)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== 'Tab') return
                const code = stateInput.trim().toUpperCase().slice(0, 2)
                const isValid = STATES.some((s) => s.code === code)
                if (isValid && stateInput.trim().length <= 2) {
                  e.preventDefault()
                  commitState(code)
                }
              }}
              placeholder="State (IL)"
              disabled={loading}
              className={[inputClass, loading ? 'opacity-60 cursor-not-allowed' : ''].join(' ')}
            />

            {stateOpen && !loading && (
              <div className={stateDropdownClass}>
                <div className={dropdownScrollClass}>
                  {stateMatches.map((s) => (
                    <button
                      key={s.code}
                      type="button"
                      onClick={() => commitState(s.code)}
                      className="w-full text-left px-3 py-2 text-sm text-gray-900 hover:bg-gray-100"
                    >
                      <span className="font-semibold">{s.code}</span>
                      <span className="ml-2 text-gray-600">{s.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!statePicked && <div className="mt-1 text-xs text-gray-600">State is required</div>}
          </div>

          {/* CITY */}
          <div ref={cityBoxRef} className="flex-1">
            <input
              ref={cityInputRef}
              value={cityInput}
              onChange={(e) => onCityChange(e.target.value)}
              onFocus={onCityFocus}
              onBlur={() => {
                if (cityInput.trim().length > 0 && !cityNotListed) setCityTouched(true)
                // close menu on blur
                if (cityOpen) {
                  setCityOpen(false)
                  setCityActiveIndex(-1)
                }
                // if invalid, show banner
                markCityNeedsDecision()
              }}
              onKeyDown={onCityKeyDown}
              placeholder={statePicked ? 'City (optional)' : 'Pick a state first'}
              disabled={!statePicked || loading}
              className={[
                inputClass,
                !statePicked || loading ? 'opacity-60 cursor-not-allowed' : '',
              ].join(' ')}
            />

            {statePicked && cityOpen && !loading && !cityNotListed && (
              <div className={cityDropdownClass}>
                <div ref={cityListRef} className={dropdownScrollClass}>
                  <button
                    type="button"
                    data-city-idx={-1}
                    onMouseEnter={() => setCityActiveIndex(-1)}
                    onClick={chooseNotListed}
                    className={cityItemClass(cityActiveIndex === -1)}
                  >
                    City not listed
                    <span className="ml-2 text-xs text-gray-500">(leave city blank)</span>
                  </button>

                  <div className="h-px bg-gray-200" />

                  {cityLoading ? (
                    <div className="px-3 py-2 text-sm text-gray-600">Loading…</div>
                  ) : citySuggestions.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-gray-600">
                      {cityInput.trim().length ? 'No matches. Press Enter to use it anyway.' : 'No cities loaded yet.'}
                    </div>
                  ) : (
                    <>
                      {citySuggestions.map((name, idx) => (
                        <button
                          key={name}
                          type="button"
                          data-city-idx={idx}
                          onMouseEnter={() => setCityActiveIndex(idx)}
                          onClick={() => pickCitySuggestion(name)}
                          className={cityItemClass(cityActiveIndex === idx)}
                        >
                          {name}
                        </button>
                      ))}

                      {isBrowsingCities && (
                        <button
                          type="button"
                          onClick={() => setCityLimit((p) => Math.min(p + 100, 2000))}
                          className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                          Load more cities…
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {statePicked && cityNotListed && (
              <div className="mt-1 text-xs text-gray-600">
                City will be left blank.
                <button
                  type="button"
                  className="ml-2 underline underline-offset-2 hover:text-gray-900"
                  onClick={() => {
                    setCityNotListed(false)
                    setCityOpen(true)
                    setCityTouched(false)
                    setSubmitAttempted(false)
                    setCityIssue(null)
                    setCityDecision(null)
                    setTimeout(() => cityInputRef.current?.focus(), 0)
                  }}
                >
                  Add a city instead
                </button>
              </div>
            )}

            {statePicked && cityOpen && !loading && !cityNotListed && (
              <div className="mt-1 text-[11px] text-gray-500">
                {cityInput.trim().length === 0
                  ? 'Browse the list or start typing to filter.'
                  : 'Tip: use ↑ ↓ then Enter to select. Esc to close. Enter (no highlight) = use typed city anyway.'}
              </div>
            )}
          </div>
        </div>

        {/* PUSH-DOWN BANNER */}
        <div
          className={[
            'overflow-hidden transition-all duration-200',
            showCityBanner ? 'max-h-40 opacity-100 mt-2' : 'max-h-0 opacity-0 mt-0',
          ].join(' ')}
        >
          {showCityBanner && (
            <div className="rounded-md border border-yellow-300 bg-yellow-50 p-3 flex items-center justify-between gap-3">
              <div className="text-sm text-yellow-900">
                <div className="font-medium">City not found for {state}.</div>
                <div className="opacity-80">How do you want to proceed?</div>
              </div>

              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  className="px-3 py-2 rounded-md bg-black text-white text-sm"
                  onClick={onCityEnterAnyway}
                >
                  Enter anyway
                </button>

                <button
                  type="button"
                  className="px-3 py-2 rounded-md border border-gray-300 bg-white text-sm"
                  onClick={onCityPickFromList}
                >
                  Pick from list
                </button>

                <button
                  type="button"
                  className="px-3 py-2 rounded-md border border-gray-300 bg-white text-sm"
                  onClick={onCityLeaveBlank}
                >
                  Leave blank
                </button>
              </div>
            </div>
          )}
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
                if (v.length <= MAX_COMMENT_CHARS && error?.includes('shorten your comment')) setError(null)
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
        title={
          !statePicked
            ? 'Pick a state to continue'
            : !handleValid
              ? 'Driver handle format invalid'
              : overLimit
                ? `Shorten comment to ${MAX_COMMENT_CHARS} chars to submit`
                : undefined
        }
      >
        {loading ? 'Posting…' : 'Create driver & post review'}
      </button>

      <div className="pt-1">
        <button
          type="button"
          onClick={onCreateOnly}
          disabled={disableCreateOnly}
          className="text-xs text-gray-600 underline underline-offset-2 hover:text-gray-900 disabled:opacity-60 disabled:cursor-not-allowed"
          title={!statePicked ? 'Pick a state to continue' : !handleValid ? 'Driver handle format invalid' : undefined}
        >
          Create driver only
        </button>
      </div>
    </form>
  )
}
