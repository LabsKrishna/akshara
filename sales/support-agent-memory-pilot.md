# Akshara Support Agent Memory Pilot

## Positioning

Akshara is an open-source memory engine for enterprise support agents that need private, auditable, time-aware recall across sessions.

Support agents fail when memory is stateless, overwritten, or impossible to audit. Akshara gives support agents durable local memory with version history, `asOf` recall, contradiction detection, provenance, classification, workspace isolation, MCP/HTTP integration, and token-budgeted recall.

Customer-facing one-liner:

> Akshara gives enterprise support agents durable, private, time-aware memory: what the agent knows now, what it knew before, who changed it, and why.

Why now:

> Enterprises are moving from chatbots to long-running agents, but their memory layer still behaves like search. Akshara makes memory versioned, inspectable, and safe to operate locally.

Credible beta language:

> Akshara is a credible beta for enterprise agent teams. It is local-first and governance-oriented today, with paid implementation support for teams evaluating production support-agent workflows. It is not yet a SOC 2, HIPAA, HA, managed-cloud, or fully compliant enterprise database.

## Buyer And Use Case

Primary buyer:

- Enterprise IT leaders
- AI platform teams
- Support engineering teams
- Internal tools teams building agentic support workflows

Lead use case:

- Internal or customer-facing support agents that must remember policy changes, customer-specific facts, prior resolutions, escalations, incident context, and workflow decisions.

Best-fit customer signals:

- They are actively building an AI support agent or internal copilot.
- They already use a vector database but struggle with stale or overwritten facts.
- They have private support data that cannot leave their environment.
- They need to inspect what an agent remembered and why it answered a certain way.
- They have changing support policies, SLAs, pricing rules, or incident procedures.

Disqualifiers:

- They want a fully managed SaaS memory platform today.
- They require formal compliance certifications before any pilot.
- They do not have a technical owner available for a 2-4 week evaluation.
- They only need stateless RAG over static documents.

## Landing Page Section

### Time-aware memory for enterprise support agents

Your support agent should not forget policy changes, customer history, or prior resolutions. And when something changes, it should be able to explain what changed, when, and from which source.

Akshara is a local-first memory engine for long-running support agents. It stores facts as versioned memories, not disposable embeddings, so your agent can answer:

- What is the current refund policy?
- What was the policy before last week's change?
- Which customer-specific facts came from a ticket, a tool, or an agent?
- Which memories changed or contradicted earlier versions?
- What context should fit into the next prompt without exceeding the token budget?

Built for enterprise evaluation:

- Local-first deployment with no required cloud dependency.
- Bring your own embedding model.
- Version history and `asOf` recall.
- Provenance, classification, tags, memory types, and workspace IDs.
- MCP and HTTP interfaces for agent toolchains.
- Markdown export for human inspection and handoff.

Akshara is currently offered as an open-source core plus paid implementation and support for enterprise support-agent pilots.

## Six-slide Pitch Deck

### Slide 1 - Support agents forget what changed

Enterprise support agents need to operate across changing policies, customer histories, tickets, incidents, and workflows. Most memory layers behave like search: they retrieve similar text, but they do not preserve what changed over time.

Talk track:

- Agents lose important context between sessions.
- Updates overwrite prior facts or create confusing duplicates.
- Support teams cannot audit why an agent answered a certain way.
- Stale policy or customer memory creates operational risk.

### Slide 2 - Vector search is not memory

Vector databases are useful retrieval infrastructure, but support-agent memory needs time, identity, and auditability.

Talk track:

- Vector DBs are optimized for similarity, not changing truth.
- They usually do not answer "what was true last week?"
- They do not naturally show version trails or contradiction signals.
- They do not decide what memory belongs in a constrained agent prompt.

### Slide 3 - Akshara: versioned memory for support agents

Akshara stores support facts as stable, versioned memories. When a policy or customer fact changes, Akshara updates the same entity and preserves the historical trail.

Talk track:

- Store policy v1.
- Update to policy v2.
- Ask for the current policy.
- Ask what was true before the update with `asOf`.
- Show the version history, delta, provenance, and classification.

### Slide 4 - Enterprise-friendly evaluation path

Akshara is local-first, model-agnostic, and built to fit into existing agent workflows.

Talk track:

- Runs locally or behind your own service boundary.
- Bring your own embeddings, including OpenAI, Cohere, or internal models.
- HTTP and MCP interfaces for integration.
- Workspace IDs and classification fields for isolation and governance-oriented workflows.
- Markdown export for review and handoff.

### Slide 5 - Support Agent Memory Pilot

The pilot is a paid 2-4 week implementation and evaluation package.

Deliverables:

- Local Akshara deployment.
- One support-agent memory workflow.
- Integration with one support knowledge source or a mocked dataset.
- Evaluation report and handoff documentation.
- Recommended roadmap for production hardening.

Suggested starting range: $5k-$15k depending on integration depth.

### Slide 6 - Choose one workflow to evaluate

The best pilot starts with one high-value support workflow.

Recommended pilot workflows:

- Refund, warranty, or policy-change recall.
- Customer-specific support context across sessions.
- Incident support memory for SRE or internal IT tickets.
- Escalation handoff memory between agents and humans.

