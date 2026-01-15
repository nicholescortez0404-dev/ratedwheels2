'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

function normalizeHandle(raw: string) {
  return raw.trim().toLowerCase().replace(/\s+/g, '-')
}

export default function CreateDriverForm({ initialRaw }: { initialRaw: string }) {
  const router = useRouter()
  const [displayName, setDisplayName] = useState(initialRaw.trim())
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handle = normalizeHandle(initialRaw)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data: inserted, error } = await supabase
      .from('drivers')
      .insert({
        driver_handle: handle,
        display_name: displayName.trim() || handle,
        city: city.trim() || null,
        state: state.trim() || null,
      })
      .select('id, driver_handle')
      .single()

    console.log('INSERT RESULT:', inserted, 'ERROR:', error)

    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    router.push(`/search?q=${encodeURIComponent(handle)}`)
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <p className="text-gray-700">
        No driver found. Create <span className="text-white font-semibold">@{handle}</span>?
      </p>

      <input
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        placeholder="Display name (ex: John (1122))"
        className="w-full rounded-md border border-gray-300 bg-black px-3 py-2 text-white"
      />

      <div className="flex gap-3">
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="City"
          className="w-full rounded-md border border-gray-300 bg-black px-3 py-2 text-white"
        />
        <input
          value={state}
          onChange={(e) => setState(e.target.value)}
          placeholder="State (IL)"
          className="w-32 rounded-md border border-gray-300 bg-black px-3 py-2 text-white"
        />
      </div>

      {error && <p className="text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="inline-flex h-11 items-center justify-center rounded-lg bg-green-600 px-5 text-sm font-semibold text-black hover:opacity-90 transition disabled:opacity-60"
      >
        {loading ? 'Creating…' : 'Create driver'}
      </button>
    </form>
  )
}
