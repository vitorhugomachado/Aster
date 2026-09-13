import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json(
    { status: 'ok', service: 'fibra-mapa' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
