// test-versioning.js — Versioning correctness tests
// Run: node test-versioning.js
"use strict";

const assert = require("assert/strict");
const lib    = require("./index");

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

// ─── Mock embedder ────────────────────────────────────────────────────────────
// Bag-of-words so that:
//   identical text → cosine 1.0        (version update path)
//   1-2 word changes → cosine ~0.85+   (still a version update)
//   completely different → cosine ~0.1  (new entity)
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

const INIT_OPTS = {
  dataFile:         ":memory:",
  embeddingDim:     64,
  embedFn:          makeMockEmbedder(64),
  versionThreshold: 0.80,
  linkThreshold:    0.72,
  minFinalScore:    0.20,
};

(async () => {
  console.log("\n── version detection ────────────────────────────────────────────");

  await lib.init(INIT_OPTS);

  await test("identical text → same ID (version update, not new entity)", async () => {
    const text = "the quarterly sales report shows strong revenue growth";
    const id1  = await lib.ingest(text);
    const id2  = await lib.ingest(text);
    assert.strictEqual(id1, id2, "must return the same ID for identical text");
  });

  await test("very similar text → same ID", async () => {
    const id1 = await lib.ingest("raw material cost is two hundred dollars per unit in january");
    const id2 = await lib.ingest("raw material cost is two hundred and ten dollars per unit in january");
    assert.strictEqual(id1, id2, "close variant must update the same entity");
  });

  await test("unrelated text → different ID", async () => {
    const id1 = await lib.ingest("distributed database sharding and replication strategy");
    const id2 = await lib.ingest("baking sourdough bread with whole wheat flour at home");
    assert.notStrictEqual(id1, id2, "unrelated content must produce a new entity");
  });

  await test("different type → different entity even if text is identical", async () => {
    await lib.init(INIT_OPTS);
    const id1 = await lib.ingest("project notes", { type: "text" });
    const id2 = await lib.ingest("project notes", { type: "document" });
    assert.notStrictEqual(id1, id2, "same text with different type must be separate entities");
  });

  console.log("\n── version count & ordering ─────────────────────────────────────");

  await lib.init(INIT_OPTS);

  await test("first ingest creates exactly 1 version", async () => {
    const id = await lib.ingest("initial content of the entity");
    const h  = await lib.getHistory(id);
    assert.strictEqual(h.versionCount, 1);
    assert.strictEqual(h.versions.length, 1);
  });

  await test("update adds exactly 1 more version per update", async () => {
    const text = "the company ceo is john smith appointed last year";
    const id   = await lib.ingest(text);
    await lib.ingest(text + " he leads three divisions");
    await lib.ingest(text + " he leads four divisions now");
    const h = await lib.getHistory(id);
    assert.strictEqual(h.versionCount, 3, `expected 3 versions, got ${h.versionCount}`);
  });

  await test("versions are returned oldest-first (v1 is the original)", async () => {
    await lib.init(INIT_OPTS);
    const base = "server response latency is ninety milliseconds average";
    const id   = await lib.ingest(base);
    const upd  = "server response latency is one hundred milliseconds average";
    await lib.ingest(upd);

    const h = await lib.getHistory(id);
    assert.strictEqual(h.versions[0].version, 1, "first element must be v1 (original)");
    assert.strictEqual(h.versions[0].text, base, "v1 text must match original ingest");
    assert.ok(h.versions[1].timestamp >= h.versions[0].timestamp,
      "later versions must have equal or greater timestamps");
  });

  await test("current entity text always reflects the latest version", async () => {
    await lib.init(INIT_OPTS);
    const id  = await lib.ingest("version one text about the product roadmap");
    const upd = "version one text about the product roadmap updated for next quarter";
    await lib.ingest(upd);
    const h = await lib.getHistory(id);
    assert.strictEqual(h.current, upd, "current must be the latest ingested text");
  });

  console.log("\n── delta classification ─────────────────────────────────────────");

  await lib.init(INIT_OPTS);

  await test("numeric change → delta type is 'update'", async () => {
    const id = await lib.ingest("raw material costs two hundred dollars per unit this quarter");
    await lib.ingest("raw material costs two hundred and fifty dollars per unit this quarter");
    const h = await lib.getHistory(id);
    const latest = h.versions[h.versions.length - 1]; // last = newest (v2)
    assert.ok(latest.delta !== null, "update must have a delta");
    assert.ok(
      ["update", "addition", "correction"].includes(latest.delta.type),
      `unexpected delta type: ${latest.delta.type}`
    );
  });

  await test("spelled-out number change is classified as 'update'", async () => {
    await lib.init(INIT_OPTS);
    const id = await lib.ingest("the team has fifty engineers working on the project");
    await lib.ingest("the team has sixty engineers working on the project");
    const h = await lib.getHistory(id);
    const latest = h.versions[h.versions.length - 1];
    assert.ok(latest.delta !== null, "must have a delta");
    assert.ok(
      ["update", "correction"].includes(latest.delta.type),
      `expected update/correction for spelled-out number change, got: ${latest.delta.type}`
    );
  });

  await test("delta has semanticShift, addedTerms, removedTerms, summary", async () => {
    await lib.init(INIT_OPTS);
    const id = await lib.ingest("the product has ten features and ships in summer");
    await lib.ingest("the product has fifteen features and ships in autumn");
    const h      = await lib.getHistory(id);
    const delta  = h.versions[h.versions.length - 1].delta;
    assert.ok(delta !== null);
    assert.ok("type"          in delta, "missing delta.type");
    assert.ok("semanticShift" in delta, "missing delta.semanticShift");
    assert.ok("addedTerms"    in delta, "missing delta.addedTerms");
    assert.ok("removedTerms"  in delta, "missing delta.removedTerms");
    assert.ok("summary"       in delta, "missing delta.summary");
    assert.ok(typeof delta.semanticShift === "number");
    assert.ok(delta.semanticShift >= 0 && delta.semanticShift <= 1,
      `semanticShift ${delta.semanticShift} out of [0,1]`);
  });

  await test("v1 origin version has delta: null", async () => {
    const id = await lib.ingest("fresh new entity with no prior history");
    const h  = await lib.getHistory(id);
    assert.strictEqual(h.versions[0].delta, null, "origin version must have null delta");
  });

  console.log("\n── tag & metadata merging ───────────────────────────────────────");

  await lib.init(INIT_OPTS);

  await test("tags are merged on version update", async () => {
    // Keep the addition short (≤2 words) so cosine stays above versionThreshold
    const text = "project knowledge base for engineering team documentation";
    const id   = await lib.ingest(text,          { tags: ["engineering", "docs"] });
    await lib.ingest(text + " revised",          { tags: ["updated"] });
    const h = await lib.getHistory(id);
    assert.ok(h.tags.includes("engineering"), "original tags must be preserved");
    assert.ok(h.tags.includes("docs"),        "original tags must be preserved");
    assert.ok(h.tags.includes("updated"),     "new tags must be added");
  });

  await test("metadata is merged on version update", async () => {
    const text = "quarterly financial results for the enterprise segment";
    const id   = await lib.ingest(text, { metadata: { author: "alice", draft: true } });
    await lib.ingest(text + " final version", { metadata: { draft: false, reviewer: "bob" } });
    const h = await lib.getHistory(id);
    assert.strictEqual(h.metadata.author,   "alice", "original metadata must persist");
    assert.strictEqual(h.metadata.draft,    false,   "metadata value must be overwriteable");
    assert.strictEqual(h.metadata.reviewer, "bob",   "new metadata keys must be added");
  });

  console.log("\n── time series ingest ───────────────────────────────────────────");

  await lib.init(INIT_OPTS);

  await test("ingestTimeSeries creates entity with type=timeseries", async () => {
    const now    = Date.now();
    const points = Array.from({ length: 10 }, (_, i) => ({
      timestamp: now - (9 - i) * 3_600_000,
      value:     20 + Math.random() * 10,
    }));
    const id = await lib.ingestTimeSeries("CPU Usage (%)", points, { tags: ["server", "metrics"] });
    const h  = await lib.getHistory(id);
    assert.strictEqual(h.type, "timeseries");
    assert.ok(h.metadata.label === "CPU Usage (%)");
    assert.ok(h.metadata.pointCount === 10);
    assert.ok(h.tags.includes("server"));
  });

  await test("ingestTimeSeries throws on empty points", async () => {
    await assert.rejects(
      () => lib.ingestTimeSeries("empty series", []),
      /non-empty/i
    );
  });

  console.log("\n── stable IDs ───────────────────────────────────────────────────");

  await lib.init(INIT_OPTS);

  await test("entity ID never changes across multiple updates", async () => {
    const text = "the ceo of the company is sarah chen appointed in january";
    const id1  = await lib.ingest(text);
    const id2  = await lib.ingest(text + " she leads five business units");
    const id3  = await lib.ingest(text + " she leads six business units now");
    assert.strictEqual(id1, id2, "ID must not change on first update");
    assert.strictEqual(id2, id3, "ID must not change on second update");
  });

  console.log("\n── maxVersions ──────────────────────────────────────────────────");

  await lib.init({ ...INIT_OPTS, maxVersions: 3 });

  await test("maxVersions trims oldest versions", async () => {
    const text = "base content about server performance metrics and latency";
    const id   = await lib.ingest(text);
    await lib.ingest(text + " update one");
    await lib.ingest(text + " update two");
    await lib.ingest(text + " update three");
    await lib.ingest(text + " update four");
    const h = await lib.getHistory(id);
    assert.ok(h.versionCount <= 3, `expected at most 3 versions, got ${h.versionCount}`);
  });

  await test("maxVersions=0 means unlimited versions", async () => {
    await lib.init({ ...INIT_OPTS, maxVersions: 0 });
    const text = "unlimited versioning entity for stress test";
    const id   = await lib.ingest(text);
    for (let i = 1; i <= 5; i++) await lib.ingest(text + " v" + i);
    const h = await lib.getHistory(id);
    assert.strictEqual(h.versionCount, 6, `expected 6 versions, got ${h.versionCount}`);
  });

  // ── Results ───────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(60)}`);
  const total = passed + failed;
  console.log(`  ${passed}/${total} passed${failed ? `  (${failed} failed)` : " ✅"}`);
  console.log(`${"─".repeat(60)}\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
