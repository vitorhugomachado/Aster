import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './auth';

describe('password protection', () => {
  it('stores a salted scrypt digest instead of the original password', () => {
    const password = 'uma-senha-forte-123';
    const stored = hashPassword(password);
    expect(stored).toMatch(/^scrypt:[a-f0-9]+:[a-f0-9]+$/);
    expect(stored).not.toContain(password);
    expect(verifyPassword(password, stored)).toBe(true);
    expect(verifyPassword('senha-incorreta', stored)).toBe(false);
  });

  it('rejects malformed stored values safely', () => {
    expect(verifyPassword('qualquer', 'valor-invalido')).toBe(false);
  });
});