Close:

> If we can show your support agent remembering current and historical support context with an inspectable audit trail in 2-4 weeks, would that be worth piloting?

## Demo Script

Use `node examples/support-agent-demo.js` for the repeatable local demo.

Demo story:

1. Initialize Akshara in memory with a deterministic local embedder.
2. Create a support agent named `support-agent`.
3. Store refund policy v1.
4. Update to refund policy v2.
5. Recall the current refund policy.
6. Recall the historical policy with `asOf`.
7. Show version history with change deltas.
8. Show provenance, classification, workspace, and memory type.
9. Export the memory as markdown for human review.

Expected buyer takeaway:

- The agent can remember the latest support rule.
- The agent can answer what used to be true.
- The agent can show who/what changed the memory.
- The memory is inspectable and portable.

## Outreach Message

Subject options:

- Support agents that remember what changed
- Time-aware memory for enterprise support agents
- Quick question on support-agent memory

Message:

Hi {{first_name}},

I am building Akshara, an open-source memory engine for enterprise support agents that need private, auditable recall across sessions.

The specific problem we focus on: support agents often retrieve similar context, but they cannot reliably answer what changed, what used to be true, or where a remembered fact came from.

Akshara stores support facts as versioned memories, so an agent can recall the current policy, ask what was true before a change, and show a provenance trail for review.

We are running a small number of paid 2-4 week support-agent memory pilots for teams building internal copilots or support automation. The pilot is local-first and implementation-supported, not a SaaS migration.

Would it be worth comparing this against one support workflow where stale or overwritten context creates risk?

Best,
{{sender}}

## Discovery Questions

- What support facts change often: policy, pricing, entitlement, incident process, customer status, or SLA?
- Where does your agent lose context today?
- What must be inspectable before a support answer can be trusted?
- What data cannot leave your environment?
- Are you currently using a vector database, RAG framework, MCP tools, or an internal knowledge base?
- What would make a 2-4 week pilot successful?
- Who owns the technical integration?
- What would block a paid pilot?

## Pilot Brief

Name: Support Agent Memory Pilot

Duration: 2-4 weeks

Commercial model:

- Open-source core.
- Paid implementation, support, evaluation design, integration help, and roadmap prioritization.
- Suggested starting range: $5k-$15k.

Pilot deliverables:

- Local Akshara setup.
- One support-agent memory workflow.
- One support knowledge source integration or mocked dataset.
- Demo covering current recall, historical recall, version history, provenance, and markdown export.
- Evaluation report with findings, limitations, and production-hardening recommendations.

Success criteria:

- The agent recalls relevant support context.
- The agent returns historical policy or customer facts with `asOf`.
- The agent shows version history and provenance for changed memories.
- The team can export memory records for human review.
- The customer can identify whether Akshara should move into a deeper production evaluation.

Do not promise yet:

- SOC 2 certification.
- HIPAA compliance.
- HA clustering.
- Encrypted-at-rest storage.
- Managed cloud service.
- Production-grade RBAC.
- Turnkey Zendesk, ServiceNow, or Salesforce connectors unless separately scoped.

## Buyer FAQ

### Is this a vector database?

No. Akshara uses embeddings for retrieval, but the product is a memory engine. It treats stable identity, version history, time-aware recall, provenance, and agent context selection as first-class features.

### Why would we pay if the core is open source?

The first paid offer is implementation and support, not a closed software license. Customers pay for integration help, pilot design, evaluation, deployment guidance, roadmap prioritization, and support-agent workflow expertise.

### Is this production ready?

Use credible-beta language. Akshara is ready for serious enterprise evaluation and local pilots. It is not yet a fully compliant enterprise database with formal certifications, HA operations, or managed cloud guarantees.

### Does it replace our vector database?

Not necessarily. For the pilot, position Akshara as the memory layer for facts that change over time and need auditability. It can complement existing RAG or vector search systems.

### What is the fastest pilot?

Use a mocked support policy/customer dataset and prove current recall, historical recall, provenance, contradiction/change visibility, and markdown export in an isolated local environment.

## 30-day Execution Checklist

Week 1:

- Run `npm run test`.
- Run `npm run bench`.
- Run `node examples/support-agent-demo.js`.
- Record demo output and benchmark proof points.
- Create a short screen-recorded demo from the script.

Week 2:

- Build a prospect list of 30-50 AI platform, IT automation, support engineering, and internal tools leaders.
- Prioritize teams using LangChain, MCP, OpenAI/Cohere embeddings, Zendesk, ServiceNow, Salesforce, or internal knowledge bases.
- Send outreach using the message above.

Week 3:

- Run discovery calls.
- Demo only the support-agent workflow.
- Track objections in a simple table: security, production readiness, integration, pricing, open-source concerns, and vector DB comparison.

Week 4:

- Close 1-2 paid pilots.
- Scope each pilot around one support workflow.
- Produce a pilot success checklist before kickoff.

Initial sales success threshold:

- 30-50 targeted prospects contacted.
- 5 buyer conversations.
- 2 serious pilot conversations.
- 1 paid pilot proposal sent.
