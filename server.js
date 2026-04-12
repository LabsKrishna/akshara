// server.js — Database X HTTP Server
"use strict";

const path    = require("path");
const express = require("express");
const lib     = require("./index");
const { Codes } = require("./errors");

const app = express();
app.use(express.json({ limit: "10mb" }));

// Allow dashboard to call the API from file://, Live Server, or another host (local dev only).
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ─── Route wrapper — kills 23 catch blocks ──────────────────────────────────
// Maps typed error codes to HTTP status codes. Untyped errors default to 500.

const _CODE_TO_HTTP = {
  [Codes.ENTITY_NOT_FOUND]: 404,
  [Codes.ALREADY_DELETED]:  400,
  [Codes.VALIDATION]:       400,
  [Codes.EMBEDDING_FAILED]: 503,
  [Codes.NOT_INITIALIZED]:  503,
};

function _wrap(fn) {
  return async (req, res) => {
    try {
      const result = await fn(req, res);
      if (!res.headersSent) res.json(result);
    } catch (err) {
      const status = _CODE_TO_HTTP[err?.code] || 500;
      res.status(status).json({
        error:   err?.code || "internal_error",
        detail:  err?.message || String(err),
        recoverable: err?.recoverable ?? false,
        suggestion:  err?.suggestion || null,
      });
    }
  };
}

// ─── Shared body extraction for ingest-like endpoints ────────────────────────

function _ingestParams(body) {
  const { text, type = "text", timestamp, metadata = {}, tags = [], source, classification, retention, memoryType, workspaceId, useLLM } = body || {};
  return { text, type, timestamp, metadata, tags, source, classification, retention, memoryType, workspaceId, useLLM: !!useLLM };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

app.post("/ingest", _wrap(async (req) => {
  const p = _ingestParams(req.body);
  if (!p.text) throw { code: Codes.VALIDATION, message: "text is required" };
  return { success: true, id: await lib.ingest(p.text, p) };
}));

app.post("/remember", _wrap(async (req) => {
  const p = _ingestParams(req.body);
  if (!p.text) throw { code: Codes.VALIDATION, message: "text is required" };
  return { success: true, id: await lib.remember(p.text, p) };
}));

app.post("/ingest/batch", _wrap(async (req) => {
  const { items } = req.body;
  if (!Array.isArray(items) || !items.length) throw { code: Codes.VALIDATION, message: "items must be a non-empty array" };
  const ids = await lib.ingestBatch(items);
  return { success: true, ids, count: ids.length };
}));

app.post("/ingest/timeseries", _wrap(async (req) => {
  const { label, points, metadata = {}, tags = [] } = req.body;
  if (!label) throw { code: Codes.VALIDATION, message: "label is required" };
  if (!Array.isArray(points) || !points.length) throw { code: Codes.VALIDATION, message: "points must be a non-empty array" };
  return { success: true, id: await lib.ingestTimeSeries(label, points, { metadata, tags }) };
}));

app.post("/ingest/file", _wrap(async (req) => {
  const { filePath, tags = [], metadata = {} } = req.body;
  if (!filePath) throw { code: Codes.VALIDATION, message: "filePath is required" };
  return { success: true, id: await lib.ingestFile(filePath, { tags, metadata }) };
}));

app.post("/query", _wrap(async (req) => {
  const { text, limit = 10, filter = {}, asOf = null } = req.body;
  if (!text) throw { code: Codes.VALIDATION, message: "text is required" };
  return await lib.query(text, { limit, filter, asOf });
}));

app.post("/entities/batch", _wrap(async (req) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) throw { code: Codes.VALIDATION, message: "ids must be an array" };
  const results = await lib.getMany(ids);
  return { results, count: results.filter(Boolean).length };
}));

app.get("/entity/:id", _wrap(async (req) => lib.get(req.params.id)));

app.delete("/entity/:id", _wrap(async (req) => {
  const { deletedBy } = req.body || {};
  await lib.remove(req.params.id, { deletedBy });
  return { success: true, id: Number(req.params.id) || req.params.id, softDeleted: true };
}));

app.delete("/entity/:id/purge", _wrap(async (req) => {
  await lib.purge(req.params.id);
  return { success: true, id: Number(req.params.id) || req.params.id, purged: true };
}));

app.get("/history/:id", _wrap(async (req) => lib.getHistory(req.params.id)));

