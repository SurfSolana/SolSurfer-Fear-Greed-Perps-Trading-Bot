"use client";

import { useState, useEffect, useMemo } from "react";
import NumberFlow from "@number-flow/react";
import { TrendingUp, AlertTriangle, Zap, Target, Filter } from "lucide-react";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import FilterBar from "@/components/ui/filter-bar";

interface Strategy {
  asset: string;
  strategy: string;
  shortThreshold: number;
  longThreshold: number;
  leverage: number;
  totalReturn: number;
  monthlyReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  totalTrades: number;
  timeInMarket: number;
  liquidations: number;
  riskLevel: "low" | "medium" | "high" | "very-high" | "extreme";
  isRecommended: boolean;
}

interface StrategyCarouselProps {
  onApplyStrategy?: (strategy: Strategy) => void;
  currentAsset?: string;
  className?: string;
}

export function StrategyCarousel({ onApplyStrategy, currentAsset, className = "" }: StrategyCarouselProps) {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filter states
  const [selectedAsset, setSelectedAsset] = useState<string>("all");
  const [selectedStrategy, setSelectedStrategy] = useState<string>("all");
  const [selectedLeverage, setSelectedLeverage] = useState<string>("all");
  const [maxDrawdownThreshold, setMaxDrawdownThreshold] = useState<number>(100);
  const [dataInterval, setDataInterval] = useState<string>("4h");

  // Available filter options from database
  const [filterOptions, setFilterOptions] = useState<{
    assets: string[];
    strategies: string[];
    leverages: number[];
    thresholdRanges: { short: number; long: number }[];
    ranges: any;
  }>({
    assets: [],
    strategies: [],
    leverages: [],
    thresholdRanges: [],
    ranges: {},
  });

  // Fetch filter options from database
  useEffect(() => {
    const fetchFilterOptions = async () => {
      try {
        const res = await fetch("/api/strategies/filter-options");
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setFilterOptions(data.options);
          }
        }
      } catch (error) {
        console.error("Failed to fetch filter options:", error);
      }
    };

    fetchFilterOptions();
  }, []);

  // Normalize asset options to base tickers (e.g., ETH from ETH-PERP)
  const assetOptions = useMemo(() => {
    const bases = new Set<string>()
    for (const a of filterOptions.assets) {
      const base = String(a || '').toUpperCase().split('-')[0]
      if (base) bases.add(base)
    }
    const list = Array.from(bases)
    if (list.length === 0) return ["ETH","BTC","SOL"]
    // Keep a stable, expected order if present
    const pref = ["ETH","BTC","SOL"]
    const rest = list.filter(x => !pref.includes(x)).sort()
    return pref.filter(x => list.includes(x)).concat(rest)
  }, [filterOptions.assets])

  // Fetch top strategies
  useEffect(() => {
    const fetchStrategies = async () => {
      try {
  const params = new URLSearchParams({ limit: '50', sortBy: 'totalReturn' })
  if (selectedAsset && selectedAsset !== 'all') params.set('asset', selectedAsset.toUpperCase())
        const res = await fetch(`/api/strategies/top?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setStrategies(data.strategies);
          }
        }
      } catch (error) {
        console.error("Failed to fetch strategies:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStrategies();
  }, [selectedAsset]);

  // Filter strategies based on current filters
  const filteredStrategies = useMemo(() => {
    return strategies.filter((strategy) => {
      // Asset filter
      if (selectedAsset !== "all" && strategy.asset !== selectedAsset) return false;

      // Strategy type filter
      if (selectedStrategy !== "all" && strategy.strategy !== selectedStrategy) return false;

      // Data interval filter - This is a mock filter, as the backend does not yet support it
      // This is ready for when the backend is updated
      // if (dataInterval !== "all" && strategy.dataInterval !== dataInterval) return false;

      // Leverage filter
      if (selectedLeverage !== "all" && strategy.leverage !== parseInt(selectedLeverage)) return false;

      // Max drawdown filter
      if (Math.abs(strategy.maxDrawdown) > maxDrawdownThreshold) return false;

      return true;
    });
  }, [strategies, selectedAsset, selectedStrategy, dataInterval, selectedLeverage, maxDrawdownThreshold]);

  // Group by displayed totalReturn (1 decimal) per asset+strategy
  const grouped = useMemo(() => {
    type Group = {
      key: string
      representative: Strategy
      items: Strategy[]
      roundedTotal: number
      // precomputed param sets
      shorts: number[]
      longs: number[]
      levs: number[]
      minShort: number
      maxShort: number
      minLong: number
      maxLong: number
      minLev: number
      maxLev: number
    }

    const map = new Map<string, Group>()
    for (const s of filteredStrategies) {
      const rounded = Number(s.totalReturn.toFixed(1))
      const key = `${s.asset}|${s.strategy}|${rounded}`
      const g = map.get(key)
      if (!g) {
        map.set(key, {
          key,
          representative: s,
          items: [s],
          roundedTotal: rounded,
          shorts: [s.shortThreshold],
          longs: [s.longThreshold],
          levs: [s.leverage],
          minShort: s.shortThreshold,
          maxShort: s.shortThreshold,
          minLong: s.longThreshold,
          maxLong: s.longThreshold,
          minLev: s.leverage,
          maxLev: s.leverage,
        })
      } else {
        g.items.push(s)
        // collect distincts
        if (!g.shorts.includes(s.shortThreshold)) g.shorts.push(s.shortThreshold)
        if (!g.longs.includes(s.longThreshold)) g.longs.push(s.longThreshold)
        if (!g.levs.includes(s.leverage)) g.levs.push(s.leverage)
        // update ranges
        g.minShort = Math.min(g.minShort, s.shortThreshold)
        g.maxShort = Math.max(g.maxShort, s.shortThreshold)
        g.minLong = Math.min(g.minLong, s.longThreshold)
        g.maxLong = Math.max(g.maxLong, s.longThreshold)
        g.minLev = Math.min(g.minLev, s.leverage)
        g.maxLev = Math.max(g.maxLev, s.leverage)
      }
    }

    // maintain original ordering by representative in filtered list
    const order = new Map<string, number>()
    filteredStrategies.forEach((s, idx) => {
      const rounded = Number(s.totalReturn.toFixed(1))
      const key = `${s.asset}|${s.strategy}|${rounded}`
      if (!order.has(key)) order.set(key, idx)
    })

    return Array.from(map.values()).sort((a, b) => (order.get(a.key)! - order.get(b.key)!))
  }, [filteredStrategies])

  // Utility to present a compact param value or range
  function renderValueOrRange(values: number[], min: number, max: number, suffix = '') {
    const distinct = [...values].sort((a,b)=>a-b)
    if (distinct.length === 1) return <span className="font-mono font-semibold">{distinct[0]}{suffix}</span>
    // If 5 or fewer distinct values, list them; else show range
    if (distinct.length <= 5) {
      return <span className="font-mono font-semibold">{distinct.join(', ')}{suffix}</span>
    }
    return <span className="font-mono font-semibold">{min}–{max}{suffix}</span>
  }

  // Reset filters
  const resetFilters = () => {
    setSelectedAsset("all");
    setSelectedStrategy("all");
    setSelectedLeverage("all");
    setMaxDrawdownThreshold(100);
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case "low":
        return "text-green-400 bg-green-400/10";
      case "medium":
        return "text-yellow-400 bg-yellow-400/10";
      case "high":
        return "text-orange-400 bg-orange-400/10";
      case "very-high":
        return "text-red-400 bg-red-400/10";
      case "extreme":
        return "text-red-600 bg-red-600/10";
      default:
        return "text-gray-400 bg-gray-400/10";
    }
  };

  const getStrategyIcon = (strategy: string) => {
    return strategy === "momentum" ? <TrendingUp className="w-4 h-4" /> : <Zap className="w-4 h-4" />;
  };

  if (isLoading) {
    return (
      <div className={`bg-card border border-border rounded-xl p-8 ${className}`}>
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading top strategies...</div>
        </div>
      </div>
    );
  }

  if (strategies.length === 0) {
    return null;
  }

  const activeFiltersCount = [selectedAsset !== "all", selectedStrategy !== "all", selectedLeverage !== "all", maxDrawdownThreshold !== 100].filter(Boolean).length;

  return (
    <div className={`bg-card border border-border rounded-xl p-6 ${className}`}>
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-white mb-1">Top Performing Strategies</h2>
            <p className="text-sm text-muted-foreground">Based on historical backtest data</p>
          </div>
          {activeFiltersCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 text-sm">
              <Filter className="w-4 h-4" />
              <span>{activeFiltersCount} Active Filter{activeFiltersCount > 1 ? 's' : ''}</span>
            </div>
          )}
        </div>

        {/* Filter controls */}
        <FilterBar
          className=""
          assets={assetOptions}
          strategies={["momentum", "contrarian"]}
          leverages={filterOptions.leverages.length ? filterOptions.leverages : [1,2,3,4,5,6,7,8,9,10]}
          selectedAsset={selectedAsset}
          selectedStrategy={selectedStrategy}
          selectedLeverage={selectedLeverage}
          maxDrawdownThreshold={maxDrawdownThreshold}
          totalCount={strategies.length}
          filteredCount={filteredStrategies.length}
          onChangeAsset={setSelectedAsset}
          onChangeStrategy={setSelectedStrategy}
          onChangeLeverage={setSelectedLeverage}
          onChangeMaxDrawdown={setMaxDrawdownThreshold}
          onReset={resetFilters}
        />
      </div>

      {grouped.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-muted-foreground">
          <div className="text-center">
            <Filter className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No strategies match your filters</p>
            <button onClick={resetFilters} className="mt-2 text-sm text-cyan-400 hover:text-cyan-300 transition-colors">
              Clear filters
            </button>
          </div>
        </div>
      ) : (
        <Carousel
          opts={{
            align: "start",
            loop: true,
          }}
          className="w-full"
        >
          <CarouselContent className="-ml-2 md:-ml-4">
            {grouped.map((group, index) => {
              const strategy = group.representative
              const variantCount = group.items.length
              return (
              <CarouselItem key={group.key + index} className="pl-2 md:pl-4 md:basis-1/3">
                <div className={`bg-black/30 rounded-lg p-4 border ${strategy.isRecommended ? "border-green-400/30" : "border-border/50"} h-full relative`}>
                  {strategy.isRecommended && (
                    <div className="absolute top-2 right-2">
                      <span className="px-2 py-0.5 text-xs font-medium bg-green-400/20 text-green-400 rounded-full">REC</span>
                    </div>
                  )}

                  <div className="flex flex-col h-full">
                    {/* Header: Asset & Strategy */}
                    <div className="mb-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xl font-bold text-white">{strategy.asset}</span>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          {getStrategyIcon(strategy.strategy)}
                          <span className="capitalize">{strategy.strategy}</span>
                          {variantCount > 1 && (
                            <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium bg-cyan-400/15 text-cyan-300">
                              {variantCount} variants
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="space-y-2">
                        {/* Strategy type and thresholds */}
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium capitalize text-cyan-400">
                            {strategy.strategy}
                          </div>
                          <div className={`px-1.5 whitespace-nowrap py-0.5 rounded text-xs font-medium ${getRiskColor(strategy.riskLevel)}`}>
                            {strategy.riskLevel.toUpperCase().replace("-", " ")} RISK
                          </div>
                        </div>
                        
                        {/* FGI Thresholds / Parameter variants */}
                        <div className="bg-black/50 rounded p-2 space-y-1">
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-muted-foreground">Short below:</span>
                            <span className="text-red-400">{renderValueOrRange(group.shorts, group.minShort, group.maxShort)}</span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-muted-foreground">Long above:</span>
                            <span className="text-green-400">{renderValueOrRange(group.longs, group.minLong, group.maxLong)}</span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-muted-foreground">Leverage:</span>
                            <span className="text-fuchsia-400">{renderValueOrRange(group.levs, group.minLev, group.maxLev, 'x')}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Returns */}
                    <div className="flex-1 space-y-3">
                      <div>
                        <div className="text-xs text-muted-foreground mb-0.5">Total Return</div>
                        <div className={`text-2xl font-bold font-mono ${group.roundedTotal >= 0 ? "text-green-400" : "text-red-400"}`}>
                          <NumberFlow value={group.roundedTotal} format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }} suffix="%" />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="text-xs text-muted-foreground">Monthly</div>
                          <div className={`text-sm font-mono font-semibold ${strategy.monthlyReturn >= 0 ? "text-green-400" : "text-red-400"}`}>
                            <NumberFlow value={strategy.monthlyReturn} format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }} suffix="%" />
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Sharpe</div>
                          <div className={`text-sm font-mono font-semibold ${strategy.sharpeRatio > 1 ? "text-green-400" : strategy.sharpeRatio > 0 ? "text-yellow-400" : "text-red-400"}`}>
                            <NumberFlow value={strategy.sharpeRatio} format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }} />
                          </div>
                        </div>
                      </div>

                      {/* Metrics Grid */}
                      <div className="grid grid-cols-2 gap-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Win:</span>
                          <span className="font-mono font-semibold text-blue-400">
                            <NumberFlow value={strategy.winRate} format={{ minimumFractionDigits: 0, maximumFractionDigits: 0 }} suffix="%" />
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">DD:</span>
                          <span className="font-mono font-semibold text-red-400">
                            <NumberFlow value={-Math.abs(strategy.maxDrawdown)} format={{ minimumFractionDigits: 0, maximumFractionDigits: 0 }} suffix="%" />
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Trades:</span>
                          <span className="font-mono font-semibold text-cyan-400">{strategy.totalTrades}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Time:</span>
                          <span className="font-mono font-semibold text-blue-400">
                            <NumberFlow value={strategy.timeInMarket} format={{ minimumFractionDigits: 0, maximumFractionDigits: 0 }} suffix="%" />
                          </span>
                        </div>
                      </div>

                      {strategy.liquidations > 0 && (
                        <div className="flex items-center gap-1 p-1.5 bg-red-500/10 border border-red-500/20 rounded text-xs">
                          <AlertTriangle className="w-3 h-3 text-red-500" />
                          <span className="text-red-400">{strategy.liquidations} liquidations</span>
                        </div>
                      )}
                    </div>

                    {/* Apply Button */}
                    <button onClick={() => onApplyStrategy?.(strategy)} className="w-full mt-3 px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 rounded-lg text-cyan-400 font-medium text-xs transition-colors flex items-center justify-center gap-1">
                      <Target className="w-3 h-3" />
                      Apply Strategy
                    </button>
                  </div>
                </div>
              </CarouselItem>
              )})}
          </CarouselContent>
          <CarouselPrevious className="-left-12 bg-black/50 border-border/50 hover:bg-black/70 text-white" />
          <CarouselNext className="-right-12 bg-black/50 border-border/50 hover:bg-black/70 text-white" />
        </Carousel>
      )}
    </div>
  );
}
