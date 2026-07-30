import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const PREFIX = 'enc:v1:';

function encryptionKey(): Buffer {
  const source = process.env.AI_SETTINGS_ENCRYPTION_KEY ?? process.env.SHOPIFY_API_SECRET;
  if (!source) {
    throw new Error('AI_SETTINGS_ENCRYPTION_KEY or SHOPIFY_API_SECRET is required.');
  }
  return createHash('sha256').update(source).digest();
}

export function isEncryptedSecret(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function encryptSecret(value: string): string {
  if (!value || isEncryptedSecret(value)) return value;

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    PREFIX.slice(0, -1),
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
}

export function decryptSecret(value: string): string {
  if (!isEncryptedSecret(value)) return value;

  const [, version, ivRaw, tagRaw, ciphertextRaw] = value.split(':');
  if (version !== 'v1' || !ivRaw || !tagRaw || !ciphertextRaw) {
    throw new Error('Encrypted secret has an invalid format.');
  }

  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(ivRaw, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
