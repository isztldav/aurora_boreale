import * as React from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export function Breadcrumb({ children, className }: React.PropsWithChildren<{ className?: string }>) {
  return (
    <nav className={cn('flex items-center gap-1 text-sm text-muted-foreground', className)} aria-label="Breadcrumb">
      {children}
    </nav>
  )
}

export function BreadcrumbItem({ children }: React.PropsWithChildren) {
  return <div className="flex items-center gap-1">{children}</div>
}

export function BreadcrumbLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link className="hover:text-foreground" href={href}>
      {children}
    </Link>
  )
}

export function BreadcrumbSeparator() {
  return <span className="px-1">/</span>
}

