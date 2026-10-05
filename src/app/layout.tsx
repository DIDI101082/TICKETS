import type { Metadata } from 'next'
import { Plus_Jakarta_Sans, Inter } from 'next/font/google'
import './globals.css'
import { APP_NOMBRE } from '@/lib/formato'
import { SCRIPT_TEMA } from '@/lib/tema'

// Mismas tipografías que Accusys Cyber
const display = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--font-display' })
const body = Inter({ subsets: ['latin'], variable: '--font-body' })

export const metadata: Metadata = { title: APP_NOMBRE, description: 'Sistema de tickets y mesa de ayuda' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body className={`${display.variable} ${body.variable} font-sans`}>{children}</body>
    </html>
  )
}
