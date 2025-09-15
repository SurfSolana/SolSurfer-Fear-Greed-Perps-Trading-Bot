import { parse } from 'csv-parse/sync';

export interface BacktestCSVRow {
  leverage: number;
  shortThreshold: number;
  longThreshold: number;
  totalReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  numTrades: number;
  winRate: number;
  liquidations: number;
  timeInMarket: number;
}

export function parseBacktestCSV(csvContent: string): BacktestCSVRow[] {
  if (!csvContent.trim()) {
    return [];
  }

  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
  });

  return records.map((record: any) => ({
    leverage: Number(record.Leverage),
    shortThreshold: Number(record.ShortThreshold),
    longThreshold: Number(record.LongThreshold),
    totalReturn: Number(record['TotalReturn%']),
    sharpeRatio: Number(record.SharpeRatio),
    maxDrawdown: Number(record['MaxDrawdown%']),
    numTrades: Number(record.NumTrades),
    winRate: Number(record['WinRate%']),
    liquidations: Number(record.Liquidations),
    timeInMarket: Number(record['TimeInMarket%']),
  }));
}