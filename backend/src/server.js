import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import mime from 'mime-types';
import rateLimit from 'express-rate-limit';
import { db } from './db.js';
import { decryptBuffer, encryptBuffer } from './security.js';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 characters. See backend/.env.example.');
}

const app = express();
const PORT = Number(process.env.PORT || 4000);
const MAX_FILE_SIZE = Number(process.env.MAX_FILE_SIZE_MB || 100) * 1024 * 1024;
const LOCK_MS = Number(process.env.LOCK_MINUTES || 15) * 60 * 1000;
const here = path.dirname(fileURLToPath(import.meta.url));
const storageRoot = path.resolve(here, '..', 'storage');
fs.mkdirSync(storageRoot, { recursive: true });

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const now = () => new Date().toISOString();
const addActivity = db.prepare(
  'INSERT INTO activities (user_id, file_id, action, details, created_at) VALUES (?, ?, ?, ?, ?)'
);
const getOwnedFile = (fileId, userId) => db.prepare(
  'SELECT * FROM files WHERE id = ? AND user_id = ?'
).get(fileId, userId);
const filePath = (userId, diskName) => path.join(storageRoot, userId, diskName);
const publicFile = (file) => ({
  id: file.id,
  name: file.original_name,
  mimeType: file.mime_type,
  size: file.size,
  encrypted: Boolean(file.encrypted),
  createdAt: file.created_at,
  updatedAt: file.updated_at
});
const sendError = (res, status, message) => res.status(status).json({ error: message });

function authenticate(req, res, next) {
  const token = req.cookies.securevault_token;
  if (!token) return sendError(res, 401, 'Please sign in to continue.');
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch {
    res.clearCookie('securevault_token');
    return sendError(res, 401, 'Your session has expired. Please sign in again.');
  }
}

async function requireSensitive(req, res, next) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return sendError(res, 401, 'Account not found.');
  const lockedUntil = user.sensitive_locked_until ? new Date(user.sensitive_locked_until).getTime() : 0;
  if (lockedUntil > Date.now()) {
    return res.status(423).json({
      error: 'Sensitive operations are temporarily locked after three failed verifications.',
      lockedUntil: user.sensitive_locked_until
    });
  }
  if (user.sensitive_locked_until) {
    db.prepare('UPDATE users SET sensitive_failures = 0, sensitive_locked_until = NULL WHERE id = ?').run(user.id);
  }

  const body = req.body || {};
  const submittedPassword = typeof body.password === 'string'
    ? body.password
    : body.currentPassword;
  const valid = typeof submittedPassword === 'string' &&
    await bcrypt.compare(submittedPassword, user.password_hash);
  if (!valid) {
    const failures = (user.sensitive_locked_until ? 0 : user.sensitive_failures) + 1;
    const lockUntil = failures >= 3 ? new Date(Date.now() + LOCK_MS).toISOString() : null;
    db.prepare('UPDATE users SET sensitive_failures = ?, sensitive_locked_until = ? WHERE id = ?')
      .run(failures >= 3 ? 0 : failures, lockUntil, user.id);
    addActivity.run(user.id, null, failures >= 3 ? 'account_locked' : 'authentication_failed',
      failures >= 3 ? 'Sensitive operations locked after three failed password verifications.' :
        `Failed password verification (${failures}/3).`, now());
    if (failures >= 3) {
      return res.status(423).json({ error: `Sensitive operations are locked for ${process.env.LOCK_MINUTES || 15} minutes after three failed attempts.`, lockedUntil: lockUntil });
    }
    return sendError(res, 401, `Password verification failed. ${3 - failures} attempt(s) remaining.`);
  }

  db.prepare('UPDATE users SET sensitive_failures = 0, sensitive_locked_until = NULL WHERE id = ?').run(user.id);
  req.verifiedUser = user;
  return next();
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Try again later.' }
});

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.post('/api/auth/register', authLimiter, async (req, res, next) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = req.body.password;
    if (name.length < 2 || name.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return sendError(res, 400, 'Enter a valid name and email address.');
    }
    if (typeof password !== 'string' || password.length < 10 || password.length > 72) {
      return sendError(res, 400, 'Password must be between 10 and 72 characters.');
    }
    const id = crypto.randomUUID();
    const hash = await bcrypt.hash(password, 12);
    db.prepare('INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, name, email, hash, now());
    fs.mkdirSync(path.join(storageRoot, id), { recursive: true });
    addActivity.run(id, null, 'account_created', 'SecureVault account created.', now());
    setSession(res, id);
    return res.status(201).json({ user: { id, name, email, createdAt: now() } });
  } catch (error) {
    if (error.message?.includes('UNIQUE constraint failed: users.email')) {
      return sendError(res, 409, 'An account with that email already exists.');
    }
    return next(error);
  }
});

