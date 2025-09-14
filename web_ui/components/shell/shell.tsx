"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/theme-toggle'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { CommandPalette, useCommandPalette } from '@/components/command-palette'
import { SidebarProvider, Sidebar, SidebarContent, SidebarHeader, SidebarFooter, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarGroup, SidebarGroupLabel, SidebarGroupContent, SidebarTrigger } from '@/components/ui/sidebar'

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex">
        <AppSidebar />
        <div className="flex flex-col min-h-screen flex-1">
          <TopBar />
          <main className="p-6 flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  )
}

function TopBar() {
  return (
    <header className="border-b bg-background">
      <div className="px-4 py-3 flex items-center gap-3">
        <SidebarTrigger className="-ml-1" />
        <span className="text-base font-medium">Dashboard</span>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <div className="hidden md:block">
            <Input placeholder="Search…" className="w-[260px]" />
          </div>
          <OpenCommandPalette />
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <Avatar>
                  <AvatarFallback>U</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href="/settings">Settings</Link>
              </DropdownMenuItem>
              <DropdownMenuItem>Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}

function AppSidebar() {
  const pathname = usePathname()
  const NavLink = ({ href, label, icon }: { href: string; label: string; icon?: React.ReactNode }) => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link href={href} className={cn('flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted', pathname === href ? 'bg-muted text-foreground' : 'text-muted-foreground')}>
            {icon}<span>{label}</span>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="px-2 text-base font-semibold">Unified Dashboard</div>
      </SidebarHeader>
      <SidebarContent>
        <div className="px-1 pb-3">
          <Button className="w-full">Quick Create</Button>
        </div>
        <SidebarGroup>
          <SidebarGroupLabel>Core</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink href="/" label="Projects" />
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink href="/agents" label="Agents" />
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Admin</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink href="/settings" label="Settings" />
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="text-xs text-muted-foreground">v1</div>
      </SidebarFooter>
    </Sidebar>
  )
}

function OpenCommandPalette() {
  const { open, setOpen } = useCommandPalette()
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} title="Search (Ctrl+K)">Search</Button>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </>
  )
}
