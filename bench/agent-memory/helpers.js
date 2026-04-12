// bench/agent-memory/helpers.js — Shared deterministic test infrastructure
"use strict";

const lib = require("../../index");

// ─── Deterministic bag-of-words embedder ────────────────────────────────────
// Produces identical vectors for identical input — no randomness, no external calls.
function makeMockEmbedder(dim = 64) {
  const vocab = new Map();
  return async (text) => {
    const words = String(text).toLowerCase().match(/[a-z]+/g) || [];
    const vec = new Array(dim).fill(0);
    for (const w of words) {
      if (!vocab.has(w)) vocab.set(w, vocab.size);
      vec[vocab.get(w) % dim]++;
    }
    const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map(v => v / mag);
  };
}

const DIM = 64;
const DAY = 86_400_000;

const BASE_OPTS = {
  dataFile: ":memory:",
  embeddingDim: DIM,
  embedFn: makeMockEmbedder(DIM),
  linkThreshold: 0.72,
  versionThreshold: 0.82,
  minFinalScore: 0.15,
  minSemanticScore: 0.15,
  recencyWeight: 0.15,
  recencyHalfLifeMs: 2 * DAY,
};

// ─── Benchmark harness ──────────────────────────────────────────────────────

class BenchSuite {
  constructor(name) {
    this.name = name;
    this.results = [];
    this._startTime = null;
  }

  start() {
    this._startTime = Date.now();
    console.log(`\n${"═".repeat(60)}`);
    console.log(`  BENCH: ${this.name}`);
    console.log(`${"═".repeat(60)}\n`);
  }

  /** Run a single named assertion. Returns { name, pass, error?, ms }. */
  async run(name, fn) {
    const t0 = Date.now();
    try {
      await fn();
      const ms = Date.now() - t0;
      this.results.push({ name, pass: true, ms });
      console.log(`  PASS  ${name} (${ms}ms)`);
    } catch (err) {
      const ms = Date.now() - t0;
      this.results.push({ name, pass: false, error: err.message, ms });
      console.log(`  FAIL  ${name} (${ms}ms)`);
      console.log(`        ${err.message}`);
    }
  }

  /** Print summary and return { suite, passed, failed, total, ms, results }. */
  finish() {
    const totalMs = Date.now() - this._startTime;
    const passed = this.results.filter(r => r.pass).length;
    const failed = this.results.length - passed;
    console.log(`\n  ${passed}/${this.results.length} passed, ${failed} failed (${totalMs}ms)\n`);
    return {
      suite: this.name,
      passed,
      failed,
      total: this.results.length,
      ms: totalMs,
      results: this.results,
    };
  }
}

module.exports = { lib, makeMockEmbedder, BASE_OPTS, DIM, DAY, BenchSuite };