app.get("/entities", _wrap(async (req) => {
  const { page, limit, type, since, until, tags, memoryType, workspaceId } = req.query;
  const parsedTags = tags ? tags.split(",").map(t => t.trim()).filter(Boolean) : undefined;
  return lib.listEntities({ page, limit, type, since, until, tags: parsedTags, memoryType, workspaceId });
}));

app.get("/graph",        _wrap(async () => lib.getGraph()));
app.get("/traverse/:id", _wrap(async (req) => {
  const depth = Math.max(1, Math.min(5, Number(req.query.depth) || 1));
  return lib.traverse(req.params.id, depth);
}));
app.get("/status",       _wrap(async () => lib.getStatus()));

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "dashboard.html")));

// ─── Agent Helper ─────────────────────────────────────────────────────────────

const _agents = new Map();
let _agentSeq = 0;

function _resolveAgent(req, res, next) {
  const agent = _agents.get(req.params.agentId);
  if (!agent) return res.status(404).json({ error: "agent_not_found" });
  req.agent = agent;
  next();
}

app.post("/agent/create", _wrap(async (req) => {
  const { name, defaultClassification, defaultTags, useLLM } = req.body;
  if (!name) throw { code: Codes.VALIDATION, message: "name is required" };
  const agent = lib.createAgent({ name, defaultClassification, defaultTags, useLLM });
  const agentId = String(++_agentSeq);
  _agents.set(agentId, agent);
  return { success: true, agentId, name: agent.name };
}));

app.post("/agent/:agentId/remember", _resolveAgent, _wrap(async (req) => {
  const p = _ingestParams(req.body);
  if (!p.text) throw { code: Codes.VALIDATION, message: "text is required" };
  return { success: true, id: await req.agent.remember(p.text, p) };
}));

app.post("/agent/:agentId/update", _resolveAgent, _wrap(async (req) => {
  const p = _ingestParams(req.body);
  if (!p.text) throw { code: Codes.VALIDATION, message: "text is required" };
  return { success: true, id: await req.agent.update(p.text, p) };
}));

app.post("/agent/:agentId/recall", _resolveAgent, _wrap(async (req) => {
  const { text, limit, filter, asOf } = req.body;
  if (!text) throw { code: Codes.VALIDATION, message: "text is required" };
  return req.agent.recall(text, { limit, filter, asOf });
}));

app.get("/agent/:agentId/history/:entityId", _resolveAgent, _wrap(async (req) => {
  return req.agent.getHistory(req.params.entityId);
}));

app.get("/agent/:agentId/contradictions/:entityId", _resolveAgent, _wrap(async (req) => {
  return req.agent.getContradictions(req.params.entityId);
}));

// ─── Start ────────────────────────────────────────────────────────────────────

lib.init().then(() => {
  const PORT = Number(process.env.DBX_PORT) || 3000;
  const server = app.listen(PORT, () => {
    console.log(`Database X running on http://localhost:${PORT}`);
    console.log(`Dashboard: http://localhost:${PORT}/`);
    console.log("Endpoints:");
    console.log("  POST   /ingest                  { text, type?, metadata?, tags?, timestamp?, source?, classification?, retention?, memoryType?, workspaceId?, useLLM? }");
    console.log("  POST   /remember                { text, type?, metadata?, tags?, timestamp?, source?, classification?, retention?, memoryType?, workspaceId?, useLLM? }");
    console.log("  POST   /ingest/batch            { items: [{text, type?, ...}] }");
    console.log("  POST   /ingest/timeseries       { label, points: [{timestamp,value}], metadata?, tags? }");
    console.log("  POST   /ingest/file             { filePath, tags?, metadata? }");
    console.log("  POST   /query                   { text, limit?, filter?: {type?,since?,until?,tags?,memoryType?,workspaceId?} }");
    console.log("  GET    /entity/:id");
    console.log("  DELETE /entity/:id              { deletedBy? } → soft delete");
    console.log("  DELETE /entity/:id/purge        → permanent hard delete");
    console.log("  GET    /entities?page&limit&type&since&until&tags&memoryType&workspaceId");
    console.log("  GET    /history/:id");
    console.log("  GET    /graph");
    console.log("  GET    /traverse/:id?depth=1");
    console.log("  GET    /status");
  });

  // Graceful shutdown on SIGTERM / SIGINT
  const stop = async (signal) => {
    console.log(`\n[dbx] ${signal} received — shutting down…`);
    server.close(async () => {
      await lib.shutdown();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5_000).unref();
  };

  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT",  () => stop("SIGINT"));
});
