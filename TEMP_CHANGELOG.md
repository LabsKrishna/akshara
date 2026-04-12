# Temporary Change Log

This file is the shared record for humans and agents.

Rule: every meaningful code, API, behavior, doc, or file change must be appended here with the date, files touched, and whether something was added, updated, or deleted.

## 2026-04-09 time 10:00pm

- Added `dbx.remember(text, opts)` in `index.js` as the recommended agent-facing write helper. It defaults `source` to `{ type: "agent" }` and `classification` to `internal`.
- Updated persistence and read models in `index.js` to store and return `classification` on entities and versions.
- Updated `server.js` to accept `classification` on `/ingest` and added `POST /remember`.
- Updated `remote.js` to expose `remember()` for remote clients.
- Updated `README.md` to document `remember()` as the recommended agent-facing API and to document the `/remember` endpoint.
- Updated `CLAUDE.md` with the rule that meaningful changes must be recorded in this file.
- Updated `test-basic.js` with coverage for `remember()` defaults and explicit overrides.
- Deleted no files in this change.
- Updated `index.js` to remove the hidden embedder fallback, neutralize the missing-embedder error, forward `source` and `classification` through `ingestBatch()`, and strengthen classification backfill during load.
- Updated `README.md` and `bin/cli.js` to remove stale embedding config references.
- Updated `query()` in `index.js` to return provenance, classification, and version delta metadata so recalled memories carry trust signals.
- Updated `test-basic.js` with a regression test for query-time provenance/classification.
- Rewrote `test-agent-simulation.js` into a hardcoded single-entity agent loop that validates stable IDs, contradiction visibility, current recall, and historical `asOf` recall.

## 2026-04-09 time 10:05pm

## added by Biraj

-created test-agent-simulation.js to see can real agents actually use this?
How would an agent interact in a realistic loop?
Is it truly helping with the constitution goals (time-aware recall, provenance, classification, durable memory, contradiction visibility, agent task completion)?

## 2026-04-09 — Agent Helper (createAgent)

- Added `agent.js` — lightweight `AgentMemory` class that wraps the core engine with agent-specific defaults (provenance via `source.actor`, default classification, default tags). Methods: `remember()`, `update()`, `recall()`, `getHistory()`, `getContradictions()`.
- Added `createAgent(opts)` to `index.js` exports. Creates an `AgentMemory` bound to the initialized engine.
- Updated `_normalizeSource()` in `index.js` to preserve the `actor` field on source objects, enabling agent identity tracking in provenance.
- Updated `server.js` with agent endpoints: `POST /agent/create`, `POST /agent/:agentId/remember`, `POST /agent/:agentId/update`, `POST /agent/:agentId/recall`, `GET /agent/:agentId/history/:entityId`, `GET /agent/:agentId/contradictions/:entityId`.
- Updated `remote.js` with `createAgent(opts)` that returns a remote agent proxy backed by the server's `/agent/*` endpoints.
- Extended `test-agent-simulation.js` with Part 2 that exercises the full `createAgent` workflow: remember, update, recall, time-travel, provenance trail, default tags, and contradiction inspection.
- Updated existing test assertions to account for the now-preserved `actor` field in source objects.
- Deleted no files in this change.

## 2026-04-09 — getContradictions safe fallback

- Updated `agent.js`: added null-safe guard in `getContradictions()` so a falsy `history` return doesn't throw.

## 2026-04-09 — Pass 1A: Core compliance + provenance hardening

### Added

