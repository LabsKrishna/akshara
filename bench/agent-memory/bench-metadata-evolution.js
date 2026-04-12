// bench/agent-memory/bench-metadata-evolution.js
// Deterministic benchmark: tests metadata evolution, provenance tracking,
// retention policies, soft/hard delete lifecycle, and the Error→Signal
// learning loop under controlled failure scenarios.
"use strict";

const assert = require("assert/strict");
const { lib, BASE_OPTS, DAY, BenchSuite } = require("./helpers");

async function run() {
  const bench = new BenchSuite("Metadata + Evolution — Lifecycle");
  bench.start();

  await lib.init(BASE_OPTS);
  const t0 = Date.now();

  // ── Provenance chain: user → agent → tool ─────────────────────────────────
  const id = await lib.remember("Server SLA is 200 milliseconds response time", {
    source: { type: "user", actor: "ops-lead" },
    classification: "internal",
    retention: { policy: "keep", expiresAt: null },
    timestamp: t0,
  });

  await lib.remember("Server SLA is 150 milliseconds response time", {
    source: { type: "agent", actor: "monitor-bot" },
    classification: "internal",
    timestamp: t0 + DAY,
  });

  await lib.remember("Server SLA is 180 milliseconds response time", {
    source: { type: "tool", uri: "sla-dashboard" },
    classification: "confidential",
    timestamp: t0 + 2 * DAY,
  });

  await bench.run("Provenance chain preserved across 3 sources", async () => {
    const h = await lib.getHistory(id);
    assert.strictEqual(h.versionCount, 3);
    assert.strictEqual(h.versions[0].source.actor, "ops-lead");
    assert.strictEqual(h.versions[1].source.actor, "monitor-bot");
    assert.deepStrictEqual(h.versions[2].source, { type: "tool", uri: "sla-dashboard" });
  });

  await bench.run("Classification escalates to latest version", async () => {
    const entity = await lib.get(id);
    assert.strictEqual(entity.classification, "confidential");
  });

  // ── Retention policy ──────────────────────────────────────────────────────
  const ephemeralId = await lib.ingest("Temporary debug log entry for session 42", {
    retention: { policy: "delete", expiresAt: t0 + 7 * DAY },
    memoryType: "short-term",
    timestamp: t0 + 3 * DAY,
  });

  await bench.run("Retention policy stored and retrievable", async () => {
    const e = await lib.get(ephemeralId);
    assert.strictEqual(e.retention.policy, "delete");
    assert.strictEqual(e.retention.expiresAt, t0 + 7 * DAY);
    assert.strictEqual(e.memoryType, "short-term");
  });

  // ── Soft delete lifecycle ─────────────────────────────────────────────────
  const deleteTargetId = await lib.ingest("Fact to be soft deleted for testing", {
    timestamp: t0 + 4 * DAY,
  });

  await lib.remove(deleteTargetId, { deletedBy: { type: "user", actor: "admin" } });

  await bench.run("Soft-deleted entity excluded from queries", async () => {
    const res = await lib.query("soft deleted for testing");
    const found = res.results.some(r => r.id === deleteTargetId);
    assert.ok(!found, "soft-deleted entity should not appear in query results");
  });

  await bench.run("Soft-deleted entity still accessible via get()", async () => {
    const e = await lib.get(deleteTargetId);
    assert.ok(e.deletedAt, "should have deletedAt timestamp");
    assert.strictEqual(e.deletedBy.actor, "admin");
  });

  await bench.run("Double-delete throws typed error", async () => {
    try {
      await lib.remove(deleteTargetId);
      assert.fail("should have thrown");
    } catch (err) {
      assert.strictEqual(err.code, "ERR_ALREADY_DELETED");
      assert.strictEqual(err.recoverable, false);
    }
  });

  // ── Hard delete (purge) ───────────────────────────────────────────────────
  const purgeTargetId = await lib.ingest("Fact to be permanently purged", {
    timestamp: t0 + 5 * DAY,
  });

  await lib.purge(purgeTargetId);

  await bench.run("Purged entity is gone from store", async () => {
    try {
      await lib.get(purgeTargetId);
      assert.fail("should have thrown");
    } catch (err) {
      assert.strictEqual(err.code, "ERR_ENTITY_NOT_FOUND");
    }
  });

  // ── Tag evolution across versions ─────────────────────────────────────────
  const tagId = await lib.ingest("Project alpha is in planning phase", {
    tags: ["alpha", "planning"],
    timestamp: t0 + 6 * DAY,
  });

  await lib.ingest("Project alpha is in execution phase", {
    tags: ["alpha", "execution"],
    timestamp: t0 + 7 * DAY,
  });

  await bench.run("Tags accumulate across versions (union)", async () => {
    const e = await lib.get(tagId);
    assert.ok(e.tags.includes("alpha"), "original tag preserved");
    assert.ok(e.tags.includes("planning"), "v1 tag preserved");
    assert.ok(e.tags.includes("execution"), "v2 tag added");
  });

  // ── Error → Signal → Learning Loop ────────────────────────────────────────
  const signals = [];
  const unsub = lib.onSignal(null, (s) => signals.push(s));

  // Trigger a known error
  try { await lib.get(888888888); } catch { /* expected */ }
  // Trigger another
  try { await lib.remove(deleteTargetId); } catch { /* expected */ }

  unsub();

  await bench.run("Signal bus captures multiple error types", async () => {
    const codes = new Set(signals.map(s => s.code));
    assert.ok(codes.has("ERR_ENTITY_NOT_FOUND"), "should capture not-found signal");
    assert.ok(codes.has("ERR_ALREADY_DELETED"), "should capture already-deleted signal");
  });

  await bench.run("Signals carry structured metadata", async () => {
    const notFoundSignal = signals.find(s => s.code === "ERR_ENTITY_NOT_FOUND");
    assert.ok(notFoundSignal.timestamp, "signal should have timestamp");
    assert.strictEqual(notFoundSignal.recoverable, false);
    assert.ok(notFoundSignal.context.entityId, "signal should have entityId in context");
  });

  await bench.run("getSignals() returns historical signal log", async () => {
    const allSignals = lib.getSignals();
    assert.ok(allSignals.length >= 2, "should have captured signals in the log");
  });

  // ── Status reflects correct counts ────────────────────────────────────────
  await bench.run("getStatus reports deleted entity count", async () => {
    const status = await lib.getStatus();
    assert.ok(status.deletedEntities >= 1, "should have at least 1 soft-deleted entity");
    assert.ok(status.entities >= 3, "should have alive entities");
  });

  return bench.finish();
}

module.exports = { run };
if (require.main === module) run().catch(e => { console.error(e); process.exit(1); });
