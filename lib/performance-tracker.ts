import { readJsonFile, writeJsonFile, ensureFile } from './file-operations';
import { formatShortDate } from './date-formatter';

export interface DailyPerformance {
  date: string;
  pnl: number;
  trades: number;
  winRate: number;
  positions: Array<{
    direction: string;
    size: number;
    pnl: number;
    timestamp: string;
  }>;
}

export interface PerformanceSummary {
  totalPnL: number;
  totalTrades: number;
  winRate: number;
  dailyStats: DailyPerformance[];
  currentStreak: number;
  bestDay: number;
  worstDay: number;
}

export class PerformanceTracker {
  private performanceFile: string;
  private performance: Record<string, DailyPerformance>;

  constructor(performanceFile = './data/performance.json') {
    this.performanceFile = performanceFile;
    this.performance = ensureFile(performanceFile, {});
  }

  trackTrade(
    direction: string,
    size: number,
    pnl: number,
    timestamp: Date = new Date()
  ): void {
    const dateKey = formatShortDate(timestamp);

    if (!this.performance[dateKey]) {
      this.performance[dateKey] = {
        date: dateKey,
        pnl: 0,
        trades: 0,
        winRate: 0,
        positions: []
      };
    }

    const daily = this.performance[dateKey];
    daily.positions.push({
      direction,
      size,
      pnl,
      timestamp: timestamp.toISOString()
    });

    daily.pnl += pnl;
    daily.trades++;

    const wins = daily.positions.filter(p => p.pnl > 0).length;
    daily.winRate = daily.trades > 0 ? (wins / daily.trades) * 100 : 0;

    this.save();
  }

  updateDailyPnL(pnl: number, date: Date = new Date()): void {
    const dateKey = formatShortDate(date);

    if (!this.performance[dateKey]) {
      this.performance[dateKey] = {
        date: dateKey,
        pnl: 0,
        trades: 0,
        winRate: 0,
        positions: []
      };
    }

    this.performance[dateKey].pnl = pnl;
    this.save();
  }

  getPerformanceSummary(): PerformanceSummary {
    const dailyStats = Object.values(this.performance);

    const totalPnL = dailyStats.reduce((sum, day) => sum + day.pnl, 0);
    const totalTrades = dailyStats.reduce((sum, day) => sum + day.trades, 0);

    const allPositions = dailyStats.flatMap(day => day.positions);
    const wins = allPositions.filter(p => p.pnl > 0).length;
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

    // Calculate streak
    const sortedDays = dailyStats
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    let currentStreak = 0;
    for (const day of sortedDays) {
      if (day.pnl > 0) {
        currentStreak++;
      } else {
        break;
      }
    }

    const pnls = dailyStats.map(d => d.pnl);
    const bestDay = pnls.length > 0 ? Math.max(...pnls) : 0;
    const worstDay = pnls.length > 0 ? Math.min(...pnls) : 0;

    return {
      totalPnL,
      totalTrades,
      winRate,
      dailyStats,
      currentStreak,
      bestDay,
      worstDay
    };
  }

  getDailyPerformance(date: Date = new Date()): DailyPerformance | null {
    const dateKey = formatShortDate(date);
    return this.performance[dateKey] || null;
  }

  getRecentPerformance(days = 7): DailyPerformance[] {
    const sorted = Object.values(this.performance)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return sorted.slice(0, days);
  }

  reset(): void {
    this.performance = {};
    this.save();
  }

  private save(): void {
    writeJsonFile(this.performanceFile, this.performance);
  }

  private load(): void {
    this.performance = readJsonFile(this.performanceFile) || {};
  }
}