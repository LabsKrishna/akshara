// bench/longmemeval/run.js — LongMemEval runner (subset or full dataset)
//
// Consumes the LongMemEval JSON format:
//   { question_id, question_type, question, answer, haystack_sessions: [[...]], ... }
//
// For each question:
//   1. Ingest every utterance of every session into a fresh in-memory Kalairos.
//   2. Run query(question) — inspect the top-K concatenated context.
//   3. Score by case-insensitive substring match of the ground-truth answer.
//
// Substring scoring is intentionally permissive (this is a *retrieval* test,
// not an answer-generation test). For judge-style scoring, export the retrieved
// context and pipe it into the reference LongMemEval grader separately.
//
// Usage:
//   node bench/longmemeval/run.js                         # uses sample.json (6 Q's)
//   node bench/longmemeval/run.js path/to/longmemeval.json   # any LongMemEval-format file
//
// Output: prints a table + writes bench/longmemeval/results.json
"use strict";

const fs = require("fs");
const path = require("path");
const kalairos = require("../..");

const DIM = 64;

function makeEmbedder(dim = DIM) {
  const vocab = new Map();
  return async (text) => {
    const words = String(text).toLowerCase().match(/[a-z0-9]+/g) || [];
    const vec = new Array(dim).fill(0);
    for (const w of words) {
      if (!vocab.has(w)) vocab.set(w, vocab.size);
      vec[vocab.get(w) % dim]++;
    }
    const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map(v => v / mag);
  };
}

// Case-insensitive substring match — permissive retrieval scoring.
function matches(retrievedText, answer) {
  if (!retrievedText || !answer) return false;
  return retrievedText.toLowerCase().includes(String(answer).toLowerCase());
}

async function runQuestion(q) {
  await kalairos.init({
    embedFn: makeEmbedder(),
    embeddingDim: DIM,
    dataFile: ":memory:",
    minFinalScore: 0.0,
    minSemanticScore: 0.0,
  });

  // Ingest every utterance individually. Real agent pipelines ingest at
  // turn- or fact-level; we approximate with per-utterance facts so the
  // retrieval signal is per-turn.
  let ingested = 0;
  for (let sIdx = 0; sIdx < q.haystack_sessions.length; sIdx++) {
    const session = q.haystack_sessions[sIdx];
    for (const turn of session) {
      const text = `[session ${sIdx}] [${turn.role}] ${turn.content}`;
      await kalairos.ingest(text, {
        source: { type: turn.role === "user" ? "user" : "agent" },
        tags: [`session-${sIdx}`, turn.role],
      });
      ingested++;
    }
  }

  const { results } = await kalairos.query(q.question, { limit: 5 });
  const concatText = results.map(r => r.text).join(" \n ");

  // Scoring
  const top1Hit  = results[0] ? matches(results[0].text, q.answer) : false;
  const top5Hit  = matches(concatText, q.answer);
  // Did any result come from a "correct" session (where the answer actually
  // lives)? This measures routing, not just lexical recall.
  const correctSessions = new Set((q.answer_session_ids || []).map(i => `session-${i}`));
  let correctSessionHit = false;
  if (correctSessions.size > 0) {
    for (const r of results) {
      // Session tag is embedded in text as "[session N]"
      const m = /\[session (\d+)\]/.exec(r.text || "");
      if (m && correctSessions.has(`session-${m[1]}`)) { correctSessionHit = true; break; }
    }
  }

  await kalairos.shutdown();

  return {
    question_id:       q.question_id,
    question_type:     q.question_type,
    question:          q.question,
    answer:            q.answer,
    ingestedUtterances: ingested,
    top1Hit,
    top5Hit,
    correctSessionHit,
    topText:           results[0]?.text || null,
  };
}

function aggregate(rows) {
  const byType = new Map();
  for (const r of rows) {
    if (!byType.has(r.question_type)) byType.set(r.question_type, []);
    byType.get(r.question_type).push(r);
  }
  const types = [];
  for (const [type, rs] of byType) {
    types.push({
      question_type: type,
      n:       rs.length,
      top1:    rs.filter(x => x.top1Hit).length / rs.length,
      top5:    rs.filter(x => x.top5Hit).length / rs.length,
      routing: rs.filter(x => x.correctSessionHit).length / rs.length,
    });
  }
  const overall = {
    n:       rows.length,
    top1:    rows.filter(x => x.top1Hit).length / rows.length,
    top5:    rows.filter(x => x.top5Hit).length / rows.length,
    routing: rows.filter(x => x.correctSessionHit).length / rows.length,
  };
  return { overall, types };
}

(async () => {
  const inputPath = process.argv[2] || path.join(__dirname, "sample.json");
  if (!fs.existsSync(inputPath)) {
    console.error(`[longmemeval] Dataset not found at ${inputPath}`);
    console.error(`             Download the full dataset from https://github.com/xiaowu0162/LongMemEval`);
    console.error(`             or leave this empty to use the bundled 6-question sample.`);
    process.exit(1);
  }
  const questions = JSON.parse(fs.readFileSync(inputPath, "utf8"));

  console.log("");
  console.log("═".repeat(76));
  console.log("  KALAIROS — LongMemEval runner");
  console.log("═".repeat(76));
  console.log(`  dataset:  ${inputPath}`);
  console.log(`  N:        ${questions.length}`);
  console.log(`  embedder: deterministic bag-of-words (dim=64)`);
  console.log(`  scoring:  case-insensitive substring match in top-K`);
  console.log("");

  const rows = [];
  for (const q of questions) {
    const r = await runQuestion(q);
    rows.push(r);
    const mark = r.top5Hit ? "✓" : "✗";
    console.log(
      `  ${mark}  ${r.question_id.padEnd(22)}  ${r.question_type.padEnd(28)}  ` +
      `top1=${r.top1Hit ? "y" : "n"} top5=${r.top5Hit ? "y" : "n"} route=${r.correctSessionHit ? "y" : "n"}`
    );
    if (!r.top5Hit) console.log(`       answer="${r.answer}" top="${(r.topText || "").slice(0, 80)}"`);
  }

  const summary = aggregate(rows);
  console.log("");
  console.log("  per type:");
  for (const t of summary.types) {
    console.log(
      `    ${t.question_type.padEnd(28)}  n=${t.n}  ` +
      `top1=${(t.top1 * 100).toFixed(0)}%  top5=${(t.top5 * 100).toFixed(0)}%  ` +
      `route=${(t.routing * 100).toFixed(0)}%`
    );
  }
  console.log("");
  console.log(
    `  OVERALL  n=${summary.overall.n}  ` +
    `top1=${(summary.overall.top1 * 100).toFixed(0)}%  ` +
    `top5=${(summary.overall.top5 * 100).toFixed(0)}%  ` +
    `route=${(summary.overall.routing * 100).toFixed(0)}%`
  );
  console.log("");

  const outPath = path.join(__dirname, "results.json");
  fs.writeFileSync(outPath, JSON.stringify({
    runAt: new Date().toISOString(),
    dataset: inputPath,
    node: process.version,
    embedder: "deterministic bag-of-words, dim=64",
    summary,
    rows,
  }, null, 2));
  console.log(`  Wrote ${outPath}`);
  console.log("");
})().catch(err => {
  console.error(err);
  process.exit(1);
});
