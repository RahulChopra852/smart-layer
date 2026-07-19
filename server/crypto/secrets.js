import crypto from 'node:crypto';

// AES-256-GCM encrypt/decrypt for connection secrets (GA4 refresh tokens, VWO/PSI/Metabase API
// keys). ENCRYPTION_KEY is a 32-byte key, base64-encoded — generate with `openssl rand -base64 32`.
// Ciphertext format stored in connections.secret_ciphertext: base64(iv):base64(authTag):base64(data)

function getKey() {
  const b64 = process.env.ENCRYPTION_KEY;
  if (!b64) throw new Error('ENCRYPTION_KEY must be set in .env');
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY must decode to exactly 32 bytes');
  return key;
}

export function encryptSecret(obj) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(obj), 'utf-8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(':');
}

export function decryptSecret(ciphertext) {
  if (!ciphertext) return null;
  const key = getKey();
  const [ivB64, tagB64, dataB64] = ciphertext.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  return JSON.parse(decrypted.toString('utf-8'));
}
