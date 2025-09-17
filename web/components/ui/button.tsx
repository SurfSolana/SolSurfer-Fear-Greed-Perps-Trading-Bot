import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold uppercase tracking-[0.28em] text-[0.68rem] transition-transform duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "text-[#080c14]",
        destructive: "text-[#080c14]",
        secondary:
          "text-slate-100 bg-gradient-to-b from-white/10 to-black/40 border border-white/10",
        outline:
          "text-slate-200 bg-transparent border border-white/20 hover:border-white/35",
        ghost:
          "text-slate-300 tracking-[0.18em] uppercase hover:text-white hover:bg-white/5",
        link: "tracking-normal uppercase text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "px-3 py-1.5 rounded-lg",
        default: "px-4 py-2 rounded-xl",
        lg: "px-5 py-2.5 rounded-xl text-[0.7rem]",
        icon: "size-9 rounded-xl tracking-normal",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  const resolvedVariant = variant ?? "default"
  const variantToData: Record<string, string> = {
    default: "primary",
    destructive: "danger",
    secondary: "secondary",
    outline: "outline",
    ghost: "ghost",
    link: "link",
  }

  const baseClass = resolvedVariant === "link" ? "" : "neo-button"

  return (
    <Comp
      data-slot="button"
      data-variant={variantToData[resolvedVariant] ?? resolvedVariant}
      className={cn(baseClass, buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { Button, buttonVariants }
