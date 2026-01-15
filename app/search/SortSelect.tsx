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
    <div className="flex items-center gap-2 text-sm">
      <span className="text-gray-600">Sort</span>
      <select
        value={sort}
        onChange={(e) => setSort(e.target.value)}
        className="rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black/20"
      >
        <option value="newest">Newest</option>
        <option value="oldest">Oldest</option>
        <option value="highest">Highest rated</option>
        <option value="lowest">Lowest rated</option>
      </select>
    </div>
  )
}
