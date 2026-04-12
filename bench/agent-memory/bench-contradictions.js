// bench/agent-memory/bench-contradictions.js
// Deterministic benchmark: tests contradiction detection across multiple
// entity types — numeric value swaps, factual corrections, source conflicts,
// and non-contradictory updates that should NOT be flagged.
"use strict";

const assert = require("assert/strict");
const { lib, BASE_OPTS, DAY, BenchSuite } = require("./helpers");

async function run() {
  const bench = new BenchSuite("Contradiction Detection — Multi-Scenario");
  bench.start();

  await lib.init(BASE_OPTS);
  const t0 = Date.now();

  // ── Scenario 1: Numeric value swap (classic contradiction) ────────────────
  const priceId = await lib.remember("Annual subscription price is 200 dollars per seat", {
    source: { type: "tool", uri: "pricing-api" },
    classification: "internal",
    timestamp: t0,
  });

  await lib.remember("Annual subscription price is 250 dollars per seat", {
    source: { type: "user", actor: "sales-lead" },
    classification: "internal",
    timestamp: t0 + DAY,
  });

  await bench.run("Numeric swap flagged as contradiction", async () => {
    const history = await lib.getHistory(priceId);
    assert.strictEqual(history.versionCount, 2);
    assert.strictEqual(history.versions[1].delta.contradicts, true);
  });

  await bench.run("Delta type is update for numeric swap", async () => {
    const history = await lib.getHistory(priceId);
    assert.ok(
      ["update", "correction"].includes(history.versions[1].delta.type),
      `expected update or correction, got ${history.versions[1].delta.type}`
    );
  });

  // ── Scenario 2: Date/time contradiction ───────────────────────────────────
  const meetingId = await lib.remember("Team standup meeting is scheduled for 9am every Monday", {
    source: { type: "agent", actor: "scheduler" },
    timestamp: t0 + 2 * DAY,
  });

  await lib.remember("Team standup meeting is scheduled for 10am every Monday", {
    source: { type: "user", actor: "manager" },
    timestamp: t0 + 3 * DAY,
  });

  await bench.run("Time change flagged as contradiction", async () => {
    const history = await lib.getHistory(meetingId);
    assert.strictEqual(history.versionCount, 2);
    // 9am→10am is a numeric-like change
    assert.strictEqual(history.versions[1].delta.contradicts, true);
  });

  // ── Scenario 3: Factual correction (non-numeric) ─────────────────────────
  const ownershipId = await lib.remember("The atlas project is owned by the infrastructure team", {
    source: { type: "agent", actor: "onboarding-bot" },
    timestamp: t0 + 4 * DAY,
  });

  await lib.remember("The atlas project is owned by the platform engineering team", {
    source: { type: "user", actor: "cto" },
    timestamp: t0 + 5 * DAY,
  });

  await bench.run("Factual correction detected as update/correction", async () => {
    const history = await lib.getHistory(ownershipId);
    assert.strictEqual(history.versionCount, 2);
    assert.ok(history.versions[1].delta, "delta should exist");
    assert.ok(
      ["correction", "update", "addition"].includes(history.versions[1].delta.type),
      `expected correction-like delta, got ${history.versions[1].delta.type}`
    );
  });

  // ── Scenario 4: Non-contradictory additive update ─────────────────────────
  // Uses very similar phrasing to stay above version threshold with mock embedder
  const statusId = await lib.remember("Project atlas status is currently in the planning phase", {
    source: { type: "agent", actor: "tracker" },
    timestamp: t0 + 6 * DAY,
  });

  await lib.remember("Project atlas status is currently in the planning phase with kickoff confirmed", {
    source: { type: "agent", actor: "tracker" },
    timestamp: t0 + 7 * DAY,
  });

  await bench.run("Additive update NOT flagged as contradiction", async () => {
    const history = await lib.getHistory(statusId);
    assert.strictEqual(history.versionCount, 2, `expected 2 versions, got ${history.versionCount}`);
    assert.strictEqual(history.versions[1].delta.contradicts, false);
  });

  await bench.run("Additive update classified as addition or patch", async () => {
    const history = await lib.getHistory(statusId);
    assert.ok(
      ["addition", "patch", "update"].includes(history.versions[1].delta.type),
      `expected addition/patch, got ${history.versions[1].delta.type}`
    );
  });

  // ── Scenario 5: Multi-source conflict (same entity, different sources) ────
  const headcountId = await lib.remember("Engineering headcount is 45 people", {
    source: { type: "tool", uri: "hr-system" },
    timestamp: t0 + 8 * DAY,
  });

  await lib.remember("Engineering headcount is 52 people", {
    source: { type: "user", actor: "vp-eng" },
    timestamp: t0 + 9 * DAY,
  });

  await bench.run("Cross-source numeric conflict flagged", async () => {
    const history = await lib.getHistory(headcountId);
    assert.strictEqual(history.versions[1].delta.contradicts, true);
  });

  await bench.run("Provenance preserved across conflicting sources", async () => {
    const history = await lib.getHistory(headcountId);
    assert.deepStrictEqual(history.versions[0].source, { type: "tool", uri: "hr-system" });
    assert.deepStrictEqual(history.versions[1].source, { type: "user", actor: "vp-eng" });
  });

  // ── Scenario 6: Rapid-fire contradictions (3 conflicting values) ──────────
  const rapidId = await lib.remember("Server response time SLA is 200 milliseconds", {
    source: { type: "agent", actor: "sre-bot" },
    timestamp: t0 + 10 * DAY,
  });

  await lib.remember("Server response time SLA is 150 milliseconds", {
    source: { type: "user", actor: "sre-lead" },
    timestamp: t0 + 11 * DAY,
  });

  await lib.remember("Server response time SLA is 300 milliseconds", {
    source: { type: "tool", uri: "policy-engine" },
    timestamp: t0 + 12 * DAY,
  });

  await bench.run("Multiple contradictions detected in rapid succession", async () => {
    const history = await lib.getHistory(rapidId);
    assert.strictEqual(history.versionCount, 3);
    const contradictionCount = history.versions.filter(v => v.delta?.contradicts).length;
    assert.ok(contradictionCount >= 2, `expected ≥2 contradictions, got ${contradictionCount}`);
  });

  await bench.run("Agent getContradictions() returns all flagged versions", async () => {
    const agent = lib.createAgent({ name: "auditor" });
    const { contradictions } = await agent.getContradictions(rapidId);
    assert.ok(contradictions.length >= 2, `expected ≥2 via agent API, got ${contradictions.length}`);
  });

  return bench.finish();
}

module.exports = { run };
if (require.main === module) run().catch(e => { console.error(e); process.exit(1); });
