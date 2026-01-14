'use client'
import { useState } from 'react'

export default function SearchForm({ initialQuery = '' }: { initialQuery?: string }) {
  const [value, setValue] = useState(initialQuery)

  return (
    <form
  action="/search"
  method="get"
  className="mt-6 flex flex-col items-center gap-4 w-full max-w-xl"
>
  <input
  name="q"
  value={value}
  onChange={(e) => setValue(e.target.value)}
  placeholder="Last 4 of license plate + First name (ex: 8841-john)"

  className="w-full rounded-md border border-gray-1000 bg-[#242a33] px-4 py-3 text-white placeholder:text-white/70"
/>

  <button
    type="submit"
    className="inline-flex h-11 items-center justify-center rounded-lg bg-green-600 px-5 text-sm font-semibold text-black hover:opacity-90 transition"
  >
    Search
  </button>
</form>

  )
}
