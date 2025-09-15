/**
 * Comprehensive type definitions for Lifeguard Token Vault
 * Generated from specs/002-redesign-the-web/data-model.md
 * All 10 core entities plus WebSocket message types
 */

// =============================================================================
// CORE ENTITIES (10)
// =============================================================================

/**
 * FGIData - Fear & Greed Index value and historical data points
 */
export interface FGIData {
  value: number; // 0-100
  timestamp: string; // ISO 8601
  trend: 'up' | 'down' | 'stable';
  changePercent: number;
}

/**
 * TradingStatus - Current state of the trading bot
 */
export interface TradingStatus {
  isActive: boolean;
  mode: 'live' | 'paper' | 'backtest';
  connectionState: 'connected' | 'connecting' | 'disconnected' | 'reconnecting';
  lastUpdate: string; // ISO 8601
}

/**
 * Position - Open trading position
 */
export interface Position {
  id: string;
  asset: string; // e.g., "ETH-PERP"
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  leverage: number; // 1-20
  liquidationPrice: number | null;
}

/**
 * Transaction - Completed trade or bot action
 */
export interface Transaction {
  id: string;
  timestamp: string; // ISO 8601
  action: 'OPEN_LONG' | 'OPEN_SHORT' | 'CLOSE_LONG' | 'CLOSE_SHORT';
  asset: string;
  price: number;
  size: number;
  fgi: number; // 0-100
  pnl: number | null; // null for opens
  fees: number;
}

/**
 * PortfolioMetrics - Aggregated metrics for trading account
 */
export interface PortfolioMetrics {
  totalValue: number;
  dailyPnl: number;
  dailyPnlPercent: number;
  totalPnl: number;
  totalPnlPercent: number;
  winRate: number; // 0-100
  sharpeRatio: number | null;
  maxDrawdown: number;
}

/**
 * TradingParameters - User-configurable bot parameters
 */
export interface TradingParameters {
  asset?: 'SOL' | 'ETH' | 'BTC';
  lowThreshold?: number; // 0-100
  highThreshold?: number; // 0-100
  leverage: number; // 1-20
  strategy?: 'contrarian' | 'momentum';
  fgiBuyThreshold?: number; // 0-100
  fgiSellThreshold?: number; // 0-100
  positionSize?: number; // USD
  maxPositions?: number;
  stopLoss?: number | null; // percentage
  takeProfit?: number | null; // percentage
}

/**
 * BacktestResult - Results from historical simulation
 */
export interface BacktestResult {
  parameters: TradingParameters;
  startDate: string;
  endDate: string;
  totalReturn: number; // percentage
  maxDrawdown: number; // percentage
  sharpeRatio: number;
  trades: number;
  winRate: number; // percentage
  profitFactor: number;
}

/**
 * ChartDataPoint - Individual point for chart visualization
 */
export interface ChartDataPoint {
  timestamp: string; // ISO 8601
  value: number;
  volume: number | null;
  label: string | null;
}

/**
 * Alert - System or trading alert/notification
 */
export interface Alert {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  timestamp: string; // ISO 8601
  actionRequired: boolean;
  dismissed: boolean;
}

/**
 * ThemeSettings - User's visual preferences
 */
export interface ThemeSettings {
  mode: 'dark' | 'light' | 'auto';
  accentColor: string; // hex color
  neonIntensity: 'low' | 'medium' | 'high';
  animations: boolean;
  compactMode: boolean;
}

// =============================================================================
// WEBSOCKET MESSAGE TYPES
// =============================================================================

/**
 * Base WebSocket message structure
 */
export interface BaseWebSocketMessage {
  type: string;
  data: any;
  timestamp: number;
}

/**
 * Inbound WebSocket Messages (Server → Client)
 */
export interface FGIUpdateMessage extends BaseWebSocketMessage {
  type: 'FGI_UPDATE';
  data: FGIData;
}

export interface PositionUpdateMessage extends BaseWebSocketMessage {
  type: 'POSITION_UPDATE';
  data: Position;
}

export interface TradeExecutedMessage extends BaseWebSocketMessage {
  type: 'TRADE_EXECUTED';
  data: Transaction;
}

export interface StatusChangeMessage extends BaseWebSocketMessage {
  type: 'STATUS_CHANGE';
  data: TradingStatus;
}

export interface MetricsUpdateMessage extends BaseWebSocketMessage {
  type: 'METRICS_UPDATE';
  data: PortfolioMetrics;
}

export interface PingMessage extends BaseWebSocketMessage {
  type: 'ping';
  data: {};
}

export interface PongMessage extends BaseWebSocketMessage {
  type: 'pong';
  data: {};
}

export interface ConnectionStatusMessage extends BaseWebSocketMessage {
  type: 'connection_status';
  data: { connected: boolean };
}

