"use client"

import * as React from 'react'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/dist/style.css'

export function Calendar(props: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      className="p-2 [&_.rdp-day_selected]:bg-primary [&_.rdp-day_selected]:text-primary-foreground"
      {...props}
    />
  )
}

