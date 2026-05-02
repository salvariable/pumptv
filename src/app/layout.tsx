import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PumpTV',
  description: 'Second-screen gaming — use your phone as a controller',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
