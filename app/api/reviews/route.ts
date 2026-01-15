import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

// Server-only Supabase client (uses service role)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Profanity censor list (extra words you want censored)
const PROFANITY_LIST = (process.env.PROFANITY_CENSOR_LIST || '')
  .split(',')
  .map((w) => w.trim().toLowerCase())
  .filter(Boolean)

// Slur blocklist (hard stop — review rejected)
const SLUR_BLOCKLIST = (process.env.SLUR_BLOCKLIST || '')
  .split(',')
  .map((w) => w.trim().toLowerCase())
  .filter(Boolean)

// Normalize text to catch sneaky variations
function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // zero-width chars
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function containsBlockedSlur(text: string) {
  if (SLUR_BLOCKLIST.length === 0) return false
  const normalized = normalize(text)
  return SLUR_BLOCKLIST.some((slur) => normalized.includes(slur))
}

/**
 * Safe loader for bad-words across CJS/ESM bundling.
 * Caches the instance so we don’t re-create it on every request.
 */
async function getProfanityFilter() {
  const g = globalThis as any
  if (g.__rw_profanityFilter) return g.__rw_profanityFilter

  const mod: any = await import('bad-words')

  // Try common shapes:
  // - mod.default is the class (ESM default)
  // - mod is the class (some interop)
  // - mod.Filter / mod.BadWords (just in case)
  const FilterCtor =
    mod?.default ??
    mod?.Filter ??
    mod?.BadWords ??
    mod

  if (typeof FilterCtor !== 'function') {
    // If this happens, the package resolution is off; return a no-op filter
    const noop = { clean: (s: string) => s }
    g.__rw_profanityFilter = noop
    return noop
  }

  const profanityFilter = new FilterCtor()

  if (PROFANITY_LIST.length > 0 && typeof profanityFilter.addWords === 'function') {
    profanityFilter.addWords(...PROFANITY_LIST)
  }

  g.__rw_profanityFilter = profanityFilter
  return profanityFilter
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const driverId = body?.driverId
    const stars = Number(body?.stars)
    const comment = String(body?.comment || '')
    const tagIds = Array.isArray(body?.tagIds) ? body.tagIds : []

    if (!driverId || !Number.isFinite(stars)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (stars < 1 || stars > 5) {
      return NextResponse.json({ error: 'Stars must be between 1 and 5' }, { status: 400 })
    }

    // 🚫 Hard block: slurs (only works if SLUR_BLOCKLIST has real entries)
    if (containsBlockedSlur(comment)) {
      return NextResponse.json(
        { error: 'Review contains prohibited language.' },
        { status: 400 }
      )
    }

    // ✳️ Soft censor: profanity
    const profanityFilter = await getProfanityFilter()
    const censoredComment = String(profanityFilter.clean(comment)).trim()

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
    const cleanTagIds = tagIds.map((x: any) => String(x)).filter(Boolean)

    if (cleanTagIds.length > 0) {
      const { error: tagErr } = await supabaseAdmin.from('review_tags').insert(
        cleanTagIds.map((tagId: string) => ({
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
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Invalid request' },
      { status: 400 }
    )
  }
}