function setSession(res, userId) {
  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '8h' });
  res.cookie('securevault_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000
  });
}

app.post('/api/auth/login', authLimiter, async (req, res, next) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || typeof req.body.password !== 'string' || !(await bcrypt.compare(req.body.password, user.password_hash))) {
      return sendError(res, 401, 'Email or password is incorrect.');
    }
    setSession(res, user.id);
    addActivity.run(user.id, null, 'login', 'Signed in successfully.', now());
    return res.json({ user: { id: user.id, name: user.name, email: user.email, createdAt: user.created_at } });
  } catch (error) { return next(error); }
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie('securevault_token');
  res.json({ message: 'Signed out.' });
});

app.get('/api/auth/me', authenticate, (req, res) => {
  const user = db.prepare('SELECT id, name, email, created_at, settings FROM users WHERE id = ?').get(req.user.id);
  if (!user) return sendError(res, 404, 'Account not found.');
  res.json({ user: { id: user.id, name: user.name, email: user.email, createdAt: user.created_at,
    settings: JSON.parse(user.settings) } });
});

app.put('/api/profile', authenticate, (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  if (name.length < 2 || name.length > 80) return sendError(res, 400, 'Name must be between 2 and 80 characters.');
  db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, req.user.id);
  res.json({ name });
});

app.put('/api/settings', authenticate, (req, res) => {
  const settings = { theme: req.body.theme === 'light' ? 'light' : 'dark', notifications: req.body.notifications !== false };
  db.prepare('UPDATE users SET settings = ? WHERE id = ?').run(JSON.stringify(settings), req.user.id);
  res.json({ settings });
});

app.post('/api/profile/password', authenticate, requireSensitive, async (req, res, next) => {
  try {
    const user = req.verifiedUser;
    if (typeof req.body.newPassword !== 'string' || req.body.newPassword.length < 10 || req.body.newPassword.length > 72) {
      return sendError(res, 400, 'New password must be between 10 and 72 characters.');
    }
    const hash = await bcrypt.hash(req.body.newPassword, 12);
    db.prepare('UPDATE users SET password_hash = ?, sensitive_failures = 0, sensitive_locked_until = NULL WHERE id = ?')
      .run(hash, user.id);
    addActivity.run(user.id, null, 'password_changed', 'Account password changed.', now());
    res.json({ message: 'Password changed successfully.' });
  } catch (error) { next(error); }
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 }
});

app.get('/api/files', authenticate, (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
  const type = typeof req.query.type === 'string' ? req.query.type : 'all';
  const sort = req.query.sort === 'name' ? 'original_name COLLATE NOCASE ASC' :
    req.query.sort === 'oldest' ? 'created_at ASC' : 'created_at DESC';
  let files = db.prepare(`SELECT * FROM files WHERE user_id = ? ORDER BY ${sort}`).all(req.user.id);
  if (search) files = files.filter(f => f.original_name.toLowerCase().includes(search.toLowerCase()));
  if (type !== 'all') files = files.filter(f => category(f.mime_type, f.original_name) === type);
  res.json({ files: files.map(publicFile) });
});

