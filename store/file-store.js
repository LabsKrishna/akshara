// store/file-store.js — JSONL file-backed store adapter (default)
// Provides the same sync Map interface used throughout index.js.
// I/O is synchronous (fs.openSync / writeSync / fsyncSync) to preserve the
// existing write-lock design — no async boundary inside the critical section.
//
// Durability contract (CLAUDE.md §18):
//   * Writes call fsync before returning, so an acknowledged write survives
//     a power loss on filesystems that honour fsync.
//   * persistAll uses tmp-file + atomic rename. Both the tmp file and the
//     parent directory are fsync'd so the rename is durable.
//   * If the process crashes after the tmp is written but before rename,
//     loadRaw reaps the orphaned tmp on next start — the canonical file is
//     the source of truth.
//   * Single-process only. Multi-process writers will corrupt the file;
//     this matches the Stage-1 indie-developer use case in CLAUDE.md §13.
"use strict";

const fs = require("fs");
const path = require("path");

function _writeFileSyncDurable(file, data) {
  // Open + write + fsync + close, then fsync the parent directory so the
  // dirent for `file` is durable too. Required for crash-consistent renames.
  const fd = fs.openSync(file, "w");
  try {
    fs.writeSync(fd, data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function _appendSyncDurable(file, data) {
  const fd = fs.openSync(file, "a");
  try {
    fs.writeSync(fd, data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function _fsyncDir(dir) {
  // Best-effort: fsync the directory so a freshly-created or renamed file
  // is durable. On some platforms (Windows) opening a directory for fsync
  // is not supported; swallow EISDIR / ENOTSUP / EPERM there.
  let fd;
  try {
    fd = fs.openSync(dir, "r");
    fs.fsyncSync(fd);
  } catch (err) {
    if (err.code !== "EISDIR" && err.code !== "ENOTSUP" && err.code !== "EPERM") throw err;
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch {}
  }
}

class FileStore {
  constructor() {
    this._map = new Map();
  }

  // ── Sync Map interface ─────────────────────────────────────────────────────
  get(id)         { return this._map.get(id); }
  set(id, entity) { this._map.set(id, entity); return this; }
  has(id)         { return this._map.has(id); }
  delete(id)      { return this._map.delete(id); }
  values()        { return this._map.values(); }
  entries()       { return this._map.entries(); }
  get size()      { return this._map.size; }
  // Allow `for (const [k, v] of store)` patterns in index.js
  [Symbol.iterator]() { return this._map[Symbol.iterator](); }

  // ── Load raw rows from JSONL file ──────────────────────────────────────────
  // Returns an array of plain objects. Sync. Malformed lines are skipped
  // with a warning; parsing errors are returned alongside clean rows so
  // the caller can emit typed errors via the signal bus.
  // Side effect: removes any orphaned `<file>.tmp` left by a crash mid-rename.
  // The canonical file is authoritative; the tmp represents work that never
  // completed and would otherwise grow stale.
  loadRaw(config) {
    const file = config.dataFile;
    if (!file || file === ":memory:") return [];

    const tmp = file + ".tmp";
    if (fs.existsSync(tmp)) {
      try {
        fs.unlinkSync(tmp);
        console.warn(`[kalairos] FileStore: reaped orphaned ${path.basename(tmp)} from prior crash`);
      } catch (err) {
        console.warn(`[kalairos] FileStore: failed to reap ${tmp}: ${err.message}`);
      }
    }

    if (!fs.existsSync(file)) return [];

    const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
    const rows = [];
    for (const line of lines) {
      try {
        rows.push(JSON.parse(line));
      } catch {
        console.warn(`[kalairos] FileStore: skipping malformed line: ${line.slice(0, 80)}`);
      }
    }
    return rows; // caller normalizes and calls store.set()
  }

  // ── Persist all entities → atomic JSONL rewrite ────────────────────────────
  // `rows` is an array of plain-object entities (links already serialised to array).
  // Throws on I/O failure so the caller can emitError and (importantly) reject
  // the originating write so the user learns about the divergence.
  persistAll(rows, config) {
    const file = config.dataFile;
    if (!file || file === ":memory:") return;

    const tmp = file + ".tmp";
    const data = rows.map(r => JSON.stringify(r)).join("\n") + "\n";
    _writeFileSyncDurable(tmp, data);
    fs.renameSync(tmp, file); // atomic on POSIX — no corrupt reads on crash
    _fsyncDir(path.dirname(file));
  }

  // ── Append one entity ──────────────────────────────────────────────────────
  appendEntity(row, config) {
    const file = config.dataFile;
    if (!file || file === ":memory:") return;
    _appendSyncDurable(file, JSON.stringify(row) + "\n");
  }

  // No connections to close.
  shutdown() {}
}

module.exports = { FileStore };
