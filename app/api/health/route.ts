import { NextResponse } from 'next/server';
import { databaseConfigured, db, ensureSchema } from '../../lib/db';

export async function GET() {
  try {
    if (databaseConfigured()) {
      await ensureSchema();
      await db()`SELECT 1`;
    }
    return NextResponse.json(
      { status: 'ok', service: 'aster', database: databaseConfigured(), gemini: Boolean(process.env.GEMINI_API_KEY), routes: Boolean(process.env.GOOGLE_MAPS_ROUTES_KEY || process.env.GOOGLE_MAPS_GEOCODING_KEY) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json({ status: 'error', service: 'aster', database: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
