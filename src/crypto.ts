import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const VERSION = 'v1';

export class SecretBox {
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) throw new Error('SecretBox requires a 32-byte key');
  }

  encryptJson(value: unknown, aad: string): string {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    cipher.setAAD(Buffer.from(aad), { plaintextLength: Buffer.byteLength(JSON.stringify(value)) });
    const plaintext = Buffer.from(JSON.stringify(value));
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return [VERSION, nonce.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
  }

  decryptJson<T>(serialized: string, aad: string): T {
    const [version, nonceValue, tagValue, ciphertextValue] = serialized.split('.');
    if (version !== VERSION || !nonceValue || !tagValue || !ciphertextValue) throw new Error('Invalid encrypted payload');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(nonceValue, 'base64url'));
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextValue, 'base64url')), decipher.final()]);
    return JSON.parse(plaintext.toString('utf8')) as T;
  }

  subjectHash(subject: string): string {
    return createHmac('sha256', this.key).update(`garmin-account-v1:${subject}`).digest('hex');
  }
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function hashesEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
