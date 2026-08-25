import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'Kekehyu Hotel — In-Room Experience',
    template: '%s | Kekehyu Hotel',
  },
  description:
    'Your personal in-room concierge. Order food, book spa treatments, and request services — all from your device.',
  keywords: ['hotel', 'room service', 'spa booking', 'concierge', 'QR ordering'],
  openGraph: {
    title: 'Kekehyu Hotel — In-Room Experience',
    description: 'Your personal in-room concierge',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="min-h-full bg-slate-950 text-white antialiased">
        {children}
      </body>
    </html>
  )
}
