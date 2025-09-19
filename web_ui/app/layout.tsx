import type { Metadata } from 'next'
import './globals.css'
import { QueryProvider } from '@/lib/query-provider'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { APP_METADATA } from '@/lib/app-config'

export const metadata: Metadata = {
  title: APP_METADATA.title,
  description: APP_METADATA.description,
  keywords: [...APP_METADATA.keywords], // Convert readonly array to mutable
  icons: {
    icon: '/icon.svg',
    apple: '/apple-icon.svg',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground">
        <ThemeProvider>
          <QueryProvider>
            {children}
          </QueryProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
