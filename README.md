# Resource Management Platform

A full-stack internal web application for managing employee resources, tracking project allocations, monitoring utilization, and handling resource requests across departments and regions.

Built with **Next.js 16**, **TypeScript**, **Supabase (Postgres)**, and **Recharts**.

---

## Features

- **Dashboard** — Utilization stats, outlier detection (missed timesheets, low utilization, over-allocation), and drill-down charts
- **Resources** — Browse and filter the employee directory by department, region, designation, and skill
- **Projects** — View active projects and their resource allocations
- **Requests** — Raise, review, and approve resource requests with a full approval workflow
- **Forecasting** — Weekly resource allocation tracker ingested from Excel forecast sheets
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
| Auth | Supabase Auth (via SSR) |
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
git clone https://code.uniqus.com/sarveshagarwal/resource-management.git
cd resource-management
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local` with your Supabase credentials (found at **Supabase Dashboard ? Settings ? API**):

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
7. `supabase/functions.sql` — Creates RPC functions

### 4. Run the app

```bash
# Development
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

Refer to `FORECAST_SHEET_NOMENCLATURE.txt` for the expected Excel sheet format.

---

## Project Structure

```
app/
  (app)/          # Main app routes (dashboard, resources, projects, etc.)
  api/            # Next.js API routes
components/       # Reusable UI components
lib/
  ingestion/      # Excel parsing and Supabase ingestion logic
  supabase-*.ts   # Supabase client helpers
supabase/
  schema.sql      # Database schema
  migrations/     # Incremental schema changes
  functions.sql   # Postgres RPC functions
  seed.ts         # Data seeding script
```

---

## Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key (safe for browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only, keep secret) |
