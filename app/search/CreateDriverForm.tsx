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

type CitySuggestionRow = { name: string; display_name: string }
type CitySuggestion = { name: string; display_name: string }

type InsertedDriver = { id: string; driver_handle: string }

type Props = {
  initialRaw: string
  initialState?: string | null
  initialCity?: string | null
  initialCarColor?: string | null
  initialCarMake?: string | null
  initialCarModel?: string | null
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

function normalizeHandle(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-')
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

export default function CreateDriverForm({
  initialRaw,
  initialState,
  initialCity,
  initialCarColor,
  initialCarMake,
  initialCarModel,
}: Props) {
  const router = useRouter()

  /* -------------------- handle (editable) -------------------- */
  const handleRef = useRef<HTMLInputElement | null>(null)
  const [handleInput, setHandleInput] = useState(initialRaw)

  const handle = useMemo(() => normalizeHandle(handleInput), [handleInput])
  const handleValid = useMemo(() => HANDLE_RE.test(handle), [handle])

  const displayLabel = useMemo(() => displayNameFromHandle(handle), [handle])

  /* -------------------- enter-to-next refs -------------------- */
  const carColorRef = useRef<HTMLInputElement | null>(null)
  const carMakeRef = useRef<HTMLInputElement | null>(null)
  const carModelRef = useRef<HTMLInputElement | null>(null)
  const stateRef = useRef<HTMLInputElement | null>(null)
  const starsRef = useRef<HTMLSelectElement | null>(null)
  const commentRef = useRef<HTMLTextAreaElement | null>(null)
  const submitRef = useRef<HTMLButtonElement | null>(null)

  const enterNext = useEnterToNext([handleRef, carColorRef, carMakeRef, carModelRef, stateRef, starsRef, commentRef, submitRef])

  /* -------------------- driver fields -------------------- */
  const [carColor, setCarColor] = useState(initialCarColor ?? '')
  const [carMake, setCarMake] = useState(initialCarMake ?? '')
  const [carModel, setCarModel] = useState(initialCarModel ?? '')

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

  /* -------------------- city typeahead (optional) -------------------- */
  const [cityInput, setCityInput] = useState((initialCity ?? '').toString())
  const [cityNotListed, setCityNotListed] = useState(false)
  const [cityOpen, setCityOpen] = useState(false)
  const [cityLoading, setCityLoading] = useState(false)
  const [citySuggestions, setCitySuggestions] = useState<CitySuggestion[]>([])
  const [cityLimit, setCityLimit] = useState(100)
  const [cityActiveIndex, setCityActiveIndex] = useState(-1)

  const cityBoxRef = useRef<HTMLDivElement | null>(null)
  const cityInputRef = useRef<HTMLInputElement | null>(null)
  const cityListRef = useRef<HTMLDivElement | null>(null)
  const cityBannerRef = useRef<HTMLDivElement | null>(null)

  const suppressCityOpenRef = useRef(false)
  const cityFetchId = useRef(0)

  const didMountRef = useRef(false)
  useEffect(() => {
    didMountRef.current = true
    suppressCityOpenRef.current = true
    setCityOpen(false)
    setCityActiveIndex(-1)
  }, [])

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

  /* -------------------- review fields -------------------- */
  const [stars, setStars] = useState<number>(5)
  const [comment, setComment] = useState('')
  const [tags, setTags] = useState<TagRow[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set())

  /* -------------------- ui -------------------- */
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // City decision flow (only when typed city isn't in list)
  const [cityDecision, setCityDecision] = useState<null | 'enter_anyway' | 'leave_blank' | 'picked_from_list'>(
    initialCity && String(initialCity).trim() ? 'enter_anyway' : null
  )
  const [cityTouched, setCityTouched] = useState(false)
  const [submitAttempted, setSubmitAttempted] = useState(false)

  const commentCount = comment.length
  const overLimit = commentCount > MAX_COMMENT_CHARS

  const normalizedCityInput = cityInput.trim().toLowerCase()
  const cityLooksValid =
    !normalizedCityInput ||
    cityNotListed ||
    citySuggestions.some((c) => c.display_name.trim().toLowerCase() === normalizedCityInput)

  const typedCity = cityInput.trim().length > 0
  const noCityMatches =
    statePicked && cityOpen && !cityLoading && !cityNotListed && typedCity && citySuggestions.length === 0

  const showCityBanner =
    statePicked &&
    !loading &&
    !cityNotListed &&
    typedCity &&
    !cityLooksValid &&
    !cityDecision &&
    (cityTouched || submitAttempted || noCityMatches)

  function scrollActiveStateIntoView(nextIdx: number) {
    if (!stateListRef.current) return
    const el = stateListRef.current.querySelector<HTMLElement>(`[data-state-idx="${nextIdx}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }

  function scrollActiveCityIntoView(nextIdx: number) {
    if (!cityListRef.current) return
    const el = cityListRef.current.querySelector<HTMLElement>(`[data-city-idx="${nextIdx}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }

  const resetCity = useCallback(() => {
    setCityInput('')
    setCityNotListed(false)
    setCitySuggestions([])
    setCityOpen(false)
    setCityActiveIndex(-1)
    setCityLimit(100)

    setCityTouched(false)
    setSubmitAttempted(false)
    setCityDecision(null)

    suppressCityOpenRef.current = false
  }, [])

  const markCityNeedsDecision = useCallback(() => {
    if (!statePicked) return
    if (cityNotListed) return
    if (cityLoading) return

    const typed = cityInput.trim().length > 0
    if (!typed) return
    if (cityLooksValid) return
    if (cityDecision) return

    setSubmitAttempted(true)
  }, [statePicked, cityNotListed, cityLoading, cityInput, cityLooksValid, cityDecision])

  /* -------------------- outside click close (banner counts as inside) -------------------- */
  useEffect(() => {
    function onDocPointerDown(e: PointerEvent) {
      const target = e.target as Node

      if (stateBoxRef.current && !stateBoxRef.current.contains(target)) {
        setStateOpen(false)
        setStateActiveIndex(-1)
      }

      if (cityOpen) {
        const clickedInsideCity =
          (cityBoxRef.current && cityBoxRef.current.contains(target)) ||
          (cityBannerRef.current && cityBannerRef.current.contains(target))

        if (!clickedInsideCity) {
          suppressCityOpenRef.current = true
          setCityOpen(false)
          setCityActiveIndex(-1)
          markCityNeedsDecision()
        }
      }
    }

    document.addEventListener('pointerdown', onDocPointerDown)
    return () => document.removeEventListener('pointerdown', onDocPointerDown)
  }, [cityOpen, markCityNeedsDecision])

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

      resetCity()
      if (error) setError(null)
    },
    [resetCity, error]
  )

  const commitState = useCallback(
    (code: string) => {
      pickState(code)
      setTimeout(() => cityInputRef.current?.focus(), 0)
    },
    [pickState]
  )

  function onStateChange(v: string) {
    const cleaned = v.toUpperCase().replace(/[^A-Z ]/g, '')
    setStateInput(cleaned)
    setStateOpen(true)
    setStateActiveIndex(-1)

    const maybeCode = cleaned.trim().slice(0, 2)
    if (STATES.some((s) => s.code === maybeCode) && cleaned.trim().length <= 2) {
      setState(maybeCode)
      // keep city as-is while typing a valid 2-letter code
    } else {
      setState('')
      resetCity()
    }
  }

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
      if (!raw) {
        if (e.key === 'Enter') {
          e.preventDefault()
          cityInputRef.current?.focus()
        }
        return
      }

      const upper = raw.toUpperCase()

      const exactCode = STATES.find((s) => s.code === upper)
      if (exactCode) {
        e.preventDefault()
        commitState(exactCode.code)
        return
      }

      const exactName = STATES.find((s) => s.name.toUpperCase() === upper)
      if (exactName) {
        e.preventDefault()
        commitState(exactName.code)
        return
      }

      if (stateActiveIndex >= 0 && stateMatches[stateActiveIndex]) {
        e.preventDefault()
        commitState(stateMatches[stateActiveIndex].code)
        return
      }

      const best = stateMatches[0]
      if (best) {
        e.preventDefault()
        commitState(best.code)
      }
    }
  }

  /* -------------------- fetch city suggestions (RPC) -------------------- */
  useEffect(() => {
    if (!statePicked) {
      setCitySuggestions([])
      setCityOpen(false)
      setCityLoading(false)
      setCityActiveIndex(-1)
      return
    }
    if (cityNotListed) return
    if (!didMountRef.current) return

    // Don’t fetch unless user is interacting with city or has typed something
    const q = cityInput.trim()
    const shouldFetchBrowse = cityOpen && q.length === 0
    const shouldFetchSearch = q.length > 0
    if (!shouldFetchBrowse && !shouldFetchSearch) return

    // If we suppressed open and city is closed, do nothing.
    if (suppressCityOpenRef.current && !cityOpen) return

    const myId = ++cityFetchId.current

    const t = setTimeout(async () => {
      setCityLoading(true)

      const { data, error: rpcErr } = await supabase.rpc('city_suggestions', {
        p_state: state,
        p_query: shouldFetchSearch ? q : '',
        p_limit: cityLimit,
      })

      if (cityFetchId.current !== myId) return

      if (rpcErr) {
        setCitySuggestions([])
        setCityLoading(false)
        setCityActiveIndex(-1)
        return
      }

      const rows = (data ?? []) as CitySuggestionRow[]
      const seen = new Set<string>()
      const suggestions: CitySuggestion[] = []

      for (const r of rows) {
        const label = (r.display_name ?? '').trim()
        if (!label) continue
        const key = label.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        suggestions.push({ name: r.name, display_name: label })
      }

      setCitySuggestions(suggestions)
      setCityLoading(false)

      if (suppressCityOpenRef.current) {
        suppressCityOpenRef.current = false
        setCityOpen(false)
      } else {
        setCityOpen(true)
      }

      if (suggestions.length > 0) {
        setCityActiveIndex(0)
        setTimeout(() => scrollActiveCityIntoView(0), 0)
      } else {
        setCityActiveIndex(-1)
      }
    }, shouldFetchSearch ? 120 : 0)

    return () => clearTimeout(t)
  }, [statePicked, state, cityInput, cityNotListed, cityOpen, cityLimit])

  const onCityFocus = useCallback(() => {
    if (!statePicked) return
    suppressCityOpenRef.current = false
    setCityOpen(true)
  }, [statePicked])

  const onCityChange = useCallback(
    (v: string) => {
      setCityInput(v)
      setCityNotListed(false)

      setCityDecision(null)
      setSubmitAttempted(false)
      setCityTouched(false)

      suppressCityOpenRef.current = false
      if (statePicked) setCityOpen(true)
    },
    [statePicked]
  )

  const pickCitySuggestion = useCallback((s: CitySuggestion) => {
    suppressCityOpenRef.current = true
    setCityInput(s.display_name)

    setCityNotListed(false)
    setCityOpen(false)
    setCityActiveIndex(-1)

    setCityTouched(false)
    setSubmitAttempted(false)
    setCityDecision('picked_from_list')

    setError(null)
    setTimeout(() => starsRef.current?.focus(), 0)
  }, [])

  const chooseNotListed = useCallback(() => {
    suppressCityOpenRef.current = true
    setCityInput('')
    setCityNotListed(true)

    setCityOpen(false)
    setCityActiveIndex(-1)

    setCityTouched(false)
    setSubmitAttempted(false)
    setCityDecision('leave_blank')

    setTimeout(() => starsRef.current?.focus(), 0)
  }, [])

  const onCityEnterAnyway = useCallback(() => {
    suppressCityOpenRef.current = true
    setCityOpen(false)
    setCityActiveIndex(-1)

    setCityDecision('enter_anyway')
    setError(null)
    setSubmitAttempted(false)
    setCityTouched(false)

    setTimeout(() => starsRef.current?.focus(), 0)
  }, [])

  const onCityPickFromList = useCallback(() => {
    setCityDecision('picked_from_list')
    setCityTouched(false)
    setSubmitAttempted(false)

    suppressCityOpenRef.current = false
    setCityOpen(true)
    setCityActiveIndex(-1)
    setTimeout(() => cityInputRef.current?.focus(), 0)
  }, [])

  function onCityKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!statePicked || loading) return

    const hasMenu = cityOpen && !cityNotListed
    const anyResults = citySuggestions.length > 0
    const maxIdx = anyResults ? citySuggestions.length - 1 : -1

    if (!cityOpen && e.key === 'Enter') {
      e.preventDefault()
      if (cityInput.trim().length > 0 && !cityNotListed && !cityLooksValid && !cityDecision) {
        setSubmitAttempted(true)
        return
      }
      starsRef.current?.focus()
      return
    }

    if (e.key === 'Tab') {
      if (cityOpen) {
        suppressCityOpenRef.current = true
        setCityOpen(false)
        setCityActiveIndex(-1)
      }
      if (cityInput.trim().length > 0 && !cityNotListed) setCityTouched(true)
      markCityNeedsDecision()
      return
    }

    if (e.key === 'Escape') {
      if (cityOpen) {
        e.preventDefault()
        suppressCityOpenRef.current = true
        setCityOpen(false)
        setCityActiveIndex(-1)
        markCityNeedsDecision()
      }
      return
    }

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()

      if (!hasMenu) {
        suppressCityOpenRef.current = false
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
      const typed = cityInput.trim().length > 0
      const shouldEnterAnyway = typed && !cityNotListed && !cityDecision && !cityLoading && citySuggestions.length === 0

      if (shouldEnterAnyway) {
        e.preventDefault()
        onCityEnterAnyway()
        return
      }

      if (hasMenu) {
        e.preventDefault()
        if (cityLoading) return

        if (cityActiveIndex >= 0) {
          const picked = citySuggestions[cityActiveIndex]
          if (picked) pickCitySuggestion(picked)
          return
        }

        suppressCityOpenRef.current = true
        setCityOpen(false)
        setCityActiveIndex(-1)
        starsRef.current?.focus()
      }
    }
  }

  function cityGatePasses(): boolean {
    if (!statePicked) return true
    if (cityNotListed) return true

    const typed = cityInput.trim().length > 0
    if (!typed) return true

    if (cityLooksValid) return true
    if (cityDecision === 'enter_anyway') return true

    suppressCityOpenRef.current = true
    setCityOpen(false)
    setCityActiveIndex(-1)
    setCityTouched(true)
    setSubmitAttempted(true)
    return false
  }

  async function createDriver(): Promise<InsertedDriver> {
    if (!statePicked) throw new Error('Please select a state.')
    if (!handleValid) {
      throw new Error('Driver handle format is invalid. Use: last 4 digits + first name (example: 8841-mike).')
    }

    const typed = cityInput.trim()
    const cityToSave =
      cityNotListed ? null : !typed ? null : cityDecision === 'enter_anyway' ? typed : cityLooksValid ? typed : null

    const { data: inserted, error: insertErr } = await supabase
      .from('drivers')
      .insert({
        driver_handle: handle,
        display_name: displayNameFromHandle(handle),
        city: cityToSave,
        state,
        car_make: carMake.trim() || null,
        car_model: carModel.trim() || null,
        car_color: carColor.trim() || null,
      })
      .select('id, driver_handle')
      .single()

    if (insertErr) throw new Error(insertErr.message)
    return inserted as InsertedDriver
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

  const stateDropdownClass =
    'absolute z-20 mt-2 w-full overflow-hidden rounded-md border border-gray-300 bg-white shadow-lg'

  const cityDropdownClass = 'mt-2 w-full overflow-hidden rounded-md border border-gray-300 bg-white shadow-lg'
  const dropdownScrollClass = 'max-h-56 overflow-auto overscroll-contain'

  const stateItemClass = (active: boolean) =>
    ['w-full text-left px-3 py-2 text-sm transition', active ? 'bg-gray-100 text-gray-900' : 'text-gray-900 hover:bg-gray-100'].join(
      ' '
    )

  const cityItemClass = (active: boolean) =>
    ['w-full text-left px-3 py-2 text-sm transition', active ? 'bg-gray-100 text-gray-900' : 'text-gray-900 hover:bg-gray-100'].join(
      ' '
    )

  const showLoadMoreCities = citySuggestions.length > 0 && citySuggestions.length >= cityLimit && cityLimit < 2000

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
        We couldn’t find this driver yet. Be the first to create and review{' '}
        <span className="font-semibold">{displayLabel}</span>.
      </p>

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
          onChange={(e) => setHandleInput(e.target.value)}
          onKeyDown={enterNext}
          placeholder='Driver handle (ex: "8841-mike")'
          className={inputClass}
          disabled={loading}
          inputMode="text"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />

        {/* car */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            ref={carColorRef}
            value={carColor}
            onChange={(e) => setCarColor(e.target.value)}
            onKeyDown={enterNext}
            placeholder="Car color (optional) — ex: Silver"
            className={inputClass}
            disabled={loading}
          />
          <input
            ref={carMakeRef}
            value={carMake}
            onChange={(e) => setCarMake(e.target.value)}
            onKeyDown={enterNext}
            placeholder="Car make (optional) — ex: Toyota"
            className={inputClass}
            disabled={loading}
          />
          <input
            ref={carModelRef}
            value={carModel}
            onChange={(e) => setCarModel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                stateRef.current?.focus()
                setStateOpen(true)
                return
              }
              enterNext(e)
            }}
            placeholder="Car model (optional) — ex: RAV4 Hybrid"
            className={inputClass}
            disabled={loading}
          />
        </div>

        <div className="flex gap-3">
          {/* state (required) */}
          <div ref={stateBoxRef} className="relative w-40">
            <input
              ref={stateRef}
              value={stateInput}
              onChange={(e) => onStateChange(e.target.value)}
              onFocus={() => setStateOpen(true)}
              onKeyDown={onStateKeyDown}
              placeholder="State (IL)"
              disabled={loading}
              className={[inputClass, loading ? 'opacity-60 cursor-not-allowed' : ''].join(' ')}
            />

            {stateOpen && !loading && (
              <div className={stateDropdownClass}>
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
                      data-state-idx={idx}
                      onMouseEnter={() => setStateActiveIndex(idx)}
                      onMouseDown={(e) => e.preventDefault()}
                      onPointerDown={optionPointerDown}
                      onPointerMove={optionPointerMove}
                      onPointerUp={(e) => {
                        if (isTouchTap(e)) commitState(s.code)
                      }}
                      onClick={(e) => {
                        e.preventDefault()
                        commitState(s.code)
                      }}
                      className={stateItemClass(stateActiveIndex === idx)}
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

          {/* city */}
          <div ref={cityBoxRef} className="flex-1">
            <input
              ref={cityInputRef}
              value={cityInput}
              onChange={(e) => onCityChange(e.target.value)}
              onFocus={onCityFocus}
              onBlur={() => {
                if (cityInput.trim().length > 0 && !cityNotListed) setCityTouched(true)
                if (cityOpen) {
                  suppressCityOpenRef.current = true
                  setCityOpen(false)
                  setCityActiveIndex(-1)
                }
                markCityNeedsDecision()
              }}
              onKeyDown={onCityKeyDown}
              placeholder={statePicked ? 'City (optional)' : 'Pick a state first'}
              disabled={!statePicked || loading}
              className={[inputClass, !statePicked || loading ? 'opacity-60 cursor-not-allowed' : ''].join(' ')}
            />

            {statePicked && cityOpen && !loading && !cityNotListed && (
              <div className={cityDropdownClass}>
                <div
                  ref={cityListRef}
                  className={dropdownScrollClass}
                  style={{ touchAction: 'pan-y' }}
                  onPointerDown={optionPointerDown}
                  onPointerMove={optionPointerMove}
                >
                  <button
                    type="button"
                    data-city-idx={-1}
                    onMouseEnter={() => setCityActiveIndex(-1)}
                    onMouseDown={(e) => e.preventDefault()}
                    onPointerDown={optionPointerDown}
                    onPointerMove={optionPointerMove}
                    onPointerUp={(e) => {
                      if (isTouchTap(e)) chooseNotListed()
                    }}
                    onClick={(e) => {
                      e.preventDefault()
                      chooseNotListed()
                    }}
                    className={cityItemClass(cityActiveIndex === -1)}
                  >
                    City not listed <span className="ml-2 text-xs text-gray-500">(leave city blank)</span>
                  </button>

                  <div className="h-px bg-gray-200" />

                  {cityLoading ? (
                    <div className="px-3 py-2 text-sm text-gray-600">Loading…</div>
                  ) : citySuggestions.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-gray-600">
                      {cityInput.trim().length ? 'No matches. Press Enter to use it anyway.' : 'Start typing to filter.'}
                    </div>
                  ) : (
                    <>
                      {citySuggestions.map((s, idx) => (
                        <button
                          key={`${s.display_name}-${idx}`}
                          type="button"
                          data-city-idx={idx}
                          onMouseEnter={() => setCityActiveIndex(idx)}
                          onMouseDown={(e) => e.preventDefault()}
                          onPointerDown={optionPointerDown}
                          onPointerMove={optionPointerMove}
                          onPointerUp={(e) => {
                            if (isTouchTap(e)) pickCitySuggestion(s)
                          }}
                          onClick={(e) => {
                            e.preventDefault()
                            pickCitySuggestion(s)
                          }}
                          className={cityItemClass(cityActiveIndex === idx)}
                        >
                          <HighlightMatch text={s.display_name} q={cityInput} />
                        </button>
                      ))}

                      {showLoadMoreCities && (
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onPointerDown={optionPointerDown}
                          onPointerMove={optionPointerMove}
                          onPointerUp={(e) => {
                            if (isTouchTap(e)) setCityLimit((p) => Math.min(p + 200, 2000))
                          }}
                          onClick={(e) => {
                            e.preventDefault()
                            setCityLimit((p) => Math.min(p + 200, 2000))
                          }}
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

            {/* banner */}
            <div
              ref={cityBannerRef}
              className={[
                'overflow-hidden transition-all duration-200',
                showCityBanner ? 'max-h-40 opacity-100 mt-2' : 'max-h-0 opacity-0 mt-0',
              ].join(' ')}
            >
              {showCityBanner && (
                <div
                  className="rounded-md border border-yellow-300 bg-yellow-50 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                  }}
                >
                  <div className="text-sm text-yellow-900">
                    <div className="font-medium">City not found for {state}.</div>
                    <div className="opacity-80">How do you want to proceed?</div>
                  </div>

                  <div className="flex flex-wrap gap-2 sm:shrink-0">
                    <button type="button" className="px-3 py-2 rounded-md bg-black text-white text-sm" onClick={onCityEnterAnyway}>
                      Enter anyway
                    </button>

                    <button
                      type="button"
                      className="px-3 py-2 rounded-md border border-gray-300 bg-white text-sm"
                      onClick={onCityPickFromList}
                    >
                      Pick from list
                    </button>

                    <button type="button" className="px-3 py-2 rounded-md border border-gray-300 bg-white text-sm" onClick={chooseNotListed}>
                      Leave blank
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
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
                overLimit ? 'border-red-500 ring-1 ring-red-500 focus:ring-2 focus:ring-red-500' : 'border-gray-300 focus:ring-2 focus:ring-black/20',
                loading ? 'opacity-60 cursor-not-allowed' : '',
              ].join(' ')}
            />

            <div className={['absolute bottom-2 right-3 text-xs tabular-nums', overLimit ? 'text-red-600' : 'text-gray-600'].join(' ')}>
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
