// test-sqlite-integration.js — KAL-108 end-to-end tests with the flag ON
// Run: KALAIROS_INDEX_SQLITE=1 node test-sqlite-integration.js
//      (the file sets the env itself if absent, so plain `node` works too)
//
// These tests exercise the live write path with the SQLite hybrid index
// enabled. The existing test-basic / test-versioning suites run with the
// flag OFF and prove the no-regression promise; this file proves the
// flag-ON promise: SQLite stays in sync with JSONL on every write, and
// boot integration picks the right action.
"use strict";

// Set the env BEFORE requiring kalairos so init() picks up the flag on the
// first call. Tests that need to flip it back off restart by re-requiring
// kalairos via fresh tmp dirs.
process.env.KALAIROS_INDEX_SQLITE = "1";

const assert = require("assert/strict");
const fs     = require("fs");
const os     = require("os");
const path   = require("path");

const lib = require("./index");
const { SqliteIndex } = require("./store/sqlite-index");

let passed = 0, failed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅  ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌  ${name}`);
    console.log(`       ${e.message}`);
    failed++;
  }
}

// Same deterministic bag-of-words embedder used by test-basic.js — keeps
// queries reproducible without hitting the ONNX model on disk.
function makeMockEmbedder(dim = 64) {
  const vocab = new Map();
  return async function embed(text) {
    const words = String(text).toLowerCase().match(/[a-z]+/g) || [];
    const vec   = new Array(dim).fill(0);
    for (const w of words) {
      if (!vocab.has(w)) vocab.set(w, vocab.size);
      vec[vocab.get(w) % dim]++;
    }
    const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map(v => v / mag);
  };
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kal-sqlite-int-"));
let counter = 0;
function freshDataFile() {
  const dir = path.join(tmpRoot, `run-${++counter}`);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "data.kalairos");
}

function baseInitOpts(dataFile) {
  return {
    dataFile,
    embeddingDim:     64,
    embedFn:          makeMockEmbedder(64),
    linkThreshold:    0.72,
    versionThreshold: 0.82,
    minFinalScore:    0.20,
  };
}

// Read SQLite directly (independent of the live _sqliteIdx) — proves the
// data is actually on disk, not just in the in-memory write-cache.
function snapshot(sqlitePath) {
  const idx = new SqliteIndex();
  idx.open(sqlitePath);
  try {
    return {
      facts:    idx.db.prepare("SELECT id, text, namespace FROM facts ORDER BY id").all(),
      versions: idx.db.prepare("SELECT fact_id, version FROM fact_versions ORDER BY fact_id, version").all(),
      links:    idx.db.prepare("SELECT src_id, dst_id FROM links ORDER BY src_id, dst_id").all(),
      meta:     Object.fromEntries(
                  idx.db.prepare("SELECT key, value FROM meta").all().map(r => [r.key, r.value])
                ),
    };
  } finally {
    idx.close();
  }
}

(async () => {

// ── KAL-108 write path ──────────────────────────────────────────────────────
console.log("\n── Write path with KALAIROS_INDEX_SQLITE=1 (KAL-108) ─────────────");

await test("first start with no JSONL → empty index, READY-equivalent setup", async () => {
  const dataFile   = freshDataFile();
  const sqlitePath = dataFile + ".sqlite";

  // No data file yet — init should still open SQLite cleanly via REBUILD path.
  await lib.init(baseInitOpts(dataFile));
  await lib.shutdown();

  assert.ok(fs.existsSync(sqlitePath), "SQLite file should exist after init");
  const snap = snapshot(sqlitePath);
  assert.equal(snap.facts.length, 0);
  assert.equal(snap.meta.schema_version, "1");
  assert.equal(snap.meta.dirty, "0");
});

await test("ingest mirrors immediately into SQLite (facts + versions + meta)", async () => {
  const dataFile   = freshDataFile();
  const sqlitePath = dataFile + ".sqlite";

  await lib.init(baseInitOpts(dataFile));
  const id = await lib.ingest("the sky is blue today");
  await lib.shutdown();

  const snap = snapshot(sqlitePath);
  assert.equal(snap.facts.length, 1);
  assert.equal(snap.facts[0].id, String(id), "facts.id should match ingest's returned id");
  assert.match(snap.facts[0].text, /sky is blue/);
  assert.equal(snap.versions.length, 1);
  assert.equal(snap.versions[0].fact_id, String(id));
  assert.equal(snap.versions[0].version, 1);

  const jsonlSize = fs.statSync(dataFile).size;
  assert.equal(snap.meta.jsonl_size_bytes, String(jsonlSize), "meta should track jsonl size after write");
  assert.equal(snap.meta.last_jsonl_offset, String(jsonlSize));
  assert.equal(snap.meta.dirty, "0");
});

await test("multiple ingests all land in SQLite in order", async () => {
  const dataFile   = freshDataFile();
  const sqlitePath = dataFile + ".sqlite";

  await lib.init(baseInitOpts(dataFile));
  const id1 = await lib.ingest("alpha bravo charlie");
  const id2 = await lib.ingest("delta echo foxtrot");
  const id3 = await lib.ingest("golf hotel india");
  await lib.shutdown();

  const snap = snapshot(sqlitePath);
  assert.equal(snap.facts.length, 3);
  const ids = snap.facts.map(f => f.id);
  assert.deepEqual(ids.sort(), [String(id1), String(id2), String(id3)].sort());
});

await test("FTS5 reflects ingested text via the live write path", async () => {
  const dataFile   = freshDataFile();
  const sqlitePath = dataFile + ".sqlite";

  await lib.init(baseInitOpts(dataFile));
  await lib.ingest("the quick brown fox jumps");
  await lib.ingest("over the lazy dog by the river");
  await lib.shutdown();

  const idx = new SqliteIndex();
  idx.open(sqlitePath);
  try {
    const foxHits = idx.db.prepare(
      "SELECT facts.id FROM facts_fts JOIN facts ON facts.rowid = facts_fts.rowid WHERE facts_fts MATCH ?"
    ).all("fox");
    assert.equal(foxHits.length, 1, "FTS5 should index live writes via the trigger");
  } finally {
    idx.close();
  }
});

// ── Boot integration ────────────────────────────────────────────────────────
console.log("\n── Boot integration (KAL-108) ────────────────────────────────────");

await test("restart on fresh JSONL → REBUILD, then READY", async () => {
  const dataFile   = freshDataFile();
  const sqlitePath = dataFile + ".sqlite";

  // First session: write a few rows, shutdown.
  await lib.init(baseInitOpts(dataFile));
  await lib.ingest("session one row a");
  await lib.ingest("session one row b");
  await lib.shutdown();

  const before = snapshot(sqlitePath);
  assert.equal(before.facts.length, 2);

  // Second session: re-init on the same data file. boot tree should READY.
  await lib.init(baseInitOpts(dataFile));
  await lib.shutdown();

  const after = snapshot(sqlitePath);
  // In-sync restart: no rows added, no dirty flag.
  assert.equal(after.facts.length, 2);
  assert.equal(after.meta.dirty, "0");
});

await test("restart with deleted SQLite file → REBUILD restores everything", async () => {
  const dataFile   = freshDataFile();
  const sqlitePath = dataFile + ".sqlite";

  // Build state in session 1.
  await lib.init(baseInitOpts(dataFile));
  await lib.ingest("rebuild me one");
  await lib.ingest("rebuild me two");
  await lib.ingest("rebuild me three");
  await lib.shutdown();

  // Simulate user deleting the SQLite cache between sessions.
  fs.unlinkSync(sqlitePath);
  // Ensure WAL siblings are gone too — rebuild should be self-sufficient.
  for (const sib of [sqlitePath + "-wal", sqlitePath + "-shm"]) {
    if (fs.existsSync(sib)) fs.unlinkSync(sib);
  }

  await lib.init(baseInitOpts(dataFile));
  await lib.shutdown();

  const snap = snapshot(sqlitePath);
  assert.equal(snap.facts.length, 3, "all 3 rows should be reconstructed from JSONL");
  assert.equal(snap.versions.length, 3);
});

await test("external JSONL append between sessions → REPLAY on restart", async () => {
  const dataFile   = freshDataFile();
  const sqlitePath = dataFile + ".sqlite";

  // Seed session 1 with enough rows to push the JSONL past 4 KB so the
  // first-4-KB hash check stays stable across the external append below
  // (otherwise branch d would fire instead of branch g — same isolation
  // requirement as the unit tests in test-sqlite-index.js).
  await lib.init(baseInitOpts(dataFile));
  for (let i = 0; i < 25; i++) await lib.ingest(`session one row ${i}`);
  await lib.shutdown();
  assert.ok(fs.statSync(dataFile).size > 4096, "JSONL must exceed 4 KB to test REPLAY in isolation");
  const beforeFacts = snapshot(sqlitePath).facts.length;

  // Simulate an external tool appending one more line directly to JSONL
  // (the canonical "another tool wrote between sessions" scenario, §6.2 g).
  const extraLine = JSON.stringify({
    id: 9_999_999,
    text: "appended externally",
    type: "text",
    memoryType: "long-term",
    workspaceId: "default",
    tags: [],
    trustScore: 0.7,
    links: [],
    versions: [{ versionId: "9999999:1", timestamp: 1_700_900_000_000 }],
  }) + "\n";
  fs.appendFileSync(dataFile, extraLine);

  // Re-init: boot tree should pick REPLAY, leaving us with N+1 rows.
  await lib.init(baseInitOpts(dataFile));
  await lib.shutdown();

  const after = snapshot(sqlitePath);
  assert.equal(after.facts.length, beforeFacts + 1, "REPLAY should add exactly the appended row");
  assert.ok(after.facts.some(f => f.id === "9999999"), "the externally-appended id should be present");
});

// ── Failure handling ────────────────────────────────────────────────────────
console.log("\n── Failure handling (KAL-108) ────────────────────────────────────");

await test("SQLite txn failure marks dirty, acks the caller, emits a signal", async () => {
  const dataFile   = freshDataFile();
  const sqlitePath = dataFile + ".sqlite";

  await lib.init(baseInitOpts(dataFile));

  // Inject failure: monkey-patch the prototype so the next applyEntity
  // throws. The instance method dispatches via prototype, so the active
  // _sqliteIdx will see this. We restore immediately after the test.
  const origApply = SqliteIndex.prototype.applyEntity;
  let capturedSignal = null;
  const off = lib.onSignal(s => { if (s.code === "ERR_INDEX_WRITE_FAILED") capturedSignal = s; });
  // Suppress the expected console.error during the failure path so test
  // output stays readable.
  const origErr = console.error;
  console.error = () => {};
  try {
    SqliteIndex.prototype.applyEntity = function() {
      throw new Error("simulated SQLite txn failure");
    };

    // Ingest should still resolve — JSONL is canonical.
    const id = await lib.ingest("durable despite sqlite failure");
    assert.ok(id, "ingest should ack even when SQLite mirror throws");

    // JSONL must contain the row.
    const jsonl = fs.readFileSync(dataFile, "utf8");
    assert.match(jsonl, /durable despite sqlite failure/, "JSONL is the source of truth and must contain the row");

    // Signal bus emitted ERR_INDEX_WRITE_FAILED.
    assert.ok(capturedSignal, "expected ERR_INDEX_WRITE_FAILED signal");
    assert.equal(capturedSignal.code, "ERR_INDEX_WRITE_FAILED");
  } finally {
    SqliteIndex.prototype.applyEntity = origApply;
    console.error = origErr;
    if (typeof off === "function") off();
    await lib.shutdown();
  }

  // dirty=1 should be set on disk so the next start triggers REBUILD.
  const snap = snapshot(sqlitePath);
  assert.equal(snap.meta.dirty, "1", "meta.dirty must be set so next start triggers REBUILD");

  // Restart: REBUILD should fire (branch h) and produce a clean index that
  // includes the row that JSONL has but SQLite was missing.
  await lib.init(baseInitOpts(dataFile));
  await lib.shutdown();

  const recovered = snapshot(sqlitePath);
  assert.equal(recovered.meta.dirty, "0", "rebuild should clear dirty");
  assert.ok(recovered.facts.some(f => /durable/.test(f.text)),
            "the row that JSONL had but SQLite missed must be present after rebuild");
});

// ── persistAll stopgap ──────────────────────────────────────────────────────
console.log("\n── persistAll stopgap (KAL-108 → KAL-109) ────────────────────────");

await test("persistAll-driven rewrite (forget) marks dirty until KAL-109", async () => {
  const dataFile   = freshDataFile();
  const sqlitePath = dataFile + ".sqlite";

  await lib.init(baseInitOpts(dataFile));
  const id = await lib.ingest("will be forgotten");
  // forget() rewrites the JSONL via _persistAll; KAL-108's stopgap is to
  // mark dirty so the next start cleanly rebuilds. KAL-109 will replace
  // this with truncate + replay in the same critical section.
  await lib.forget(id);
  await lib.shutdown();

  const snap = snapshot(sqlitePath);
  assert.equal(snap.meta.dirty, "1", "_persistAll must mark dirty under KAL-108");

  // Next start rebuilds from JSONL — the entity is now soft-deleted.
  await lib.init(baseInitOpts(dataFile));
  await lib.shutdown();

  const recovered = snapshot(sqlitePath);
  assert.equal(recovered.meta.dirty, "0");
  // The entity should still be in SQLite (forget is a soft delete, not a
  // line removal) — the deleted_at column reflects the state.
  const idx = new SqliteIndex();
  idx.open(sqlitePath);
  try {
    const row = idx.db.prepare("SELECT deleted_at FROM facts WHERE id = ?").get(String(id));
    assert.ok(row, "the soft-deleted row should still exist in SQLite");
    assert.ok(row.deleted_at != null, "deleted_at should be populated");
  } finally {
    idx.close();
  }
});

// ── Cleanup + results ───────────────────────────────────────────────────────
fs.rmSync(tmpRoot, { recursive: true, force: true });

console.log(`\n${"─".repeat(60)}`);
const total = passed + failed;
console.log(`  ${passed}/${total} passed${failed ? `  (${failed} failed)` : " ✅"}`);
console.log(`${"─".repeat(60)}\n`);
process.exit(failed > 0 ? 1 : 0);

})();
