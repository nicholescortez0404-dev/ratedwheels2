'use client'

import { useMemo, useState } from 'react'

export default function SearchForm({
  initialQuery = '',
  initialState = '',
  initialCity = '',
  initialColor = '',
  initialMake = '',
  initialModel = '',
}: {
  initialQuery?: string
  initialState?: string
  initialCity?: string
  initialColor?: string
  initialMake?: string
  initialModel?: string
}) {
  const [q, setQ] = useState(initialQuery)
  const [open, setOpen] = useState(false)

  const [state, setState] = useState(initialState)
  const [city, setCity] = useState(initialCity)
  const [color, setColor] = useState(initialColor)
  const [make, setMake] = useState(initialMake)
  const [model, setModel] = useState(initialModel)

  const inputClass =
    'w-full rounded-md border border-gray-300 bg-[#242a33] px-4 py-3 text-white placeholder:text-white/70 ' +
    'focus:outline-none focus:ring-2 focus:ring-white/20'

  const miniInputClass =
    'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder:text-gray-500 ' +
    'focus:outline-none focus:ring-2 focus:ring-black/20'

  const hasAnyFilters = useMemo(() => {
    return Boolean(state.trim() || city.trim() || color.trim() || make.trim() || model.trim())
  }, [state, city, color, make, model])

  return (
    <div className="w-full max-w-xl">
      <form action="/search" method="get" className="mt-6 flex flex-col items-center gap-4 w-full">
        <input
          name="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Last 4 of license plate + first name (ex: 8841 john)"
          className={inputClass}
        />

        {/* optional filters are still submitted as query params */}
        <input type="hidden" name="state" value={state} />
        <input type="hidden" name="city" value={city} />
        <input type="hidden" name="color" value={color} />
        <input type="hidden" name="make" value={make} />
        <input type="hidden" name="model" value={model} />

        <button
          type="submit"
          className="inline-flex h-11 items-center justify-center rounded-lg bg-green-600 px-5 text-sm font-semibold text-black hover:opacity-90 transition"
        >
          Search
        </button>

        <div className="w-full">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-sm text-gray-700 underline underline-offset-2 hover:text-gray-900"
          >
            {open ? 'Hide optional details' : 'Add optional details (recommended)'}
            {hasAnyFilters ? <span className="ml-2 text-xs text-gray-600">(active)</span> : null}
          </button>

          {open && (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="State (optional) — ex: IL"
                className={miniInputClass}
              />
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="City (optional) — ex: Chicago"
                className={miniInputClass}
              />
              <input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="Car color (optional) — ex: Silver"
                className={miniInputClass}
              />
              <input
                value={make}
                onChange={(e) => setMake(e.target.value)}
                placeholder="Car make (optional) — ex: Toyota"
                className={miniInputClass}
              />
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Car model (optional) — ex: RAV4 Hybrid"
                className={miniInputClass}
              />
            </div>
          )}

          <p className="mt-3 text-xs text-gray-600">
            Tip: Searches are most precise with <strong>plate + name</strong>. Adding{' '}
            <strong>city</strong> and <strong>car details</strong> helps people pick the right driver.
          </p>
        </div>
      </form>
    </div>
  )
}
