// TEST: pushing update

'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function Home() {
  const router = useRouter()
  const [query, setQuery] = useState('')

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    router.push(`/search?q=${encodeURIComponent(q)}`)
  }

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center">
      <h1 className="text-5xl font-bold mb-4">RatedWheels</h1>
      <p className="text-gray-700 mb-8">Search any driver by handle</p>

      <form onSubmit={onSubmit} className="flex flex-col items-center gap-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Last 4 of license plate + First name (ex: 8841-mike)"
          className="px-4 py-3 rounded bg-gray-900 border border-gray-300 w-100"
        />

        <button
          type="submit"
          className="mt-4 px-6 py-3 bg-green-500 text-black rounded"
        >
          Search
        </button>
      </form>

      <p className="mt-6 text-xs text-gray-600">
        Built for rider safety, not harassment
      </p>
    </main>
  )
}
