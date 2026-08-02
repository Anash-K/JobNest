# JobNest — Job Outreach CRM

Monorepo for managing job leads, building email drafts, Gmail outreach, and pipeline tracking.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15, TypeScript, Tailwind, shadcn/ui |
| Backend | Express.js, Prisma, PostgreSQL |
| Database | [Neon PostgreSQL](https://neon.tech) (serverless, pooled) |
| Shared | `@jobhunter/shared` — types, constants, query parsers |

## Prerequisites

- Node.js 20+
- pnpm 9+
- A [Neon](https://neon.tech) PostgreSQL project (recommended for dev and production)

## Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Edit `apps/api/.env` and set your **Neon pooled connection string**:

```env
DATABASE_URL=postgresql://USER:PASSWORD@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require
```

Use the **pooled** endpoint from the Neon dashboard (hostname contains `-pooler`). SSL is required (`sslmode=require`).

Fill in the remaining required API variables (`BETTER_AUTH_SECRET`, `ENCRYPTION_KEY`, `GOOGLE_*`, etc.) — see `apps/api/.env.example`.

For the web app, defaults in `apps/web/.env` point at the local API (`http://localhost:4000`). Change them only if your API runs elsewhere — see `apps/web/.env.example`.

```bash
# 3. Generate Prisma client & apply migrations to Neon
pnpm db:generate
pnpm db:migrate:deploy

# 4. Build shared package
pnpm --filter @jobhunter/shared build

# 5. Start dev servers (API + Web)
pnpm dev
```

- **Web:** http://localhost:3000
- **API:** http://localhost:4000
- **Health:** http://localhost:4000/api/v1/health

## Database (Neon)

JobNest uses **Neon PostgreSQL** as the primary database for development and production.

| Command | Description |
|---|---|
| `pnpm db:generate` | Generate Prisma Client |
| `pnpm db:migrate:deploy` | Apply pending migrations to Neon (production-safe) |
| `pnpm db:migrate` | Create/apply migrations in dev (`prisma migrate dev`) |
| `pnpm db:studio` | Open Prisma Studio against `DATABASE_URL` |

### Optional: local PostgreSQL via Docker

For offline development without Neon, you can run a local Postgres container:

```bash
pnpm db:up
```

Set `DATABASE_URL=postgresql://jobhunter:jobhunter@localhost:5432/jobhunter` in `apps/api/.env` instead of the Neon URL.

## Project Structure

```
jobhunter/
├── apps/
│   ├── api/          Express API + Prisma
│   └── web/          Next.js frontend
├── packages/
│   └── shared/       Shared types & constants
└── docs/
    └── IMPLEMENTATION.md
```

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Run API + Web in parallel |
| `pnpm dev:api` | API only |
| `pnpm dev:web` | Web only |
| `pnpm build` | Build all packages |
| `pnpm db:migrate:deploy` | Apply migrations to Neon |
| `pnpm db:studio` | Open Prisma Studio |

See [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md) for the full roadmap.

## Deploy frontend (Vercel)

Root Directory: **`apps/web`**

| Setting | Value |
|---|---|
| Framework | Next.js |
| Install Command | `cd ../.. && pnpm install --frozen-lockfile` |
| Build Command | `pnpm run build` |
| Output Directory | *(default — leave empty)* |
| Node.js Version | 20.x |
| Package Manager | pnpm 9.15.0 (from root `packageManager` field) |

**Required environment variables** (Vercel project → Settings → Environment Variables):

| Variable | Example | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.yourdomain.com/api/v1` | Production API base URL |
| `NEXT_PUBLIC_AUTH_URL` | `https://api.yourdomain.com` | Better Auth server origin |

No backend secrets (`DATABASE_URL`, `ENCRYPTION_KEY`, etc.) are needed for the frontend build.

The web `prebuild` script compiles `@jobhunter/shared` before `next build` — required because shared `dist/` is not committed.

## Deploy backend (Render)

Root Directory: **`apps/api`**

| Setting | Value |
|---|---|
| Runtime | Node |
| Install Command | `cd ../.. && pnpm install --frozen-lockfile` |
| Build Command | `cd ../.. && pnpm --filter @jobhunter/api build && pnpm --filter @jobhunter/api exec prisma migrate deploy` |
| Start Command | `node dist/index.js` |
| Health Check Path | `/api/v1/health` |
| Node.js Version | `20` (see root `.node-version` and `packageManager`) |

**Required environment variables** (Render → Environment):

| Variable | Example | Notes |
|---|---|---|
| `NODE_ENV` | `production` | Enables secure cookies, production logging |
| `DATABASE_URL` | `postgresql://...@ep-xxx-pooler.neon.tech/neondb?sslmode=require` | Neon **pooled** connection string |
| `BETTER_AUTH_SECRET` | *(openssl rand -base64 32)* | Min 32 chars |
| `BETTER_AUTH_URL` | `https://your-api.onrender.com` | Public API URL (no trailing slash) |
| `CORS_ORIGIN` | `https://your-app.vercel.app` | Vercel frontend URL |
| `GOOGLE_CLIENT_ID` | *(from Google Cloud Console)* | Required at startup |
| `GOOGLE_CLIENT_SECRET` | *(from Google Cloud Console)* | Required at startup |
| `GOOGLE_REDIRECT_URI` | `https://your-api.onrender.com/api/v1/gmail/callback` | Must match Google OAuth config |
| `ENCRYPTION_KEY` | *(openssl rand -hex 32)* | 64-char hex string |

**Optional (defaults in code):**

| Variable | Default |
|---|---|
| `PORT` | `4000` (Render sets `PORT` automatically) |
| `UPLOAD_DIR` | `./uploads` (ephemeral on Render; add a [persistent disk](https://render.com/docs/disks) for resume storage) |
| `MAX_RESUME_SIZE_MB` | `5` |
| `BULK_SEND_DELAY_SECONDS` | `25` |
| `BULK_SEND_MAX_RETRIES` | `3` |
| `BULK_SEND_DAILY_WARN_THRESHOLD` | `400` |

A [`render.yaml`](render.yaml) blueprint is included for one-click deploy. Migrations run during the build step via `prisma migrate deploy` (requires `DATABASE_URL` at build time).
