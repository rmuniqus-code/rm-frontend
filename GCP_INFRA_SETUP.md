# Resource Management Platform - GCP Infrastructure Setup Runbook

> Version: 1.0 | Date: 2026-07-07 | Audience: Engineer provisioning GCP infra for the first time  
> Companion docs: [GCP_ARCHITECTURE.md](GCP_ARCHITECTURE.md), [GCP_COST_PLAN.md](GCP_COST_PLAN.md)

This is the GCP equivalent of the AWS setup runbook. It keeps the initial deployment small and cost-controlled while leaving a clear upgrade path.

---

## Table of Contents

0. [Prerequisites](#0-prerequisites)
1. [Project Prep](#1-project-prep)
2. [Networking](#2-networking)
3. [Cloud SQL PostgreSQL](#3-cloud-sql-postgresql)
4. [Artifact Registry](#4-artifact-registry)
5. [IAM Service Accounts](#5-iam-service-accounts)
6. [Secret Manager](#6-secret-manager)
7. [Cloud Run Deployment](#7-cloud-run-deployment)
8. [Custom Domain](#8-custom-domain)
9. [Jenkins CI/CD Setup](#9-jenkins-cicd-setup)
10. [Cloud Scheduler Jobs](#10-cloud-scheduler-jobs)
11. [Logging, Monitoring, and Alerts](#11-logging-monitoring-and-alerts)
12. [Validation Checklist](#12-validation-checklist)
13. [Operational Runbooks](#13-operational-runbooks)
14. [Cost Monitoring](#14-cost-monitoring)
15. [Disaster Recovery](#15-disaster-recovery)

---

## 0. Prerequisites

- [ ] GCP billing account enabled.
- [ ] GCP project created, for example `rm-platform-prod`.
- [ ] Region: `us-central1` (Iowa) — closed decision, matches the rationale behind the approved AWS `us-east-1` pick (lowest cost, no India/Doha requirement in the approved plan).
- [ ] Domain confirmed: `www.unisource.uniqus.com`, parent zone managed in GoDaddy by Uniqus IT.
- [ ] GitLab repository available for `rm-frontend`.
- [ ] Jenkins server can run Docker and `gcloud`.
- [ ] Zoho People and Zoho Analytics OAuth credentials available.
- [ ] Supabase project retained for Auth.
- [ ] Local tools installed:

```bash
brew install --cask google-cloud-sdk
brew install postgresql jq
gcloud version
psql --version
```

### Command conventions

Replace these values before running commands:

```bash
export PROJECT_ID="rm-platform-prod"
export REGION="us-central1"
export ZONE="us-central1-a"
export SERVICE_NAME="rm-frontend"
export DB_INSTANCE="rm-db-prod"
export DB_NAME="rm_prod"
export DB_USER="rm_app"
export AR_REPO="rm-containers"
export DOMAIN="www.unisource.uniqus.com"
```

---

## 1. Project Prep

### 1.1 Login and select project

```bash
gcloud auth login
gcloud config set project "$PROJECT_ID"
gcloud config set run/region "$REGION"
gcloud config set compute/region "$REGION"
gcloud config set compute/zone "$ZONE"
```

### 1.2 Enable required APIs

```bash
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  cloudscheduler.googleapis.com \
  cloudbuild.googleapis.com \
  logging.googleapis.com \
  monitoring.googleapis.com \
  servicenetworking.googleapis.com \
  compute.googleapis.com
```

### 1.3 Create budget alerts

Console: Billing -> Budgets & alerts -> Create budget

```
Name: rm-gcp-monthly-budget
Amount: $65/month
Alerts:
  66% actual    -> $43
  83% actual    -> $54
  100% forecast -> $65
Recipients: project owners + infra owner email group
```

---

## 2. Networking

Goal: create a minimal VPC for private Cloud SQL access without adding Cloud NAT or a load balancer.

### 2.1 Create VPC and subnet

```bash
gcloud compute networks create rm-vpc \
  --subnet-mode=custom

gcloud compute networks subnets create rm-subnet-app \
  --network=rm-vpc \
  --region="$REGION" \
  --range=10.10.0.0/24
```

### 2.2 Reserve private service access range for Cloud SQL

```bash
gcloud compute addresses create rm-private-service-range \
  --global \
  --purpose=VPC_PEERING \
  --prefix-length=24 \
  --network=rm-vpc
```

### 2.3 Connect private service access

```bash
gcloud services vpc-peerings connect \
  --service=servicenetworking.googleapis.com \
  --ranges=rm-private-service-range \
  --network=rm-vpc
```

### 2.4 Validate networking

```bash
gcloud compute networks peerings list --network=rm-vpc
gcloud compute addresses describe rm-private-service-range --global
```

Expected:

- VPC peering exists for `servicenetworking-googleapis-com`.
- Reserved private range is attached to `rm-vpc`.

---

## 3. Cloud SQL PostgreSQL

Goal: create a minimal managed PostgreSQL instance similar to AWS RDS `db.t4g.micro`.

### 3.1 Generate DB password

```bash
openssl rand -base64 24
```

Save the value temporarily as `<DB_PASSWORD>`.

### 3.2 Create Cloud SQL instance

Minimal cost start:

```bash
gcloud sql instances create "$DB_INSTANCE" \
  --database-version=POSTGRES_16 \
  --tier=db-f1-micro \
  --region="$REGION" \
  --storage-type=SSD \
  --storage-size=20GB \
  --storage-auto-increase \
  --availability-type=ZONAL \
  --network=rm-vpc \
  --no-assign-ip \
  --backup-start-time=02:00 \
  --retained-backups-count=7 \
  --maintenance-window-day=SUN \
  --maintenance-window-hour=3 \
  --deletion-protection
```

If private IP setup blocks launch, fallback option:

```bash
gcloud sql instances patch "$DB_INSTANCE" --assign-ip
```

Use this only as a temporary launch fallback. Keep authorized networks restricted and move back to private IP after validation.

### 3.3 Create database and user

```bash
gcloud sql databases create "$DB_NAME" \
  --instance="$DB_INSTANCE"

gcloud sql users create "$DB_USER" \
  --instance="$DB_INSTANCE" \
  --password="<DB_PASSWORD>"
```

### 3.4 Validate instance

```bash
gcloud sql instances describe "$DB_INSTANCE" \
  --format="table(name,region,databaseVersion,settings.tier,settings.dataDiskSizeGb,settings.availabilityType,ipAddresses.ipAddress)"
```

Expected:

- Tier is `db-f1-micro`.
- Storage is `20`.
- Availability is `ZONAL`.
- Public IP is absent if `--no-assign-ip` worked.

---

## 4. Artifact Registry

Goal: create the GCP equivalent of ECR.

### 4.1 Create Docker repository

```bash
gcloud artifacts repositories create "$AR_REPO" \
  --repository-format=docker \
  --location="$REGION" \
  --description="RM Platform container images"
```

### 4.2 Configure Docker authentication

```bash
gcloud auth configure-docker "$REGION-docker.pkg.dev"
```

### 4.3 Image naming convention

```
$REGION-docker.pkg.dev/$PROJECT_ID/$AR_REPO/rm-frontend:<git-sha>
$REGION-docker.pkg.dev/$PROJECT_ID/$AR_REPO/rm-frontend:latest
```

### 4.4 Cleanup policy

Console: Artifact Registry -> rm-containers -> Cleanup policies

Recommended:

```
Keep: latest 10 tagged images
Delete: untagged images older than 30 days
```

---

## 5. IAM Service Accounts

### 5.1 Cloud Run runtime service account

```bash
gcloud iam service-accounts create rm-cloudrun-sa \
  --display-name="RM Cloud Run runtime"
```

Grant runtime permissions:

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:rm-cloudrun-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/cloudsql.client"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:rm-cloudrun-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:rm-cloudrun-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/logging.logWriter"
```

### 5.2 Jenkins deploy service account

```bash
gcloud iam service-accounts create jenkins-gcp-deploy \
  --display-name="Jenkins GCP deploy"
```

Grant deploy permissions:

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:jenkins-gcp-deploy@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:jenkins-gcp-deploy@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.developer"

gcloud iam service-accounts add-iam-policy-binding \
  "rm-cloudrun-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --member="serviceAccount:jenkins-gcp-deploy@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

Preferred Jenkins auth: Workload Identity Federation. If not available, create a service account key as a temporary exception and rotate it.

---

## 6. Secret Manager

### 6.1 Create secrets

```bash
printf '%s' '<DB_PASSWORD>' | gcloud secrets create rm-prod-db-password --data-file=-
printf '%s' '<ZOHO_CLIENT_ID>' | gcloud secrets create rm-prod-zoho-client-id --data-file=-
printf '%s' '<ZOHO_CLIENT_SECRET>' | gcloud secrets create rm-prod-zoho-client-secret --data-file=-
printf '%s' '<ZOHO_REFRESH_TOKEN>' | gcloud secrets create rm-prod-zoho-refresh-token --data-file=-
printf '%s' '<SUPABASE_URL>' | gcloud secrets create rm-prod-supabase-url --data-file=-
printf '%s' '<SUPABASE_ANON_KEY>' | gcloud secrets create rm-prod-supabase-anon-key --data-file=-
printf '%s' '<SUPABASE_JWT_SECRET>' | gcloud secrets create rm-prod-supabase-jwt-secret --data-file=-
printf '%s' '<SYNC_TRIGGER_KEY>' | gcloud secrets create rm-prod-sync-trigger-key --data-file=-
```

### 6.2 Create database URL secret

For Cloud SQL Unix socket:

```bash
printf '%s' "postgresql://$DB_USER:<DB_PASSWORD>@/$DB_NAME?host=/cloudsql/$PROJECT_ID:$REGION:$DB_INSTANCE" \
  | gcloud secrets create rm-prod-database-url --data-file=-
```

### 6.3 Validate secret access

```bash
gcloud secrets versions access latest --secret=rm-prod-database-url
```

Do not paste secret values into tickets or docs.

---

## 7. Cloud Run Deployment

### 7.1 Confirm Dockerfile requirements

The Next.js container should:

```dockerfile
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
```

`next.config.ts` should include:

```typescript
const config = {
  output: 'standalone',
}
export default config
```

### 7.2 Build and push image manually

Run from `rm-app/rm-frontend`:

```bash
export IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$AR_REPO/rm-frontend:latest"

docker build -t "$IMAGE" .
docker push "$IMAGE"
```

### 7.3 Deploy Cloud Run

Sizing below (`min-instances=1`, `max-instances=4`, `concurrency=100`) matches the approved AWS App Runner configuration — no cold starts, same behavior as what was signed off for AWS.

```bash
gcloud run deploy "$SERVICE_NAME" \
  --image="$IMAGE" \
  --region="$REGION" \
  --platform=managed \
  --service-account="rm-cloudrun-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --allow-unauthenticated \
  --port=8080 \
  --cpu=0.5 \
  --memory=1Gi \
  --concurrency=100 \
  --min-instances=1 \
  --max-instances=4 \
  --add-cloudsql-instances="$PROJECT_ID:$REGION:$DB_INSTANCE" \
  --vpc-network=rm-vpc \
  --vpc-subnet=rm-subnet-app \
  --vpc-egress=private-ranges-only \
  --set-env-vars="NODE_ENV=production" \
  --set-secrets="DATABASE_URL=rm-prod-database-url:latest,SUPABASE_URL=rm-prod-supabase-url:latest,SUPABASE_ANON_KEY=rm-prod-supabase-anon-key:latest,SUPABASE_JWT_SECRET=rm-prod-supabase-jwt-secret:latest,ZOHO_CLIENT_ID=rm-prod-zoho-client-id:latest,ZOHO_CLIENT_SECRET=rm-prod-zoho-client-secret:latest,ZOHO_REFRESH_TOKEN=rm-prod-zoho-refresh-token:latest,SYNC_TRIGGER_KEY=rm-prod-sync-trigger-key:latest"
```

**Health check note:** the approved AWS plan checks `/api/health`, but no such route exists in the app — the only health route in the repo is `app/healthz/route.ts` (currently uncommitted). `gcloud run deploy` has no plain flag for an HTTP startup probe; it requires a service YAML (`startupProbe.httpGet.path`) applied via `gcloud run services replace`. Before relying on this in production, either commit `app/healthz/` and add an explicit `startupProbe`/`livenessProbe` pointing at `/healthz`, or build `/api/health` to match what AWS approved — otherwise Cloud Run falls back to a bare TCP check on port 8080.

### 7.4 Validate service

```bash
gcloud run services describe "$SERVICE_NAME" \
  --region="$REGION" \
  --format="value(status.url)"
```

Open the returned URL and test:

- Home page loads.
- Login flow works.
- API routes return expected responses.
- App can read/write Cloud SQL.

---

## 8. Custom Domain

Goal: map `www.unisource.uniqus.com` to Cloud Run while keeping DNS in GoDaddy.

### 8.1 Verify domain ownership

Console: Cloud Run -> Custom domains -> Add mapping

Follow Google verification prompt. Uniqus IT may need to add a TXT record in GoDaddy.

### 8.2 Create Cloud Run domain mapping

```bash
gcloud beta run domain-mappings create \
  --service="$SERVICE_NAME" \
  --domain="$DOMAIN" \
  --region="$REGION"
```

### 8.3 Get required DNS records

```bash
gcloud beta run domain-mappings describe "$DOMAIN" \
  --region="$REGION"
```

Ask Uniqus IT to add the returned CNAME/TXT records in GoDaddy.

### 8.4 Validate

```bash
curl -I "https://$DOMAIN"
```

Expected:

- HTTP 200 or 302.
- TLS certificate is valid.

---

## 9. Jenkins CI/CD Setup

### 9.1 Jenkins plugins

Required:

- GitLab plugin or webhook trigger support.
- Docker available on Jenkins worker.
- Google Cloud SDK installed.
- Credentials binding plugin.

### 9.2 Jenkins credentials

Preferred:

- Workload Identity Federation from Jenkins to GCP.

Fallback:

- Store service account JSON for `jenkins-gcp-deploy`.
- Rotate key every 90 days.

### 9.3 Jenkinsfile sketch

```groovy
pipeline {
  agent any

  environment {
    PROJECT_ID = 'rm-platform-prod'
    REGION = 'us-central1'
    AR_REPO = 'rm-containers'
    SERVICE_NAME = 'rm-frontend'
    IMAGE_TAG = "${GIT_COMMIT.take(8)}"
    IMAGE = "${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/rm-frontend:${IMAGE_TAG}"
    IMAGE_LATEST = "${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/rm-frontend:latest"
  }

  options {
    timeout(time: 20, unit: 'MINUTES')
    disableConcurrentBuilds()
    timestamps()
  }

  stages {
    stage('Checkout') {
      steps { checkout scm }
    }

    stage('Auth GCP') {
      steps {
        sh '''
          gcloud config set project ${PROJECT_ID}
          gcloud auth configure-docker ${REGION}-docker.pkg.dev --quiet
        '''
      }
    }

    stage('Build image') {
      steps {
        sh '''
          docker build -t ${IMAGE} -t ${IMAGE_LATEST} .
        '''
      }
    }

    stage('Push image') {
      steps {
        sh '''
          docker push ${IMAGE}
          docker push ${IMAGE_LATEST}
        '''
      }
    }

    stage('Deploy Cloud Run') {
      steps {
        sh '''
          gcloud run deploy ${SERVICE_NAME} \
            --image=${IMAGE} \
            --region=${REGION} \
            --quiet
        '''
      }
    }
  }
}
```

---

## 10. Cloud Scheduler Jobs

### 10.1 Create hourly Zoho sync

```bash
export APP_URL="https://$DOMAIN"

gcloud scheduler jobs create http rm-zoho-hourly-sync \
  --location="$REGION" \
  --schedule="0 * * * *" \
  --uri="$APP_URL/api/zoho/sync" \
  --http-method=POST \
  --headers="Content-Type=application/json,x-sync-key=<SYNC_TRIGGER_KEY>" \
  --message-body='{"source":"cloud-scheduler","type":"hourly"}' \
  --time-zone="Asia/Kolkata" \
  --attempt-deadline=180s
```

### 10.2 Validate scheduler job

```bash
gcloud scheduler jobs run rm-zoho-hourly-sync --location="$REGION"
gcloud scheduler jobs describe rm-zoho-hourly-sync --location="$REGION"
```

Check Cloud Run logs for the sync request.

---

## 11. Logging, Monitoring, and Alerts

### 11.1 Cloud Run logs

```bash
gcloud logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=$SERVICE_NAME" \
  --limit=50 \
  --format=json
```

### 11.2 Set log retention

Console: Logging -> Logs Storage -> `_Default` bucket -> Edit retention

```
Retention: 30 days
```

### 11.3 Recommended alerts

Create in Cloud Monitoring:

| Alert | Condition |
|---|---|
| Cloud Run 5xx | 5xx responses > 1% for 5 minutes |
| Cloud Run latency | p95 latency > 3 seconds for 10 minutes |
| Cloud SQL CPU | CPU > 80% for 10 minutes |
| Cloud SQL storage | Free storage < 20% |
| Cloud SQL connections | Connections > 80% of expected safe limit |
| Budget | Actual `$40`, `$50`, forecast `$60` |

---

## 12. Validation Checklist

- [ ] Cloud Run URL loads.
- [ ] Custom domain `https://www.unisource.uniqus.com` loads.
- [ ] TLS certificate is valid.
- [ ] Login works through Supabase Auth.
- [ ] Protected page rejects unauthenticated users.
- [ ] Dashboard API reads from Cloud SQL.
- [ ] Excel upload writes rows to Cloud SQL.
- [ ] Zoho hourly sync endpoint works with `x-sync-key`.
- [ ] Cloud Run service account has no broad owner/editor role.
- [ ] Cloud SQL has backups enabled.
- [ ] Cloud SQL deletion protection enabled.
- [ ] Artifact Registry cleanup policy enabled.
- [ ] Budget alerts configured.

---

## 13. Operational Runbooks

### 13.1 Rotate DB password

```bash
gcloud sql users set-password "$DB_USER" \
  --instance="$DB_INSTANCE" \
  --password="<NEW_DB_PASSWORD>"

printf '%s' '<NEW_DATABASE_URL>' | gcloud secrets versions add rm-prod-database-url --data-file=-

gcloud run services update "$SERVICE_NAME" \
  --region="$REGION" \
  --update-secrets="DATABASE_URL=rm-prod-database-url:latest"
```

### 13.2 Roll back Cloud Run image

List revisions:

```bash
gcloud run revisions list \
  --service="$SERVICE_NAME" \
  --region="$REGION"
```

Shift traffic back:

```bash
gcloud run services update-traffic "$SERVICE_NAME" \
  --region="$REGION" \
  --to-revisions="<OLD_REVISION>=100"
```

### 13.3 Increase Cloud Run size

```bash
gcloud run services update "$SERVICE_NAME" \
  --region="$REGION" \
  --cpu=1 \
  --memory=2Gi \
  --concurrency=40
```

### 13.4 Keep one warm instance

```bash
gcloud run services update "$SERVICE_NAME" \
  --region="$REGION" \
  --min-instances=1
```

### 13.5 Resize Cloud SQL

```bash
gcloud sql instances patch "$DB_INSTANCE" \
  --tier=db-g1-small
```

### 13.6 Restore Cloud SQL backup

List backups:

```bash
gcloud sql backups list --instance="$DB_INSTANCE"
```

Restore:

```bash
gcloud sql backups restore <BACKUP_ID> \
  --restore-instance="$DB_INSTANCE"
```

---

## 14. Cost Monitoring

### 14.1 Expected steady-state

Full breakdown in [GCP_COST_PLAN.md](GCP_COST_PLAN.md). Summary (`us-central1`, `min-instances=1` to match approved AWS behavior):

| Service | Monthly |
|---|---:|
| Cloud SQL `db-f1-micro` + 20 GB SSD | `~$11-15` |
| Cloud Run 0.5 vCPU / 1 GiB, min 1 (always warm) | `~$18-25` |
| Artifact Registry | `$0-1` |
| Secret Manager | `$0-2` |
| Cloud Scheduler | `$0` |
| Cloud Logging | `$0-3` |
| Data transfer out | `$0-2` |
| **Total** | **`~$40-50`** |

### 14.2 Cost controls

- Keep Cloud Run max instances at `4` (matches approved AWS `max=4`).
- Keep Cloud Run min instances at `1` to preserve the approved no-cold-start behavior; drop to `0` only if that tradeoff is re-approved.
- Keep Cloud SQL at `db-f1-micro` until CPU/memory metrics justify upgrade.
- Do not add Cloud NAT, GKE, external load balancer, Memorystore, or BigQuery in phase 1.
- Use Artifact Registry cleanup.
- Set log retention to 30 days.

### 14.3 Labels for cost attribution

Apply labels:

```bash
gcloud run services update "$SERVICE_NAME" \
  --region="$REGION" \
  --labels=app=rm-platform,env=prod,owner=uniqus

gcloud sql instances patch "$DB_INSTANCE" \
  --update-labels=app=rm-platform,env=prod,owner=uniqus
```

---

## 15. Disaster Recovery

| Failure | RTO | RPO | Recovery |
|---|---:|---:|---|
| Cloud Run bad deploy | 5-10 min | 0 | Shift traffic to previous revision. |
| Cloud SQL instance issue | 30-60 min | Last backup/PITR setting | Restore backup or upgrade/repair instance. |
| Data corruption | 30-60 min | Depends on backup/PITR | Restore backup to new instance, validate, point app to restored DB. |
| Secret leaked | 15-30 min | 0 | Rotate secret, add new Secret Manager version, redeploy. |
| Region outage | Manual | Last backup/export | Recreate Cloud Run and Cloud SQL in secondary region. Not automated in minimal phase. |

---

## Pricing and Documentation References

- Cloud Run pricing: https://cloud.google.com/run/pricing
- Cloud SQL pricing: https://cloud.google.com/sql/pricing
- Cloud Run to Cloud SQL: https://cloud.google.com/sql/docs/postgres/connect-run
- Cloud Run custom domains: https://cloud.google.com/run/docs/mapping-custom-domains
- Artifact Registry pricing: https://cloud.google.com/artifact-registry/pricing
- Secret Manager pricing: https://cloud.google.com/secret-manager/pricing
- Cloud Scheduler pricing: https://cloud.google.com/scheduler/pricing
