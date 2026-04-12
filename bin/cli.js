#!/usr/bin/env node
// bin/cli.js — Database X CLI
// Usage: dbx start | dbx status | dbx query <text>
"use strict";

const args = process.argv.slice(2);
const cmd  = args[0] || "start";
const PORT = Number(process.env.DBX_PORT) || 3000;

if (cmd === "start") {
  require("../server");

} else if (cmd === "status") {
  fetch(`http://localhost:${PORT}/status`)
    .then(r => r.json())
    .then(s => console.log(JSON.stringify(s, null, 2)))
    .catch(() => {
      console.error(`[dbx] Could not reach server on port ${PORT}. Is it running?`);
      process.exit(1);
    });

} else if (cmd === "query") {
  const text = args.slice(1).join(" ").trim();
  if (!text) {
    console.error("Usage: dbx query <text>");
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
      console.error(`[dbx] Could not reach server on port ${PORT}. Is it running?`);
      process.exit(1);
    });

} else {
  console.log("Database X CLI");
  console.log("");
  console.log("Usage:");
  console.log("  dbx start            Start the server (default port 3000)");
  console.log("  dbx status           Print server status as JSON");
  console.log('  dbx query <text>     Run a semantic query against the server');
  console.log("");
  console.log("Environment:");
  console.log("  DBX_PORT             Server port (default: 3000)");
  console.log("  DBX_LINK_THRESHOLD   Graph link threshold (default: 0.72)");
  console.log("  DBX_VERSION_THRESHOLD Version detection threshold (default: 0.82)");
  process.exit(cmd === "help" ? 0 : 1);
}
