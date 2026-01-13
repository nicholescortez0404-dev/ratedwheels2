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
  placeholder="For ex: Last 4 of license plate + first name"
  className="w-full rounded-md border border-gray-1000 bg-[#242a33] px-4 py-3 text-white placeholder:text-white/70"
/>

  <button
    type="submit"
    className="rounded-md bg-green-500 px-8 py-3 font-semibold text-black"
  >
    Search
  </button>
</form>

  )
}
