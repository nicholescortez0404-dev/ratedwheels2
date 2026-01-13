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

    const { error } = await supabase.from('drivers').insert({
      driver_handle: handle,
      display_name: displayName.trim() || handle,
      city: city.trim() || null,
      state: state.trim() || null,
    })

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
        className="rounded-md bg-green-500 px-4 py-2 font-semibold text-black disabled:opacity-60"
      >
        {loading ? 'Creating…' : 'Create driver'}
      </button>
    </form>
  )
}
