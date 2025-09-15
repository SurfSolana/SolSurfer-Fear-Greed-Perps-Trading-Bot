import { NextResponse } from 'next/server'

export async function GET() {
  // Mock current FGI data
  const fgiData = {
    value: 34,
    timestamp: new Date().toISOString(),
    trend: 'fear' as const,
    changePercent: -5.2,
    classification: 'Fear'
  }

  return NextResponse.json(fgiData)
}