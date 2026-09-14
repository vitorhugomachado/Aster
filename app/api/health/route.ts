import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json(
    { status: 'ok', service: 'aster', gemini: Boolean(process.env.GEMINI_API_KEY) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
