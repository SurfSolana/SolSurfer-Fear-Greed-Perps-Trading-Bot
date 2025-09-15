'use client'

import { useState, useEffect, useCallback } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ReferenceLine, Area, ComposedChart } from 'recharts'
import { Button } from '@/components/ui/button'
import { ChartDataPoint } from '@/lib/types'
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface FGITimeSeriesProps {
  currentFGI: number
  thresholds?: {
    low: number
    high: number
  }
  asset: 'SOL' | 'ETH' | 'BTC'
  onAssetChange: (asset: 'SOL' | 'ETH') => void
  selectedViewWindow?: ViewWindow
  onViewWindowChange?: (window: ViewWindow) => void
  dataInterval?: DataInterval
  onDataIntervalChange?: (interval: DataInterval) => void
  className?: string
}

export type DataInterval = '15min' | '1h' | '4h';
export type ViewWindow = '7days' | '30days';

interface ViewWindowConfig {
  label: string;
  hours: number;
  intervalMinutes: number;
}

const VIEW_WINDOW_CONFIG: Record<ViewWindow, ViewWindowConfig> = {
  '7days': { label: '7D', hours: 168, intervalMinutes: 360 },
  '30days': { label: '30D', hours: 720, intervalMinutes: 1440 }
};

const DATA_INTERVAL_CONFIG: Record<DataInterval, { label: string }> = {
  '15min': { label: '15M' },
  '1h': { label: '1H' },
  '4h': { label: '4H' },
};

