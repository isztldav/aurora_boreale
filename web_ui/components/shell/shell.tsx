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
import { SidebarProvider, Sidebar, SidebarContent, SidebarHeader, SidebarFooter, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarGroup, SidebarGroupLabel, SidebarGroupContent, SidebarTrigger, useSidebar } from '@/components/ui/sidebar'
import { LayoutDashboard, Users, Settings, Plus } from 'lucide-react'

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
  const { collapsed } = useSidebar()

  const NavLink = ({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) => {
    const isActive = pathname === href
    const linkContent = (
      <Link
        href={href}
        className={cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted',
          isActive ? 'bg-muted text-foreground font-medium' : 'text-muted-foreground hover:text-foreground',
          collapsed ? 'justify-center px-2' : 'justify-start'
        )}
      >
        <div className="flex-shrink-0">{icon}</div>
        {!collapsed && <span className="truncate">{label}</span>}
      </Link>
    )

    if (collapsed) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              {linkContent}
            </TooltipTrigger>
            <TooltipContent side="right">
              {label}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )
    }

    return linkContent
  }

  return (
    <Sidebar>
      <SidebarHeader>
        {collapsed ? (
          <div className="flex justify-center">
            <div className="w-8 h-8 bg-primary rounded flex items-center justify-center text-primary-foreground text-sm font-bold">
              U
            </div>
          </div>
        ) : (
          <div className="text-sm font-semibold truncate">Unified Dashboard</div>
        )}
      </SidebarHeader>

      <SidebarContent className="py-4">
        {/* Quick Create Button */}
        <div className="px-2 mb-4">
          {collapsed ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" className="w-full">
                    <Plus className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  Quick Create
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <Button className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Quick Create
            </Button>
          )}
        </div>

        {/* Core Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel>Core</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    href="/"
                    label="Projects"
                    icon={<LayoutDashboard className="h-4 w-4" />}
                  />
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    href="/agents"
                    label="Agents"
                    icon={<Users className="h-4 w-4" />}
                  />
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Admin Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel>Admin</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    href="/settings"
                    label="Settings"
                    icon={<Settings className="h-4 w-4" />}
                  />
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        {collapsed ? (
          <div className="flex justify-center">
            <div className="text-xs text-muted-foreground">v1</div>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">v1</div>
        )}
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