app.post('/api/files', authenticate, upload.single('file'), (req, res, next) => {
  try {
    if (!req.file) return sendError(res, 400, 'Choose a file to upload.');
    const id = crypto.randomUUID();
    const diskName = `${crypto.randomUUID()}.bin`;
    const directory = path.join(storageRoot, req.user.id);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, diskName), req.file.buffer, { flag: 'wx' });
    const created = now();
    const mimeType = req.file.mimetype || mime.lookup(req.file.originalname) || 'application/octet-stream';
    db.prepare(`INSERT INTO files (id, user_id, original_name, disk_name, mime_type, size, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, req.user.id, path.basename(req.file.originalname), diskName,
      mimeType, req.file.size, created, created);
    addActivity.run(req.user.id, id, 'file_uploaded', `Uploaded ${path.basename(req.file.originalname)}.`, created);
    res.status(201).json({ file: publicFile(getOwnedFile(id, req.user.id)) });
  } catch (error) { next(error); }
});

app.get('/api/files/:id', authenticate, (req, res) => {
  const file = getOwnedFile(req.params.id, req.user.id);
  if (!file) return sendError(res, 404, 'File not found.');
  res.json({ file: publicFile(file) });
});

app.post('/api/files/:id/encrypt', authenticate, requireSensitive, (req, res, next) => {
  try {
    const file = getOwnedFile(req.params.id, req.user.id);
    if (!file) return sendError(res, 404, 'File not found.');
    if (file.encrypted) return sendError(res, 409, 'This file is already encrypted.');
    const target = filePath(req.user.id, file.disk_name);
    const result = encryptBuffer(fs.readFileSync(target), req.user.id);
    const temporary = `${target}.tmp`;
    fs.writeFileSync(temporary, result.buffer, { flag: 'wx' });
    fs.renameSync(temporary, target);
    db.prepare('UPDATE files SET encrypted = 1, nonce = ?, auth_tag = ?, updated_at = ? WHERE id = ? AND user_id = ?')
      .run(result.nonce, result.authTag, now(), file.id, req.user.id);
    addActivity.run(req.user.id, file.id, 'file_encrypted', `Encrypted ${file.original_name}.`, now());
    res.json({ file: publicFile(getOwnedFile(file.id, req.user.id)) });
  } catch (error) { next(error); }
});

app.post('/api/files/:id/content', authenticate, requireSensitive, (req, res, next) => {
  try {
    const file = getOwnedFile(req.params.id, req.user.id);
    if (!file) return sendError(res, 404, 'File not found.');
    const stored = fs.readFileSync(filePath(req.user.id, file.disk_name));
    const content = file.encrypted ? decryptBuffer(stored, req.user.id, file.nonce, file.auth_tag) : stored;
    const download = req.body.mode === 'download';
    const timestamp = now();
    if (file.encrypted) {
      addActivity.run(req.user.id, file.id, 'file_decrypted', `Decrypted ${file.original_name} in memory for this request.`, timestamp);
    }
    if (download) {
      addActivity.run(req.user.id, file.id, 'file_downloaded', `Downloaded ${file.original_name}${file.encrypted ? ' (decrypted in memory)' : ''}.`, timestamp);
    } else {
      addActivity.run(req.user.id, file.id, 'file_opened', `Opened ${file.original_name}${file.encrypted ? ' (decrypted in memory)' : ''}.`, timestamp);
    }
    res.set({
      'Content-Type': file.mime_type,
      'Content-Length': content.length,
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(file.original_name)}`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    res.send(content);
  } catch (error) { next(error); }
});

