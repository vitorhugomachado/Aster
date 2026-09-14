import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import {
  authenticate,
  clearSessionCookie,
  createInitialUser,
  currentUser,
  destroySession,
  sessionCookie,
  setupRequired,
} from '../../../lib/auth';
import { consumeLoginAttempt, databaseConfigured } from '../../../lib/db';

function clean(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function GET(request: Request) {
  if (!databaseConfigured()) return NextResponse.json({ configured: false, authenticated: false });
  try {
    const user = await currentUser(request);
    return NextResponse.json({
      configured: true,
      authenticated: Boolean(user),
      setupRequired: user ? false : await setupRequired(),
      user,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ configured: true, authenticated: false, unavailable: true }, { status: 503 });
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return NextResponse.json({ message: 'Dados inválidos.' }, { status: 400 }); }
  const email = clean(body.email, 180).toLowerCase();
  const password = clean(body.password, 256);
  if (!email.includes('@') || password.length < 10) {
    return NextResponse.json({ message: 'Informe um e-mail válido e uma senha com pelo menos 10 caracteres.' }, { status: 400 });
  }
  try {
    const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const attemptKey = createHash('sha256').update(`${forwardedFor}:${email}`).digest('hex');
    if (!(await consumeLoginAttempt(attemptKey))) {
      return NextResponse.json({ message: 'Muitas tentativas. Aguarde um minuto e tente novamente.' }, { status: 429 });
    }
    const session = body.mode === 'setup'
      ? await createInitialUser(email, password, clean(body.name, 100), clean(body.setupToken, 200))
      : await authenticate(email, password);
    if (!session) return NextResponse.json({ message: 'E-mail ou senha inválidos.' }, { status: 401 });
    return NextResponse.json({ ok: true }, { headers: { 'Set-Cookie': sessionCookie(session.token, session.expiresAt), 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : 'Não foi possível entrar.' }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  await destroySession(request);
  return NextResponse.json({ ok: true }, { headers: { 'Set-Cookie': clearSessionCookie(), 'Cache-Control': 'no-store' } });
}
