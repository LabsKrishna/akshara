# LongMemEval runner

A thin runner over the [LongMemEval](https://github.com/xiaowu0162/LongMemEval) evaluation format. Works against the bundled 6-question sample out of the box, and against the real ~500-question dataset when you download it.

```bash
# Bundled sample — runs in < 10 seconds, no network needed
node bench/longmemeval/run.js

# Full dataset — download from the upstream repo first
node bench/longmemeval/run.js path/to/longmemeval_s.json
```

Output: `bench/longmemeval/results.json`.

## Why a subset in-repo

Two reasons. First, the full LongMemEval dataset is ~500 questions × multi-session haystacks — too large to ship with the npm package. Second, CI needs something deterministic and fast to run on every PR; that's what `sample.json` is. The shape exactly matches the upstream format, so the same runner binds to both.

## What it measures

Per question, we ingest every utterance of every haystack session, then `query(question)`. Scoring is:

| Metric | Meaning |
|--------|---------|
| `top1` | top-1 result's text contains the ground-truth answer (case-insensitive substring) |
| `top5` | top-5 concatenated text contains the ground-truth answer |
| `route` | at least one retrieved result came from a session listed in `answer_session_ids` |

`top5` is the headline number — it is what an agent-level prompt would see if it grabbed the retrieved context as-is. `route` is the cleaner signal for retrieval quality (did we even look at the right session), uncoupled from lexical answer form.

## Current sample numbers

Deterministic bag-of-words embedder, in-memory store, 6 questions:

| Question type              | n | top1 | top5 | route |
|----------------------------|:-:|:----:|:----:|:-----:|
| single-session-user        | 2 | 100% | 100% | 100%  |
| single-session-preference  | 1 | 100% | 100% | 100%  |
| single-session-assistant   | 1 |   0% | 100% | 100%  |
| multi-session              | 1 |   0% | 100% | 100%  |
| knowledge-update           | 1 |   0% | 100% | 100%  |
| **overall**                | 6 |  50% | 100% | 100%  |

Routing is 100% on the sample — the engine pulls from the right session every time. top1 drops on the harder types because the top slot often surfaces a *related* utterance rather than the exact answer-bearing one (e.g., "I might watch a movie tonight" outranks "I go to bed at 11 PM" under a naive bag-of-words embedder). With a neural embedder we expect top1 to rise materially.

## What the sample is **not**

- **Not a substitute for the real dataset.** Six hand-crafted questions do not establish competitive standing; they establish that the runner is wired correctly.
- **Not a claim against Mem0 / Zep / Letta.** Upstream LongMemEval publishes comparable numbers for those; run the full dataset through this runner and through theirs to compare.
- **Not a judge-scored result.** We use permissive substring matching. For the upstream judge protocol (LLM-graded), serialize the retrieved context per question and feed it through the reference grader.

## Running against the full dataset

1. Download the dataset from the [LongMemEval repo](https://github.com/xiaowu0162/LongMemEval) — specifically `longmemeval_s.json` (short) or `longmemeval_m.json` (medium). 
2. Run:
   ```bash
   node bench/longmemeval/run.js ~/Downloads/longmemeval_s.json
   ```
3. For real embeddings, swap `makeEmbedder()` in `run.js` for a function that calls OpenAI / Cohere / local embeddings. Keep the bag-of-words default as the CI guardrail.
