import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  console.log('--- FGI History API Start ---');
  try {
    const searchParams = request.nextUrl.searchParams
    const hours = parseInt(searchParams.get('hours') || '48', 10)
    const asset = searchParams.get('asset') || 'ETH'
    const dataInterval = searchParams.get('dataInterval') || '4h'
    console.log(`[History] Params: hours=${hours}, asset=${asset}, dataInterval=${dataInterval}`);

    const url = `https://api.surfsolana.com/${asset}/${dataInterval}/1_year.json`;
    console.log(`[History] Fetching from URL: ${url}`);
    
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[History] HTTP error! status: ${response.status}`);
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('[History] Raw data received:', JSON.stringify(data, null, 2).substring(0, 500) + '...');

    // It's possible the data is not an array directly
    const dataArray = Array.isArray(data) ? data : (data.data || []);

    let historicalData = dataArray.map((item: any) => ({
      timestamp: new Date(item.timestamp || item.date).getTime(),
      fgi: parseFloat(item.fgi || item.cfgi || 50),
      price: parseFloat(item.price)
    })).filter((d: { timestamp: number; fgi: number; }) => !isNaN(d.timestamp) && !isNaN(d.fgi));
    
    // Sort chronologically
    historicalData.sort((a: { timestamp: number; }, b: { timestamp: number; }) => a.timestamp - b.timestamp);

    if (historicalData.length > 0) {
      const maxTs = historicalData[historicalData.length - 1].timestamp;
      const cutoff = maxTs - hours * 60 * 60 * 1000;
      historicalData = historicalData.filter((r: { timestamp: number; }) => r.timestamp >= cutoff);
    }
    console.log(`[History] Processed and filtered data count: ${historicalData.length}`);
    console.log('--- FGI History API End ---');

    return NextResponse.json({
      data: historicalData,
      source: 'live'
    });
  } catch (error) {
    console.error('Failed to get FGI history:', error)
    console.log('--- FGI History API End (Error) ---');
    return NextResponse.json({
      data: [],
      source: 'none',
      error: 'Failed to fetch FGI history'
    }, { status: 500 })
  }
}
