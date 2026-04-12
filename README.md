# Database X

Database X is a lightweight, local-first semantic memory engine for Node.js.

It combines:

- Vector similarity for semantic search
- Graph links for related-memory traversal
- Version history for evolving records
- Multi-type ingestion for text, files, and time series

## Why Use It

Database X is built for developers and AI agents that need memory without adding a heavy external database.

- Local-first: runs on your machine and keeps data private
- Simple API: small surface area, easy to wire into apps and tools
- Version-aware: updates become history instead of overwrites
- Hybrid retrieval: semantic search plus keyword and graph signals
- Multi-model ready: supports text, JSON, images, audio, video, and time series

## Highlights

### What makes it useful

- Explicit `init()` and `shutdown()` lifecycle
- Automatic update detection during ingest
- Per-entity version history with delta summaries
- Worker-thread query execution for faster searches
- Atomic persistence to a local `data.dbx` file
- Optional HTTP server for app and dashboard access

### Best fit

Use Database X when you want:

- Local semantic memory for an agent
- Versioned knowledge storage for a tool or app
- Lightweight retrieval without setting up a larger database stack

## Installation

```bash
npm install database-x
```

Node.js `18+` is required.

## Quick Start

```js
const dbx = require('database-x');

async function main() {
	await dbx.init();

	const id = await dbx.remember('Raw material costs $200 per unit');

	await dbx.remember('Raw material costs $250 per unit');

	const results = await dbx.query('What is the current raw material cost?');
	console.log(results);

	const history = await dbx.getHistory(id);
	console.log(history);

	await dbx.shutdown();
}

main().catch(console.error);
```

## Core Concepts

### Entity

An entity is a living record. Instead of overwriting old content, Database X can recognize updates and attach them as newer versions of the same entity.

### Versioning

Every meaningful update is stored with:

- The new text
- A timestamp
- A delta summary describing the change

### Hybrid Query

Queries combine:

- Semantic similarity
- Graph relationships
- Keyword relevance

### Type-Aware Ingestion

Different data types can be embedded through type-specific embedders:

- `text`
- `document`
- `json`
- `image`
- `audio`
- `video`
- `timeseries`

## API Overview

### Lifecycle

```js
await dbx.init(options?)
await dbx.shutdown()
```

### Ingestion

```js
await dbx.remember(text, options?)
await dbx.ingest(text, options?)
await dbx.ingestBatch(items)
await dbx.ingestFile(filePath, options?)
await dbx.ingestTimeSeries(label, points, options?)
```

### Retrieval

```js
await dbx.query(text, options?)
await dbx.get(id)
await dbx.getMany(ids)
await dbx.getHistory(id)
await dbx.listEntities(options?)
await dbx.getGraph()
await dbx.traverse(id, depth?)
await dbx.getStatus()
await dbx.remove(id)
```

## Common Examples

### Recommended agent API

Use `remember()` for agent writes. It is a thin helper over `ingest()` that defaults:

- `source` to `{ type: "agent" }`
- `classification` to `"internal"`

```js
await dbx.remember('User prefers weekly planning summaries', {
	tags: ['preference', 'planning'],
});
```

### Ingest text

```js
await dbx.ingest('Customer requested a refund', {
	type: 'text',
	classification: 'internal',
	source: { type: 'tool', uri: 'support-ticket' },
	tags: ['support', 'billing'],
});
```

### Ingest multiple items

```js
await dbx.ingestBatch([
	{ text: 'Server CPU hit 80%', type: 'text', tags: ['ops'] },
	{ text: 'Disk usage reached 90%', type: 'text', tags: ['ops'] },
]);
```

### Ingest a file

```js
await dbx.ingestFile('./notes/roadmap.md', {
	tags: ['planning'],
});
```

### Ingest time series data

```js
await dbx.ingestTimeSeries('weekly_signups', [
	{ timestamp: Date.now() - 2000, value: 120 },
	{ timestamp: Date.now() - 1000, value: 132 },
	{ timestamp: Date.now(), value: 145 },
]);
```

### Query with filters

```js
const result = await dbx.query('recent ops alerts', {
	limit: 5,
	filter: { type: 'text', tags: ['ops'] },
});
```

## HTTP Server

Database X can also run as a local HTTP service.

### Start the server

```bash
npx dbx
```

Or from source:

```bash
node server.js
```

### Server exports

```js
const server = require('database-x/server');
```

### Main endpoints

- `POST /ingest`
- `POST /remember`
- `POST /ingest/batch`
- `POST /ingest/timeseries`
- `POST /ingest/file`
- `POST /query`
- `POST /entities/batch`
- `GET /entity/:id`
- `DELETE /entity/:id`
- `GET /history/:id`
- `GET /entities`
- `GET /graph`
- `GET /traverse/:id`
- `GET /status`

By default the server runs on `http://localhost:3000`.

### Agent-facing HTTP write API

`POST /remember` is the recommended endpoint for agents and agent frameworks. It accepts the same body shape as `POST /ingest`, but defaults `source` to `{ type: "agent" }` and `classification` to `"internal"` when omitted.

## Configuration

Database X supports environment-variable configuration for common settings:

- `DBX_LINK_THRESHOLD`
- `DBX_VERSION_THRESHOLD`
- `DBX_GRAPH_BOOST`
- `DBX_MIN_SCORE`
- `DBX_MIN_SEMANTIC`
- `DBX_MAX_VERSIONS`
- `DBX_STRICT_EMBEDDINGS`
- `DBX_PORT`

## Storage Behavior

- Data is persisted locally to `data.dbx`
- Writes are atomic to reduce corruption risk
- Batch ingest writes once at the end for better performance

## Notes on Embeddings

Database X is model-agnostic. Supply an embedder with `init({ embedFn })`, and optionally pass `embeddingDim` if you want to enforce a fixed output size.

## Project Direction

The project focuses on:

- Clear APIs
- Local development workflows
- Practical semantic memory for real apps
- Readable code over unnecessary complexity

## Contributing

Contributions are welcome. If you are contributing to the project, follow the repository conventions and check `CLAUDE.md` if it is part of your workflow.
