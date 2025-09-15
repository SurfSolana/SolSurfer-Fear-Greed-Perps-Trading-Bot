import { NextRequest, NextResponse } from 'next/server'

// Duplicating this from the component for now
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


export async function GET(request: NextRequest) {
  console.log('--- FGI Historical API Start ---');
  try {
    const { searchParams } = new URL(request.url)
    const viewWindow = (searchParams.get('viewWindow') || '7days') as ViewWindow
    const asset = (searchParams.get('asset') || 'ETH').toUpperCase()
    const dataInterval = searchParams.get('dataInterval') || '4h';
    console.log(`[Historical] Params: viewWindow=${viewWindow}, asset=${asset}, dataInterval=${dataInterval}`);

    const config = VIEW_WINDOW_CONFIG[viewWindow] ?? VIEW_WINDOW_CONFIG['7days']

    // Reuse the existing history endpoint logic
    const url = new URL('/api/fgi/fgi-history-data', request.url)
    url.searchParams.set('hours', String(config.hours))
    url.searchParams.set('asset', asset)
    url.searchParams.set('dataInterval', dataInterval)
    console.log(`[Historical] Fetching from internal URL: ${url.toString()}`);

    const resp = await fetch(url.toString(), { cache: 'no-store' })
    if (!resp.ok) {
      console.error(`[Historical] Fetch to /api/fgi/history failed with status: ${resp.status}`);
      return NextResponse.json({ points: [], source: 'none' })
    }

    const data = await resp.json()
    console.log(`[Historical] Data received from /history:`, JSON.stringify(data, null, 2).substring(0, 500) + '...');

    // The history route returns { data: [...] }, not { points: [...] }
    const raw = Array.isArray(data.data) ? data.data : []
    
    // The filtering logic here is a bit redundant since the history route already does it,
    // but we'll keep it for precision.
    const minutes = config.hours * 60;
    let trimmed = raw
    if (raw.length > 0) {
      const maxTs = raw.reduce((m: number, r: any) => Math.max(m, Number(r.timestamp) || 0), 0)
      const cutoff = maxTs - minutes * 60 * 1000
      trimmed = raw.filter((r: any) => Number(r.timestamp) >= cutoff)
    }
    
    // Normalize to the shape expected by FGITimeSeries (ChartDataPoint[])
    const points = trimmed.map((d: any) => ({
      timestamp: new Date(d.timestamp).toISOString(),
      value: Number(d.fgi) ?? 50,
      volume: null,
      label: null
    }))

    console.log(`[Historical] Sending ${points.length} points to frontend.`);
    console.log('--- FGI Historical API End ---');
    return NextResponse.json({ points, source: data.source || 'historical' })
  } catch (error) {
    console.error('historical FGI endpoint failed:', error)
    console.log('--- FGI Historical API End (Error) ---');
    return NextResponse.json({ points: [], source: 'none' }, { status: 500 })
  }
}