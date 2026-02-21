# ADR-0004: Cloud-Agnostic Architecture & Portable Stack

**Status:** Accepted  
**Date:** 2026-02-20  
**Deciders:** Benjamin Gröner

## Context

Qoomb is a SaaS-first product with self-hosting as a first-class deployment option. Many SaaS
products make early technology choices that lock them into a single cloud provider:

- **Managed services** (proprietary databases, queues, auth, serverless runtimes) create tight
  coupling to one vendor's API surface and pricing model
- **Provider-specific SDKs** in application code (cloud storage, KMS, push notifications) make
  migration expensive or impossible
- **Serverless functions** (Lambda, Cloud Functions, Azure Functions) impose constraints on
  execution model, cold starts, and local development that complicate self-hosting
- **Proprietary authentication** services cannot be self-hosted and create dependency on a
  third-party's uptime, pricing, and data handling policies

For Qoomb, this is unacceptable for several reasons:

1. **Privacy promise** — users trust us to keep their data under control; vendor lock-in
   undermines that by tying data to a specific ecosystem
2. **Self-hosting viability** — a realistic self-hosting option requires a stack that runs on
   any Linux server, not just a specific cloud console
3. **Cost predictability** — proprietary managed services often have opaque or usage-based
   pricing that scales unpredictably
4. **Sustainability** — if a provider changes pricing, deprecates a service, or suffers an
   outage, the business must be able to move without rewriting the application
5. **Developer experience** — the full stack must run locally on a developer's laptop without
   cloud credentials, emulators, or shims

## Decision

We commit to a **cloud-agnostic architecture**: every technology in the stack must be
open-source, self-hostable, and runnable on any hosting platform — from a single VPS to a
Kubernetes cluster, across any cloud provider or bare-metal infrastructure.

### Stack Choices & Rationale

| Concern              | Choice                                       | Why Not Proprietary?                                                                                                      |
| -------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Runtime**          | Node.js (NestJS on Fastify)                  | Runs anywhere — Docker, VM, bare metal. No vendor-specific serverless runtime.                                            |
| **Database**         | PostgreSQL 18 (with pgvector)                | Open-source, self-hostable. No proprietary database engine or query language.                                             |
| **Cache / Queue**    | Redis 8                                      | Open-source, runs everywhere. No managed-only message broker.                                                             |
| **ORM**              | Prisma                                       | Database-agnostic migrations. Not coupled to a specific cloud DB API.                                                     |
| **Object Storage**   | S3-compatible API (planned)                  | MinIO, Ceph, or any S3-compatible provider — not limited to one cloud's implementation.                                   |
| **Authentication**   | Custom JWT + PassKey/WebAuthn                | No dependency on third-party auth services. Full control over user data and auth flow.                                    |
| **Encryption**       | Node.js `crypto` (AES-256-GCM, HKDF)         | Zero external dependencies. Works offline. Optional integration with external KMS via pluggable interface (see ADR-0005). |
| **Email**            | Pluggable transports (SMTP, Resend, Console) | SMTP is universal. SaaS transports (Resend) are optional alternatives, not requirements.                                  |
| **Frontend**         | React + Vite                                 | Static files servable from any web server or CDN. No vendor-specific hosting requirement.                                 |
| **Mobile**           | Capacitor                                    | Wraps the existing web app. No vendor-specific mobile backend.                                                            |
| **Containerization** | Docker Compose                               | Standard OCI containers. Runs on any container runtime.                                                                   |
| **CI/CD**            | GitHub Actions                               | Only for CI — the application itself has zero dependency on GitHub at runtime.                                            |

### Architectural Rules

1. **No provider-specific imports in application code.** The `apps/api/src/modules/` layer must
   never import a cloud SDK directly. Cloud-specific code lives behind interfaces in
   infrastructure adapters (see ADR-0002).

2. **Infrastructure behind interfaces.** When cloud-specific integrations are needed (e.g. KMS
   for key management, S3 for file storage), they are implemented as pluggable providers behind
   a common interface. The application depends on the interface, never the implementation.

   ```typescript
   // ✅ Application depends on interface
   interface KeyProvider {
     getMasterKey(): Promise<Buffer>;
   }

   // Implementations: EnvironmentKeyProvider, FileKeyProvider, VaultKeyProvider, CloudKmsKeyProvider
   // Which one runs is determined by configuration, not code
   ```

3. **`docker-compose up` must be sufficient for development.** The entire stack —
   PostgreSQL, Redis, and the application — must start locally without cloud credentials,
   API keys, or external services.

4. **No managed-service-only features.** We do not use database features, queue semantics, or
   storage APIs that exist only in one provider's managed offering. Core PostgreSQL features we
   use (RLS, JSONB) are built-in; extensions like pgvector must be installed explicitly but are
   open-source and available on any PostgreSQL installation.

