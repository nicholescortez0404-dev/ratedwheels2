import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

type ReviewBody = {
  driverId?: string
  stars?: number
  comment?: string
  tagIds?: unknown
}

/* ----------------------- helpers ----------------------- */

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // zero-width chars
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getEnvList(name: string): string[] {
  const raw = process.env[name]
  if (!raw) return []
  return raw
    .split(',')
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length > 0)
}

function containsBlockedSlur(text: string, slurBlocklist: string[]) {
  if (slurBlocklist.length === 0) return false
  const normalized = normalize(text)
  return slurBlocklist.some((slur) => normalized.includes(slur))
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) throw new Error('Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)')
  if (!serviceKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  })
}

async function getProfanityFilter() {
  // "bad-words" has awkward typing in some setups, so we treat it as "any"
  const mod: any = await import('bad-words')
  const Filter: any = mod?.default ?? mod

  const profanityFilter = new Filter()

  const profanityList = getEnvList('PROFANITY_CENSOR_LIST')
  if (profanityList.length > 0) {
    profanityFilter.addWords(...profanityList)
  }

  return profanityFilter as {
    clean: (input: string) => string
  }
}

/* ----------------------- POST ----------------------- */

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ReviewBody

    const driverId = body.driverId
    const stars = Number(body.stars)
    const comment = String(body.comment ?? '')

    const tagIdsRaw = body.tagIds
    const tagIds: string[] = Array.isArray(tagIdsRaw)
      ? tagIdsRaw.map((x) => String(x)).filter((x) => x.length > 0)
      : []

    if (!driverId || !Number.isFinite(stars)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (stars < 1 || stars > 5) {
      return NextResponse.json({ error: 'Stars must be between 1 and 5' }, { status: 400 })
    }

    // 🚫 Hard block list
    const slurBlocklist = getEnvList('SLUR_BLOCKLIST')
    if (containsBlockedSlur(comment, slurBlocklist)) {
      return NextResponse.json(
        { error: 'Review contains prohibited language.' },
        { status: 400 }
      )
    }

    // ✳️ Soft censor
    const profanityFilter = await getProfanityFilter()
    const censoredComment = profanityFilter.clean(comment).trim()

    const supabaseAdmin = getSupabaseAdmin()

    // 1) Insert review
    const { data: created, error: reviewErr } = await supabaseAdmin
      .from('reviews')
      .insert({
        driver_id: driverId,
        stars,
        comment: censoredComment,
      })
      .select('id')
      .single()

    if (reviewErr) {
      return NextResponse.json({ error: reviewErr.message }, { status: 500 })
    }

    // 2) Insert tags
    if (tagIds.length > 0) {
      const { error: tagErr } = await supabaseAdmin.from('review_tags').insert(
        tagIds.map((tagId) => ({
          review_id: created.id,
          tag_id: tagId,
        }))
      )

      if (tagErr) {
        return NextResponse.json({ error: tagErr.message }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      review_id: created.id,
      censored_comment: censoredComment, // optional
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? 'Invalid request' },
      { status: 400 }
    )
  }
}
