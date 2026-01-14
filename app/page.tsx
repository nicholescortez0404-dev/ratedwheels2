'use client'

import Image from 'next/image'
import Link from 'next/link'
import SearchForm from './search/SearchForm'

export default function Home() {
  return (
    <main className="min-h-screen bg-[#ffeed5] text-black p-8">
      {/* TOP BAR */}
      <div className="relative">
        {/* Centered brand block */}
        <div className="flex flex-col items-center gap-4 mt-12 mb-20">
          <Link
  href="/"
  aria-label="Go home"
  className="relative z-0 inline-flex items-center justify-center max-w-fit"
>
  <Image
    src="/logos/rw-logov2.png"
    alt="Rated Wheels logo"
    width={180}
    height={180}
    priority
    className="h-28 w-auto md:h-36 cursor-pointer select-none"
  />
</Link>


          <h1 className="text-4xl font-bold">Rated Wheels</h1>
          <p className="text-sm text-gray-600">
            Community-powered driver reviews
          </p>
        </div>

        {/* Top-right link */}
        <Link
  href="/drivers"
  className="absolute right-0 top-0 z-20 rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-900 hover:border-gray-600 transition"
>
  Browse all drivers
</Link>
      </div>

      {/* SEARCH */}
      <div className="flex flex-col items-center mt-10">
        <SearchForm />

        <p className="mt-6 text-xs text-gray-600 text-center">
          Built for rider safety, not harassment
        </p>
      </div>
    </main>
  )
}
