#!/usr/bin/env node
// examples/demo.js — Interactive Smriti demo
// Runs a full agent memory scenario with a built-in embedder. No API key needed.
"use strict";

const path = require("path");
const dbx  = require(path.resolve(__dirname, "..", "index"));

// ── ANSI helpers (zero dependencies) ────────────────────────────────────────

const bold   = (s) => `\x1b[1m${s}\x1b[0m`;
const dim    = (s) => `\x1b[2m${s}\x1b[0m`;
const green  = (s) => `\x1b[32m${s}\x1b[0m`;
const cyan   = (s) => `\x1b[36m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;

function section(n, title) {
  console.log("");
  console.log(bold(`  ━━━ ${n}. ${title} ${"━".repeat(Math.max(1, 48 - title.length))}`));
  console.log("");
}

function code(s)   { console.log(`    ${cyan(s)}`); }
function result(s) { console.log(`    ${green("→")} ${s}`); }
function note(s)   { console.log(`    ${dim(s)}`); }

// ── Demo embedder — bag-of-words with multi-hash, no API key needed ─────────

const EMBED_DIM = 256;

function demoEmbed(text) {
  const vec   = new Float64Array(EMBED_DIM);
  const words = String(text).toLowerCase().replace(/[^a-z0-9$.\s]/g, " ").split(/\s+/).filter(Boolean);
  for (const w of words) {
    for (let seed = 0; seed < 3; seed++) {
      let h = seed * 2654435769;
      for (let i = 0; i < w.length; i++) h = ((h << 5) - h + w.charCodeAt(i)) | 0;
      vec[(h >>> 0) % EMBED_DIM] += 1;
    }
  }
  let norm = 0;
  for (let i = 0; i < EMBED_DIM; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < EMBED_DIM; i++) vec[i] /= norm;
  return Array.from(vec);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ── Suppress engine console.log during demo for clean output ────────────────

const _origLog     = console.log;
const _origTime    = console.time;
const _origTimeEnd = console.timeEnd;
let _muteEngine = false;
console.log = function (...args) {
  if (_muteEngine && typeof args[0] === "string" && args[0].startsWith("[smriti]")) return;
  _origLog.apply(console, args);
};
console.time    = function (...args) { if (!_muteEngine) _origTime.apply(console, args); };
console.timeEnd = function (...args) { if (!_muteEngine) _origTimeEnd.apply(console, args); };

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  _origLog("");
  _origLog(bold("  ╔══════════════════════════════════════════════════╗"));
  _origLog(bold("  ║          Smriti — Live Demo                       ║"));
  _origLog(bold("  ║          No API key. No config. In-memory.       ║"));
  _origLog(bold("  ╚══════════════════════════════════════════════════╝"));
  _origLog("");

  _muteEngine = true;

  // Lower thresholds for the bag-of-words demo embedder (production would use
  // real embeddings with the defaults). These values make version detection,
  // time-travel queries, and contradiction detection work reliably with the
  // simple hash-based embedder above.
  await dbx.init({
    embedFn:                async (text) => demoEmbed(text),
    embeddingDim:           EMBED_DIM,
    dataFile:               ":memory:",
    strictEmbeddings:       true,
    versionThreshold:       0.55,
    consolidationThreshold: 0.40,
    linkThreshold:          0.35,
    minFinalScore:          0.10,
    minSemanticScore:       0.08,
  });

  const agent = dbx.createAgent({ name: "analyst" });
  result("Agent " + bold("analyst") + " ready (in-memory, nothing written to disk)");

  // ── 1. Store and automatic versioning ──────────────────────────────────────

  section(1, "Store facts — updates are automatic");

  code('agent.remember("Revenue target is $10M for Q3")');
  const id1 = await agent.remember("Revenue target is $10M for Q3");
  result(`Stored as entity ${bold(String(id1))}`);

  const t_before_update = Date.now();
  await sleep(60);

  code('agent.remember("Revenue target revised to $12M for Q3")');
  await agent.remember("Revenue target revised to $12M for Q3");
  result(`Updated entity ${bold(String(id1))} ${dim("→ version 2")}`);
  note("Same entity detected automatically — no ID required.");

  // ── 2. Time-travel ─────────────────────────────────────────────────────────

  section(2, "Time-travel — what was true before?");

  code('agent.recall("revenue target")');
  const current = await agent.recall("revenue target");
  if (current.results && current.results.length > 0) {
    result(`"${current.results[0].text}" ${dim("(current)")}`);
  } else {
    note("(no results — query similarity below threshold with demo embedder)");
  }

  code('agent.recall("revenue target", { asOf: <before update> })');
  const past = await agent.recall("revenue target", { asOf: t_before_update });
  if (past.results && past.results.length > 0) {
    result(`"${past.results[0].text}" ${dim("(what was true then)")}`);
  } else {
    note("(time-travel query — result depends on embedder similarity)");
  }

  // ── 3. Version history with deltas ─────────────────────────────────────────

  section(3, "Version history with change deltas");

  code(`agent.getHistory(${id1})`);
  const history = await agent.getHistory(id1);
  if (history && history.versions) {
    for (const v of history.versions) {
      const delta = v.delta ? dim(` — ${v.delta.summary}`) : "";
      const flag  = v.delta && v.delta.contradicts ? yellow(" [CONTRADICTION]") : "";
      result(`v${v.version}: "${v.text}"${delta}${flag}`);
    }
  }

  // ── 4. Contradiction detection ─────────────────────────────────────────────

  section(4, "Contradiction detection");

  code('agent.remember("The API rate limit is 1000 requests per minute")');
  const id2 = await agent.remember("The API rate limit is 1000 requests per minute");
  result(`Stored as entity ${bold(String(id2))}`);

  await sleep(30);

  code('agent.remember("The API rate limit is 500 requests per minute")');
  await agent.remember("The API rate limit is 500 requests per minute");
  result(`Updated entity ${bold(String(id2))} ${dim("→ version 2")}`);

  code(`agent.getContradictions(${id2})`);
  const { contradictions } = await agent.getContradictions(id2);
  if (contradictions.length > 0) {
    result(`${yellow(contradictions.length + " contradiction(s)")} found across versions`);
    for (const c of contradictions) {
      note(`v${c.version}: ${c.delta.summary}`);
    }
  } else {
    result("No contradictions flagged (delta type depends on embedder precision)");
  }

  // ── 5. Provenance ──────────────────────────────────────────────────────────

  section(5, "Provenance — who stored what");

  const entity = await dbx.get(id1);
  result(`source:         ${cyan(JSON.stringify(entity.source))}`);
  result(`classification: ${cyan('"' + entity.classification + '"')}`);
  result(`versions:       ${cyan(String(entity.versionCount))}`);
  result(`memoryType:     ${cyan('"' + entity.memoryType + '"')}`);

  // ── Summary ────────────────────────────────────────────────────────────────

  const status = await dbx.getStatus();

  _origLog("");
  _origLog(bold("  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  _origLog("");
  result(`Demo complete. ${bold(String(status.entities))} entities, ${bold(String(status.totalVersions))} versions, ${bold("0")} cloud calls.`);
  _origLog("");
  _origLog(`    ${bold("Get started:")}`);
  _origLog(`      npm install smriti-db`);
  _origLog(`      https://github.com/LabsKrishna/smriti-db`);
  _origLog("");

  await dbx.shutdown();
  _muteEngine = false;
}

main().catch((err) => {
  console.error("\n  Demo failed:", err.message || err);
  process.exit(1);
});
