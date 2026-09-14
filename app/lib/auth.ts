import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { db, ensureSchema } from './db';

export const SESSION_COOKIE = 'aster_session';
const SESSION_DAYS = 30;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  mustChangePassword: boolean;
}

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get('cookie') ?? '';
  for (const part of cookie.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string) {
  const [algorithm, saltHex, hashHex] = stored.split(':');
  if (algorithm !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function setupRequired() {
  await ensureSchema();
  const rows = await db()`SELECT count(*)::int AS count FROM aster_users`;
  return Number(rows[0]?.count ?? 0) === 0;
}

export async function createInitialUser(email: string, password: string, name: string, setupToken: string) {
  await ensureSchema();
  if (!(await setupRequired())) throw new Error('O administrador já foi criado.');
  const expected = process.env.ASTER_BOOTSTRAP_TOKEN?.trim() ?? '';
  if (!expected || setupToken.length !== expected.length || !timingSafeEqual(Buffer.from(setupToken), Buffer.from(expected))) {
    throw new Error('Código de configuração inválido.');
  }
  const id = crypto.randomUUID();
  await db()`INSERT INTO aster_users (id, email, password_hash, name)
    VALUES (${id}, ${email.toLowerCase()}, ${hashPassword(password)}, ${name || 'Administrador'})`;
  return createSession(id);
}

export async function authenticate(email: string, password: string) {
  await ensureSchema();
  const rows = await db()`SELECT id, email, name, password_hash, must_change_password
    FROM aster_users WHERE email = ${email.toLowerCase()} LIMIT 1`;
  const row = rows[0];
  if (!row || !verifyPassword(password, String(row.password_hash))) return null;
  return createSession(String(row.id));
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db()`DELETE FROM aster_sessions WHERE expires_at <= now()`;
  await db()`INSERT INTO aster_sessions (token_hash, user_id, expires_at)
    VALUES (${tokenHash(token)}, ${userId}, ${expiresAt})`;
  return { token, expiresAt };
}

export async function currentUser(request: Request): Promise<AuthUser | null> {
  if (!process.env.DATABASE_URL) return null;
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;
  await ensureSchema();
  const rows = await db()`SELECT u.id, u.email, u.name, u.must_change_password
    FROM aster_sessions s JOIN aster_users u ON u.id = s.user_id
    WHERE s.token_hash = ${tokenHash(token)} AND s.expires_at > now() LIMIT 1`;
  const row = rows[0];
  return row ? {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
    mustChangePassword: Boolean(row.must_change_password),
  } : null;
}

export async function requireUser(request: Request) {
  const user = await currentUser(request);
  if (!user) throw new Response('Não autorizado.', { status: 401 });
  return user;
}

export async function destroySession(request: Request) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (token && process.env.DATABASE_URL) {
    await ensureSchema();
    await db()`DELETE FROM aster_sessions WHERE token_hash = ${tokenHash(token)}`;
  }
}

export function sessionCookie(token: string, expiresAt: Date) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${expiresAt.toUTCString()}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
