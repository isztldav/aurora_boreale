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
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader } from '@/components/ui/sheet'
import { LayoutDashboard, Users, Settings, Plus, Menu, Tag } from 'lucide-react'
import { APP_NAME, NAV_LABELS, APP_CONFIG } from '@/lib/app-config'

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex">
        {/* Desktop Sidebar - hidden on mobile */}
        <div className="hidden lg:block">
          <AppSidebar />
        </div>

        <div className="flex flex-col min-h-screen flex-1 min-w-0">
          <TopBar />
          <main className="p-4 sm:p-6 flex-1 overflow-auto">
            <div className="mx-auto max-w-7xl">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  )
}


function TopBar() {
  return (
    <header className="border-b bg-background sticky top-0 z-40">
      <div className="px-4 py-3 flex items-center gap-3">
        {/* Mobile Menu */}
        <div className="lg:hidden">
          <MobileNav />
        </div>

        {/* Desktop Sidebar Toggle - only visible on desktop when sidebar is present */}
        <div className="hidden lg:block">
          <SidebarTrigger className="-ml-1" />
        </div>

        <span className="text-base font-medium">{APP_NAME}</span>
        <div className="flex-1" />

        <div className="flex items-center gap-2">
          <div className="hidden md:block">
            <Input placeholder="Search…" className="w-[200px] lg:w-[260px]" />
          </div>
          <div className="md:hidden">
            <OpenCommandPalette />
          </div>
          <div className="hidden md:block">
            <OpenCommandPalette />
          </div>
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
    const isActive = href === '/'
      ? pathname === '/' || pathname.startsWith('/projects')
      : pathname === href
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
            <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 via-cyan-500 to-purple-500 rounded flex items-center justify-center text-white text-sm font-bold">
              A
            </div>
          </div>
        ) : (
          <div className="text-sm font-semibold truncate">{APP_NAME}</div>
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
                    label={NAV_LABELS.dashboard}
                    icon={<LayoutDashboard className="h-4 w-4" />}
                  />
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    href="/agents"
                    label={NAV_LABELS.agents}
                    icon={<Users className="h-4 w-4" />}
                  />
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    href="/tags"
                    label={NAV_LABELS.tags}
                    icon={<Tag className="h-4 w-4" />}
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
                    label={NAV_LABELS.settings}
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
            <div className="text-xs text-muted-foreground">v{APP_CONFIG.version}</div>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">v{APP_CONFIG.version}</div>
        )}
      </SidebarFooter>
    </Sidebar>
  )
}

function MobileNav() {
  const pathname = usePathname()

  const NavLink = ({ href, label, icon, onSelect }: {
    href: string;
    label: string;
    icon: React.ReactNode;
    onSelect?: () => void;
  }) => {
    const isActive = href === '/'
      ? pathname === '/' || pathname.startsWith('/projects')
      : pathname === href
    return (
      <Link
        href={href}
        onClick={onSelect}
        className={cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted',
          isActive ? 'bg-muted text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <div className="flex-shrink-0">{icon}</div>
        <span>{label}</span>
      </Link>
    )
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon">
          <Menu className="h-4 w-4" />
          <span className="sr-only">Toggle navigation menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[300px] sm:w-[400px]">
        <SheetHeader>
          <SheetTitle className="text-left">Navigation</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-6">
          {/* Quick Create */}
          <div>
            <Button className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Quick Create
            </Button>
          </div>

          {/* Core Navigation */}
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">Core</h4>
            <div className="space-y-1">
              <NavLink
                href="/"
                label={NAV_LABELS.dashboard}
                icon={<LayoutDashboard className="h-4 w-4" />}
              />
              <NavLink
                href="/agents"
                label={NAV_LABELS.agents}
                icon={<Users className="h-4 w-4" />}
              />
              <NavLink
                href="/tags"
                label={NAV_LABELS.tags}
                icon={<Tag className="h-4 w-4" />}
              />
            </div>
          </div>

          {/* Admin Navigation */}
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">Admin</h4>
            <div className="space-y-1">
              <NavLink
                href="/settings"
                label={NAV_LABELS.settings}
                icon={<Settings className="h-4 w-4" />}
              />
            </div>
          </div>

          {/* Search on Mobile */}
          <div className="md:hidden">
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Search</h4>
              <Input placeholder="Search…" className="w-full" />
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function OpenCommandPalette() {
  const { open, setOpen } = useCommandPalette()
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} title="Search (Ctrl+K)">
        <span className="hidden sm:inline">Search</span>
        <span className="sm:hidden">⌘K</span>
      </Button>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </>
  )
}
