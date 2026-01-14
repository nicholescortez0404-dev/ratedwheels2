import SearchForm from './search/SearchForm'

export default function Home() {
  return (
    <main className="min-h-screen bg-[#ffeed5] text-black p-8">
      {/* HOME HERO (text-only) */}
      <div className="flex flex-col items-center text-center mt-16">
        <h1 className="text-4xl font-bold">Rated Wheels</h1>
        <p className="mt-2 text-sm text-gray-600">
          Community-powered driver reviews
        </p>
      </div>

      {/* SEARCH */}
      <div className="flex flex-col items-center mt-10">
        <SearchForm />

        <p className="mt-6 text-xs text-gray-600 text-center">
          Built for rider safety, not harassment
        </p>
      </div>
    </main>
  )
}
