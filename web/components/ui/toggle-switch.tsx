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
        "peer inline-flex h-8 w-16 shrink-0 cursor-pointer items-center rounded-full border border-white/15 bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-[#a78bfa]/45 data-[state=unchecked]:bg-white/10",
        className
      )}
      {...props}
      ref={ref}
    >
      <SwitchPrimitives.Thumb
        className={cn(
          "pointer-events-none block h-6 w-6 rounded-full bg-white shadow-[0_4px_18px_rgba(167,139,250,0.45)] ring-0 transition-transform data-[state=checked]:translate-x-8 data-[state=unchecked]:translate-x-0"
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
