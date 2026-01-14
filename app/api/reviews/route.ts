import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// bad-words export can be funky in TS, so use require for compatibility
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Filter = require('bad-words')

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
// Leave empty until YOU provide entries (don’t put placeholders like "slur1")
const SLUR_BLOCKLIST = (process.env.SLUR_BLOCKLIST || '')
  .split(',')
  .map((w) => w.trim().toLowerCase())
  .filter(Boolean)

// Profanity filter instance (bad-words includes its own default list)
// We add your custom ones on top.
const profanityFilter = new Filter()
if (PROFANITY_LIST.length > 0) {
  profanityFilter.addWords(...PROFANITY_LIST)
}

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

export async function POST(req: Request) {
  try {
    const body = await req.json()

    // match what your client sends
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
      return NextResponse.json({ error: 'Review contains prohibited language.' }, { status: 400 })
    }

    // ✳️ Soft censor: profanity
    const censoredComment = profanityFilter.clean(comment)

    // 1) Insert review
    const { data: created, error: reviewErr } = await supabaseAdmin
      .from('reviews')
      .insert({
        driver_id: driverId,
        stars,
        comment: censoredComment.trim(),
      })
      .select('id')
      .single()

    if (reviewErr) {
      return NextResponse.json({ error: reviewErr.message }, { status: 500 })
    }

    // 2) Insert tags
    const cleanTagIds = tagIds
      .map((x: any) => String(x))
      .filter(Boolean)

    if (cleanTagIds.length > 0) {
      const { error: tagErr } = await supabaseAdmin.from('review_tags').insert(
        cleanTagIds.map((tagId: string) => ({
          review_id: created.id,
          tag_id: tagId,
        }))
      )

      if (tagErr) {
        // optional: roll back the review if tag insert fails
        // await supabaseAdmin.from('reviews').delete().eq('id', created.id)
        return NextResponse.json({ error: tagErr.message }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      review_id: created.id,
      censored_comment: censoredComment, // optional, can remove
    })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
