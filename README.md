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
cp apps/web/.env.example apps/web/.env.local
```

Edit `apps/api/.env` and set your **Neon pooled connection string**:

```env
DATABASE_URL=postgresql://USER:PASSWORD@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require
```

Use the **pooled** endpoint from the Neon dashboard (hostname contains `-pooler`). SSL is required (`sslmode=require`).

Fill in the remaining required variables (`BETTER_AUTH_SECRET`, `ENCRYPTION_KEY`, `GOOGLE_*`, etc.) — see `apps/api/.env.example`.

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
