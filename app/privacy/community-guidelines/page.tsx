export default function CommunityGuidelinesPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold mb-6">Community Guidelines</h1>

      <p>
        RatedWheels exists to help riders share honest experiences and improve safety.
        We do not allow harassment, defamation, or abuse.
      </p>

      <ul className="mt-6 list-disc pl-6 space-y-2">
        <li>Reviews must reflect genuine, first-hand experiences.</li>
        <li>No threats, hate speech, or personal attacks.</li>
        <li>No posting private or sensitive personal information.</li>
        <li>No false statements presented as fact.</li>
        <li>No impersonation or coordinated harassment.</li>
      </ul>

      <p className="mt-6">
        We reserve the right to remove content or restrict access that violates these
        guidelines.
      </p>
    </main>
  )
}
