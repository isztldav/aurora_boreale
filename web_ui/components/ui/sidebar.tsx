"use client"

import * as React from 'react'
import { cn } from '@/lib/utils'

type SidebarContextValue = {
  collapsed: boolean
  toggle: () => void
}

const SidebarContext = React.createContext<SidebarContextValue | undefined>(undefined)

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState(false)
  const value = React.useMemo(() => ({ collapsed, toggle: () => setCollapsed((v) => !v) }), [collapsed])
  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
}

export function useSidebar() {
  const ctx = React.useContext(SidebarContext)
  if (!ctx) throw new Error('useSidebar must be used within SidebarProvider')
  return ctx
}

export function Sidebar({ className, children }: React.HTMLAttributes<HTMLElement>) {
  const { collapsed } = useSidebar()
  return (
    <aside
      className={cn(
        'border-r bg-card transition-all duration-200 ease-linear overflow-hidden min-h-full flex flex-col',
        collapsed ? 'w-14' : 'w-60',
        className,
      )}
    >
      {children}
    </aside>
  )
}

export function SidebarHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { collapsed } = useSidebar()
  return (
    <div
      className={cn(
        'p-3 border-b',
        collapsed ? 'text-center' : '',
        className
      )}
      {...props}
    />
  )
}

export function SidebarContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-2 flex-1', className)} {...props} />
}

export function SidebarFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-3 mt-auto', className)} {...props} />
}

export function SidebarMenu({ className, ...props }: React.HTMLAttributes<HTMLUListElement>) {
  return <ul className={cn('flex flex-col gap-1', className)} {...props} />
}

export function SidebarMenuItem({ className, ...props }: React.HTMLAttributes<HTMLLIElement>) {
  return <li className={cn('', className)} {...props} />
}

export function SidebarMenuButton({ className, children, asChild, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) {
  const Comp: any = asChild ? 'span' : 'button'
  return (
    <Comp
      className={cn(
        'w-full',
        !asChild && 'flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted transition-colors',
        className,
      )}
      {...props}
    >
      {children}
    </Comp>
  )
}

export function SidebarGroup({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-2', className)} {...props} />
}

export function SidebarGroupLabel({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { collapsed } = useSidebar()
  if (collapsed) return null
  return (
    <div className={cn('px-2 pb-1 text-xs text-muted-foreground', className)} {...props}>
      {children}
    </div>
  )
}

export function SidebarGroupContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('', className)} {...props} />
}

export function SidebarTrigger({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { toggle } = useSidebar()
  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        'inline-flex items-center justify-center rounded-md border bg-background px-2 py-1.5 text-sm hover:bg-muted transition-colors',
        'w-8 h-8',
        className
      )}
      {...props}
    >
      <svg
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 6h16M4 12h16M4 18h16"
        />
      </svg>
      <span className="sr-only">Toggle sidebar</span>
    </button>
  )
}

