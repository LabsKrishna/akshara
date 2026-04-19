#!/usr/bin/env node
// bin/cli.js — Kalairos CLI
// Usage: kalairos start | kalairos status | kalairos query <text>
"use strict";

const args = process.argv.slice(2);
const cmd  = args[0] || "start";
const PORT = Number(process.env.KALAIROS_PORT) || 3000;

if (cmd === "start") {
  require("../server");

} else if (cmd === "demo") {
  require("../examples/demo");

} else if (cmd === "status") {
  fetch(`http://localhost:${PORT}/status`)
    .then(r => r.json())
    .then(s => console.log(JSON.stringify(s, null, 2)))
    .catch(() => {
      console.error(`[kalairos] Could not reach server on port ${PORT}. Is it running?`);
      process.exit(1);
    });

} else if (cmd === "query") {
  const text = args.slice(1).join(" ").trim();
  if (!text) {
    console.error("Usage: kalairos query <text>");
    process.exit(1);
  }
  fetch(`http://localhost:${PORT}/query`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ text, limit: 5 }),
  })
    .then(r => r.json())
    .then(r => console.log(JSON.stringify(r, null, 2)))
    .catch(() => {
      console.error(`[kalairos] Could not reach server on port ${PORT}. Is it running?`);
      process.exit(1);
    });

} else if (cmd === "migrate") {
  console.error("[kalairos] 'kalairos migrate' requires Kalairos Enterprise (PostgreSQL/pgvector).");
  console.error("  See https://github.com/LabsKrishna/kalairos#enterprise for upgrade information.");
  process.exit(1);

} else {
  console.log("Kalairos CLI");
  console.log("");
  console.log("Usage:");
  console.log("  kalairos start            Start the server (default port 3000)");
  console.log("  kalairos demo             Run interactive demo (no API key needed)");
  console.log("  kalairos status           Print server status as JSON");
  console.log('  kalairos query <text>     Run a semantic query against the server');
  console.log("  kalairos migrate [file]   [Enterprise] Import data.kalairos → PostgreSQL");
  console.log("");
  console.log("Environment:");
  console.log("  KALAIROS_PORT              Server port (default: 3000)");
  console.log("  KALAIROS_RATE_LIMIT        Max requests/minute per IP (default: 120, 0=off)");
  console.log("  KALAIROS_LINK_THRESHOLD    Graph link threshold (default: 0.72)");
  console.log("  KALAIROS_VERSION_THRESHOLD Version detection threshold (default: 0.82)");
  process.exit(cmd === "help" ? 0 : 1);
}
