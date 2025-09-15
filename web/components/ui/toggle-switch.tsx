'use client'

import * as React from 'react'
import * as SwitchPrimitives from '@radix-ui/react-switch'
import { cn } from '@/lib/utils'

interface ToggleSwitchProps extends React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root> {
  leftLabel?: string
  rightLabel?: string
  leftValue?: string
  rightValue?: string
}

const ToggleSwitch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  ToggleSwitchProps
>(({ className, leftLabel, rightLabel, leftValue, rightValue, ...props }, ref) => (
  <div className="flex items-center gap-3">
    {leftLabel && (
      <span className={cn(
        "text-sm font-medium transition-colors",
        !props.checked ? "text-foreground" : "text-muted-foreground"
      )}>
        {leftLabel}
      </span>
    )}
    <SwitchPrimitives.Root
      className={cn(
        "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
        className
      )}
      {...props}
      ref={ref}
    >
      <SwitchPrimitives.Thumb
        className={cn(
          "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
        )}
      />
    </SwitchPrimitives.Root>
    {rightLabel && (
      <span className={cn(
        "text-sm font-medium transition-colors",
        props.checked ? "text-foreground" : "text-muted-foreground"
      )}>
        {rightLabel}
      </span>
    )}
  </div>
))
ToggleSwitch.displayName = SwitchPrimitives.Root.displayName

export { ToggleSwitch }