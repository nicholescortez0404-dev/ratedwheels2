'use client'

import { useRouter, useSearchParams } from 'next/navigation'

export default function SortSelect() {
  const router = useRouter()
  const sp = useSearchParams()

  const q = sp.get('q') ?? ''
  const sort = sp.get('sort') ?? 'newest'

  function setSort(next: string) {
    const params = new URLSearchParams(sp.toString())
    if (q) params.set('q', q)
    params.set('sort', next)
    router.push(`/search?${params.toString()}`)
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-700">Sort</span>
      <select
        value={sort}
        onChange={(e) => setSort(e.target.value)}
        className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
      >
        <option value="newest">Newest</option>
        <option value="highest">Highest rated</option>
      </select>
    </div>
  )
}
