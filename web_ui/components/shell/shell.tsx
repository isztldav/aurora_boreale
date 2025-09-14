"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/theme-toggle'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { CommandPalette, useCommandPalette } from '@/components/command-palette'

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid grid-cols-[240px_1fr]">
      <Sidebar />
      <div className="flex flex-col min-h-screen">
        <TopBar />
        <main className="p-6 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}

function TopBar() {
  return (
    <header className="border-b bg-background">
      <div className="px-4 py-3 flex items-center gap-3">
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

function Sidebar() {
  const pathname = usePathname()
  const NavLink = ({ href, label, icon }: { href: string; label: string; icon?: React.ReactNode }) => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={href}
            className={cn('flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted text-sm', pathname === href ? 'bg-muted text-foreground' : 'text-muted-foreground')}
          >
            {icon}
            <span>{label}</span>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )

  return (
    <aside className="border-r bg-card">
      <div className="p-4 text-lg font-semibold">Unified Dashboard</div>
      <ScrollArea className="h-[calc(100vh-64px)] px-2 pb-6">
        <div className="px-1 pb-2">
          <Button className="w-full">Quick Create</Button>
        </div>
        <Accordion type="single" collapsible defaultValue="grp-main">
          <AccordionItem value="grp-main">
            <AccordionTrigger>Core</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-1">
                <NavLink href="/" label="Projects" />
                <NavLink href="/agents" label="Agents" />
              </div>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="grp-admin">
            <AccordionTrigger>Admin</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-1">
                <NavLink href="/settings" label="Settings" />
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </ScrollArea>
    </aside>
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
