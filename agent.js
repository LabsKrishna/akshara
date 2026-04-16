// agent.js — Lightweight agent helper for Smriti
// A thin, opinionated wrapper that gives agents a clean, high-level interface
// for durable memory. Completely optional — the raw API works just as well.
"use strict";

/**
 * Create an AgentMemory instance backed by a Smriti engine.
 *
 * @param {object} engine — the core lib (index.js exports) or a remote client
 * @param {{ name: string, defaultClassification?: string, defaultTags?: string[] }} opts
 * @returns {AgentMemory}
 *
 * @example
 * const smriti = require("smriti-db");
 * await smriti.init({ ... });
 * const agent = smriti.createAgent({ name: "budget-planner" });
 * await agent.remember("Q2 budget is 2.4M");
 * await agent.update("Q2 budget is now 2.7M");
 * const results = await agent.recall("Q2 budget");
 */
class AgentMemory {
  /**
   * @param {object} engine — object with remember/query/getHistory methods
   * @param {object} opts
   * @param {string} opts.name — agent identity (stored in provenance)
   * @param {string} [opts.defaultClassification="internal"]
   * @param {string[]} [opts.defaultTags=[]]
   * @param {boolean} [opts.useLLM=false] — enable LLM enrichment by default for this agent
   */
  constructor(engine, { name, defaultClassification = "internal", defaultTags = [], useLLM = false }) {
    if (!name) throw new Error("agent name is required");
    if (!engine) throw new Error("engine is required");
    this._engine = engine;
    this.name = name;
    this.defaultClassification = defaultClassification;
    this.defaultTags = Array.isArray(defaultTags) ? [...defaultTags] : [];
    this.useLLM = !!useLLM;
  }

  /**
   * Build the source object for this agent.
   * @returns {{ type: "agent", actor: string }}
   */
  _source() {
    return { type: "agent", actor: this.name };
  }

  /**
   * Merge caller opts with agent defaults.
   * @param {object} opts
   * @returns {object}
   */
  _mergeOpts(opts = {}) {
    return {
      ...opts,
      source: opts.source || this._source(),
      classification: opts.classification || this.defaultClassification,
      tags: Array.from(new Set([...this.defaultTags, ...(opts.tags || [])])),
      useLLM: opts.useLLM !== undefined ? opts.useLLM : this.useLLM,
    };
  }

  /**
   * Store a new fact or update an existing one (version detection is automatic).
   * @param {string} text
   * @param {{ type?, timestamp?, metadata?, tags?, classification? }} [opts]
   * @returns {Promise<number>} stable entity ID
   */
  async remember(text, opts = {}) {
    const merged = this._mergeOpts(opts);
    if (opts.allowedWorkspaces) merged.allowedWorkspaces = opts.allowedWorkspaces;
    return this._engine.remember(text, merged);
  }

  /**
   * Alias for remember() — makes intent explicit when updating a known fact.
   * @param {string} text
   * @param {{ type?, timestamp?, metadata?, tags?, classification? }} [opts]
   * @returns {Promise<number>} stable entity ID
   */
  async update(text, opts = {}) {
    return this.remember(text, opts);
  }

  /**
   * Recall memories matching a query. Supports time-travel via asOf.
   * @param {string} text — natural language query
   * @param {{ limit?, filter?, asOf? }} [opts]
   * @returns {Promise<{ count, results, filter, asOf, config }>}
   */
  async recall(text, opts = {}) {
    return this._engine.query(text, { ...opts, allowedWorkspaces: opts.allowedWorkspaces });
  }

  /**
   * Get the full version history and provenance trail for an entity.
   * @param {number} id — entity ID
   * @returns {Promise<object>} history object with versions array
   */
  async getHistory(id) {
    return this._engine.getHistory(id);
  }

  /**
   * Extract discrete facts from raw text and ingest each as a separate memory.
   * Requires factExtractFn to be configured via init().
   * @param {string} text — raw text (meeting notes, paragraphs, etc.)
   * @param {{ type?, timestamp?, metadata?, tags?, classification? }} [opts]
   * @returns {Promise<{ facts: string[], ids: number[] }>}
   */
  async learnFrom(text, opts = {}) {
    const merged = this._mergeOpts(opts);
    if (opts.allowedWorkspaces) merged.allowedWorkspaces = opts.allowedWorkspaces;
    return this._engine.extractFacts(text, merged);
  }

  /**
   * Boot the agent with a token-budgeted summary of the most critical memories.
   * Call once at startup instead of searching the full store.
   *
   * @param {{ maxTokens?, maxItems?, depth?, filter? }} [opts]
   *   - maxTokens:  token budget (default 500)
   *   - maxItems:   hard cap on returned items
   *   - depth:      "essential" | "standard" | "full"
   *   - filter:     standard filter object (type, tags, memoryType, workspaceId)
   * @returns {Promise<{ summary, items }>}
   */
  async boot(opts = {}) {
    return this._engine.getStartupSummary({
      ...opts,
      allowedWorkspaces: opts.allowedWorkspaces,
    });
  }

  /**
   * Inspect contradictions across all versions of an entity.
   * Returns an array of versions that have contradicts === true.
   * @param {number} id — entity ID
   * @returns {Promise<{ id, contradictions: object[] }>}
   */
  async getContradictions(id) {
    const history = await this._engine.getHistory(id);
    const contradictions = ((history && history.versions) || []).filter(v => v.delta?.contradicts);
    return { id, contradictions };
  }
}

module.exports = { AgentMemory };
