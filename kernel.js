// kernel.js — Scoring primitives
"use strict";

function cosine(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// Returns a scoring function for a single entity against a query.
// Scores = semantic cosine + graph boost + keyword boost + recency boost, capped at 1.0.
// minSemanticScore is a hard floor applied before boosts — boosts cannot rescue an irrelevant entity.
//
// Recency uses exponential half-life decay: at updatedAt == now, the full recencyWeight applies;
// at (now - halfLife) it's halved; further back it fades toward zero.
function makeHybridKernel({
  graphBoostWeight   = 0.01,
  keywordBoostWeight = 0.05,
  llmBoostWeight     = 0.08,
  recencyWeight      = 0.10,
  recencyHalfLifeMs  = 30 * 86_400_000, // 30 days
  minFinalScore      = 0.45,
  minSemanticScore   = 0.35,
  now                = Date.now(),
  useRecency         = true,
} = {}) {
  return function hybridKernel(entity, queryVector, queryTerms) {
    const semantic = cosine(queryVector, entity.vector);

    // Hard floor: discard before computing boosts so graph-heavy or recency-heavy
    // entities can't pass the threshold on weak semantic signal.
    if (semantic < minSemanticScore) return null;

    // Cap link count at 10 so highly-connected entities don't dominate (max +0.10).
    const graphBoost = Math.min(entity.links?.size || 0, 10) * graphBoostWeight;

    let kwBoost = 0;
    if (queryTerms && queryTerms.length) {
      const lower   = entity.text.toLowerCase();
      const matches = queryTerms.filter(t => lower.includes(t)).length;
      kwBoost = (matches / queryTerms.length) * keywordBoostWeight;
    }

    // LLM-enriched keyword boost: matches query terms against LLM-extracted keywords.
    // Only fires when entities have been ingested with useLLM: true, so zero cost otherwise.
    let llmBoost = 0;
    const llmKw = entity.llmKeywords;
    if (llmBoostWeight > 0 && queryTerms && queryTerms.length && Array.isArray(llmKw) && llmKw.length) {
      const llmLower = llmKw.map(k => k.toLowerCase());
      const llmMatches = queryTerms.filter(t => llmLower.some(k => k.includes(t))).length;
      llmBoost = (llmMatches / queryTerms.length) * llmBoostWeight;
    }

    let recencyBoost = 0;
    if (useRecency && entity.updatedAt) {
      const ageMs = Math.max(0, now - entity.updatedAt);
      recencyBoost = recencyWeight * Math.exp(-Math.LN2 * ageMs / recencyHalfLifeMs);
    }

    const score = Math.min(1, semantic + graphBoost + kwBoost + llmBoost + recencyBoost);
    if (score < minFinalScore) return null;

    return {
      id:        entity.id,
      text:      entity.text,
      type:      entity.type || "text",
      score:     +score.toFixed(4),
      semantic:  +semantic.toFixed(4),
      recency:   +recencyBoost.toFixed(4),
      llmBoost:  +llmBoost.toFixed(4),
      updatedAt: entity.updatedAt || null,
    };
  };
}

module.exports = { cosine, makeHybridKernel };
