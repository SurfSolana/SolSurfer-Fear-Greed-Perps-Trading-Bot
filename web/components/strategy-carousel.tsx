"use client";

import { useState, useEffect, useMemo } from "react";
import NumberFlow from "@number-flow/react";
import { TrendingUp, AlertTriangle, Zap, Target, Filter, X } from "lucide-react";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";

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

export function StrategyCarousel({ onApplyStrategy, currentAsset = "ETH", className = "" }: StrategyCarouselProps) {
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

  // Fetch top strategies
  useEffect(() => {
    const fetchStrategies = async () => {
      try {
        const res = await fetch("/api/strategies/top?limit=50&sortBy=totalReturn");
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
  }, []);

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
        <div className="bg-black/30 border border-border/50 rounded-lg p-4 space-y-4">
            {/* Ranges info card */}
            {filterOptions.thresholdRanges.length > 0 && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mb-4">
                <div className="flex items-start gap-2">
                  <div className="text-blue-400 mt-0.5">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-blue-300 mb-1">Why don't filters change results?</div>
                    <div className="text-xs text-blue-200/80">
                      Backtests were run with specific FGI threshold ranges: {filterOptions.thresholdRanges.slice(0, 3).map((r) => 
                        `${r.short}-${r.long}`
                      ).join(', ')}{filterOptions.thresholdRanges.length > 3 && `, and ${filterOptions.thresholdRanges.length - 3} more`}.
                      The system tests these exact combinations, not every possible value.
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Primary filters */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* Asset filter */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Token</label>
                <select value={selectedAsset} onChange={(e) => setSelectedAsset(e.target.value)} className="w-full px-2 py-1.5 bg-black/50 border border-border/50 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/50">
                  <option value="all">All Tokens</option>
                  {filterOptions.assets.map((asset) => (
                    <option key={asset} value={asset}>
                      {asset}
                    </option>
                  ))}
                </select>
              </div>

              {/* Strategy type filter */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Strategy</label>
                <div className="flex items-center gap-2">
                  <button onClick={() => setSelectedStrategy("all")} className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${selectedStrategy === "all" ? "bg-cyan-500/20 text-cyan-400" : "bg-black/50 hover:bg-black/70"}`}>All</button>
                  <button onClick={() => setSelectedStrategy("momentum")} className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${selectedStrategy === "momentum" ? "bg-cyan-500/20 text-cyan-400" : "bg-black/50 hover:bg-black/70"}`}>Momentum</button>
                  <button onClick={() => setSelectedStrategy("contrarian")} className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${selectedStrategy === "contrarian" ? "bg-cyan-500/20 text-cyan-400" : "bg-black/50 hover:bg-black/70"}`}>Contrarian</button>
                </div>
              </div>

              {/* Data interval filter */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Data Interval</label>
                <select value={dataInterval} onChange={(e) => setDataInterval(e.target.value)} className="w-full px-2 py-1.5 bg-black/50 border border-border/50 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/50">
                  <option value="15min">15 minutes</option>
                  <option value="1h">1 hour</option>
                  <option value="4h">4 hours</option>
                  <option value="24h">24 hours</option>
                </select>
              </div>

              {/* Leverage filter */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Leverage</label>
                <select value={selectedLeverage} onChange={(e) => setSelectedLeverage(e.target.value)} className="w-full px-2 py-1.5 bg-black/50 border border-border/50 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/50">
                  <option value="all">All Leverage</option>
                  <option value="1">1x</option>
                  <option value="2">2x</option>
                  <option value="3">3x</option>
                  <option value="4">4x</option>
                  <option value="5">5x</option>
                  <option value="6">6x</option>
                  <option value="7">7x</option>
                  <option value="8">8x</option>
                  <option value="9">9x</option>
                  <option value="10">10x</option>
                </select>
              </div>

              {/* Max drawdown filter */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Max DD: &lt; {maxDrawdownThreshold}%</label>
                <input type="range" min="10" max="100" step="5" value={maxDrawdownThreshold} onChange={(e) => setMaxDrawdownThreshold(parseInt(e.target.value))} className="w-full h-1.5 bg-black/50 rounded-lg appearance-none cursor-pointer slider-thumb" />
              </div>
            </div>


            <div className="flex items-center justify-between pt-2 border-t border-border/30">
              <div className="text-xs text-muted-foreground">
                Showing {filteredStrategies.length} of {strategies.length} strategies
              </div>
              {activeFiltersCount > 0 && (
                <button onClick={resetFilters} className="flex items-center gap-1 px-2 py-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors">
                  <X className="w-3 h-3" />
                  Clear filters
                </button>
              )}
            </div>
        </div>
      </div>

      {filteredStrategies.length === 0 ? (
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
            {filteredStrategies.map((strategy, index) => (
              <CarouselItem key={index} className="pl-2 md:pl-4 md:basis-1/3">
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
                        
                        {/* FGI Thresholds */}
                        <div className="bg-black/50 rounded p-2 space-y-1">
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-muted-foreground">Short below:</span>
                            <span className="font-mono font-semibold text-red-400">{strategy.shortThreshold}</span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-muted-foreground">Long above:</span>
                            <span className="font-mono font-semibold text-green-400">{strategy.longThreshold}</span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-muted-foreground">Leverage:</span>
                            <span className="font-mono font-semibold text-fuchsia-400">{strategy.leverage}x</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Returns */}
                    <div className="flex-1 space-y-3">
                      <div>
                        <div className="text-xs text-muted-foreground mb-0.5">Total Return</div>
                        <div className={`text-2xl font-bold font-mono ${strategy.totalReturn >= 0 ? "text-green-400" : "text-red-400"}`}>
                          <NumberFlow value={strategy.totalReturn} format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }} suffix="%" />
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
            ))}
          </CarouselContent>
          <CarouselPrevious className="-left-12 bg-black/50 border-border/50 hover:bg-black/70 text-white" />
          <CarouselNext className="-right-12 bg-black/50 border-border/50 hover:bg-black/70 text-white" />
        </Carousel>
      )}
    </div>
  );
}