export interface ErrorMessage extends BaseWebSocketMessage {
  type: 'error';
  data: { message: string };
}

export interface BotStatusMessage extends BaseWebSocketMessage {
  type: 'bot_status';
  data: TradingStatus;
}

export interface TradeUpdateMessage extends BaseWebSocketMessage {
  type: 'trade_update';
  data: Transaction;
}

export interface FGIUpdateLegacyMessage extends BaseWebSocketMessage {
  type: 'fgi_update';
  data: {
    value: number;
    classification: 'extreme-fear' | 'fear' | 'neutral' | 'greed' | 'extreme-greed';
    timestamp: number;
  };
}

export type InboundWebSocketMessage =
  | FGIUpdateMessage
  | PositionUpdateMessage
  | TradeExecutedMessage
  | StatusChangeMessage
  | MetricsUpdateMessage
  | PingMessage
  | PongMessage
  | ConnectionStatusMessage
  | ErrorMessage
  | BotStatusMessage
  | TradeUpdateMessage
  | FGIUpdateLegacyMessage;

/**
 * Outbound WebSocket Messages (Client → Server)
 */
export interface UpdateParametersMessage extends BaseWebSocketMessage {
  type: 'UPDATE_PARAMETERS';
  data: TradingParameters;
}

export interface ControlBotMessage extends BaseWebSocketMessage {
  type: 'CONTROL_BOT';
  data: {
    action: 'start' | 'stop' | 'pause';
  };
}

export interface RequestBacktestMessage extends BaseWebSocketMessage {
  type: 'REQUEST_BACKTEST';
  data: {
    parameters: TradingParameters;
    startDate: string;
    endDate: string;
  };
}

export type OutboundWebSocketMessage =
  | UpdateParametersMessage
  | ControlBotMessage
  | RequestBacktestMessage
  | PingMessage
  | PongMessage;

/**
 * Union of all WebSocket messages
 */
export type WebSocketMessage = InboundWebSocketMessage | OutboundWebSocketMessage;

// =============================================================================
// UTILITY AND HELPER TYPES
// =============================================================================

/**
 * API Response wrapper type
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * WebSocket connection state
 */
export interface WebSocketConnectionState {
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  lastConnected?: number;
  reconnectAttempts: number;
  error?: string;
}

/**
 * Common component prop types
 */
export interface ComponentProps {
  className?: string;
  children?: React.ReactNode;
}

/**
 * Cache entry for server-side caching
 */
export interface CacheEntry<T = unknown> {
  key: string;
  data: T;
  timestamp: number;
  ttl: number;
}

// =============================================================================
// TYPE UNIONS AND ENUMS
// =============================================================================

export type TradingMode = TradingStatus['mode'];
export type ConnectionState = TradingStatus['connectionState'];
export type PositionSide = Position['side'];
export type TransactionAction = Transaction['action'];
export type AlertType = Alert['type'];
export type ThemeMode = ThemeSettings['mode'];
export type NeonIntensity = ThemeSettings['neonIntensity'];
export type BotControlAction = ControlBotMessage['data']['action'];

// =============================================================================
// VALIDATION AND ERROR TYPES
// =============================================================================

/**
 * Application error type
 */
export interface AppError {
  code: string;
  message: string;
  details?: unknown;
  timestamp: number;
}

/**
 * Validation error extending AppError
 */
export interface ValidationError extends AppError {
  field: string;
  value: unknown;
}

// =============================================================================
// ADDITIONAL INTERFACES FOR WEB CLIENT
// =============================================================================

/**
 * Price update for real-time price feeds
 */
export interface PriceUpdate {
  asset: string;
  price: number;
  timestamp: string; // ISO 8601
}

/**
 * FGI update for real-time fear & greed index feeds
 */
export interface FGIUpdate {
  value: number; // 0-100
  sentiment: string;
  timestamp: string; // ISO 8601
}

/**
 * Backtest parameters (imported from backtest-types.ts)
 */
export interface BacktestParams {
  asset: 'SOL' | 'ETH' | 'BTC';
  timeframe: '15m' | '1h' | '4h';
  leverage: number;
  lowThreshold: number;
  highThreshold: number;
  strategy: 'contrarian' | 'momentum';
  dateRange?: { start: string, end: string };
}

// =============================================================================
// LEGACY TYPES FOR BACKWARD COMPATIBILITY
// =============================================================================

/**
 * @deprecated Use TradingStatus instead
 */
export type BotStatus = TradingStatus;

/**
 * @deprecated Use PortfolioMetrics instead
 */
export interface PerformanceMetrics {
  totalReturn: number;
  annualizedReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  winRate: number;
  totalTrades: number;
  profitFactor: number;
  averageWin: number;
  averageLoss: number;
  renderTime: number;
}

// =============================================================================
// EXPORTS
// =============================================================================

// All types are exported inline above