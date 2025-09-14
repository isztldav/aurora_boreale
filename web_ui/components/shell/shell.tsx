"use client"

import Link from 'next/link'
import { useUI } from '@/lib/store'
import { cn } from '@/lib/utils'

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid grid-cols-[240px_1fr]">
      <Sidebar />
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="p-6 flex-1">{children}</main>
      </div>
    </div>
  )
}

function Sidebar() {
  const { sidebarOpen } = useUI()
  return (
    <aside className={cn('border-r bg-card', sidebarOpen ? 'block' : 'block')}>
      <div className="p-4 text-lg font-semibold">Unified Dashboard</div>
      <nav className="px-2 space-y-1">
        <Link className="block px-3 py-2 rounded-md hover:bg-muted" href="/">Projects</Link>
        <Link className="block px-3 py-2 rounded-md hover:bg-muted" href="/agents">Agents</Link>
      </nav>
    </aside>
  )
}

function Header() {
  return (
    <header className="border-b bg-background">
      <div className="px-6 py-3 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">Modern training platform UI</div>
        <div className="text-sm">v1</div>
      </div>
    </header>
  )
}
