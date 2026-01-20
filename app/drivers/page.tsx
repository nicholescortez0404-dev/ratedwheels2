export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

import { unstable_noStore as noStore } from 'next/cache'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabaseServer'

type Driver = {
  id: string
  display_name: string | null
  driver_handle: string
  city: string | null
  state: string | null
  car_color: string | null
  car_make: string | null
  car_model: string | null
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
  noStore()
  const supabase = createSupabaseServerClient()

  // 1) Load drivers (newest first)
  const { data: driversData, error: driversErr } = await supabase
    .from('drivers')
    .select('id,display_name,driver_handle,city,state,car_color,car_make,car_model,created_at')
    .order('created_at', { ascending: false })

  if (driversErr) {
    return (
      <main className="min-h-screen bg-black text-white p-8">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-2xl font-bold">All drivers</h1>
          <p className="mt-4 text-red-400">Error loading drivers: {driversErr.message}</p>
          <Link
            href="/"
            className="mt-6 inline-flex h-11 items-center justify-center rounded-lg border border-white/20 px-5 text-sm font-semibold hover:bg-white/10 transition"
          >
            Go home
          </Link>
        </div>
      </main>
    )
  }

  const drivers = (driversData ?? []) as Driver[]

  // 2) Stats only for these drivers
  let statsByDriver = new Map<string, DriverStat>()

  if (drivers.length > 0) {
    const driverIds = drivers.map((d) => d.id)

    const { data: statsData, error: statsErr } = await supabase
      .from('driver_stats')
      .select('driver_id,avg_stars,review_count')
      .in('driver_id', driverIds)

    if (statsErr) {
      return (
        <main className="min-h-screen bg-black text-white p-8">
          <div className="mx-auto max-w-5xl">
            <h1 className="text-2xl font-bold">All drivers</h1>
            <p className="mt-4 text-red-400">Error loading driver stats: {statsErr.message}</p>
          </div>
        </main>
      )
    }

    const stats = (statsData ?? []) as DriverStat[]
    statsByDriver = new Map(stats.map((s) => [s.driver_id, s]))
  }

  return (
    <main className="min-h-screen bg-[#ffeed5] text-black p-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">All drivers</h1>
            <p className="mt-1 text-gray-700">Browse profiles and jump into reviews/traits.</p>
          </div>

          <Link
            href="/search"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-green-600 px-5 text-sm font-semibold text-black hover:opacity-90 transition"
          >
            Search
          </Link>
        </div>

        {drivers.length === 0 ? (
          <p className="mt-8 text-gray-700">No drivers yet.</p>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
            {drivers.map((d) => {
              const s = statsByDriver.get(d.id)
              const avg = s?.avg_stars ?? null
              const count = s?.review_count ?? 0

              const carLine = [d.car_color, d.car_make, d.car_model].filter(Boolean).join(' ')

              return (
                <Link
                  key={d.id}
                  href={`/search?q=${encodeURIComponent(d.driver_handle)}`}
                  className="rounded-2xl border border-gray-300 bg-transparent p-5 hover:border-gray-600 transition"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xl font-semibold">{d.display_name ?? d.driver_handle}</div>
                      <div className="text-gray-700">@{d.driver_handle}</div>

                      <div className="text-gray-600">
                        {d.city ?? '—'}
                        {d.state ? `, ${d.state}` : ''}
                      </div>

                      {carLine && <div className="text-gray-600">{carLine}</div>}
                    </div>

                    <div className="text-right">
                      <div className="text-sm text-gray-700">Avg rating</div>
                      <div className="text-2xl font-bold">
                        {formatAvg(avg)}
                        <span className="text-sm font-normal text-gray-700">/5</span>
                      </div>
                      <div className="text-xs text-gray-600">
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
