'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useEnterToNext } from '@/lib/useEnterToNext'

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

// DB constraint: ^[a-z0-9]{1,4}-[a-z]{2,24}$
const HANDLE_RE = /^[a-z0-9]{1,4}-[a-z]{2,24}$/
const PLATE_LEADING_RE = /^(\d{4})(?:-([a-z]{1,24}))?$/

function normalizeQueryToHandle(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-')
}

function formatQueryInputDisplay(nextRaw: string) {
  let v = nextRaw.replace(/\s+/g, ' ')
  v = v.replace(/^(\d{4})([A-Za-z])/, '$1 $2')
  v = v.replace(/^(\d{4})[-_]+/, '$1 ')
  return v
}

function parsePlateLeading(norm: string) {
  const m = norm.match(PLATE_LEADING_RE)
  if (!m) return null
  return { plate: m[1], namePrefix: (m[2] ?? '').trim() }
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

export default function SearchForm({
  initialQuery = '',
  initialState = '',
  initialCarMake = '',
}: {
  initialQuery?: string
  initialState?: string
  initialCarMake?: string
}) {
  const router = useRouter()

  /* -------------------- refs -------------------- */
  const qRef = useRef<HTMLInputElement>(null)
  const stateRef = useRef<HTMLInputElement>(null)
  const makeRef = useRef<HTMLInputElement>(null)
  const submitRef = useRef<HTMLButtonElement>(null)

  const enterNext = useEnterToNext([qRef, stateRef, makeRef, submitRef])

  /* -------------------- form state -------------------- */
  const [qInput, setQInput] = useState(() => formatQueryInputDisplay(initialQuery))
  const [carMake, setCarMake] = useState(initialCarMake)

  const [helper, setHelper] = useState<string | null>(null)
  const [shakeKey, setShakeKey] = useState(0)

  const normQ = useMemo(() => normalizeQueryToHandle(qInput), [qInput])
  const isExactHandle = useMemo(() => HANDLE_RE.test(normQ), [normQ])
  const plateParsed = useMemo(() => parsePlateLeading(normQ), [normQ])

  /* -------------------- state dropdown -------------------- */
  const [stateInput, setStateInput] = useState((initialState || '').toUpperCase())
  const [state, setState] = useState((initialState || '').toUpperCase())
  const [stateOpen, setStateOpen] = useState(false)
  const [stateActiveIndex, setStateActiveIndex] = useState(-1)

  const stateBoxRef = useRef<HTMLDivElement | null>(null)
  const stateListRef = useRef<HTMLDivElement | null>(null)

  const stateMatches = useMemo(() => bestStateMatches(stateInput, 60), [stateInput])

  const hasDisambiguatorsLive = useMemo(() => Boolean(state.trim() || carMake.trim()), [state, carMake])

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

  const isTouchTap = useCallback((e: React.PointerEvent) => {
    return e.pointerType === 'touch' && !touchMovedRef.current
  }, [])

  const scrollActiveStateIntoView = useCallback((nextIdx: number) => {
    if (!stateListRef.current) return
    const el = stateListRef.current.querySelector<HTMLElement>(`[data-state-idx="${nextIdx}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [])

  const pickState = useCallback(
    (code: string) => {
      const up = code.toUpperCase().trim()
      if (!STATES.some((s) => s.code === up)) return

      setState(up)
      setStateInput(up)
      setStateOpen(false)
      setStateActiveIndex(-1)

      setTimeout(() => makeRef.current?.focus(), 0)
    },
    [makeRef]
  )

  const onStateChange = useCallback((v: string) => {
    const cleaned = v.toUpperCase().replace(/[^A-Z ]/g, '')
    setStateInput(cleaned)
    setStateOpen(true)
    setStateActiveIndex(-1)

    const maybeCode = cleaned.trim().slice(0, 2)
    if (STATES.some((s) => s.code === maybeCode) && cleaned.trim().length <= 2) setState(maybeCode)
    else setState('')
  }, [])

  const selectBestStateFromInput = useCallback(() => {
    const raw = stateInput.trim()
    if (!raw) return false

    const upper = raw.toUpperCase()

    const exactCode = STATES.find((s) => s.code === upper)
    if (exactCode) {
      pickState(exactCode.code)
      return true
    }

    const exactName = STATES.find((s) => s.name.toUpperCase() === upper)
    if (exactName) {
      pickState(exactName.code)
      return true
    }

    if (stateActiveIndex >= 0 && stateMatches[stateActiveIndex]) {
      pickState(stateMatches[stateActiveIndex].code)
      return true
    }

    const best = stateMatches[0]
    if (best) {
      pickState(best.code)
      return true
    }

    return false
  }, [stateInput, stateActiveIndex, stateMatches, pickState])

  // ✅ same update as CreateDriverForm:
  // - Tab/Shift+Tab cycles highlight ONLY while dropdown is open (does not select)
  // - Enter selects highlighted/best match
  // - Esc closes dropdown (then Tab proceeds normally to next field)
  const onStateKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      const anyResults = stateMatches.length > 0
      const maxIdx = anyResults ? stateMatches.length - 1 : -1

      if (e.key === 'Escape') {
        if (stateOpen) {
          e.preventDefault()
          e.stopPropagation()
          setStateOpen(false)
          setStateActiveIndex(-1)
        }
        return
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()

        if (!stateOpen) {
          setStateOpen(true)
          setStateActiveIndex(-1)
          return
        }

        if (!anyResults) return

        setStateActiveIndex((prev) => {
          let next = prev
          if (e.key === 'ArrowDown') next = prev < maxIdx ? prev + 1 : 0
          else next = prev <= 0 ? maxIdx : prev - 1
          setTimeout(() => scrollActiveStateIntoView(next), 0)
          return next
        })
        return
      }

      if (e.key === 'Tab' && stateOpen) {
        e.preventDefault()
        e.stopPropagation()

        if (!anyResults) return

        setStateActiveIndex((prev) => {
          const start = prev < 0 ? (e.shiftKey ? maxIdx : 0) : prev
          const next = e.shiftKey ? (start <= 0 ? maxIdx : start - 1) : start >= maxIdx ? 0 : start + 1
          setTimeout(() => scrollActiveStateIntoView(next), 0)
          return next
        })
        return
      }

      if (e.key === 'Enter') {
        const didSelect = selectBestStateFromInput()
        if (didSelect) {
          e.preventDefault()
          e.stopPropagation()
        }
        return
      }
    },
    [stateMatches, stateOpen, scrollActiveStateIntoView, selectBestStateFromInput]
  )

  /* -------------------- close dropdown on outside click -------------------- */
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

  /* -------------------- submit gating -------------------- */
  const triggerHelper = useCallback((message: string) => {
    setHelper(message)
    setShakeKey((k) => k + 1)
    setTimeout(() => qRef.current?.focus(), 0)
  }, [])

  const canSubmit = useCallback((): boolean => {
    const q = normQ

    if (!q) {
      triggerHelper('Enter the last 4 digits + first name (example: 8841-mike).')
      return false
    }

    if (isExactHandle) return true

    if (plateParsed) {
      const typedOnlyPlate = q === plateParsed.plate
      if (typedOnlyPlate && !hasDisambiguatorsLive) {
        triggerHelper('That’s only the plate. Add state or car make, or include the first name (example: 7483-mike).')
        return false
      }

      if (q.endsWith('-')) {
        triggerHelper('Add at least one letter of the first name after the plate (example: 2222 t).')
        return false
      }

      return true
    }

    triggerHelper('That doesn’t look like a handle. Use: last 4 of license + first name (example: 8841-mike).')
    return false
  }, [normQ, isExactHandle, plateParsed, hasDisambiguatorsLive, triggerHelper])

  const buildSearchUrl = useCallback(() => {
    const params = new URLSearchParams()
    if (normQ) params.set('q', normQ)

    const st = state.trim().toUpperCase()
    if (st) params.set('state', st)

    const mk = carMake.trim()
    if (mk) params.set('car_make', mk)

    const qs = params.toString()
    return qs ? `/search?${qs}` : '/search'
  }, [normQ, state, carMake])

  /* -------------------- styles -------------------- */
  const inputClass =
    'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder:text-gray-500 ' +
    'focus:outline-none focus:ring-2 focus:ring-black/20'

  const dropdownClass = 'absolute z-20 mt-2 w-full overflow-hidden rounded-md border border-gray-300 bg-white shadow-lg'
  const dropdownScrollClass = 'max-h-56 overflow-auto overscroll-contain'

  const itemClass = (active: boolean) =>
    ['w-full text-left px-3 py-2 text-sm transition', active ? 'bg-gray-100 text-gray-900' : 'text-gray-900 hover:bg-gray-100'].join(' ')

  return (
    <>
      <style jsx>{`
        @keyframes rwshake {
          0% {
            transform: translateX(0);
          }
          20% {
            transform: translateX(-6px);
          }
          40% {
            transform: translateX(6px);
          }
          60% {
            transform: translateX(-4px);
          }
          80% {
            transform: translateX(4px);
          }
          100% {
            transform: translateX(0);
          }
        }
        .rw-shake {
          animation: rwshake 0.35s ease-in-out;
        }
      `}</style>

      <form
        className="mt-6 w-full max-w-xl space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!canSubmit()) return
          setHelper(null)
          router.push(buildSearchUrl())
        }}
        onKeyDown={(e) => {
          // prevent Enter from submitting while navigating inputs,
          // but DO NOT block Enter on the submit button
          if (e.key !== 'Enter') return
          const el = e.target as Element | null
          if (!el) return
          if (el instanceof HTMLTextAreaElement) return
          if (el instanceof HTMLButtonElement && el.getAttribute('type') === 'submit') return
          // also allow Enter on dropdown option buttons
          if (el instanceof HTMLButtonElement) return
          e.preventDefault()
        }}
      >
        <div key={shakeKey} className={helper ? 'rw-shake' : ''}>
          <input
            ref={qRef}
            value={qInput}
            onChange={(e) => {
              setQInput(formatQueryInputDisplay(e.target.value))
              if (helper) setHelper(null)
            }}
            onBlur={() => setQInput((prev) => formatQueryInputDisplay(prev.trim()))}
            onKeyDown={enterNext}
            placeholder="Last 4 of license plate + First name (ex: 8841 mike)"
            className="w-full rounded-md border border-gray-900 bg-[#242a33] px-4 py-3 text-white placeholder:text-white/70"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
          />
        </div>

        {helper && (
          <div className="rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm text-yellow-900">{helper}</div>
        )}

        <p className="text-sm text-gray-700">
          <span className="font-semibold">Recommended:</span> Searches are most precise with <span className="font-semibold">plate + name</span>. If you
          only know the plate, add <span className="font-semibold">state</span> or <span className="font-semibold">car make</span> to narrow results.
        </p>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {/* State */}
          <div ref={stateBoxRef} className="relative">
            <input
              ref={stateRef}
              value={stateInput}
              onChange={(e) => onStateChange(e.target.value)}
              onFocus={() => setStateOpen(true)}
              onKeyDown={onStateKeyDown}
              placeholder="State (optional) — ex: IL"
              className={inputClass}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
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
                      tabIndex={-1} // ✅ keep Tab on the input; we cycle in onStateKeyDown
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

            {stateOpen && (
              <div className="mt-1 text-[11px] text-gray-500">
                Tip: <span className="font-semibold">Tab</span> cycles states • <span className="font-semibold">Enter</span> selects •{' '}
                <span className="font-semibold">Esc</span> closes
              </div>
            )}
          </div>

          {/* Car make */}
          <input
            ref={makeRef}
            value={carMake}
            onChange={(e) => setCarMake(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submitRef.current?.focus()
                return
              }
              enterNext(e)
            }}
            placeholder="Car make (optional) — ex: Honda"
            className={inputClass}
            autoCorrect="off"
            spellCheck={false}
          />

          <div className="hidden md:block" />
        </div>

        <button
          ref={submitRef}
          type="submit"
          className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-green-600 px-5 text-sm font-semibold text-black transition hover:opacity-90"
        >
          Search
        </button>
      </form>
    </>
  )
}
