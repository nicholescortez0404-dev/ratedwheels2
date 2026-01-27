export default function PrivacyHubPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold mb-3">Legal</h1>
      <p className="text-sm text-gray-600 mb-8">
        Policies and guidelines for RatedWheels.
      </p>

      <ul className="space-y-3 list-disc pl-6">
        <li>
          <a className="underline" href="/privacy/privacy-policy">
            Privacy Policy
          </a>
        </li>
        <li>
          <a className="underline" href="/privacy/community-guidelines">
            Community Guidelines
          </a>
        </li>
      </ul>
    </main>
  )
}
