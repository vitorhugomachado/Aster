export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

import { NextResponse } from 'next/server';
import { databaseConfigured, db, ensureSchema } from '../../lib/db';

export async function GET() {
  try {
    if (databaseConfigured()) {
      await ensureSchema();
      await db()`SELECT 1`;
    }
    return NextResponse.json(
      { status: 'ok', service: 'aster', database: databaseConfigured(), gemini: Boolean(process.env.GEMINI_API_KEY), groq: Boolean(process.env.GROQ_API_KEY), aiProvider: process.env.GROQ_API_KEY ? 'groq' : process.env.GEMINI_API_KEY ? 'gemini' : null, routes: Boolean(process.env.GOOGLE_MAPS_ROUTES_KEY || process.env.GOOGLE_MAPS_GEOCODING_KEY) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[aster-health] database initialization failed', error);
    return NextResponse.json({ status: 'error', service: 'aster', database: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
