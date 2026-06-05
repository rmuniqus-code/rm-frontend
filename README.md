# Resource Management Platform — Frontend

Internal web application for managing employee resources, tracking project allocations, monitoring utilization, and handling resource requests across departments and regions.

Built with **Next.js 16**, **TypeScript**, **Supabase (Postgres)**, and **Recharts**.

---

## Features

- **Dashboard** — Utilization stats, outlier detection (missed timesheets, low utilization, over-allocation), and drill-down charts
- **Resources** — Browse and filter the employee directory by department, region, designation, and skill
- **Projects** — View active projects and their resource allocations
- **Requests** — Raise, review, and approve resource requests with a full approval workflow
- **Forecasting** — Weekly resource allocation tracker ingested from Excel forecast sheets
- **Chargeability & Performance** — Chargeability tracking and performance metrics
- **Roles & Permissions** — Role-based access control management
- **Audit Trail** — Full change log of all platform actions
- **Admin** — Upload Excel data files (timesheet compliance, forecast, skill mapping) to seed/update the database
- **Version History** — Track uploaded file versions

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (SSR) |
| Charts | Recharts |
| Styling | Styled Components + Tailwind CSS |
| Excel Parsing | xlsx |

---

## Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project

---

## Setup

### 1. Clone and install

```bash
git clone https://code.uniqus.com/sarveshagarwal/rm-frontend.git
cd rm-frontend
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local` with your Supabase credentials (found at **Supabase Dashboard → Settings → API**):

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 3. Set up the database

Run the following SQL files against your Supabase project **in order** using the Supabase SQL Editor:

1. `supabase/schema.sql` — Creates all tables
2. `supabase/migrations/001_enhancements.sql`
3. `supabase/migrations/002_outliers_rpc.sql`
4. `supabase/migrations/003_allocations.sql`
5. `supabase/migrations/004_skill_mapping.sql`
6. `supabase/migrations/005_request_service_line.sql`
7. `supabase/migrations/010_notification_metadata.sql`
8. `supabase/migrations/011_role_permissions.sql`
9. `supabase/functions.sql` — Creates RPC functions

### 4. Run the app

```bash
# Development (Turbopack)
npm run dev

# Production build
npm run build
npm start
```

The app runs at `http://localhost:3000`.

---

## Loading Data

Data is ingested from Excel files via the **Admin** page in the UI, or via the seed script:

```bash
NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx supabase/seed.ts
```

The seed script expects these files in `~/Downloads`:
- `Employee_Timesheet_Compliance_1-31_March.xlsx`
- `Regionwise view.xlsx`

Refer to `FORECAST_SHEET_NOMENCLATURE.txt` for the expected Excel forecast sheet format.

---

## Project Structure

```
app/
  (app)/                        # Authenticated app routes
    dashboard/
    resources/
    projects/
    requests/
    approvals/
    forecasting/
    chargeability-performance/
    roles-permissions/
    admin/
    audit-trail/
    version-history/
  api/                          # Next.js API routes
  login/
  signup/
components/
  booking/
  dashboard/
  layout/
  requests/
  shared/
lib/
  api.ts                        # Single HTTP client for backend calls
  ingestion/                    # Excel parsing and Supabase ingestion logic
  server/                       # Server-only utilities
hooks/                          # Custom React hooks
utils/
  supabase/
    client.ts                   # Browser Supabase client
    server.ts                   # Server Supabase client
supabase/
  schema.sql                    # Full database schema
  migrations/                   # Incremental schema changes
  functions.sql                 # Postgres RPC functions
  seed.ts                       # Data seeding script
```

---

## Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key (safe for browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only — keep secret) |

---

## API Routes

All backend logic is colocated in this repository under `app/api/`. There is no separate backend server — Next.js API routes handle everything, calling Supabase directly using the service role key (server-only). All routes authenticate the caller via the Supabase JWT in the request cookie before executing.
