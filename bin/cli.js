#!/usr/bin/env node
// bin/cli.js — Akshara CLI
// Usage: akshara start | akshara status | akshara query <text>
"use strict";

const args = process.argv.slice(2);
const cmd  = args[0] || "start";
const PORT = Number(process.env.AKSHARA_PORT) || 3000;

if (cmd === "start") {
  require("../server");

} else if (cmd === "demo") {
  require("../examples/demo");

} else if (cmd === "status") {
  fetch(`http://localhost:${PORT}/status`)
    .then(r => r.json())
    .then(s => console.log(JSON.stringify(s, null, 2)))
    .catch(() => {
      console.error(`[akshara] Could not reach server on port ${PORT}. Is it running?`);
      process.exit(1);
    });

} else if (cmd === "query") {
  const text = args.slice(1).join(" ").trim();
  if (!text) {
    console.error("Usage: akshara query <text>");
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
      console.error(`[akshara] Could not reach server on port ${PORT}. Is it running?`);
      process.exit(1);
    });

} else if (cmd === "migrate") {
  console.error("[akshara] 'akshara migrate' requires Akshara Enterprise (PostgreSQL/pgvector).");
  console.error("  See https://github.com/LabsKrishna/akshara#enterprise for upgrade information.");
  process.exit(1);

} else {
  console.log("Akshara CLI");
  console.log("");
  console.log("Usage:");
  console.log("  akshara start            Start the server (default port 3000)");
  console.log("  akshara demo             Run interactive demo (no API key needed)");
  console.log("  akshara status           Print server status as JSON");
  console.log('  akshara query <text>     Run a semantic query against the server');
  console.log("  akshara migrate [file]   [Enterprise] Import data.akshara → PostgreSQL");
  console.log("");
  console.log("Environment:");
  console.log("  AKSHARA_PORT              Server port (default: 3000)");
  console.log("  AKSHARA_RATE_LIMIT        Max requests/minute per IP (default: 120, 0=off)");
  console.log("  AKSHARA_LINK_THRESHOLD    Graph link threshold (default: 0.72)");
  console.log("  AKSHARA_VERSION_THRESHOLD Version detection threshold (default: 0.82)");
  process.exit(cmd === "help" ? 0 : 1);
}