- **`retention` field** as first-class top-level entity field (`{ policy: "keep", expiresAt: null }` default). Accepted on `ingest()`, `remember()`, and HTTP `/ingest`, `/remember` endpoints. Returned in `get()`, `getMany()`, `query()`, `listEntities()`, `getHistory()`. Backfilled on load for older data files.
- **Soft delete** via `deletedAt` + `deletedBy` fields on entities. `remove(id, { deletedBy })` now performs a soft delete (sets timestamps, clears graph links, keeps entity in store for auditability). Soft-deleted entities are excluded from `query()`, `listEntities()`, `getGraph()`, `traverse()`, `getStatus()` counts, and ingest update-matching. They remain accessible via `get()` and `getHistory()` with visible `deletedAt`/`deletedBy` fields.
- **`purge(id)`** for permanent hard deletion (GDPR right-to-erasure). Irrecoverably removes entity from store.
- **`_normalizeRetention()`** helper for canonicalizing retention policy objects.
- **`_isAlive()`** helper for filtering soft-deleted entities.
- **`DELETE /entity/:id/purge`** server endpoint for hard delete.
- **`deletedEntities`** count added to `getStatus()` response.

### Updated

- `index.js`: `ingest()` accepts `retention` option; entity creation includes `retention`, `deletedAt`, `deletedBy`; update path preserves/merges retention; `_loadData()` backfills new fields.
- `index.js`: `remove()` converted from hard delete to soft delete with `deletedBy` support.
- `index.js`: `query()`, `listEntities()`, `getGraph()`, `traverse()`, `getStatus()`, and ingest update-matching all filter out soft-deleted entities.
- `index.js`: `get()`, `getMany()`, `getHistory()`, `query()`, `listEntities()` now return `retention` (and `deletedAt`/`deletedBy` where applicable).
- `index.js`: exports updated to include `purge`.
- `server.js`: `DELETE /entity/:id` now accepts `{ deletedBy }` body and returns `{ softDeleted: true }`.
- `server.js`: `/ingest` and `/remember` endpoints accept `retention` field.
- `server.js`: startup console logs updated for new endpoints.
- `test-basic.js`: remove test updated for soft-delete behavior; added tests for double-delete rejection and `purge()`.

### Files touched

- `index.js` (core engine)
- `server.js` (HTTP API)
- `test-basic.js` (tests)

## 2026-04-10 — Schema v2: Honest data model (memoryType, workspaceId, per-version linkIds)

### Added

- **`memoryType`** field on entities — `"short-term"` | `"long-term"` | `"working"` (default `"long-term"`). Enables Phase 2 short-term vs long-term memory separation.
- **`workspaceId`** field on entities — string tenant/workspace identifier (default `"default"`). Foundation for tenant-aware data isolation (Phase 3 enterprise readiness).
- **`_normalizeMemoryType()`** and **`_normalizeWorkspaceId()`** canonicalization helpers.
- **Per-version `linkIds` snapshot** — each version now records the entity's graph edges at the time it was created, making `asOf` time-travel queries use the historical graph state instead of current links.
- `_applyFilter()` supports `memoryType` and `workspaceId` filtering.
- `listEntities()` accepts `memoryType` and `workspaceId` filter params.
- `query()` filter accepts `memoryType` and `workspaceId`.
- `getStatus()` returns `byMemoryType` and `byWorkspace` breakdowns.

### Updated

- `index.js`: `_loadData()` migration backfills `memoryType`, `workspaceId`, and per-version `linkIds` for all existing data — fully backward compatible.
- `index.js`: `ingest()` accepts and stores `memoryType` and `workspaceId`; snapshots `linkIds` on every version.
- `index.js`: `ingestBatch()` passes through `memoryType` and `workspaceId`.
- `index.js`: `get()`, `getMany()`, `getHistory()`, `query()`, `listEntities()` return `memoryType` and `workspaceId`.
- `index.js`: `getHistory()` versions include `linkIds` array.
- `index.js`: `asOf` time-travel in `query()` uses per-version `linkIds` snapshot when available, falling back to current links for pre-migration data.
- `server.js`: `/ingest`, `/remember`, `/entities`, agent remember/update endpoints accept and pass `memoryType` and `workspaceId`.
- `server.js`: startup log updated with new fields.

### Design notes

