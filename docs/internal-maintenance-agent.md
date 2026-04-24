# Internal Maintenance Agent — design note

**Status:** not started. Design capture only, not a current deliverable.
**Owner:** Biraj
**Created:** 2026-04-24

## Motivation

The word "agent" currently leaks out of the public API via `createAgent()`. That conflates two very different things:

1. **The user's agent.** A LangGraph / Claude Agent SDK / custom loop that the user builds. Kalairos is a *memory layer* underneath it. The user's agent is not our concern.
2. **An internal autonomous subsystem.** A programmatic, rule-driven background loop that maintains memory quality over time — the "intelligent agent" originally envisioned. It is not exposed to users.

This document is about the second one. Stage 1 chose to keep the public surface flat (`init` / `remember` / `query`) and to hide any agent-shaped helper behind `scope()`. This frees the word "agent" to mean the internal subsystem when it's built.

## What it would do

Invisible to callers. Runs in-process (and, in enterprise, as a sidecar worker) and performs maintenance that today is either manual or happens inline with writes:

- **Trust score updates.** Recompute composite trust as new evidence accumulates, corroboration counts shift, contradictions are detected, or sources decay in authority.
- **Version / `asOf` hygiene.** Compact or rebuild version indexes; verify valid-interval coverage; detect gaps.
- **Deduplication / consolidation.** Run `consolidate()` on a schedule or threshold trigger rather than on-demand. Deterministic merge rules first; optional LLM-assisted mode gated behind a budget.
- **Intelligent query rewriting / routing.** Pre-plan retrieval for common query shapes; expand queries with synonym / provenance hints drawn from the store; route cheap queries to the fast path and expensive ones to the full hybrid kernel.
- **Drift and poisoning monitors.** Surface entities whose semantic drift exceeds a threshold, or whose ingest pattern matches known poisoning shapes, and raise signals via `onSignal`.

Each of these corresponds to code that already exists somewhere in the engine. The subsystem is about **orchestration and cadence**, not new algorithms.

## What it is not

- Not user-visible. `kalairos.init()` starts it; no new public methods.
- Not an LLM-first system. LLM calls in the hot path violate CLAUDE.md §11.6. Any LLM use must be off by default and budget-gated.
- Not a replacement for the deterministic primitives (`consolidate`, `annotate`, `getContradictions`) — it calls them.
- Not a scheduler the user configures directly. Tuning knobs are engine config, not per-call options.

## Why Stage 1+ is the wrong time to build it

Per CLAUDE.md §5 Stage-1 Definition of Done, the Persona A bar is "working memory in ≤ 10 lines, reliable JSONL store, published poisoning benchmark, stable 1.x API, ≥500 stars or ≥1000 weekly downloads." None of that needs the internal agent. Building it now would:

- Add a background subsystem that's hard to test and harder to explain.
- Introduce latency and correctness risk to the hot path before we have the benchmark infrastructure to catch regressions.
- Compete for attention with the Stage 1 priorities (poisoning demo, markdown export/import, 5-minute getting-started, 1.x API freeze).

Revisit when we hit **Stage 2** (enterprise copilot) or **Stage 3** (vertical AI). Both stages imply longer-lived stores with compounding maintenance debt — the subsystem has a natural home there.

## Open questions (for whoever picks this up)

1. In-process or sidecar? An enterprise deployment almost certainly wants a separate worker against Postgres. The free edition probably wants in-process with opt-out.
2. Triggering model: periodic (cron-like) vs event-driven (write counts, drift thresholds) vs both?
3. How are decisions auditable? Every automatic action needs a signal + audit record — silent maintenance is a trust killer.
4. Which subsystems get the first pass? Best candidates: trust recomputation (cheap, high value), consolidation (already exists, just needs cadence).

## Amendment history

- 2026-04-24 — Created. Captured as follow-up to the `createAgent()` → `scope()` API cleanup.
