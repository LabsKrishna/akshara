# Hacker News Launch Post

## Title (80 char max)

```
Show HN: Database X – Versioned memory engine for AI agents (time-travel, local-first)
```

## Post body

---

I've been building AI agents for the past year, and I kept rebuilding the same memory layer. Every project needed the same thing: store facts, update them over time, and answer "what changed?" No vector database does this well.

Vector databases treat writes as append-only embeddings. Update a fact and the old one is gone. Ask "what was the budget last week?" and you get silence. The old embedding was overwritten or you're left deduplicating by hand.

So I built Database X. The core idea: **every write is a version, not an overwrite.** Queries can time-travel.

```js
const agent = dbx.createAgent({ name: 'analyst' });

// Store a fact
await agent.remember('Revenue target is $10M for Q3');

// Update it — version detection is automatic
await agent.remember('Revenue target revised to $12M for Q3');

// What's current?
await agent.recall('revenue target');
// → "Revenue target revised to $12M for Q3"

// What was true BEFORE the revision?
await agent.recall('revenue target', { asOf: lastWeek });
// → "Revenue target is $10M for Q3"
```

No ID needed for the update — Database X detects that the new text is an update to an existing entity based on semantic similarity and stores it as version 2.

**What else it does:**

- **Automatic contradiction detection** — when v2 contradicts v1 (e.g. "$10M" → "$12M"), the delta is flagged. Agents can inspect contradictions and decide how to act.
- **Provenance tracking** — every entity records who stored it, when, and from where. Query results include provenance so downstream systems can make trust decisions.
- **Hybrid retrieval** — cosine similarity + graph relationships + keyword overlap + recency scoring. Not just nearest-neighbor.
- **Soft delete + hard delete** — soft delete for audit trails, `purge()` for GDPR right-to-erasure.
- **Memory types + workspaces** — short-term vs. long-term memory separation, workspace isolation for multi-tenant agents.
- **BYO embedder** — pass any `async (text) => number[]` function. No bundled model, no vendor lock.

**What it's NOT:**

- Not distributed. Single-node, file-based persistence.
- Not a Postgres replacement. It's ~1,500 lines of JavaScript.
- Not trying to be a generic vector database. It's specifically for agent memory that evolves over time.

**Try it without an API key:**

```bash
npx dbx-memory demo
```

Runs a full agent scenario in your terminal — versioning, time-travel, contradiction detection — using a built-in demo embedder. Nothing written to disk.

**Install:**

```bash
npm install dbx-memory
```

- GitHub: https://github.com/LabsKrishna/dbx
- npm: https://www.npmjs.com/package/dbx-memory
- MIT licensed, zero dependencies beyond Express

I'd genuinely appreciate feedback from anyone building agent systems. What memory problems are you hitting that this doesn't solve?

---

## Timing notes

- **Best days**: Tuesday, Wednesday, Thursday
- **Best time**: 8-10am ET (HN audience wakes up, post has all day to climb)
- **Avoid**: Fridays, weekends, holidays, major tech announcements

## Engagement strategy

1. **First comment**: Post a detailed technical comment immediately after submitting. Explain the architecture decisions, the scoring formula, why you chose file-based persistence over SQLite, what the version detection threshold means. HN rewards technical depth in comments.

2. **Sample first comment:**

> A few architecture notes since HN tends to appreciate the details:
>
> **Version detection**: When you call `remember()`, the engine computes cosine similarity against all existing entities of the same type. If similarity ≥ 0.82 (configurable via `DBX_VERSION_THRESHOLD`), it's treated as an update to the existing entity. Below that but above 0.78, it's a "consolidation" — same fact expressed differently. Below that, it's a new entity.
>
> **Scoring**: Retrieval isn't just cosine. The hybrid score is: `semantic + graphBoost + keywordBoost + llmBoost + recencyBoost`. Graph boost comes from automatically discovered links between related entities. Recency uses exponential decay with a configurable half-life (default 30 days).
>
> **Persistence**: Append-only JSONL file (`data.dbx`), atomic writes via temp file + rename. I considered SQLite but the append-only log is simpler, easier to debug, and good enough for the single-node use case. You can also pass `dataFile: ":memory:"` for in-memory-only mode.
>
> **Why JavaScript**: Agents are mostly being built in JS/TS and Python right now. I started with JS because it's what I was building agents in. Python client is on the roadmap.
>
> Happy to dive deeper on any of these.

3. **Reply to every comment** in the first 2 hours. Be genuinely helpful, not defensive. If someone says "just use Postgres," acknowledge it and explain the specific gap.

4. **Don't ask for upvotes.** Don't share the link in Slack channels asking people to vote. HN detects and penalizes voting rings.

## Alternative titles (test which resonates)

```
Show HN: Database X – Memory for AI agents that understands what changed over time
Show HN: Database X – Your AI agent forgets between sessions. This fixes that.
Show HN: I built a versioned memory engine because vector DBs can't answer "what changed?"
```
