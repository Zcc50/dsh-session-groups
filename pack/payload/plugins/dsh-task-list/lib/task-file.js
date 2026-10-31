/**
 * Task list persistence — one JSON file per session under `$DSH_HOME`.
 *
 *   <DSH_HOME>/storages/task-list/<sessionId>.json
 *   { version: 1, sessionId, tasks: Task[], updatedAt: number }
 *
 * Writes are atomic: serialise to a sibling temp file, then rename over the
 * target, so a crash mid-write leaves the previous list intact. A corrupt file
 * is moved aside rather than deleted — a bad byte costs one session's list,
 * never the user's only copy.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const FILE_VERSION = 1;

/** Resolve `$DSH_HOME`, falling back to `~/.dsh` in a bare Node process. */
export function dshHome() {
  const fromEnv = typeof process !== 'undefined' && process.env ? process.env.DSH_HOME : undefined;
  if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) return fromEnv.trim();
  return join(homedir(), '.dsh');
}

/** Directory holding every session's task file. */
export function taskListDir() {
  return join(dshHome(), 'storages', 'task-list');
}

/** Session ids are usually UUIDs, but never trust one as a path segment. */
export function safeName(sessionId) {
  const text = String(sessionId === undefined || sessionId === null ? '' : sessionId).trim();
  if (text.length === 0) throw new Error('sessionId must be a non-empty string');
  return text.replace(/[^A-Za-z0-9._-]/g, '_');
}

/** Absolute path of one session's task file. */
export function taskFilePath(sessionId) {
  return join(taskListDir(), safeName(sessionId) + '.json');
}

/**
 * Read one session's list.
 * @returns {{ tasks: object[], exists: boolean, corrupt: boolean, file: string, aside?: string, error?: string }}
 */
export function readTaskState(sessionId) {
  const file = taskFilePath(sessionId);
  if (!existsSync(file)) return { tasks: [], exists: false, corrupt: false, updatedAt: 0, file };
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    return { tasks: [], exists: true, corrupt: false, updatedAt: 0, error: describe(error), file };
  }
  try {
    const parsed = JSON.parse(text);
    const tasks = parsed && Array.isArray(parsed.tasks) ? parsed.tasks : [];
    const updatedAt = parsed && typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0;
    return { tasks, exists: true, corrupt: false, updatedAt, file };
  } catch (error) {
    const aside = file + '.corrupt-' + Date.now();
    try {
      renameSync(file, aside);
    } catch (renameError) {
      // Keep the unreadable original in place; the caller still reports empty.
      return { tasks: [], exists: true, corrupt: true, updatedAt: 0, error: describe(error), file };
    }
    return { tasks: [], exists: true, corrupt: true, updatedAt: 0, aside, error: describe(error), file };
  }
}

/** Atomically replace one session's list. Returns the written path and stamp. */
export function writeTaskState(sessionId, tasks) {
  const file = taskFilePath(sessionId);
  mkdirSync(taskListDir(), { recursive: true });
  const updatedAt = Date.now();
  const payload = JSON.stringify({
    version: FILE_VERSION,
    sessionId: String(sessionId),
    tasks: Array.isArray(tasks) ? tasks : [],
    updatedAt,
  }, null, 2);
  const tmp = file + '.tmp-' + process.pid;
  writeFileSync(tmp, payload, 'utf8');
  renameSync(tmp, file);
  return { file, updatedAt };
}

function describe(error) {
  return error && error.message ? String(error.message) : String(error);
}