5. **Configuration over code.** Deployment differences (cloud vs. self-hosted) are expressed
   through environment variables, not code branches.

   ```bash
   # Self-hosted
   KEY_PROVIDER=environment
   ENCRYPTION_KEY=<base64>

   # Enterprise with external KMS
   KEY_PROVIDER=vault
   VAULT_ADDR=https://vault.internal
   ```

### Deployment Target Matrix

The architecture is validated against these deployment scenarios:

| Scenario                  | Infrastructure                                   | Status                                         |
| ------------------------- | ------------------------------------------------ | ---------------------------------------------- |
| **Local development**     | Docker Compose on laptop                         | ✅ Supported                                    |
| **Single VPS**            | Docker Compose on any Linux server               | ✅ Supported                                    |
| **Kubernetes**            | Standard K8s (any provider)                      | ✅ Supported (stateless app, external DB/Redis) |
| **Platform-as-a-Service** | Railway, Render, Fly.io, etc.                    | ✅ Supported (Docker-based)                     |
| **Cloud IaaS**            | Any cloud VM (EC2, GCE, Azure VM, Hetzner, etc.) | ✅ Supported                                    |
| **Managed containers**    | ECS, Cloud Run, Azure Container Apps, etc.       | ✅ Supported                                    |
| **Bare-metal**            | Physical server, no cloud                        | ✅ Supported                                    |

## Rationale

### Why Not Serverless?

Serverless (Lambda, Cloud Functions, etc.) is appealing for cost and scaling but:

- **Vendor lock-in** — each provider has a different API, event format, and deployment model
- **Cold starts** — impact latency for a real-time collaboration app
- **Self-hosting impossible** — cannot run Lambda functions on a VPS
- **Local development gap** — requires emulators or cloud-specific tooling
- **Connection management** — PostgreSQL connection pooling is harder with ephemeral functions

A long-running Node.js process (NestJS on Fastify) is simpler, more portable, and more predictable. Horizontal scaling is achieved by running multiple instances behind a load balancer — works identically on any platform.

### Why Not a Third-Party Auth Service?

Third-party auth services (Auth0, Clerk, Firebase Auth, Supabase Auth, etc.) offer convenience
but:

- **Data sovereignty** — user authentication data lives on a third party's infrastructure
- **Pricing risk** — authentication is a cost-centre that scales with user count
- **Feature dependency** — when they deprecate, change, or have an outage, our auth breaks
- **Self-hosting blocked** — these services cannot be self-hosted
- **Privacy conflict** — Qoomb's core promise is privacy; outsourcing auth data contradicts this

Custom JWT + PassKey/WebAuthn gives us full control over auth data, no vendor dependency, and
the ability to self-host without any external service.

### Why Not a Proprietary Database?

Proprietary databases (DynamoDB, Cloud Spanner, Cosmos DB, etc.) offer managed convenience but:

- **Migration cost** — query languages and data models are incompatible across providers
- **Self-hosting impossible** — cannot run DynamoDB on a local server
- **Feature lock-in** — once you use provider-specific features, you're committed
- **PostgreSQL sufficiency** — PostgreSQL provides everything we need: RLS for multi-tenancy,
  JSONB for flexible schemas, pgvector for semantic search, and a mature ecosystem

### Rejected Alternatives

- **Full serverless architecture** — too provider-specific, incompatible with self-hosting
- **Managed auth service** — conflicts with privacy-first principle and self-hosting requirement
- **Proprietary database** — creates permanant vendor lock-in
- **Provider-specific message queues** — Redis covers our pub/sub and caching needs portably
- **Multi-cloud abstraction layers** (Pulumi, Terraform in application code) — adds complexity
  without solving the application-level portability problem

## Consequences

### Positive

- **True self-hosting** — `docker-compose up` on any Linux machine gives a fully functional instance
- **No vendor lock-in** — can move between clouds or to bare-metal without application changes
- **Cost transparency** — no opaque managed service pricing; infrastructure costs are predictable
- **Developer simplicity** — `docker-compose up -d` starts everything locally, no cloud accounts needed
- **Privacy by architecture** — no user data flows to third-party services by default
- **Long-term sustainability** — the project is not dependent on any vendor's roadmap

### Negative

- **More operational responsibility** — no managed auto-scaling, backups, or monitoring out of the box
  (mitigated by standard tooling: Docker health checks, pg_dump, Prometheus/Grafana)
- **More code for infrastructure** — custom auth, custom encryption, pluggable providers mean more code
  to write and maintain (mitigated by well-defined interfaces and thorough testing)
- **No serverless cost advantages** — must provision capacity ahead of demand (mitigated by
  container orchestration and horizontal scaling)
- **Cloud-specific optimisations left on the table** — cannot use proprietary features that
  would be faster/cheaper on a specific cloud (acceptable trade-off for portability)

## References

- [The Twelve-Factor App](https://12factor.net/) — methodology for building portable SaaS
- [Hexagonal Architecture (Ports & Adapters)](https://alistair.cockburn.us/hexagonal-architecture/) — infrastructure behind interfaces
- [Cloud Native Computing Foundation](https://www.cncf.io/) — open-source cloud-native standards
