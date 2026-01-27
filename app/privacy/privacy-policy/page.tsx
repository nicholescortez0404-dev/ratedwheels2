// app/privacy/privacy-policy/page.tsx
import { TERMly_RAW_HTML } from './termlyRaw'

const COMPANY_NAME = 'RatedWheels'
const CONTACT_EMAIL = 'support@ratedwheels.app'

// Uses today's date automatically (server-rendered)
function formatLongDate(d: Date) {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function applyTermlyAutofill(raw: string) {
  const today = formatLongDate(new Date())
  const company = escapeHtml(COMPANY_NAME)
  const email = escapeHtml(CONTACT_EMAIL)

  let html = raw

  // 1) Fill the "Last updated" blank (robust to whitespace/newlines)
  html = html.replace(
    /(Last updated\s*<bdt class="question">)\s*__________\s*(<\/bdt>)/i,
    `$1${today}$2`
  )

  // 2) Fill ALL noTranslate blanks with company name
  html = html.replace(
    /<bdt class="question noTranslate">\s*__________\s*<\/bdt>/g,
    `<bdt class="question noTranslate">${company}</bdt>`
  )

  // 3) Fill remaining generic blanks with contact email
  html = html.replace(
    /<bdt class="question">\s*__________\s*<\/bdt>/g,
    `<bdt class="question">${email}</bdt>`
  )

  return html
}

export default function PrivacyPolicyPage() {
  const html = applyTermlyAutofill(TERMly_RAW_HTML)

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold mb-6">Privacy Policy</h1>

      {/* Termly injects its own styling; keep wrapper minimal to avoid CSS fights */}
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </main>
  )
}