- Additive only — no breaking changes, no field removals. All new fields have safe defaults.
- Old `data.dbx` files load and migrate transparently via `_loadData()`.
- `memoryType` is enum-restricted to prevent drift; `workspaceId` is free-form string for flexibility.

### Files touched

- `index.js` (core engine)
- `server.js` (HTTP API)

## 2026-04-10 — Optional LLM metadata enrichment (useLLM flag)

### Added

- **`useLLM` flag** on `ingest()` and `remember()` — when `true` and a `llmFn` is configured via `init()`, the LLM extracts structured metadata before storage. Off by default for speed and privacy.
- **`llmFn` config option** — injectable via `init({ llmFn })`. Expected signature: `async (text, type) => { keywords, context, llmTags, importance?, suggestedType? }`. Non-blocking: failures log a warning and skip enrichment.
- **`_enrichWithLLM()` internal helper** — sanitizes and caps LLM output (max 30 keywords, 500-char context, 20 tags, importance clamped 0-1).
- **LLM enrichment stored in `metadata.llm`** — structured sub-object containing `keywords`, `context`, `llmTags`, `importance` (0-1, default 0.5), and `suggestedType`. Keeps LLM-derived data clearly separated from user metadata.
- **`llmKeywords` top-level field** on entities — denormalized keyword array for fast kernel scoring without metadata traversal.
- **LLM keyword boost in kernel** — new `llmBoostWeight` parameter (default 0.08, env `DBX_LLM_BOOST`). Matches query terms against LLM-extracted keywords. Zero cost for entities without LLM enrichment. Added to scoring formula: `score = semantic + graphBoost + kwBoost + llmBoost + recencyBoost`.
- **`llmBoost` field in query results** — each scored result now reports its LLM keyword boost component.
- **LLM tags merged into entity tags** — `llmTags` from enrichment are deduplicated and merged into the entity's `tags` array, making them filterable via existing tag queries.
- **`useLLM` on `AgentMemory`** — agents can set `useLLM: true` at construction (applies to all writes) or per-call. Per-call `useLLM` overrides the agent default.

### Updated

- `index.js`: `DEFAULTS` adds `llmBoostWeight` (0.08). `ingest()` accepts `useLLM`, calls `_enrichWithLLM()` when enabled, stores results in `metadata.llm` and `llmKeywords`. `_loadData()` backfills `llmKeywords` from existing `metadata.llm.keywords`. `_runWorkers()` passes `llmKeywords` in worker chunks and `llmBoostWeight` in job config. `ingestBatch()` passes through `useLLM`.
- `kernel.js`: `makeHybridKernel()` accepts `llmBoostWeight`, computes LLM keyword boost from `entity.llmKeywords`, includes `llmBoost` in returned score objects.
- `agent.js`: `AgentMemory` constructor accepts `useLLM` (default `false`). `_mergeOpts()` propagates `useLLM` with per-call override support.
- `server.js`: `/ingest`, `/remember`, `/agent/create`, `/agent/:agentId/remember`, `/agent/:agentId/update` endpoints accept `useLLM` field. Startup log updated.
- `remote.js`: No code changes needed — `useLLM` passes through via existing opts spread.

### Design notes

- **Off by default** — `useLLM` defaults to `false` everywhere. No LLM calls happen unless explicitly opted in, preserving speed and privacy.
- **Non-blocking** — LLM enrichment failures are caught and logged; ingest always succeeds.
- **Additive only** — no breaking changes. Old data files load transparently with empty `llmKeywords`.
- **Kernel boost is proportional** — `llmBoostWeight` (0.08) is deliberately lower than semantic similarity but meaningful enough to break ties between similar entities.

### Files touched

- `index.js` (core engine)
- `kernel.js` (scoring primitives)
- `agent.js` (agent helper)
- `server.js` (HTTP API)

## 2026-04-10 — CI pipeline, Dockerfile, .dockerignore

