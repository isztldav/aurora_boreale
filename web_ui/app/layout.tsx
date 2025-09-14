import type { Metadata } from 'next'
import './globals.css'
import { QueryProvider } from '@/lib/query-provider'

export const metadata: Metadata = {
  title: 'Unified Training Dashboard',
  description: 'Modern UI for managing training projects and runs',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground">
        <QueryProvider>
          {children}
        </QueryProvider>
      </body>
    </html>
  )
}

