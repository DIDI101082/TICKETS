import type { Metadata } from 'next'
import './globals.css'
import { APP_NOMBRE } from '@/lib/formato'

export const metadata: Metadata = { title: APP_NOMBRE, description: 'Sistema de tickets y mesa de ayuda' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