### Added
- **`.github/workflows/ci.yml`** — GitHub Actions CI pipeline. Runs `npm test` and `npm run bench` on push/PR to `main`. Tests against Node 18, 20, and 22.
- **`Dockerfile`** — Alpine-based container image for the Database X server. Zero build step, just `node server.js`. Exposes port 3000.
- **`.dockerignore`** — Excludes `node_modules`, `data.dbx`, `.git`, `.github`, `bench`, and test files from the image.

### Files touched
- `.github/workflows/ci.yml` (new)
- `Dockerfile` (new)
- `.dockerignore` (new)

## 2026-04-10 — Error → Signal → Learning Loop + Core Refactor

### Added
- **`errors.js`** — Typed error system with signal bus for the Error → Signal → Learning Loop:
  - `DatabaseXError` class with `code`, `recoverable`, `suggestion`, `context` fields
  - Error codes: `ERR_NOT_INITIALIZED`, `ERR_ENTITY_NOT_FOUND`, `ERR_ALREADY_DELETED`, `ERR_EMBEDDING_FAILED`, `ERR_PERSIST_FAILED`, `ERR_LOAD_FAILED`, `ERR_VALIDATION`, `ERR_WORKER_FAILED`
  - Signal bus (`onSignal`, `getSignals`, `resetSignals`) — agents subscribe to error signals and adapt
  - Convenience constructors (`Err.notFound(id)`, `Err.persistFailed(detail)`, etc.)
  - Ring buffer of recent signals (max 200) for post-mortem analysis
- **`onSignal(code, fn)`** and **`getSignals(code?)`** exported from `index.js` — agents can subscribe to structured error signals
- **Persistence error handling** — `_persistAll()` now catches disk errors, cleans up temp files, and emits `ERR_PERSIST_FAILED` signals
- **Data load error signals** — malformed lines in `data.dbx` emit `ERR_LOAD_FAILED` signals (not just console.warn)

### Refactored (Store less. Retrieve precisely.)
- **`_serializeEntity(e, opts?)`** — Single source of truth for entity → DTO conversion. Replaced 5 copy-paste blocks across `get()`, `getMany()`, `listEntities()`, `getHistory()`, and query result mapping (~75 lines eliminated).
- **`_unlinkEntity(entity, entityId)`** — Extracted shared graph unlink logic from `remove()` and `purge()`.
- **`_getAllAlive()`** — Shared helper for enumerating non-deleted entities.
- **Removed redundant read-time normalization** — Entity fields are normalized at write-time only. Read paths no longer re-normalize.
- **All error throws now emit signals** — `_assertInit()`, `get()`, `getMany()`, `remove()`, `purge()`, `traverse()`, `ingestBatch()`, and `_embed()` emit typed `DatabaseXError` objects through the signal bus.

### Refactored server.js
- **`_wrap(fn)`** — Route wrapper replaces 23 identical try/catch blocks. Maps typed error codes to HTTP status codes.
- **`_ingestParams(body)`** — Shared body extraction for all ingest-like endpoints.
- **Error responses now include `recoverable` and `suggestion`** fields for client-side adaptive retry.
- Net reduction: ~120 lines from server.js.

### Added: Benchmark Suite (`bench/agent-memory/`)
- **`helpers.js`** — Shared deterministic infrastructure (mock embedder, BenchSuite harness)
- **`bench-budget-drift.js`** (8 tests) — 7-day budget evolution
- **`bench-contradictions.js`** (10 tests) — Multi-scenario contradiction detection
- **`bench-cross-session.js`** (8 tests) — Multi-agent cross-session recall
- **`bench-metadata-evolution.js`** (12 tests) — Lifecycle + Error→Signal loop
- **`run-all.js`** — Runner with Constitution Goal Scorecard (38 tests → 10 goals)

### Scorecard: 38/38 tests, 10/10 constitution goals (100%)

### Files touched
- `errors.js` (new), `index.js`, `server.js`, `package.json`
- `bench/agent-memory/` (6 new files)
