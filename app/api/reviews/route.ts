import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import * as leoProfanity from 'leo-profanity'

export const runtime = 'nodejs'

/* -------------------- config -------------------- */

const MAX_COMMENT_CHARS = 500

// Comma-separated in env, e.g. "word1,word2,word3"
const SLUR_BLOCKLIST = (process.env.SLUR_BLOCKLIST || '')
  .split(',')
  .map((w) => w.trim().toLowerCase())
  .filter(Boolean)

leoProfanity.loadDictionary()

/* -------------------- types -------------------- */

type JsonObject = Record<string, unknown>

type ReviewInsertRow = {
  driver_id: string
  stars: number
  comment: string | null
}

type ReviewRow = {
  id: string
  driver_id: string
  stars: number
  comment: string | null
  created_at?: string
}

type RateLimitRow = {
  driver_id: string
  ip_hash: string
}

/* -------------------- helpers -------------------- */

function isJsonObject(v: unknown): v is JsonObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Missing Supabase env vars')

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  })
}

function getIp(req: Request) {
  // Vercel/NGINX commonly set x-forwarded-for = "client, proxy1, proxy2"
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? '0.0.0.0'
}

function sha256(input: string) {
  return crypto.createHash('sha256').update(input).digest('hex')
}

function hashIp(ip: string) {
  const salt = process.env.IP_HASH_SALT || 'ratedwheels'
  return sha256(`${salt}:${ip}`)
}

function normalize(text: unknown) {
  return String(text ?? '')
    // remove zero-width chars
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // collapse whitespace
    .replace(/\s+/g, ' ')
    .trim()
}

function clampComment(text: string) {
  if (!text) return ''
  return text.length > MAX_COMMENT_CHARS ? text.slice(0, MAX_COMMENT_CHARS) : text
}

function containsSlur(text: string) {
  if (!text || SLUR_BLOCKLIST.length === 0) return false
  const lower = text.toLowerCase()
  // simple contains check; keep blocklist private + curated
  return SLUR_BLOCKLIST.some((slur) => slur && lower.includes(slur))
}

function containsLinkOrHandle(text: string) {
  if (!text) return false
  // blocks obvious link/handle/contact attempts (reduces doxxing / solicitation)
  const link = /\b(https?:\/\/|www\.)\S+/i
  const email = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i
  const handle = /(^|\s)@[\w.]{2,}/
  return link.test(text) || email.test(text) || handle.test(text)
}

function uniqStrings(arr: unknown[]) {
  const out: string[] = []
  const seen = new Set<string>()
  for (const v of arr) {
    const s = String(v ?? '').trim()
    if (!s) continue
    if (seen.has(s)) continue
    seen.add(s)
    out.push(s)
  }
  return out
}

/* -------------------- handler -------------------- */

export async function POST(req: Request) {
  try {
    const supabase = getClient()

    const bodyUnknown: unknown = await req.json().catch(() => ({}))
    const body: JsonObject = isJsonObject(bodyUnknown) ? bodyUnknown : {}

    const driverId = String(body.driverId ?? '').trim()
    const stars = Number(body.stars)
    const commentRaw = body.comment
    const tagIds = Array.isArray(body.tagIds) ? uniqStrings(body.tagIds) : []

    // Basic validation
    if (!driverId) {
      return NextResponse.json({ error: 'Missing driverId.' }, { status: 400 })
    }
    if (!Number.isFinite(stars) || stars < 1 || stars > 5) {
      return NextResponse.json({ error: 'Stars must be 1–5.' }, { status: 400 })
    }

    // Normalize + cap length
    const commentNorm = clampComment(normalize(commentRaw))

    // 🚫 HARD BLOCK: slurs / hate terms
    if (commentNorm && containsSlur(commentNorm)) {
      return NextResponse.json({ error: 'Your comment contains prohibited language.' }, { status: 400 })
    }

    // 🚫 HARD BLOCK: links / contact attempts
    if (commentNorm && containsLinkOrHandle(commentNorm)) {
      return NextResponse.json({ error: 'Please don’t include links, emails, or social handles.' }, { status: 400 })
    }

    // 🧼 SOFT CENSOR: mild profanity
    const safeComment =
      commentNorm && leoProfanity.check(commentNorm) ? leoProfanity.clean(commentNorm) : commentNorm

    // Store null for empty comments (keeps DB clean)
    const finalComment: string | null = safeComment ? safeComment : null

    // ⏱️ RATE LIMIT: 1 review per driver per network (IP hash)
    const ipHash = hashIp(getIp(req))

    const { error: rlErr } = await supabase
      .from('review_rate_limits')
      .insert({ driver_id: driverId, ip_hash: ipHash } satisfies RateLimitRow)

    // Postgres unique violation
    if (rlErr?.code === '23505') {
      return NextResponse.json({ error: 'You already reviewed this driver from this network.' }, { status: 429 })
    }
    if (rlErr) {
      return NextResponse.json({ error: rlErr.message }, { status: 500 })
    }

    // 📝 INSERT REVIEW
    const insertRow: ReviewInsertRow = {
      driver_id: driverId,
      stars,
      comment: finalComment,
    }

    const { data: review, error: reviewErr } = await supabase
      .from('reviews')
      .insert(insertRow)
      .select('id,driver_id,stars,comment,created_at')
      .single()

    if (reviewErr) {
      return NextResponse.json({ error: reviewErr.message }, { status: 500 })
    }

    const reviewRow = review as ReviewRow

    // 🏷️ TAGS (best-effort, don’t fail the whole request if tags insert fails)
    if (tagIds.length) {
      const rows = tagIds.map((tag_id) => ({ review_id: reviewRow.id, tag_id }))

      const { error: tagsErr } = await supabase.from('review_tags').insert(rows)

      if (tagsErr) {
        // no eslint-disable needed (no-console isn’t enabled in your lint output)
        console.warn('review_tags insert failed:', tagsErr.message)
      }
    }

    return NextResponse.json({ ok: true, review: reviewRow })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
