'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useEnterToNext } from '@/lib/useEnterToNext'

type CitySuggestionRow = { name: string; display_name: string }
type CitySuggestion = { name: string; display_name: string }

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
      <span className="font-semibold underline underline-offset-2">
        {text.slice(idx, idx + query.length)}
      </span>
      {text.slice(idx + query.length)}
    </>
  )
}

export default function SearchForm({
  initialQuery = '',
  initialState = '',
  initialCity = '',
  initialCarColor = '',
  initialCarMake = '',
  initialCarModel = '',
}: {
  initialQuery?: string
  initialState?: string
  initialCity?: string
  initialCarColor?: string
  initialCarMake?: string
  initialCarModel?: string
}) {
  /* -------------------- Enter-to-next refs -------------------- */
  const qRef = useRef<HTMLInputElement>(null)
  const stateRef = useRef<HTMLInputElement>(null)
  const cityRef = useRef<HTMLInputElement>(null)
  const colorRef = useRef<HTMLInputElement>(null)
  const makeRef = useRef<HTMLInputElement>(null)
  const modelRef = useRef<HTMLInputElement>(null)
  const submitRef = useRef<HTMLButtonElement>(null)

  // one handler used across inputs
  const enterNext = useEnterToNext([qRef, stateRef, cityRef, colorRef, makeRef, modelRef, submitRef])

  /* -------------------- form state -------------------- */
  const [value, setValue] = useState(initialQuery)

  const [carColor, setCarColor] = useState(initialCarColor)
  const [carMake, setCarMake] = useState(initialCarMake)
  const [carModel, setCarModel] = useState(initialCarModel)

  /* -------------------- State dropdown -------------------- */
  const [stateInput, setStateInput] = useState((initialState || '').toUpperCase())
  const [state, setState] = useState((initialState || '').toUpperCase())
  const [stateOpen, setStateOpen] = useState(false)
  const [stateActiveIndex, setStateActiveIndex] = useState(-1)

  const stateBoxRef = useRef<HTMLDivElement | null>(null)
  const stateListRef = useRef<HTMLDivElement | null>(null)

  const stateMatches = useMemo(() => bestStateMatches(stateInput, 60), [stateInput])
  const statePicked = state.trim().length === 2

  /* -------------------- City dropdown -------------------- */
  const [cityInput, setCityInput] = useState(initialCity || '')
  const [cityOpen, setCityOpen] = useState(false)
  const [cityLoading, setCityLoading] = useState(false)
  const [citySuggestions, setCitySuggestions] = useState<CitySuggestion[]>([])
  const [cityLimit, setCityLimit] = useState(80)
  const [cityActiveIndex, setCityActiveIndex] = useState(-1)

  const cityBoxRef = useRef<HTMLDivElement | null>(null)
  const cityListRef = useRef<HTMLDivElement | null>(null)
  const cityFetchId = useRef(0)

  /* -------------------- mobile tap vs scroll guard -------------------- */
  const touchStartYRef = useRef(0)
  const touchMovedRef = useRef(false)

  function optionPointerDown(e: React.PointerEvent) {
    if (e.pointerType === 'touch') {
      touchStartYRef.current = e.clientY
      touchMovedRef.current = false
    }
  }

  function optionPointerMove(e: React.PointerEvent) {
    if (e.pointerType !== 'touch') return
    if (Math.abs(e.clientY - touchStartYRef.current) > 8) touchMovedRef.current = true
  }

  function isTouchTap(e: React.PointerEvent) {
    return e.pointerType === 'touch' && !touchMovedRef.current
  }

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

  function resetCity() {
    setCityInput('')
    setCityOpen(false)
    setCitySuggestions([])
    setCityActiveIndex(-1)
  }

  function pickState(code: string) {
    const up = code.toUpperCase().trim()
    if (!STATES.some((s) => s.code === up)) return

    setState(up)
    setStateInput(up)
    setStateOpen(false)
    setStateActiveIndex(-1)

    resetCity()

    // move user to City right after picking a state
    setTimeout(() => {
      cityRef.current?.focus()
      setCityOpen(true)
    }, 0)
  }

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
      resetCity()
    }
  }

  function onStateKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
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

    if (e.key === 'Enter') {
      const raw = stateInput.trim()
      if (!raw) return

      const upper = raw.toUpperCase()
      const exactCode = STATES.find((s) => s.code === upper)
      if (exactCode) {
        e.preventDefault()
        pickState(exactCode.code)
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

  /* -------------------- fetch city suggestions -------------------- */
  useEffect(() => {
    if (!statePicked) {
      setCitySuggestions([])
      setCityOpen(false)
      setCityLoading(false)
      setCityActiveIndex(-1)
      return
    }

    if (!cityOpen) return

    const q = cityInput.trim()
    const shouldFetchBrowse = q.length === 0
    const shouldFetchSearch = q.length > 0
    if (!shouldFetchBrowse && !shouldFetchSearch) return

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

      if (suggestions.length > 0) {
        setCityActiveIndex(0)
        setTimeout(() => scrollActiveCityIntoView(0), 0)
      } else {
        setCityActiveIndex(-1)
      }
    }, q.length > 0 ? 120 : 0)

    return () => clearTimeout(t)
  }, [statePicked, state, cityOpen, cityInput, cityLimit])

  function pickCitySuggestion(s: CitySuggestion) {
    setCityInput(s.display_name)
    setCityOpen(false)
    setCityActiveIndex(-1)

    // move to next field after picking a city
    setTimeout(() => colorRef.current?.focus(), 0)
  }

  function onCityKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!statePicked) return

    if (e.key === 'Escape') {
      if (cityOpen) {
        e.preventDefault()
        setCityOpen(false)
        setCityActiveIndex(-1)
      }
      return
    }

    // if dropdown closed, Enter should just go next
    if (!cityOpen) {
      if (e.key === 'Enter') enterNext(e)
      return
    }

    const maxIdx = citySuggestions.length - 1

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
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
      if (cityActiveIndex >= 0 && citySuggestions[cityActiveIndex]) {
        e.preventDefault()
        pickCitySuggestion(citySuggestions[cityActiveIndex])
        return
      }
      // no suggestion selected -> go next
      enterNext(e)
    }
  }

  /* -------------------- close dropdowns on outside click -------------------- */
  useEffect(() => {
    function onDocPointerDown(e: PointerEvent) {
      const target = e.target as Node

      if (stateBoxRef.current && !stateBoxRef.current.contains(target)) {
        setStateOpen(false)
        setStateActiveIndex(-1)
      }

      if (cityOpen) {
        const clickedInsideCity = cityBoxRef.current && cityBoxRef.current.contains(target)
        if (!clickedInsideCity) {
          setCityOpen(false)
          setCityActiveIndex(-1)
        }
      }
    }

    document.addEventListener('pointerdown', onDocPointerDown)
    return () => document.removeEventListener('pointerdown', onDocPointerDown)
  }, [cityOpen])

  /* -------------------- styles -------------------- */
  const inputClass =
    'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder:text-gray-500 ' +
    'focus:outline-none focus:ring-2 focus:ring-black/20'

  const dropdownClass =
    'absolute z-20 mt-2 w-full overflow-hidden rounded-md border border-gray-300 bg-white shadow-lg'

  const dropdownScrollClass = 'max-h-56 overflow-auto overscroll-contain'

  const itemClass = (active: boolean) =>
    [
      'w-full text-left px-3 py-2 text-sm transition',
      active ? 'bg-gray-100 text-gray-900' : 'text-gray-900 hover:bg-gray-100',
    ].join(' ')

  const showLoadMoreCities =
    citySuggestions.length > 0 && citySuggestions.length >= cityLimit && cityLimit < 2000

  /* -------------------- render -------------------- */
  return (
    <form
      action="/search"
      method="get"
      className="mt-6 w-full max-w-xl space-y-3"
      // global safety: prevents Enter from submitting early
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return
        const el = e.target as Element | null
        if (el instanceof HTMLTextAreaElement) return
        if (el instanceof HTMLButtonElement && el.type === 'submit') return
        e.preventDefault()
      }}
    >
      {/* Main handle input */}
      <input
        ref={qRef}
        name="q"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={enterNext}
        placeholder="Last 4 of license plate + First name (ex: 8841-john)"
        className="w-full rounded-md border border-gray-1000 bg-[#242a33] px-4 py-3 text-white placeholder:text-white/70"
      />

      <p className="text-sm text-gray-700">
        <span className="font-semibold">Recommended:</span> Searches are most precise with{' '}
        <span className="font-semibold">plate + name</span>. Adding city and car details helps people pick the right
        driver.
      </p>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {/* State (optional) */}
        <div ref={stateBoxRef} className="relative">
          <input
            ref={stateRef}
            name="state"
            value={stateInput}
            onChange={(e) => onStateChange(e.target.value)}
            onFocus={() => setStateOpen(true)}
            onKeyDown={onStateKeyDown}
            placeholder="State (optional) — ex: IL"
            className={inputClass}
          />

          {stateOpen && (
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
                    data-state-idx={idx}
                    onMouseEnter={() => setStateActiveIndex(idx)}
                    onMouseDown={(e) => e.preventDefault()}
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
        </div>

        {/* City (optional) */}
        <div ref={cityBoxRef} className="relative">
          <input
            ref={cityRef}
            name="city"
            value={cityInput}
            onChange={(e) => {
              setCityInput(e.target.value)
              if (statePicked) setCityOpen(true)
            }}
            onFocus={() => {
              if (statePicked) setCityOpen(true)
            }}
            onKeyDown={onCityKeyDown}
            placeholder={statePicked ? 'City (optional) — ex: Chicago' : 'City (optional) — pick a state first'}
            disabled={!statePicked}
            className={[inputClass, !statePicked ? 'opacity-60 cursor-not-allowed' : ''].join(' ')}
          />

          {statePicked && cityOpen && (
            <div className={dropdownClass}>
              <div
                ref={cityListRef}
                className={dropdownScrollClass}
                style={{ touchAction: 'pan-y' }}
                onPointerDown={optionPointerDown}
                onPointerMove={optionPointerMove}
              >
                {cityLoading ? (
                  <div className="px-3 py-2 text-sm text-gray-600">Loading…</div>
                ) : citySuggestions.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-gray-600">
                    {cityInput.trim().length ? 'No matches.' : 'Start typing to filter.'}
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
                        className={itemClass(cityActiveIndex === idx)}
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
        </div>

        <input
          ref={colorRef}
          name="car_color"
          value={carColor}
          onChange={(e) => setCarColor(e.target.value)}
          onKeyDown={enterNext}
          placeholder="Car color (optional) — ex: Silver"
          className={inputClass}
        />

        <input
          ref={makeRef}
          name="car_make"
          value={carMake}
          onChange={(e) => setCarMake(e.target.value)}
          onKeyDown={enterNext}
          placeholder="Car make (optional) — ex: Toyota"
          className={inputClass}
        />

        <input
          ref={modelRef}
          name="car_model"
          value={carModel}
          onChange={(e) => setCarModel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submitRef.current?.focus()
              return
            }
            enterNext(e)
          }}
          placeholder="Car model (optional) — ex: RAV4 Hybrid"
          className={inputClass}
        />

        <div className="hidden md:block" />
      </div>

      <button
        ref={submitRef}
        type="submit"
        className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-green-600 px-5 text-sm font-semibold text-black hover:opacity-90 transition"
      >
        Search
      </button>
    </form>
  )
}
