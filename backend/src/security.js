import crypto from 'node:crypto';

const masterKey = Buffer.from(process.env.MASTER_KEY_BASE64 || '', 'base64');
if (masterKey.length !== 32) {
  throw new Error('MASTER_KEY_BASE64 must decode to exactly 32 bytes. See backend/.env.example.');
}

export function keyForUser(userId) {
  return crypto.createHmac('sha256', masterKey).update(userId).digest();
}

export function encryptBuffer(buffer, userId) {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyForUser(userId), nonce);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return { buffer: encrypted, nonce: nonce.toString('base64'), authTag: cipher.getAuthTag().toString('base64') };
}

export function decryptBuffer(buffer, userId, nonce, authTag) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyForUser(userId), Buffer.from(nonce, 'base64'));
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  return Buffer.concat([decipher.update(buffer), decipher.final()]);
}
