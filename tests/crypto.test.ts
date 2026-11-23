import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { SecretBox, hashToken, hashesEqual } from '../src/crypto.js';

describe('SecretBox', () => {
  const box = new SecretBox(randomBytes(32));
  it('round-trips encrypted JSON and does not expose plaintext', () => {
    const encrypted = box.encryptJson({ accessToken: 'secret-value', expiresAt: 123 }, 'account:1');
    expect(encrypted).not.toContain('secret-value');
    expect(box.decryptJson(encrypted, 'account:1')).toEqual({ accessToken: 'secret-value', expiresAt: 123 });
  });
  it('rejects ciphertext tampering and wrong authenticated data', () => {
    const encrypted = box.encryptJson({ refreshToken: 'secret' }, 'account:1');
    expect(() => box.decryptJson(encrypted, 'account:2')).toThrow();
    const parts = encrypted.split('.');
    parts[3] = `${parts[3]?.slice(0, -2)}AA`;
    expect(() => box.decryptJson(parts.join('.'), 'account:1')).toThrow();
  });
  it('produces stable account hashes but different encryption nonces', () => {
    expect(box.subjectHash('profile:123')).toBe(box.subjectHash('profile:123'));
    expect(box.subjectHash('profile:123')).not.toBe(box.subjectHash('profile:124'));
    expect(box.encryptJson({ a: 1 }, 'x')).not.toBe(box.encryptJson({ a: 1 }, 'x'));
  });
  it('compares token hashes safely', () => {
    expect(hashesEqual(hashToken('a'), hashToken('a'))).toBe(true);
    expect(hashesEqual(hashToken('a'), hashToken('b'))).toBe(false);
  });
});
