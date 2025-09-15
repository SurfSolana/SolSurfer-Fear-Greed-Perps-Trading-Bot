import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

// DEPRECATED: This API reads from JSON files and should not be used in production
// Use /api/backtest/sqlite for database-backed results or /api/strategies/top for consolidated data
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const asset = searchParams.get('asset') || 'ETH';
    const strategy = searchParams.get('strategy') || 'momentum';
    const fgiThreshold = searchParams.get('fgi');
    const leverage = searchParams.get('leverage');

    // Path to backtest data
    const dataPath = path.join(
      process.cwd(),
      '..',
      'data',
      'backtests',
      asset.toLowerCase(),
      strategy,
      'complete-results.json'
    );

    try {
      const fileContent = await fs.readFile(dataPath, 'utf-8');
      const data = JSON.parse(fileContent);

      // If specific parameters requested, return just that result
      if (fgiThreshold && leverage) {
        const result = data.results?.[fgiThreshold]?.[leverage];
        if (result) {
          return NextResponse.json({
            success: true,
            data: result,
            metadata: {
              ...data.metadata,
              dateRange: {
                // Calculate date range based on when data was generated
                endDate: data.metadata.generatedAt,
                startDate: new Date(
                  new Date(data.metadata.generatedAt).getTime() -
                  (data.metadata.daysOfData * 24 * 60 * 60 * 1000)
                ).toISOString(),
                days: data.metadata.daysOfData,
                note: "30-day rolling FGI average applied"
              }
            }
          });
        } else {
          return NextResponse.json(
            { success: false, error: 'No data for specified parameters' },
            { status: 404 }
          );
        }
      }

      // Return full dataset with date range info
      return NextResponse.json({
        success: true,
        data: data.results,
        bestPerformers: data.bestPerformers,
        metadata: {
          ...data.metadata,
          dateRange: {
            endDate: data.metadata.generatedAt,
            startDate: new Date(
              new Date(data.metadata.generatedAt).getTime() -
              (data.metadata.daysOfData * 24 * 60 * 60 * 1000)
            ).toISOString(),
            days: data.metadata.daysOfData,
            note: "30-day rolling FGI average applied"
          }
        }
      });

    } catch (error) {
      // Data not generated yet - return placeholder
      return NextResponse.json({
        success: false,
        error: 'DEPRECATED API: Use /api/backtest/sqlite for database results. Legacy JSON data not available.',
        instructions: 'Run: bun run /backtesting/run-complete-backtests.ts',
        willContain: {
          totalResults: 1000,
          fgiRange: '1-100',
          leverageRange: '1x-10x',
          dateRange: '365 days of historical data with 30-day rolling averages'
        }
      }, { status: 503 });
    }

  } catch (error) {
    console.error('Backtest data API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load backtest data' },
      { status: 500 }
    );
  }
}