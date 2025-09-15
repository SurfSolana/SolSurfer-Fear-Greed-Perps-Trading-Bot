/**
 * Reusable skeleton loading components for consistent loading states
 */

import React from 'react'
import { cn } from '@/lib/utils'

// Base skeleton component
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-gray-200 dark:bg-gray-700",
        className
      )}
      {...props}
    />
  )
}

// Specialized skeleton components for common use cases

export function ChartSkeleton({ height = 400 }: { height?: number }) {
  return (
    <div className={`w-full space-y-4`} style={{ height }}>
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-6 w-32" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-12" />
          <Skeleton className="h-8 w-12" />
          <Skeleton className="h-8 w-12" />
        </div>
      </div>
      
      <Skeleton className="w-full h-64" />
      
      <div className="flex items-center gap-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="w-3 h-3 rounded-full" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full space-y-3">
      {/* Header */}
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
      
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="grid gap-4" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {Array.from({ length: cols }).map((_, colIndex) => (
            <Skeleton key={colIndex} className="h-4 w-full" />
          ))}
        </div>
      ))}
    </div>
  )
}

export function CardSkeleton({ 
  title = true, 
  content = true, 
  footer = false 
}: { 
  title?: boolean
  content?: boolean
  footer?: boolean
}) {
  return (
    <div className="border rounded-lg p-6 space-y-4">
      {title && (
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      )}
      
      {content && (
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      )}
      
      {footer && (
        <div className="flex justify-between items-center pt-4">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-16" />
        </div>
      )}
    </div>
  )
}

export function StatsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="p-4 border rounded-lg space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  )
}

export function ListSkeleton({ items = 5 }: { items?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex items-center space-x-3 p-3 border rounded-lg">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-6 w-16" />
        </div>
      ))}
    </div>
  )
}

export function VisualizationSkeleton({ fullWidth = false }: { fullWidth?: boolean }) {
  const height = fullWidth ? 400 : 250
  
  return (
    <div className="space-y-6">
      {/* Title area */}
      <div className="text-center space-y-2">
        <Skeleton className="h-8 w-64 mx-auto" />
        <Skeleton className="h-4 w-48 mx-auto" />
      </div>
      
      {/* Main visualization area */}
      <div className="relative">
        <Skeleton className={`w-full rounded-lg`} style={{ height }} />
        
        {/* Simulate interactive elements */}
        <div className="absolute bottom-4 left-4">
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="absolute bottom-4 right-4">
          <Skeleton className="h-4 w-16" />
        </div>
      </div>
      
      {/* Stats area */}
      <div className="text-center space-y-4">
        <Skeleton className="h-12 w-32 mx-auto" />
        <Skeleton className="h-4 w-40 mx-auto" />
        
        <div className="flex justify-center gap-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-4 w-8" />
            </div>
          ))}
        </div>
      </div>
      
      {/* Badge area */}
      <div className="flex justify-center">
        <Skeleton className="h-8 w-32 rounded-full" />
      </div>
    </div>
  )
}

export function FormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <div className="space-y-6">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
      
      <div className="flex gap-3 pt-4">
        <Skeleton className="h-10 w-20" />
        <Skeleton className="h-10 w-16" />
      </div>
    </div>
  )
}