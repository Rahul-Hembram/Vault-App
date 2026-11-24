import initSqlJs from 'sql.js';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, '..', 'data');
const dbPath = path.join(dataDir, 'securevault.sqlite');
fs.mkdirSync(dataDir, { recursive: true });

const require = createRequire(import.meta.url);
const SQL = await initSqlJs({
  locateFile: file => path.join(path.dirname(require.resolve('sql.js')), file)
});
const database = fs.existsSync(dbPath)
  ? new SQL.Database(new Uint8Array(fs.readFileSync(dbPath)))
  : new SQL.Database();
database.run('PRAGMA foreign_keys = ON');

function persist() {
  fs.writeFileSync(dbPath, Buffer.from(database.export()));
}

export const db = {
  exec(sql) {
    database.run(sql);
    persist();
  },
  prepare(sql) {
    return {
      run(...params) {
        database.run(sql, params);
        const changes = database.getRowsModified();
        const result = database.exec('SELECT last_insert_rowid() AS id');
        persist();
        return { changes, lastInsertRowid: result[0]?.values[0][0] };
      },
      get(...params) {
        const statement = database.prepare(sql);
        try {
          statement.bind(params);
          return statement.step() ? statement.getAsObject() : undefined;
        } finally {
          statement.free();
        }
      },
      all(...params) {
        const statement = database.prepare(sql);
        const rows = [];
        try {
          statement.bind(params);
          while (statement.step()) rows.push(statement.getAsObject());
          return rows;
        } finally {
          statement.free();
        }
      }
    };
  }
};

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    sensitive_failures INTEGER NOT NULL DEFAULT 0,
    sensitive_locked_until TEXT,
    settings TEXT NOT NULL DEFAULT '{"theme":"dark","notifications":true}'
  );
  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    original_name TEXT NOT NULL,
    disk_name TEXT NOT NULL UNIQUE,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    encrypted INTEGER NOT NULL DEFAULT 0,
    nonce TEXT,
    auth_tag TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS files_user_created ON files(user_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_id TEXT,
    action TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS activities_user_created ON activities(user_id, created_at DESC);
`);
