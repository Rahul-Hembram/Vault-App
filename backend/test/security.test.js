import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.MASTER_KEY_BASE64 = crypto.randomBytes(32).toString('base64');
const { decryptBuffer, encryptBuffer } = await import('../src/security.js');

test('AES-256-GCM encrypts and decrypts for the owning account', () => {
  const content = Buffer.from('private lab document');
  const encrypted = encryptBuffer(content, 'owner-1');
  assert.notDeepEqual(encrypted.buffer, content);
  assert.deepEqual(decryptBuffer(encrypted.buffer, 'owner-1', encrypted.nonce, encrypted.authTag), content);
});

test('AES-256-GCM rejects tampering and a different account key', () => {
  const encrypted = encryptBuffer(Buffer.from('private'), 'owner-1');
  const tampered = Buffer.from(encrypted.buffer);
  tampered[0] ^= 0xff;
  assert.throws(() => decryptBuffer(tampered, 'owner-1', encrypted.nonce, encrypted.authTag));
  assert.throws(() => decryptBuffer(encrypted.buffer, 'owner-2', encrypted.nonce, encrypted.authTag));
});
