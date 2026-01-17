import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import AppHeader from "@/components/AppHeader"
import { Analytics } from '@vercel/analytics/react'


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "RatedWheels",
  description: "Community-powered driver reviews",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
  <html lang="en">
    <body
      className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#ffeed5] text-black text-[15px] sm:text-[16px]`}
    >
      <AppHeader />
      {children}
       <Analytics />
    </body>
  </html>
)

}
