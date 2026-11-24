<<<<<<< HEAD
# SecureVault — Multimedia Content Protection System

SecureVault is a local-first software engineering lab project for private file management. It has a React/Vite dashboard and an Express/SQLite API. Uploads are stored outside the web root; users can explicitly encrypt files at rest with AES-256-GCM. Passwords are bcrypt-hashed, sessions use an HttpOnly JWT cookie, and sensitive file operations re-check the account password on the server.

> **Lab/demo scope:** SecureVault is intended for local demonstrations and learning. It is not a substitute for a professionally audited cloud storage service. Protect the master encryption key and back it up securely. Anyone who loses it will not be able to decrypt encrypted files.
>
> App-level controls cannot prevent a user with operating-system or server access from copying stored bytes, nor can they stop someone from copying a file after it has been decrypted or downloaded. Sensitive app operations are password-gated; this is not DRM.

## Requirements

- Node.js 20 or newer
- npm

## Install and run

1. From the project root, install both applications:

   ```bash
   npm run install:all
   ```

2. Create `backend/.env` by copying `backend/.env.example` (PowerShell: `Copy-Item backend\.env.example backend\.env`). Generate secrets from the project root with Node:

   ```bash
   node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(48).toString('hex')); console.log('MASTER_KEY_BASE64=' + require('crypto').randomBytes(32).toString('base64'))"
   ```

   Put the printed values in `backend/.env` along with the other settings shown in `.env.example`. The master key must remain the same for as long as encrypted files are kept. Do not commit `.env`.

3. Start the API and frontend in two terminals from the project root:

   ```bash
   npm run dev:backend
   ```

   ```bash
   npm run dev:frontend
   ```

4. Open the Vite URL printed in the frontend terminal (normally `http://localhost:5173`). Register an account; SQLite and private storage directories are created automatically under `backend/data/` and `backend/storage/`.

The API listens on port 4000 by default. Vite proxies `/api` requests to it. Set `CLIENT_ORIGIN` to the frontend origin if changing the Vite port. For a production deployment, serve the frontend and API over HTTPS, use a unique JWT secret and master key, and restrict file/network access appropriately.

## Practical demo flow

1. Register and open the dashboard. Counts, file-type totals, storage use, and recent activity are read from SQLite.
2. Upload a PDF, image, audio/video file, or text file from **Upload files** or drag it into the upload area.
3. Go to **My files**. Search, filter by category, and sort by name/date.
4. Use the lock action to encrypt an uploaded file. Confirm your password. The actual file bytes are replaced with AES-256-GCM ciphertext; the nonce and authentication tag are stored as metadata.
5. Open or download the file. The API verifies your password and decrypts in memory for that request. A preview is temporary in the browser; it is not written back as plaintext to storage.
6. Copy or delete a file after password verification. The copy keeps the original encryption state; deletion is permanent.
7. Review **Security logs** and export up to 500 latest activity entries as CSV. Edit your display name, change your password, and try the dark/light theme in **Profile** and **Settings**.
8. To demonstrate lockout, enter an incorrect password for a sensitive operation three consecutive times. Sensitive operations are locked for the configured interval (15 minutes by default). After the interval, a correct password resets the failure state and operations resume.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run install:all` | Install backend and frontend dependencies |
| `npm run dev:backend` | Start Express API with Node watch mode |
| `npm run dev:frontend` | Start Vite dev server |
| `npm run build` | Create optimized frontend build in `frontend/dist/` |
| `npm test` | Run backend AES-GCM tests |

Health check: `GET http://localhost:4000/api/health`.

## Project map

```text
backend/
  src/server.js       Express routes, validation, authentication, logs
  src/db.js           SQLite schema and indexes
  src/security.js     AES-256-GCM and account-key derivation
  test/               focused crypto tests
  data/               generated SQLite database (ignored by git)
  storage/            private uploaded file bytes (ignored by git)
frontend/
  src/App.jsx         authentication and dashboard workflows
  src/styles.css      responsive dark/light SaaS styling
  vite.config.js      local API proxy
```

## Security behavior and data model

- Registration uses bcrypt with cost factor 12. Password length is constrained to 10–72 characters.
- The API puts a signed JWT in an HttpOnly, SameSite=Lax cookie. Sign-out clears the cookie; it expires after eight hours.
- User IDs are UUIDs and files are stored in that user's private storage directory. Every file query is scoped to the authenticated user.
- AES-256-GCM uses a random 96-bit nonce per encryption and an HMAC-derived per-account key based on `MASTER_KEY_BASE64`. The GCM tag is checked before decrypted bytes are returned.
- Sensitive endpoints require the current password. Three consecutive failures lock sensitive operations for `LOCK_MINUTES`; normal login remains possible. The lock expires automatically, and a successful subsequent verification resets the counter.
- File upload size is capped by `MAX_FILE_SIZE_MB`. Activity history is account-scoped and records file actions and sensitive-operation failures/lockouts.
- SQLite tables: `users`, `files`, and `activities`. SQLite runs through a pure-WASM adapter to avoid native build-tool requirements. The `users` row carries lock state and serialized preferences; `files` holds ownership, metadata, protection state, and GCM parameters.

## Configuration

See `backend/.env.example`:

- `PORT`: API port (default 4000)
- `JWT_SECRET`: at least 32 characters and unique to the deployment
- `MASTER_KEY_BASE64`: exactly 32 random bytes, base64-encoded
- `CLIENT_ORIGIN`: allowed browser origin
- `MAX_FILE_SIZE_MB`: upload limit
- `LOCK_MINUTES`: sensitive-operation lock duration

Do not delete `backend/data/` or `backend/storage/` while retaining the other: the database references stored files. Back up the database, storage, and master key together.

## Tests and customization

Run `npm test` for round-trip, tamper detection, and account-key isolation checks; run `npm run build` to validate the frontend production bundle. The SQLite schema is initialized in `backend/src/db.js`, API behavior is defined in `backend/src/server.js`, and UI components and workflows are in `frontend/src/App.jsx`. Tailwind is configured and available alongside the custom design system in `frontend/src/styles.css`.

For production hardening, add HTTPS, CSRF defenses appropriate to your deployment, stricter upload content inspection and quotas, key rotation/recovery, backups, and external security review.
=======
# Vault-App
>>>>>>> 35e532571c558312161d53faa7d011d671657f05
