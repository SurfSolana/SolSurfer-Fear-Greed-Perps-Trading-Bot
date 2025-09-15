export type DataInterval = '15min' | '1h' | '4h' | '24h';

export function getIntervalMs(dataInterval: DataInterval): number {
  switch (dataInterval) {
    case '15min': return 15 * 60 * 1000;
    case '1h': return 60 * 60 * 1000;
    case '4h': return 4 * 60 * 60 * 1000;
    case '24h': return 24 * 60 * 60 * 1000;
    default: return 4 * 60 * 60 * 1000;
  }
}

export function getIntervalHours(dataInterval: DataInterval): number {
  switch (dataInterval) {
    case '15min': return 0.25;
    case '1h': return 1;
    case '4h': return 4;
    case '24h': return 24;
    default: return 4;
  }
}

export function getProgressIntervalMs(dataInterval: DataInterval): number {
  switch (dataInterval) {
    case '15min': return 15 * 1000; // 15 seconds
    case '1h': return 60 * 1000; // 1 minute
    case '4h': return 60 * 1000; // 1 minute
    case '24h': return 60 * 1000; // 1 minute
    default: return 60 * 1000;
  }
}