import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import * as leoProfanity from 'leo-profanity'

export const runtime = 'nodejs'

/* -------------------- helpers -------------------- */

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error('Missing Supabase env vars')
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  })
}

function getIp(req: Request) {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? '0.0.0.0'
}

function hashIp(ip: string) {
  const salt = process.env.IP_HASH_SALT || 'ratedwheels'
  return crypto.createHash('sha256').update(`${salt}:${ip}`).digest('hex')
}

function normalize(text: string) {
  return String(text || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, ' ')
    .trim()
}

/* -------------------- moderation -------------------- */

leoProfanity.loadDictionary()

const SLUR_BLOCKLIST = (process.env.SLUR_BLOCKLIST || '')
  .split(',')
  .map(w => w.trim().toLowerCase())
  .filter(Boolean)

function containsSlur(text: string) {
  const lower = text.toLowerCase()
  return SLUR_BLOCKLIST.some(slur => lower.includes(slur))
}

/* -------------------- handler -------------------- */

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
      return NextResponse.json({ error: 'Stars must be 1–5.' }, { status: 400 })
    }

    const comment = normalize(commentRaw)

    // 🚫 HARD BLOCK (slurs / extreme language)
    if (comment && containsSlur(comment)) {
      return NextResponse.json(
        { error: 'Your comment contains prohibited language.' },
        { status: 400 }
      )
    }

    // 🧼 SOFT CENSOR (mild profanity)
    const safeComment =
      comment && leoProfanity.check(comment)
        ? leoProfanity.clean(comment)
        : comment || null

    // ⏱️ RATE LIMIT (1 per driver per IP)
    const ipHash = hashIp(getIp(req))
    const { error: rlErr } = await supabase
      .from('review_rate_limits')
      .insert({ driver_id: driverId, ip_hash: ipHash })

    if (rlErr?.code === '23505') {
      return NextResponse.json(
        { error: 'You already reviewed this driver from this network.' },
        { status: 429 }
      )
    }

    // 📝 INSERT REVIEW
    const { data: review, error: reviewErr } = await supabase
      .from('reviews')
      .insert({
        driver_id: driverId,
        stars,
        comment: safeComment,
      })
      .select()
      .single()

    if (reviewErr) {
      return NextResponse.json({ error: reviewErr.message }, { status: 500 })
    }

    // 🏷️ TAGS
    if (tagIds.length) {
      await supabase.from('review_tags').insert(
        tagIds.map((tag_id: string) => ({
          review_id: review.id,
          tag_id,
        }))
      )
    }

    return NextResponse.json({ ok: true, review })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Server error' },
      { status: 500 }
    )
  }
}
