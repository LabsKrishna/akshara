# Security Policy

Kalairos positions itself as a memory layer that resists poisoning, preserves
provenance, and surfaces contradictions rather than silently overwriting them.
Security reports are taken seriously and triaged ahead of feature work.

## Reporting a Vulnerability

**Please do not file public GitHub issues for suspected vulnerabilities.**

Email: **security@krishnalabs.ai**

Include, where possible:

- A clear description of the issue and the impact you observed
- Reproduction steps or a minimal proof-of-concept
- The Kalairos version (`npm ls kalairos`) and Node.js version (`node -v`)
- Whether you'd like credit in the advisory

You should expect:

- An acknowledgment within **3 business days**
- An initial assessment (severity + planned timeline) within **10 business days**
- A fix or mitigation in a patch release; the advisory is published once users
  have had a reasonable window to upgrade

## In Scope

- Memory poisoning and prompt-injection attacks against the ingest path
- Trust-score or provenance bypasses (e.g., source spoofing)
- Authentication or workspace-isolation bypasses in `server.js` / `auth.js`
- Data corruption or silent loss in the JSONL store
- Denial-of-service against the rate limiter, write queue, or worker pool
- Supply-chain concerns affecting the published npm package

## Out of Scope

- Attacks requiring local filesystem access to `data.kalairos`
  (the file-store assumes a single trusted process — see CLAUDE.md §13)
- Issues in third-party dependencies that are already publicly tracked
- Theoretical attacks against the deterministic mock embedder used in tests
  and benchmarks (it is not intended for production)

## Coordinated Disclosure

We follow a 90-day disclosure window from initial report to public advisory,
extendable by mutual agreement when a fix needs more runway. Researchers acting
in good faith will not be pursued under DMCA, CFAA, or equivalent laws.
