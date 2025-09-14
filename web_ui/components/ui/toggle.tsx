"use client"

import * as React from 'react'
import * as TogglePrimitive from '@radix-ui/react-toggle'
import { cn } from '@/lib/utils'

export const Toggle = React.forwardRef<
  React.ElementRef<typeof TogglePrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TogglePrimitive.Root>
>(({ className, ...props }, ref) => (
  <TogglePrimitive.Root
    ref={ref}
    className={cn('inline-flex items-center justify-center rounded-md border bg-background px-2 py-1 text-sm font-medium shadow-sm transition-colors data-[state=on]:bg-accent data-[state=on]:text-accent-foreground', className)}
    {...props}
  />
))
Toggle.displayName = 'Toggle'

