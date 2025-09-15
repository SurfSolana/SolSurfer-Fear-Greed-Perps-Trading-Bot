export interface TradingConfig {
  asset: string
  leverage: number
  lowThreshold: number
  highThreshold: number
  maxPositionRatio: number
  strategy: 'momentum' | 'contrarian'
  enabled: boolean
  dataInterval: '15min' | '1h' | '4h' | '24h'
}

export const DEFAULT_CONFIG: TradingConfig = {
  asset: 'ETH',
  leverage: 4,
  lowThreshold: 49,
  highThreshold: 50,
  maxPositionRatio: 1.0,
  strategy: 'momentum',
  enabled: true,
  dataInterval: '4h'
}