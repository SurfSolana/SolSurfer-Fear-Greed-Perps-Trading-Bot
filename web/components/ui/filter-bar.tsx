"use client"

import { X, Filter as FilterIcon, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import Link from "next/link"

export interface FilterBarProps {
  className?: string
  // Options
  assets: string[]
  strategies: string[]
  leverages: number[]
  // Current values
  selectedAsset: string
  selectedStrategy: string
  selectedLeverage: string
  maxDrawdownThreshold: number
  // Counts & info
  totalCount?: number
  filteredCount?: number
  infoNote?: string
  // Handlers
  onChangeAsset: (v: string) => void
  onChangeStrategy: (v: string) => void
  onChangeLeverage: (v: string) => void
  onChangeMaxDrawdown: (v: number) => void
  onReset?: () => void
}

export function FilterBar({
  className,
  assets,
  strategies,
  leverages,
  selectedAsset,
  selectedStrategy,
  selectedLeverage,
  maxDrawdownThreshold,
  totalCount,
  filteredCount,
  infoNote,
  onChangeAsset,
  onChangeStrategy,
  onChangeLeverage,
  onChangeMaxDrawdown,
  onReset,
}: FilterBarProps) {
  const activeFiltersCount = [
    selectedAsset !== "all",
    selectedStrategy !== "all",
    selectedLeverage !== "all",
    maxDrawdownThreshold !== 100,
  ].filter(Boolean).length

  return (
    <div className={cn("bg-background/40 border border-border rounded-xl p-4 md:p-5", className)}>
      {/* Top row: title + meta + actions */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FilterIcon className="size-4" />
          <span>Filters</span>
          {typeof filteredCount === "number" && typeof totalCount === "number" && (
            <span className="text-foreground/80">• Showing {filteredCount} of {totalCount}</span>
          )}
          {activeFiltersCount > 0 && (
            <span className="ml-1 rounded-full bg-cyan-500/15 text-cyan-300 px-2 py-0.5 text-xs font-medium">
              {activeFiltersCount} active
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link href="/docs" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <Info className="size-4" />
            Docs
          </Link>
          {activeFiltersCount > 0 && (
            <Button variant="ghost" size="sm" onClick={onReset} className="text-cyan-300 hover:text-cyan-200">
              <X className="size-3.5" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Optional inline note area (kept but unused). */}
      {Boolean(infoNote) && (
        <div className="mb-4 rounded-lg border border-blue-500/25 bg-blue-500/10 p-3 text-xs text-blue-200">
          {infoNote}
        </div>
      )}

      {/* Controls grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Asset */}
        <div className="space-y-1.5">
          <div className="text-xs text-muted-foreground">Token</div>
          <Select value={selectedAsset} onValueChange={onChangeAsset}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue placeholder="All Tokens" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tokens</SelectItem>
              {assets.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Strategy */}
        <div className="space-y-1.5">
          <div className="text-xs text-muted-foreground">Strategy</div>
          <Select value={selectedStrategy} onValueChange={onChangeStrategy}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue placeholder="All Strategies" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Strategies</SelectItem>
              {strategies.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Leverage */}
        <div className="space-y-1.5">
          <div className="text-xs text-muted-foreground">Leverage</div>
          <Select value={selectedLeverage} onValueChange={onChangeLeverage}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue placeholder="All Leverage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Leverage</SelectItem>
              {leverages.map((l) => (
                <SelectItem key={l} value={String(l)}>{l}x</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Max DD */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Max Drawdown</span>
            <span className="font-mono text-foreground/80">≤ {maxDrawdownThreshold}%</span>
          </div>
          <div className="px-1 pt-1">
            <Slider
              min={10}
              max={100}
              step={5}
              value={[maxDrawdownThreshold]}
              onValueChange={(v) => onChangeMaxDrawdown(v[0] ?? 100)}
              className="w-full"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default FilterBar
