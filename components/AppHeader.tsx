import Link from "next/link"
import Image from "next/image"
import Container from "@/components/Container"

export default function AppHeader() {
  return (
    <header className="sticky top-0 z-50 bg-[#ffeed5] text-black border-b border-gray-200">
      <Container className="py-4">
        <div className="grid grid-cols-3 items-center">
          {/* Left: Brand text */}
          <div className="justify-self-start">
            <Link
              href="/"
              className="font-bold tracking-tight text-base sm:text-lg hover:opacity-80 transition"
              aria-label="Go to home"
            >
              RatedWheels
            </Link>
          </div>

          {/* Center: Logo (home button) */}
          <div className="justify-self-center">
            <Link
              href="/"
              aria-label="Go home"
              className="inline-flex items-center justify-center rounded-md hover:opacity-80 transition"
            >
              <Image
                src="/logos/rw-logov2.png"
                alt="RatedWheels"
                width={50}
                height={50}
                className="h-20 w-20 select-none"
                priority
              />
            </Link>
          </div>

          {/* Right: Directory link */}
          <div className="justify-self-end">
            <Link
              href="/drivers"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 px-4 text-sm font-semibold text-gray-900 hover:border-gray-600 transition"
            >
              All drivers
            </Link>
          </div>
        </div>
      </Container>
    </header>
  )
}
