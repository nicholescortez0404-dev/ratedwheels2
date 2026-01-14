import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import Container from "@/components/Container"


type Driver = {
  id: string
  display_name: string
  driver_handle: string
  city: string | null
  state: string | null
}

type DriverStat = {
  driver_id: string
  avg_stars: number | null
  review_count: number | null
}

function formatAvg(avg: number | null | undefined) {
  if (avg === null || avg === undefined || Number.isNaN(avg)) return '—'
  return Number(avg).toFixed(1)
}

export default async function DriversPage() {
  // 1) drivers list
  const { data: driversData, error: driversErr } = await supabase
    .from('drivers')
    .select('id,display_name,driver_handle,city,state')
    .order('display_name', { ascending: true })

  if (driversErr) {
    return (
      <main className="min-h-screen bg[-black] text-white p-8">
        <p className="text-red-400">Error loading drivers: {driversErr.message}</p>
      </main>
    )
  }

  const drivers = (driversData ?? []) as Driver[]

  // 2) stats list (from your view/table)
  const { data: statsData, error: statsErr } = await supabase
    .from('driver_stats')
    .select('driver_id,avg_stars,review_count')

  if (statsErr) {
    return (
      <main className="min-h-screen bg-black text-white p-8">
        <p className="text-red-400">Error loading driver stats: {statsErr.message}</p>
      </main>
    )
  }

  const stats = (statsData ?? []) as DriverStat[]
  const statsByDriver = new Map(stats.map((s) => [s.driver_id, s]))

  return (
    <main className="min-h-screen bg-[#ffeed5] text-black p-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">All drivers</h1>
            <p className="mt-1 text-black-400">
              Browse profiles and jump into reviews/traits.
            </p>
          </div>

          <Link
            href="/search"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-green-600 px-5 text-sm font-semibold text-black hover:opacity-90 transition"

          >
            Search
          </Link>
        </div>

        {drivers.length === 0 ? (
          <p className="mt-8 text-black-400">No drivers yet.</p>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
            {drivers.map((d) => {
              const s = statsByDriver.get(d.id)
              const avg = s?.avg_stars ?? null
              const count = s?.review_count ?? 0

              return (
                <Link
                key={d.id}
                href={`/search?q=${encodeURIComponent(d.driver_handle)}`}
                className="rounded-2xl border border-gray-300 bg-transparent p-5 hover:border-gray-600 transition"
>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xl font-semibold">{d.display_name}</div>
                      <div className="text-black-400">@{d.driver_handle}</div>
                      <div className="text-black-500">
                        {d.city ? d.city : '—'}
                        {d.state ? `, ${d.state}` : ''}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-sm text-black-400">Avg rating</div>
                      <div className="text-2xl font-bold">
                        {formatAvg(avg)}
                        <span className="text-sm font-normal text-black-400">/5</span>
                      </div>
                      <div className="text-xs text-black-500">
                        {count} review{count === 1 ? '' : 's'}
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
