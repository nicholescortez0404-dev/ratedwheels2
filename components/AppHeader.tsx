import Link from "next/link";
import Image from "next/image";
import Container from "./Container";

export default function AppHeader() {
  return (
    <header className="border-b border-gray-200 bg-[#ffeed5]">
      <Container className="h-20">
        <div className="grid h-full grid-cols-3 items-center">
          {/* Left: Brand text */}
          <div className="justify-self-start">
            <Link
              href="/"
              className="text-lg font-bold tracking-tight text-black hover:opacity-80 transition"
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
    <div className="relative h-20 w-20">
      <Image
        src="/logos/rw-logov2.png"
        alt="RatedWheels"
        fill
        priority
        sizes="80px"
        className="select-none object-contain scale-150"
      />
    </div>
  </Link>
</div>


          {/* Right: Directory link */}
          <div className="justify-self-end">
            <Link
              href="/drivers"
              className="inline-flex h-11 items-center justify-center rounded-lg border border-gray-300 bg-transparent px-5 text-sm font-semibold text-gray-900 hover:border-gray-600 transition"
            >
              All drivers
            </Link>
          </div>
        </div>
      </Container>
    </header>
  );
}