app.post('/api/files/:id/copy', authenticate, requireSensitive, (req, res, next) => {
  try {
    const original = getOwnedFile(req.params.id, req.user.id);
    if (!original) return sendError(res, 404, 'File not found.');
    const id = crypto.randomUUID();
    const diskName = `${crypto.randomUUID()}.bin`;
    fs.copyFileSync(filePath(req.user.id, original.disk_name), filePath(req.user.id, diskName), fs.constants.COPYFILE_EXCL);
    const created = now();
    db.prepare(`INSERT INTO files (id, user_id, original_name, disk_name, mime_type, size, encrypted, nonce, auth_tag, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, req.user.id, `Copy of ${original.original_name}`, diskName, original.mime_type, original.size,
        original.encrypted, original.nonce, original.auth_tag, created, created);
    addActivity.run(req.user.id, id, 'file_copied', `Created a protected copy of ${original.original_name}.`, created);
    res.status(201).json({ file: publicFile(getOwnedFile(id, req.user.id)) });
  } catch (error) { next(error); }
});

app.delete('/api/files/:id', authenticate, requireSensitive, (req, res, next) => {
  try {
    const file = getOwnedFile(req.params.id, req.user.id);
    if (!file) return sendError(res, 404, 'File not found.');
    fs.unlinkSync(filePath(req.user.id, file.disk_name));
    db.prepare('DELETE FROM files WHERE id = ? AND user_id = ?').run(file.id, req.user.id);
    addActivity.run(req.user.id, file.id, 'file_deleted', `Deleted ${file.original_name}.`, now());
    res.json({ message: 'File permanently deleted.' });
  } catch (error) { next(error); }
});

app.get('/api/dashboard', authenticate, (req, res) => {
  const files = db.prepare('SELECT * FROM files WHERE user_id = ?').all(req.user.id);
  const activities = db.prepare('SELECT * FROM activities WHERE user_id = ? ORDER BY created_at DESC LIMIT 8').all(req.user.id);
  const recentlyOpened = db.prepare(`SELECT f.* FROM files f JOIN (
    SELECT file_id, MAX(created_at) AS opened_at FROM activities
    WHERE user_id = ? AND action = 'file_opened' AND file_id IS NOT NULL GROUP BY file_id
  ) a ON f.id = a.file_id WHERE f.user_id = ? ORDER BY a.opened_at DESC LIMIT 5`).all(req.user.id, req.user.id);
  const types = {};
  for (const file of files) {
    const key = category(file.mime_type, file.original_name);
    types[key] = (types[key] || 0) + 1;
  }
  res.json({
    stats: {
      totalFiles: files.length,
      encryptedFiles: files.filter(file => file.encrypted).length,
      storageUsed: files.reduce((total, file) => total + file.size, 0),
      typeCounts: types
    },
    recentFiles: files.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5).map(publicFile),
    recentlyOpened: recentlyOpened.map(publicFile),
    activities: activities.map(publicActivity)
  });
});

app.get('/api/activities', authenticate, (req, res) => {
  const rows = db.prepare('SELECT * FROM activities WHERE user_id = ? ORDER BY created_at DESC LIMIT 500').all(req.user.id);
  if (req.query.format === 'csv') {
    const escape = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = ['Date,Activity,Details', ...rows.map(row =>
      [row.created_at, row.action, row.details].map(escape).join(','))].join('\r\n');
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="securevault-activity.csv"' });
    return res.send(csv);
  }
  res.json({ activities: rows.map(publicActivity) });
});

function publicActivity(row) {
  return { id: row.id, fileId: row.file_id, action: row.action, details: row.details, createdAt: row.created_at };
}

function category(mimeType, name) {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType === 'application/pdf' || /\\.(docx?|txt|rtf|odt)$/i.test(name)) return 'document';
  return 'other';
}

app.use((error, _req, res, _next) => {
  console.error(error);
  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE' ? `File exceeds the ${process.env.MAX_FILE_SIZE_MB || 100} MB upload limit.` : error.message;
    return sendError(res, 400, message);
  }
  return sendError(res, 500, 'An unexpected server error occurred.');
});

app.listen(PORT, () => console.log(`SecureVault API listening on http://localhost:${PORT}`));