export function FGITimeSeries({
  currentFGI,
  thresholds = { low: 25, high: 75 },
  asset,
  onAssetChange,
  selectedViewWindow: propViewWindow,
  onViewWindowChange,
  dataInterval: propDataInterval,
  onDataIntervalChange,
  className = ""
}: FGITimeSeriesProps) {
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);

  // Use props directly or fallback to defaults
  const selectedViewWindow = propViewWindow || '7days';
  const dataInterval = propDataInterval || '4h';

  // Fetch historical FGI data
  const fetchHistoricalData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/fgi/historical?viewWindow=${selectedViewWindow}&asset=${asset}&dataInterval=${dataInterval}`);
      if (response.ok) {
        const data = await response.json();
        setChartData(data.points || []);
      } else {
        setChartData([]);
      }
    } catch (error) {
      console.error('Failed to fetch historical FGI data:', error);
      setChartData([]);
    } finally {
      setLoading(false);
    }
  }, [asset, selectedViewWindow, dataInterval]);

  // Load data on mount and when parameters change
  useEffect(() => {
    fetchHistoricalData();
  }, [fetchHistoricalData]);

  // Format timestamp for display
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const config = VIEW_WINDOW_CONFIG[selectedViewWindow];

    if (config.hours <= 1) {
      // Show time for short view windows
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: false
      });
    } else if (config.hours <= 24) {
      // Show day/time for medium view windows
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric'
      });
    } else {
      // Show date for long view windows
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
    }
  };

  // Use simple timestamp string for X axis, formatted via formatter

  // Get FGI zone color
  const getFGIColor = (value: number) => {
    if (value <= 25) return '#ef4444'; // red-500 - Extreme Fear
    if (value <= 45) return '#f97316'; // orange-500 - Fear
    if (value <= 55) return '#eab308'; // yellow-500 - Neutral
    if (value <= 75) return '#84cc16'; // lime-500 - Greed
    return '#3b82f6'; // blue-500 - Extreme Greed
  };

  // Custom dot for current value
  const CustomDot = (props: any) => {
    const { cx, cy, payload } = props;
    if (!payload) return null;

    const isLast = payload === chartData[chartData.length - 1];
    if (!isLast) return null;

    return (
      <circle
        cx={cx}
        cy={cy}
        r={6}
        fill={getFGIColor(payload.value)}
        stroke="#ffffff"
        strokeWidth={3}
        className="animate-pulse"
      />
    );
  };

  return (
    <div className={`bg-card border border-border rounded-xl p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-xl font-bold text-foreground">Fear & Greed Index</h2>
            <p className="text-sm text-muted-foreground">Historical trends and current market sentiment</p>
          </div>
          {/* Asset Selector */}
          <Select value={asset} onValueChange={(v) => onAssetChange(v as 'SOL' | 'ETH')}>
            <SelectTrigger className="w-20 h-10 bg-background border-border text-center font-mono font-bold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SOL" className="font-mono">SOL</SelectItem>
              <SelectItem value="ETH" className="font-mono">ETH</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold font-mono" style={{ color: getFGIColor(currentFGI) }}>
            {currentFGI}
          </span>
          <div className="text-xs text-muted-foreground">
            {currentFGI <= 25 ? 'EXTREME FEAR' :
             currentFGI <= 45 ? 'FEAR' :
             currentFGI <= 55 ? 'NEUTRAL' :
             currentFGI <= 75 ? 'GREED' : 'EXTREME GREED'}
          </div>
        </div>
      </div>

      {/* ViewWindow Selector */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex gap-2">
          <span className="text-sm text-muted-foreground self-center mr-2">View:</span>
          {Object.entries(VIEW_WINDOW_CONFIG).map(([key, config]) => (
            <Button
              key={key}
              variant={selectedViewWindow === key ? "default" : "outline"}
              size="sm"
              onClick={() => {
                const newWindow = key as ViewWindow;
                onViewWindowChange?.(newWindow);
              }}
              className="text-xs font-mono"
            >
              {config.label}
            </Button>
          ))}
        </div>
        <div className="flex gap-2 items-center">
           <span className="text-sm text-muted-foreground self-center mr-2">Interval:</span>
          <ToggleGroup 
            type="single" 
            value={dataInterval}
            variant="outline"
            onValueChange={(value: DataInterval) => {
              if (value) {
                onDataIntervalChange?.(value);
              }
            }}
          >
            {Object.entries(DATA_INTERVAL_CONFIG).map(([key, config]) => (
              <ToggleGroupItem 
                key={key}
                value={key}
                size="sm"
                className="text-xs font-mono"
              >
                {config.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>


      {/* Chart */}
      <div className="h-80 w-full">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full"></div>
          </div>
        ) : (
          chartData.length === 0 ? (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              No historical data available for this timeframe.
            </div>
          ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
              <XAxis
                dataKey="timestamp"
                tickFormatter={formatTimestamp}
                stroke="#64748b"
                fontSize={12}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                stroke="#64748b"
                fontSize={12}
                axisLine={false}
                tickLine={false}
              />

              {/* Threshold lines */}
              <ReferenceLine
                y={thresholds.low}
                stroke="#22d3ee"
                strokeDasharray="5 5"
                strokeWidth={2}
                opacity={0.7}
              />
              <ReferenceLine
                y={thresholds.high}
                stroke="#f472b6"
                strokeDasharray="5 5"
                strokeWidth={2}
                opacity={0.7}
              />

              {/* Fear zone (0-50) */}
              <Area
                dataKey="value"
                stroke="none"
                fill="url(#fearGradient)"
                fillOpacity={0.1}
                isAnimationActive={false}
              />

              {/* Main FGI line */}
              <Line
                type="monotone"
                dataKey="value"
                stroke="#8b5cf6"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 6, stroke: '#8b5cf6', strokeWidth: 2, fill: '#ffffff' }}
              />

              {/* Current value indicator */}
              <Line
                type="monotone"
                dataKey="value"
                stroke="transparent"
                strokeWidth={0}
                dot={<CustomDot />}
                activeDot={false}
                isAnimationActive={false}
              />

              {/* Gradient definitions */}
              <defs>
                <linearGradient id="fearGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity="0.3" />
                  <stop offset="50%" stopColor="#eab308" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.3" />
                </linearGradient>
              </defs>

              {/* No brush */}
            </ComposedChart>
          </ResponsiveContainer>
          )
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-4 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-3 h-0.5 bg-cyan-400 opacity-70"></div>
          <span className="text-muted-foreground">Buy Threshold ({thresholds.low})</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-0.5 bg-pink-400 opacity-70"></div>
          <span className="text-muted-foreground">Sell Threshold ({thresholds.high})</span>
        </div>
      </div>
    </div>
  )
}

