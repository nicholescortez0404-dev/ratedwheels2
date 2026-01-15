import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

export const runtime = 'nodejs'

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  })
}

function getIp(req: Request) {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  const xrip = req.headers.get('x-real-ip')
  if (xrip) return xrip.trim()
  return '0.0.0.0'
}

function hashIp(ip: string) {
  const salt = process.env.IP_HASH_SALT || 'ratedwheels-salt'
  return crypto.createHash('sha256').update(`${salt}:${ip}`).digest('hex')
}

function normalize(text: string) {
  return String(text || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, ' ')
    .trim()
}

async function getProfanityFilter() {
  // Works whether bad-words exports default OR module itself
  const mod: any = await import('bad-words')
  const FilterCtor = mod?.default ?? mod
  return new FilterCtor()
}

export async function POST(req: Request) {
  try {
    const supabase = getClient()

    const body = await req.json().catch(() => ({}))
    const driverId = String(body?.driverId || '').trim()
    const stars = Number(body?.stars)
    const commentRaw = body?.comment ?? ''
    const tagIds = Array.isArray(body?.tagIds) ? body.tagIds : []

    if (!driverId) {
      return NextResponse.json({ error: 'Missing driverId.' }, { status: 400 })
    }

    if (!Number.isFinite(stars) || stars < 1 || stars > 5) {
      return NextResponse.json(
        { error: 'Stars must be between 1 and 5.' },
        { status: 400 }
      )
    }

    const comment = normalize(commentRaw)

    // Profanity filter (bundler-safe)
    const profanityFilter = await getProfanityFilter()
    const safeComment = comment ? profanityFilter.clean(comment) : null

    // ---------- RATE LIMIT: 1 review per driver per IP forever ----------
    const ip = getIp(req)
    const ipHash = hashIp(ip)

    const { error: rlErr } = await supabase
      .from('review_rate_limits')
      .insert({ driver_id: driverId, ip_hash: ipHash })

    if (rlErr) {
      const code = (rlErr as any)?.code
      if (code === '23505') {
        return NextResponse.json(
          { error: 'You already posted a review for this driver from this device/network.' },
          { status: 429 }
        )
      }
      return NextResponse.json({ error: rlErr.message }, { status: 500 })
    }
    // -------------------------------------------------------------------

    // 1) Insert review
    const { data: review, error: reviewErr } = await supabase
      .from('reviews')
      .insert({
        driver_id: driverId,
        stars,
        comment: safeComment,
      })
      .select('id, driver_id, stars, comment, created_at')
      .single()

    if (reviewErr) {
      // rollback rate-limit record so they can retry if insert failed
      await supabase
        .from('review_rate_limits')
        .delete()
        .match({ driver_id: driverId, ip_hash: ipHash })

      return NextResponse.json({ error: reviewErr.message }, { status: 500 })
    }

    // 2) Insert review_tags if any
    if (tagIds.length > 0) {
      const rows = tagIds.map((tag_id: string) => ({
        review_id: review.id,
        tag_id,
      }))

      const { error: rtErr } = await supabase.from('review_tags').insert(rows)

      if (rtErr) {
        return NextResponse.json(
          { ok: true, review, warning: `Review saved but tags failed: ${rtErr.message}` },
          { status: 200 }
        )
      }
    }

    return NextResponse.json({ ok: true, review }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
