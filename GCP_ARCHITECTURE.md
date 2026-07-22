# Resource Management Platform - Technical Architecture (GCP)

> Version: 1.1 | Date: 2026-07-07 | Status: Minimal production-ready design — aligned to the approved AWS plan (ARCHITECTURE.md v3.0)  
> Region: `us-central1` (Iowa) — closed decision, cheapest GCP region, same rationale as the approved `us-east-1` pick on AWS  
> Budget target: ~`$60-65/month`, matching the approved AWS budget  
> Companion docs: [GCP_INFRA_SETUP.md](GCP_INFRA_SETUP.md), [GCP_COST_PLAN.md](GCP_COST_PLAN.md), [gcp-architecture.drawio](gcp-architecture.drawio)

---

## Table of Contents

1. [Current State](#1-current-state)
2. [Target Architecture (GCP)](#2-target-architecture-gcp)
3. [Region and Sizing](#3-region-and-sizing)
4. [Compute Decision: Why Cloud Run](#4-compute-decision-why-cloud-run)
5. [Tech Stack](#5-tech-stack)
6. [Database Migration: Supabase to Cloud SQL PostgreSQL](#6-database-migration-supabase-to-cloud-sql-postgresql)
7. [Cloud Run and Cloud SQL Connectivity](#7-cloud-run-and-cloud-sql-connectivity)
8. [Networking, Security, and Secrets](#8-networking-security-and-secrets)
9. [Zoho Integration Plan](#9-zoho-integration-plan)
10. [Cost Breakdown](#10-cost-breakdown)
11. [Migration Phases and Roadmap](#11-migration-phases-and-roadmap)
12. [Open Decisions](#12-open-decisions)

---

## 1. Current State

```
Browser
  |
  v
Next.js 16 app (rm-frontend, local / Vercel)
  | - App Router UI in app/
  | - API route handlers in app/api/*
  | - Server logic in lib/server/ and lib/ingestion/
  | - Supabase client and JWT middleware
  v
Supabase (hosted Postgres + Auth)
```

### Already true

- `rm-frontend/` is the single full-stack Next.js repo.
- API routes already live inside the Next.js app, so no separate backend service is required.
- Supabase Auth is already integrated and can remain as the identity provider.
- PostgreSQL is already the database engine, so the DB move is a Postgres-to-Postgres migration.

### Pain points to solve

- Backend API routes need a stable public deployment.
- Supabase free-tier limits and auto-pause are not ideal for production use.
- No managed CI/CD deployment target in GCP yet.
- Need logs, metrics, budget alerts, and a small but clear upgrade path.

---

## 2. Target Architecture (GCP)

```
                  +------------------------------------------+
                  | GoDaddy DNS - uniqus.com zone            |
                  | managed by Uniqus IT                     |
                  |                                          |
                  | CNAME www.unisource -> Cloud Run domain  |
                  | CNAME ownership proof -> Google verify   |
                  +--------------------+---------------------+
                                       |
                                       v
+----------------------------------------------------------------------------+
| Google Cloud project: rm-platform-prod                                      |
| Region: us-central1                                                        |
|                                                                            |
|  +----------------------------------------------------------------------+  |
|  | Cloud Run service: rm-frontend                                       |  |
|  | Custom domain: www.unisource.uniqus.com                              |  |
|  | Managed HTTPS                                                        |  |
|  |                                                                      |  |
|  | Next.js 16 standalone container                                      |  |
|  | - UI pages in app/                                                   |  |
|  | - API routes in app/api/*                                            |  |
|  | - Server libs in lib/server/* and lib/ingestion/*                    |  |
|  | - Supabase JWT middleware                                            |  |
|  |                                                                      |  |
|  | Size: 0.5 vCPU / 1 GiB RAM                                           |  |
|  | Min instances: 1 (always warm, matches approved AWS behavior)        |  |
|  | Max instances: 4                                                     |  |
|  | Concurrency: 100                                                     |  |
|  +-----------------------------+----------------------------------------+  |
|                                |                                           |
|                                | Cloud SQL connection                      |
|                                v                                           |
|  +----------------------------------------------------------------------+  |
|  | Cloud SQL PostgreSQL: rm-db-prod                                     |  |
|  | PostgreSQL 16                                                        |  |
|  | Tier: db-f1-micro initially                                          |  |
|  | Storage: 20 GB SSD, auto-increase enabled                            |  |
|  | Availability: single-zone initially                                  |  |
|  | Backups: automated, 7-day retention                                  |  |
|  +----------------------------------------------------------------------+  |
|                                                                            |
|  +---------------------+     +--------------------+     +----------------+ |
|  | Artifact Registry   |     | Secret Manager     |     | Cloud Logging  | |
|  | rm-frontend images  |     | DB, Zoho, Supabase |     | Metrics/Alerts | |
|  +---------------------+     +--------------------+     +----------------+ |
|                                                                            |
|  +----------------------------------------------------------------------+  |
|  | Cloud Scheduler                                                       |  |
|  | hourly POST -> https://www.unisource.uniqus.com/api/zoho/sync          |  |
|  +----------------------------------------------------------------------+  |
|                                                                            |
+------------------------------------+---------------------------------------+
                                     |
                                     v
                  +------------------------------------------+
                  | External SaaS APIs                       |
                  | - Zoho People                            |
                  | - Zoho Analytics                         |
                  | - Supabase Auth JWT issuer               |
                  +------------------------------------------+

CI/CD:
GitLab push -> Jenkins -> docker build -> Artifact Registry push
-> gcloud run deploy rm-frontend -> rolling deployment
```

### Key Architecture Decisions

| Concern | GCP choice | Why |
|---|---|---|
| Hosting | Cloud Run | Best fit for one containerized Next.js full-stack app; managed HTTPS and autoscaling without GKE or a load balancer. |
| Database | Cloud SQL PostgreSQL 16 | Same database engine as Supabase; minimal application query changes. |
| Region | `us-central1` | Closed decision — cheapest GCP region, same rationale as the approved `us-east-1` pick on AWS. No India/Doha requirement was part of the approved plan. |
| Initial DB size | `db-f1-micro`, 20 GB SSD | Lowest managed PostgreSQL starting point. Good for initial low-traffic production or pilot. |
| Auth | Keep Supabase Auth | Avoids Cognito/Firebase Auth migration risk. Middleware can continue verifying Supabase JWTs. |
| DNS | Keep GoDaddy | Matches AWS plan; no need to move parent zone to Cloud DNS. |
| TLS | Cloud Run managed certificate | Google provisions and renews certificates for mapped custom domains. |
| Registry | Artifact Registry | GCP-native Docker image registry, equivalent to ECR. |
| Secrets | Secret Manager | Holds DB password, Zoho credentials, Supabase keys, and sync trigger key. |
| CI/CD | Jenkins + gcloud deploy | Mirrors AWS plan where Jenkins builds and deploys; avoids Cloud Build cost/ops for now. |
| Scheduled jobs | Cloud Scheduler | Equivalent to EventBridge Scheduler; one hourly job is free under current pricing. |
| Observability | Cloud Logging + Cloud Monitoring | Native logs, metrics, uptime checks, and alerting. |

---

## 3. Region and Sizing

### Region — closed decision

| Option | Region | Status | Cost note |
|---|---|---|---|
| **Lowest cost (selected)** | `us-central1` | ✅ Decided — matches the rationale behind the approved AWS `us-east-1` pick | Usually the cheapest GCP baseline. |
| India latency | `asia-south1` Mumbai | Not selected — no India-hosting requirement in the approved plan | Slightly higher than US. |
| Middle East / Doha alignment | `me-central1` Doha | Not selected — no Doha alignment requirement in the approved plan | Higher than US. |

### Initial production sizing

Sizing mirrors the approved AWS App Runner configuration (0.5 vCPU / 1 GB, min=1, max=4, concurrency=100) so behavior — including no cold starts — doesn't change as part of the cloud migration.

| Component | Initial size | Reason |
|---|---|---|
| Cloud Run CPU | 0.5 vCPU | Matches approved AWS App Runner sizing. |
| Cloud Run memory | 1 GiB | Matches approved AWS App Runner sizing. |
| Cloud Run min instances | 1 | Always warm — matches the approved AWS behavior (no cold starts). |
| Cloud Run max instances | 4 | Matches approved AWS App Runner `max=4`. |
| Cloud Run concurrency | 100 | Matches approved AWS App Runner `concurrency=100`. |
| Cloud SQL engine | PostgreSQL 16 | Matches AWS RDS plan and current Supabase Postgres direction. |
| Cloud SQL tier | `db-f1-micro` | Minimal managed DB tier, equivalent to RDS `db.t4g.micro`. |
| Cloud SQL storage | 20 GB SSD | Same starting storage used in AWS plan. |
| Cloud SQL availability | Single-zone | Keeps cost low; HA is a later upgrade — same as AWS Single-AZ. |
| Cloud SQL backup retention | 7 days | Matches AWS plan. |
| Artifact Registry | Regional Docker repo | Store only RM app images. |
| Logging retention | 30 days | Matches AWS CloudWatch Logs retention. |

### Production upgrade sizing

| Trigger | Upgrade | Budget impact |
|---|---|---|
| Cost pressure and cold starts become acceptable | Cloud Run min instances 1 -> 0 | Saves roughly `$8-12/month`; reintroduces cold starts that the approved plan doesn't have today. |
| DB CPU/memory high | Cloud SQL `db-f1-micro` -> `db-g1-small` | DB cost increases but likely stays around the budget ceiling. |
| More users or SLA requirement | Cloud SQL dedicated-core, single-zone | More reliable, may exceed `$65/month`. |
| HA required | Cloud SQL regional HA | Not recommended for the current budget; approve separately. |
| Large upload/download usage | Add Cloud Storage signed URLs | Low storage cost, egress depends on traffic. |

---

## 4. Compute Decision: Why Cloud Run

| Factor | Cloud Run | GKE Autopilot | Compute Engine VM | App Engine |
|---|---:|---:|---:|---:|
| Control plane cost | $0 | GKE management/compute floor applies | $0, but VM always-on | $0 |
| Load balancer required | No | Usually yes for production ingress | Usually yes or manual reverse proxy | No |
| Scale to zero | Yes | Not the full app platform floor | No | Yes |
| Container portability | Yes | Yes | Yes | Less flexible |
| Ops effort | Low | Medium/high | Medium | Low |
| Fit for one Next.js service | Best | Overkill | More manual ops | Possible but less container-native |
| Initial monthly floor | Lowest | Too high for this request | Always-on VM cost | Low, but less aligned with Docker/Jenkins flow |

Decision: **Cloud Run**. It is the closest GCP equivalent to AWS App Runner and keeps the monthly cost at or below the approved `~$60-65` AWS budget.

---

## 5. Tech Stack

### Unchanged

| Layer | Technology |
|---|---|
| Framework | Next.js 16 App Router |
| Language | TypeScript |
| UI | Styled Components 6 |
| Charts | Recharts |
| Icons | Lucide React |
| Excel parsing | xlsx / SheetJS |
| Auth | Supabase Auth |
| Database engine | PostgreSQL |

### Changed from AWS plan

| AWS item | GCP item |
|---|---|
| AWS App Runner | Cloud Run |
| Amazon RDS PostgreSQL | Cloud SQL PostgreSQL |
| Amazon ECR | Artifact Registry |
| AWS Secrets Manager + SSM | Secret Manager |
| EventBridge Scheduler | Cloud Scheduler |
| CloudWatch Logs/Alarms | Cloud Logging + Cloud Monitoring |
| ACM managed cert | Cloud Run managed cert |
| NAT Gateway | Not required for minimal Cloud Run design |

---

## 6. Database Migration: Supabase to Cloud SQL PostgreSQL

### Cloud SQL instance spec

```
Engine:                  PostgreSQL 16
Instance ID:             rm-db-prod
Machine type:            db-f1-micro initially
Storage:                 20 GB SSD
Storage auto-increase:   Enabled
Availability:            Single-zone
Region:                  Same as Cloud Run
Backups:                 Enabled, 7-day retention
Point-in-time recovery:  Optional at launch; enable if budget allows
Deletion protection:     Enabled after initial validation
Public IP:               Disabled if using private IP path
Private IP:              Preferred
Database name:           rm_prod
Application user:        rm_app
```

### Migration steps

1. Freeze schema changes.
2. Export Supabase Postgres using `pg_dump`.
3. Create Cloud SQL instance, database, and application user.
4. Import dump into Cloud SQL.
5. Apply `supabase/functions.sql` if required by app logic.
6. Run app locally against Cloud SQL using a temporary secure connection.
7. Deploy Cloud Run with Cloud SQL connection configured.
8. Run smoke tests: login, dashboard load, employee API, Excel upload, Zoho sync trigger.
9. Cut over DNS/custom domain after validation.

### Connection model

Preferred: Cloud Run connects to Cloud SQL through the Cloud SQL connector integration and a service account with `roles/cloudsql.client`. Keep Cloud SQL in the same region as Cloud Run for latency, lower networking cost, and lower cross-region risk.

---

## 7. Cloud Run and Cloud SQL Connectivity

### Minimal secure path

| Item | Setting |
|---|---|
| Cloud SQL IP | Private IP preferred |
| Cloud Run egress | Direct VPC egress to private ranges only |
| External API egress | Public internet directly from Cloud Run |
| Cloud NAT | Not required |
| Load balancer | Not required |
| Service account | `rm-cloudrun-sa` |
| IAM | `roles/cloudsql.client`, `roles/secretmanager.secretAccessor`, logging writer |

This avoids the always-on NAT Gateway equivalent from the AWS design. Cloud Run can still reach Zoho and Supabase Auth over public HTTPS, while database traffic stays inside Google Cloud.

### Environment variables

```
NODE_ENV=production
PORT=8080
DATABASE_URL=postgresql://rm_app:<password>@/rm_prod?host=/cloudsql/<PROJECT>:<REGION>:rm-db-prod
SUPABASE_URL=<from Secret Manager>
SUPABASE_ANON_KEY=<from Secret Manager>
SUPABASE_JWT_SECRET=<from Secret Manager>
ZOHO_CLIENT_ID=<from Secret Manager>
ZOHO_CLIENT_SECRET=<from Secret Manager>
ZOHO_REFRESH_TOKEN=<from Secret Manager>
SYNC_TRIGGER_KEY=<from Secret Manager>
```

---

## 8. Networking, Security, and Secrets

### Network layout

For the minimal design, keep networking simple:

| Network item | Value |
|---|---|
| VPC | `rm-vpc` |
| Subnet | `rm-subnet-app`, `/24`, same region as Cloud Run |
| Private Service Access | Enabled for Cloud SQL private IP |
| Serverless VPC Access connector | Avoid unless Direct VPC egress is unavailable in the selected setup |
| Cloud NAT | Not required |
| External HTTPS LB | Not required |

### Service accounts

| Service account | Purpose | Roles |
|---|---|---|
| `rm-cloudrun-sa` | Runtime identity for Cloud Run | Cloud SQL Client, Secret Manager Secret Accessor, Logs Writer |
| `jenkins-gcp-deploy` | CI/CD deploy identity | Artifact Registry Writer, Cloud Run Developer, Service Account User |

### Secret Manager paths

```
rm-prod-database-url
rm-prod-db-password
rm-prod-zoho-client-id
rm-prod-zoho-client-secret
rm-prod-zoho-refresh-token
rm-prod-supabase-url
rm-prod-supabase-anon-key
rm-prod-supabase-jwt-secret
rm-prod-sync-trigger-key
```

### Security controls

- Use least-privilege service accounts.
- Disable broad public database access.
- Keep Cloud SQL backups enabled.
- Keep Cloud Run ingress public only for the app service, not for admin endpoints.
- Protect scheduled sync endpoint with `x-sync-key`.
- Set Cloud Logging retention to 30 days.
- Create budget alerts at `$40`, `$50`, and `$60`.

---

## 9. Zoho Integration Plan

Zoho integration remains application-level and does not require separate infrastructure.

### Zoho People sync

Cloud Scheduler triggers:

```
Schedule: every 1 hour
Target:   https://www.unisource.uniqus.com/api/zoho/sync
Method:   POST
Header:   x-sync-key: <from Secret Manager>
Body:     {"source":"cloud-scheduler","type":"hourly"}
Retries:  enabled
```

For syncs longer than the request timeout, convert the job to a Cloud Run Job and trigger that from Cloud Scheduler.

### Zoho Analytics

Start with pull mode:

- App route calls Zoho Analytics API.
- Cache API response in Cloud SQL for 1 hour.
- Defer push-mode analytics until the core app is stable.

---

## 10. Cost Breakdown

Full breakdown, region-specific pricing, and levers to reduce cost live in [GCP_COST_PLAN.md](GCP_COST_PLAN.md) — mirrors the structure of the approved AWS cost breakdown in `ARCHITECTURE.md` §10. Summary:

| Service | Spec | Monthly estimate | Notes |
|---|---|---:|---|
| Cloud SQL PostgreSQL | `db-f1-micro`, 20 GB SSD, single-zone, `us-central1` | `~$11-15` | Cheapest managed Postgres option; shared-core has no Cloud SQL SLA, same tradeoff as AWS RDS `db.t4g.micro`. |
| Cloud Run | 0.5 vCPU, 1 GiB, **min instances 1** (always warm, matches approved AWS) | `~$18-25` | Idle-instance charge plus request-based compute. |
| Artifact Registry | < 1 GB images | `$0-1` | Cleanup policy: keep last 10, delete untagged > 30 days. |
| Secret Manager | < 10 secrets, low access | `$0-2` | Depends on versions and reads. |
| Cloud Scheduler | 1 job | `$0` | Current free tier covers first 3 jobs per billing account. |
| Cloud Logging | 30-day retention | `$0-3` | Add exclusions for debug logs. |
| Data transfer out | < 10 GB | `$0-2` | Depends on traffic. |
| Cloud NAT / Load Balancer / GKE | Not used | `$0` | Direct VPC egress avoids Cloud NAT entirely — this is GCP's real saving vs. the AWS plan's $32/mo NAT Gateway. |
| **Total** |  | **`~$40-50/month`** | Below the approved AWS budget of `~$60-65/month`, with equivalent (no-cold-start) behavior. |
| + Zoho People / Analytics | If not already subscribed | `+$0-25` | Same open item as the AWS plan — check existing Uniqus subscription first. |

### Costs explicitly avoided

| Item | Why avoided |
|---|---|
| GKE | Too much platform overhead for one service; same reasoning as the AWS plan's EKS rejection. |
| External HTTP(S) Load Balancer | Cloud Run already provides HTTPS endpoint and custom domain mapping. |
| Cloud NAT | Not required — Direct VPC egress with private-ranges-only reaches Cloud SQL privately while still reaching the public internet for Zoho/Supabase. |
| Memorystore | Not needed until caching/session pressure appears. |
| BigQuery / Looker | Defer analytics warehouse cost — same as AWS plan. |
| Dedicated-core Cloud SQL | Better for SLA/performance, but not required for the initial budget target. |

---

## 11. Migration Phases and Roadmap

### Phase 0 - GCP project prep

- [ ] Confirm GCP billing account and project.
- [ ] Region: `us-central1` (closed decision, see §3).
- [ ] Enable APIs: Cloud Run, Cloud SQL Admin, Artifact Registry, Secret Manager, Cloud Scheduler, Cloud Build only if needed, Cloud Logging, Cloud Monitoring.
- [ ] Create budget alerts at `$40`, `$50`, and `$60`.
- [ ] Create service accounts and IAM bindings.

### Phase 1 - Database

- [ ] Create Cloud SQL PostgreSQL instance.
- [ ] Create database `rm_prod`.
- [ ] Create user `rm_app`.
- [ ] Export Supabase database.
- [ ] Import into Cloud SQL.
- [ ] Test schema, functions, and indexes.

### Phase 2 - Container and registry

- [ ] Confirm Next.js standalone Dockerfile.
- [ ] Create Artifact Registry repo.
- [ ] Build and push `rm-frontend` image.
- [ ] Add cleanup policy for old images.

### Phase 3 - Cloud Run

- [ ] Deploy `rm-frontend` Cloud Run service.
- [ ] Attach Cloud SQL instance.
- [ ] Configure secrets and environment variables.
- [ ] Set CPU, memory, concurrency, min/max instances.
- [ ] Validate app URL.

### Phase 4 - Domain and scheduled jobs

- [ ] Map `www.unisource.uniqus.com` to Cloud Run.
- [ ] Ask Uniqus IT to add required GoDaddy DNS records.
- [ ] Create Cloud Scheduler hourly sync.
- [ ] Test `/api/zoho/sync` with `x-sync-key`.

### Phase 5 - Observability and handover

- [ ] Set log retention to 30 days.
- [ ] Create alerts for Cloud Run 5xx, Cloud SQL CPU, DB storage, and budget.
- [ ] Document rollback and DB restore.
- [ ] Run final smoke tests and hand over.

---

## 12. Open Decisions

| Decision | Status |
|---|---|
| Final region | ✅ Decided — `us-central1`, matching the rationale behind the approved AWS `us-east-1` pick. |
| Cloud Run min instances | ✅ Decided — `1`, always warm, matching approved AWS behavior (no cold starts). |
| Cloud SQL IP mode | Open — Private IP preferred; public IP with connector is acceptable only if private setup delays launch. |
| Cloud SQL SLA tier | Open — Start `db-f1-micro`; upgrade when usage or SLA requires it. |
| DNS location | ✅ Decided — Keep GoDaddy, matches approved AWS plan. |
| CI/CD identity | Open — Prefer Workload Identity Federation for Jenkins; service account key only if Jenkins cannot federate. |

---

## Pricing and Documentation References

- Cloud Run pricing: https://cloud.google.com/run/pricing
- Cloud SQL pricing: https://cloud.google.com/sql/pricing
- Cloud Run to Cloud SQL: https://cloud.google.com/sql/docs/postgres/connect-run
- Artifact Registry pricing: https://cloud.google.com/artifact-registry/pricing
- Secret Manager pricing: https://cloud.google.com/secret-manager/pricing
- Cloud Scheduler pricing: https://cloud.google.com/scheduler/pricing
