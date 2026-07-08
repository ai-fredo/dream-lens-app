import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';

/**
 * Encrypted offline dream queue (Mobile M9 / engineering-standards §9).
 *
 * Every dream is written to this table immediately on capture, before any
 * network call is attempted — a dream recorded at 6am with no signal must
 * never be lost. The table is `dream_queue`, verbatim per §9. The underlying
 * SQLite database is opened with the `expo-sqlite` SQLCipher config plugin
 * (see app.json) and keyed via `PRAGMA key` immediately after opening, using
 * a random 32-byte key generated once and held in expo-secure-store — never
 * in plaintext, never logged.
 *
 * Purge on sync: `markSynced` DELETES the row rather than flipping a status
 * flag. Transcripts must not persist on-device any longer than needed.
 */

const DB_KEY_SECURE_STORE_KEY = 'dreamlens.dbkey';
const DB_NAME = 'dreamlens.db';

export type SyncStatus = 'pending' | 'synced' | 'failed';

export interface EnqueueInput {
  localId: string;
  recordedAt: string;
  rawTranscript: string;
  editedTranscript?: string;
}

export interface QueuedDream {
  localId: string;
  recordedAt: string;
  rawTranscript: string;
  editedTranscript: string | null;
  syncStatus: SyncStatus;
  syncedId: string | null;
  createdAt: string;
}

interface DreamQueueRow {
  local_id: string;
  recorded_at: string;
  raw_transcript: string;
  edited_transcript: string | null;
  sync_status: string;
  synced_id: string | null;
  created_at: string;
}

function toQueuedDream(row: DreamQueueRow): QueuedDream {
  return {
    localId: row.local_id,
    recordedAt: row.recorded_at,
    rawTranscript: row.raw_transcript,
    editedTranscript: row.edited_transcript,
    syncStatus: row.sync_status as SyncStatus,
    syncedId: row.synced_id,
    createdAt: row.created_at,
  };
}

function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

/** Loads the persisted DB key, generating and persisting a new one on first run. */
async function getOrCreateDbKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DB_KEY_SECURE_STORE_KEY);
  if (existing) return existing;

  const bytes = await Crypto.getRandomBytesAsync(32);
  const key = toHex(bytes);
  await SecureStore.setItemAsync(DB_KEY_SECURE_STORE_KEY, key);
  return key;
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function openDb(): Promise<SQLite.SQLiteDatabase> {
  const key = await getOrCreateDbKey();
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  // Key the encrypted database immediately after opening — before any other
  // statement runs — per Mobile M9.
  await db.execAsync(`PRAGMA key = '${key}';`);
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS dream_queue (
      local_id TEXT PRIMARY KEY,
      recorded_at TEXT NOT NULL,
      raw_transcript TEXT NOT NULL,
      edited_transcript TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      synced_id TEXT,
      created_at TEXT NOT NULL
    );
  `);
  return db;
}

function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openDb();
  }
  return dbPromise;
}

async function init(): Promise<void> {
  await getDb();
}

async function enqueue(input: EnqueueInput): Promise<void> {
  const db = await getDb();
  const createdAt = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO dream_queue (local_id, recorded_at, raw_transcript, edited_transcript, sync_status, synced_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    input.localId,
    input.recordedAt,
    input.rawTranscript,
    input.editedTranscript ?? null,
    'pending',
    null,
    createdAt,
  );
}

async function pending(): Promise<QueuedDream[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<DreamQueueRow>(
    `SELECT * FROM dream_queue WHERE sync_status = ? ORDER BY created_at ASC`,
    'pending',
  );
  return rows.map(toQueuedDream);
}

/** Purge on sync (Mobile M9): deletes the row rather than flipping a flag. */
async function markSynced(localId: string, _syncedId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM dream_queue WHERE local_id = ?`, localId);
}

async function markFailed(localId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE dream_queue SET sync_status = ? WHERE local_id = ?`, 'failed', localId);
}

/**
 * Account deletion (§10 / Task 12): wipes every locally-queued dream and the
 * encryption key that guards them. Used after `DELETE /v1/account` succeeds,
 * before `signOut()` — a deleted account must leave nothing dream-shaped
 * behind on the device, queued or otherwise. Drops all rows (not just
 * pending ones) and removes the secure-store db key so a stale key can never
 * be reused to decrypt a future db file, then resets the cached handle so a
 * subsequent init() starts completely fresh.
 */
async function clearAll(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`DELETE FROM dream_queue;`);
  await SecureStore.deleteItemAsync(DB_KEY_SECURE_STORE_KEY);
  dbPromise = null;
}

/** Test-only: resets the module-level cached DB handle so tests get a fresh init(). */
function __resetForTests(): void {
  dbPromise = null;
}

export const dreamQueue = {
  init,
  enqueue,
  pending,
  markSynced,
  markFailed,
  clearAll,
  __resetForTests,
};
