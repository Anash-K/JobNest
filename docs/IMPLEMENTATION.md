# Job Outreach CRM — Production-Grade Multi-Tenant Implementation Document

> **Production-grade multi-tenant platform** for automating job outreach: import leads from Excel, build and review personalized email drafts, approve, send via Gmail, and track applications on a Kanban pipeline — all in a secure, isolated workspace per user.

This system is optimized for multiple concurrent users. It guarantees complete data isolation between tenants, secure session-based authentication via Better Auth, and high-performance queries on Neon PostgreSQL.

---

## Table of Contents

1. [Overview & Constraints](#1-overview--constraints)
2. [Architecture & Request Lifecycle](#2-architecture--request-lifecycle)
3. [Repository Structure](#3-repository-structure)
4. [Database Schema](#4-database-schema)
5. [API Design](#5-api-design)
6. [Module & System Workflows](#6-module--system-workflows)
7. [Shared Services & Utils](#7-shared-services--utils)
8. [Frontend Structure & UI](#8-frontend-structure--ui)
9. [Environment & Configuration](#9-environment--configuration)
10. [Implementation Phases](#10-implementation-phases)
11. [Security & Operational Notes](#11-security--operational-notes)

---

## 1. Overview & Constraints

### 1.1 Core Value Proposition

The system implements the high-value outreach funnel:


```text
Excel Import → Build Email Drafts → Review & Approve → Gmail Send → Pipeline Tracking
```

* **No direct sends:** The system never sends emails directly after selecting leads. All emails are built first as drafts, reviewed, validated, approved, and then sent.
* **Multi-tenant isolation:** A user can only see, edit, or interact with their own campaigns, leads, templates, resumes, applications, and logs.

### 1.2 Phase 1 Multi-User Constraints

| Feature / Limit | Specification |
| --- | --- |
| **Users & Roles** | Multi-user support with `USER` and `ADMIN` role enum. Only `USER` is active in Phase 1. |
| **Authentication** | Better Auth with session cookies. Registration, Login, Logout, Forgot Password, Reset Password. |
| **Data Isolation** | Root-level and business entities contain `userId` foreign keys. APIs verify ownership. |
| **Google OAuth** | **Single Global OAuth Application** configured in `.env`. Users authorize their Gmail account using this global app. |
| **Token Storage** | DB stores only encrypted `refreshToken`. Short-lived `accessToken` cached strictly **in-memory** (1 hour TTL). |
| **Resume Versioning** | Self-referencing version tree. Replacing a resume archives the old version and creates a new one; historical drafts point to the archived version. |
| **Email Queue** | In-process sequential sender with configurable delay (default 25s) and randomized jitter. No BullMQ/Redis required for MVP. |
| **Gmail Quotas** | Out of scope. Google does not expose reliable quota APIs; sending uses sequential delays. |

---

## 2. Architecture & Request Lifecycle

### 2.1 High-Level Diagram


```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                    Next.js Multi-Tenant Frontend (App Router)                │
│  Login │ Pipeline │ Dashboard │ Settings │ Draft Review │ Templates │ Build  │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │ HTTP / JSON (CORS / Cookies / Session token)
┌──────────────────────────────▼───────────────────────────────────────────────┐
│                    Express.js Backend & API Server                           │
│  ┌───────────────────────────┐ ┌──────────────────────────────────────────┐  │
│  │   Better Auth Middleware  │ │        Ownership Check Middleware        │  │
│  │   (Validates session cookie)│ │   (Validates user owns requested resource)│  │
│  └─────────────┬─────────────┘ └────────────────────┬─────────────────────┘  │
│                │                                    │                        │
│  ┌─────────────▼─────────────┐ ┌────────────────────▼─────────────────────┐  │
│  │     Leads & Campaigns     │ │       Email Build & Review Engine        │  │
│  └───────────────────────────┘ └──────────────────────────────────────────┘  │
│  ┌───────────────────────────┐ ┌──────────────────────────────────────────┐  │
│  │     Resumes (Versioned)   │ │       Gmail Sender (Memory Cache)        │  │
│  └───────────────────────────┘ └──────────────────────────────────────────┘  │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │ Prisma Client (Tenant Filters)
┌──────────────────────────────▼───────────────────────────────────────────────┐
│                        Neon PostgreSQL Database                              │
│  users │ sessions │ accounts │ campaigns │ job_leads │ generated_emails      │
│  resumes │ email_templates │ applications │ email_logs                       │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Request & Security Lifecycle

1. **Authentication:** The client sends credentials to `/api/v1/auth/login`. Better Auth issues a secure, HTTP-only session cookie.
2. **Routing Gate:** Every business API route is protected by `requireAuth` middleware. This fetches the session and mounts `req.user` (with `id` and `role`).
3. **Resource Ownership Guard:** If an API endpoint contains an ID param (e.g., `/leads/:id`), a generic guard intercepts the request and queries the table. If `record.userId !== req.user.id`, the server returns a `404 Not Found` (never `403`), preventing resource existence leakage.
4. **Data Isolation:** Queries fetch rows using tenant filters:

```typescript
prisma.campaign.findMany({ where: { userId: req.user.id } })
```

---

## 3. Repository Structure


```text
jobhunter/
├── apps/
│   ├── api/
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   ├── src/
│   │   │   ├── app.ts
│   │   │   ├── index.ts
│   │   │   ├── config/
│   │   │   │   └── env.ts            # Fail-fast startup validations
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts           # Better Auth check
│   │   │   │   └── ownership.ts      # Resource verification
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts           # Better Auth endpoint mounts
│   │   │   │   ├── campaigns.ts
│   │   │   │   ├── leads.ts
│   │   │   │   ├── resumes.ts
│   │   │   │   └── ...
│   │   │   └── services/
│   │   │       ├── auth.service.ts
│   │   │       ├── bulk-send.service.ts  # Background sender & memory cache
│   │   │       └── ...
│   └── web/
│       ├── app/
│       │   ├── (auth)/
│       │   │   ├── login/
│       │   │   ├── register/
│       │   │   ├── forgot-password/
│       │   │   └── reset-password/
│       │   ├── (app)/
│       │   │   ├── layout.tsx        # Session-aware navigation & sidebar
│       │   │   ├── pipeline/
│       │   │   ├── settings/         # Profile, Connected Gmail, Resumes
│       │   │   └── ...
```

---

## 4. Database Schema

### 4.1 Prisma Schema


```prisma

// apps/api/prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  USER
  ADMIN
}

enum PipelineStatus {
  NEW
  READY_TO_APPLY
  APPLIED
  REPLIED
  INTERVIEW
  REJECTED
  OFFER
}

enum EmailLogStatus {
  PENDING
  SENDING
  SENT
  FAILED
}

enum GeneratedEmailStatus {
  DRAFT
  APPROVED
  SENT
  FAILED
}

enum EmailFailureReason {
  INVALID_EMAIL
  GMAIL_LIMIT
  TIMEOUT
  NETWORK_ERROR
  ATTACHMENT_ERROR
  MISSING_VARIABLES
  GMAIL_NOT_CONNECTED
  DRAFT_NOT_APPROVED
  DRAFT_INVALID
}

enum LeadSource {
  MANUAL
  EXCEL_IMPORT
  LINKEDIN
  OTHER
}
```
```prisma
// Better Auth Models
model User {
  id            String    @id @default(cuid())
  name          String
  email         String    @unique
  emailVerified Boolean   @default(false)
  image         String?
  role          Role      @default(USER)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  sessions      Session[]
  accounts      Account[]
  
  // Settings & Preferences
  defaultDelaySeconds Int     @default(25)
  defaultResumeId     String?
  defaultTemplateId   String?

  campaigns        Campaign[]
  resumes          Resume[]
  jobLeads         JobLead[]
  emailTemplates   EmailTemplate[]
  generatedEmails  GeneratedEmail[]
  applications     Application[]
  emailLogs        EmailLog[]
  gmailAccount     GmailAccount?

  @@map("user")
}

model Session {
  id        String   @id
  expiresAt DateTime
  token     String   @unique
  createdAt DateTime
  updatedAt DateTime
  ipAddress String?
  userAgent String?
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("session")
  @@index([userId])
}

model Account {
  id                    String    @id
  accountId             String
  providerId            String
  userId                String
  user                  User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  accessToken           String?
  refreshToken          String?
  idToken               String?
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope                 String?
  password              String?
  createdAt             DateTime
  updatedAt             DateTime

  @@map("account")
  @@index([userId])
}

model Verification {
  id         String    @id
  identifier String
  value      String
  expiresAt  DateTime
  createdAt  DateTime?
  updatedAt  DateTime?

  @@map("verification")
}
```
```prisma
// Gmail Connection
model GmailAccount {
  id                    String   @id @default(cuid())
  userId                String   @unique
  email                 String
  encryptedRefreshToken String
  scopes                String
  connectedAt           DateTime @default(now())
  updatedAt             DateTime @updatedAt

  user                  User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```
```prisma
// Campaign Model
model Campaign {
  id          String   @id @default(cuid())
  userId      String
  name        String
  description String?  @db.Text
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user            User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  leads           JobLead[]
  applications    Application[]
  emailLogs       EmailLog[]
  generatedEmails GeneratedEmail[]

  @@index([userId])
  @@index([userId, name])
}

// Versioned Resume Model
model Resume {
  id               String   @id @default(cuid())
  userId           String
  name             String
  fileName         String
  filePath         String
  mimeType         String   @default("application/pdf")
  fileSize         Int
  isDefault        Boolean  @default(false)
  version          Int      @default(1)
  originalResumeId String?
  archived         Boolean  @default(false)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  user             User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  originalResume   Resume?  @relation("ResumeVersions", fields: [originalResumeId], references: [id], onDelete: Cascade)
  versions         Resume[] @relation("ResumeVersions")
  
  applications     Application[]
  emailLogs        EmailLog[]
  generatedEmails  GeneratedEmail[]

  @@index([userId])
  @@index([originalResumeId])
}

// Job Lead Model
model JobLead {
  id             String         @id @default(cuid())
  userId         String
  campaignId     String?
  companyName    String
  receiverName   String?
  receiverEmail  String?
  jobTitle       String?
  location       String?
  salary         String?
  linkedinUrl    String?
  jobUrl         String?
  jobDescription String?        @db.Text
  notes          String?        @db.Text
  pipelineStatus PipelineStatus @default(NEW)
  source         LeadSource     @default(MANUAL)
  customFields   Json           @default("{}")
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt

  user            User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  campaign        Campaign?        @relation(fields: [campaignId], references: [id], onDelete: SetNull)
  applications    Application[]
  emailLogs       EmailLog[]
  generatedEmails GeneratedEmail[]

  @@index([userId])
  @@index([userId, campaignId])
  @@index([userId, pipelineStatus])
  @@index([userId, companyName])
  @@index([userId, createdAt])
}
```
```prisma
// Template Model
model EmailTemplate {
  id            String   @id @default(cuid())
  userId        String
  name          String
  subject       String
  bodyHtml      String   @db.Text
  bodyPlainText String?  @db.Text
  detectedVars  String[]
  variableMap   Json     @default("{}")
  defaultValues Json     @default("{}")
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  user            User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  applications    Application[]
  emailLogs       EmailLog[]
  generatedEmails GeneratedEmail[]

  @@index([userId])
}

// Generated Email Model
model GeneratedEmail {
  id                String               @id @default(cuid())
  userId            String
  campaignId        String?
  leadId            String
  templateId        String?
  resumeId          String?
  buildBatchId      String?
  recipientEmail    String
  subject           String
  bodyHtml          String               @db.Text
  bodyPlainText     String?              @db.Text
  previewHash       String
  status            GeneratedEmailStatus @default(DRAFT)
  isValid           Boolean              @default(false)
  missingVariables  String[]             @default([])
  renderedVariables Json                 @default("{}")
  approvedAt        DateTime?
  sentAt            DateTime?
  createdAt         DateTime             @default(now())
  updatedAt         DateTime             @updatedAt

  user      User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  campaign  Campaign?      @relation(fields: [campaignId], references: [id], onDelete: SetNull)
  lead      JobLead        @relation(fields: [leadId], references: [id], onDelete: Cascade)
  template  EmailTemplate? @relation(fields: [templateId], references: [id], onDelete: SetNull)
  resume    Resume?        @relation(fields: [resumeId], references: [id], onDelete: SetNull)
  emailLog  EmailLog?
  application Application?

  @@index([userId])
  @@index([userId, campaignId])
  @@index([userId, leadId])
  @@index([userId, status])
  @@index([userId, buildBatchId])
  @@index([userId, createdAt])
}
```
```prisma
// Application Model (Opp History)
model Application {
  id               String         @id @default(cuid())
  userId           String
  campaignId       String?
  jobLeadId        String
  resumeId         String?
  templateId       String?
  generatedEmailId String?        @unique
  status           PipelineStatus @default(APPLIED)
  appliedDate      DateTime       @default(now())
  notes            String?        @db.Text
  createdAt        DateTime       @default(now())
  updatedAt        DateTime       @updatedAt

  user           User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  campaign       Campaign?       @relation(fields: [campaignId], references: [id], onDelete: SetNull)
  jobLead        JobLead         @relation(fields: [jobLeadId], references: [id], onDelete: Cascade)
  resume         Resume?         @relation(fields: [resumeId], references: [id], onDelete: SetNull)
  template       EmailTemplate?  @relation(fields: [templateId], references: [id], onDelete: SetNull)
  generatedEmail GeneratedEmail? @relation(fields: [generatedEmailId], references: [id], onDelete: SetNull)

  @@index([userId])
  @@index([userId, campaignId])
  @@index([userId, jobLeadId])
  @@index([userId, status])
  @@index([userId, appliedDate])
}
```
```prisma
// Send Log
model EmailLog {
  id               String              @id @default(cuid())
  userId           String
  campaignId       String?
  jobLeadId        String?
  templateId       String?
  resumeId         String?
  generatedEmailId String?             @unique
  recipientEmail   String
  subject          String
  status           EmailLogStatus      @default(PENDING)
  failureReason    EmailFailureReason?
  failureMessage   String?             @db.Text
  gmailMessageId   String?
  sentAt           DateTime?
  retryCount       Int                 @default(0)
  bulkSendId       String?
  createdAt        DateTime            @default(now())
  updatedAt        DateTime            @updatedAt

  user           User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  campaign       Campaign?       @relation(fields: [campaignId], references: [id], onDelete: SetNull)
  jobLead        JobLead?        @relation(fields: [jobLeadId], references: [id], onDelete: SetNull)
  template       EmailTemplate?  @relation(fields: [templateId], references: [id], onDelete: SetNull)
  resume         Resume?         @relation(fields: [resumeId], references: [id], onDelete: SetNull)
  generatedEmail GeneratedEmail? @relation(fields: [generatedEmailId], references: [id], onDelete: SetNull)

  @@index([userId])
  @@index([userId, campaignId])
  @@index([userId, status])
  @@index([userId, bulkSendId])
  @@index([userId, createdAt])
}
```

---

## 5. API Design

All endpoints resolve the tenant from the session and check resource ownership. Client cannot pass `userId`.

### 5.1 campaigns

* `GET /api/v1/campaigns` - List tenant's campaigns.
* `POST /api/v1/campaigns` - Create a campaign.
* `GET /api/v1/campaigns/:id` - Fetch details if owned; else `404`.
* `PUT /api/v1/campaigns/:id` - Edit if owned; else `404`.
* `DELETE /api/v1/campaigns/:id` - Unlinks references and deletes.

### 5.2 Leads

* `GET /api/v1/leads` - List with query filter support (e.g. `?source=EXCEL_IMPORT`).
* `POST /api/v1/leads` - Create a single lead.
* `POST /api/v1/leads/import` - Bulk create leads via Excel (`createMany`).
* `GET /api/v1/leads/:id` - Fetch details.
* `PUT /api/v1/leads/:id` - Update fields.
* `DELETE /api/v1/leads/:id` - Cascade delete matching generated emails.

### 5.3 Resumes

* `GET /api/v1/resumes` - List active (non-archived) user resumes.
* `POST /api/v1/resumes` - Upload PDF. Sets default transactionally.
* `POST /api/v1/resumes/:id/replace` - Replace resume (archives previous, creates new version).
* `DELETE /api/v1/resumes/:id` - Archives the resume if used historically; else deletes.

### 5.4 Generated Emails

* `POST /api/v1/generated-emails/build` - Generates drafts (`createMany` batch operation). Logs `renderedVariables` JSON.
* `GET /api/v1/generated-emails` - Paginated lists of drafts.
* `PATCH /api/v1/generated-emails/:id` - Edit. Edits to `APPROVED` drafts revert them to `DRAFT`.
* `POST /api/v1/generated-emails/:id/unapprove` - Revert `APPROVED` back to `DRAFT`.

---

## 6. Module & System Workflows

### 6.1 Resume Replacement & Versioning Workflow

When a user replaces an existing resume `React_Resume.pdf` (Version 1, ID `R1`):


```text
User uploads new PDF 
  │
  ▼
Archive old resume:
  ├─ Set R1.archived = true
  └─ Set R1.isDefault = false
  │
  ▼
Create new resume row (R2):
  ├─ Set R2.version = R1.version + 1 (v2)
  ├─ Set R2.originalResumeId = R1.originalResumeId ?? R1.id
  └─ Set R2.isDefault = true
```

* **Historical Integrity:** Any generated emails or application logs referencing `R1` continue to point directly to `R1` and its correct local PDF file.
* **New Drafts:** The builder wizard filters out `archived: true` resumes, automatically presenting `R2` for subsequent runs.

### 6.2 Gmail Connection & In-Memory Token Caching


```text
User clicks "Connect Gmail"
  │
  ▼
Redirect to Google OAuth Consent Page (Uses global GOOGLE_CLIENT_ID)
  │
  ▼
User approves & returns to callback
  │
  ▼
Express exchanges auth code for refresh token
  │
  ▼
Encrypt refresh token (AES-256-GCM) → Store in GmailAccount (encryptedRefreshToken)
  │
  ▼
Discard Google's access token from database insertion payload
```

* **Access Token Retrieval & Cache:**

  When sending an email, the Express server decrypts `encryptedRefreshToken`, requests an access token from Google, and stores it in a secure **in-memory token cache** (TTL = 1 hour).
  Sequenced sends read from the memory cache, preventing rate-limiting on token swaps.

---

## 7. Shared Services & Utils

* **`bulkSendService.processQueue`**: Validates drafts are `APPROVED`, pulls the cache or swaps the refresh token, builds the MIME payload, attaches the version-specific PDF file path, and executes sends with a 25s delay + jitter.
* **`encryption`**: AES-256-GCM cipher using a 64-character hex key verified at application start.

---

## 8. Frontend Structure & UI

The frontend uses Next.js App Router and TanStack React Query for caching:

* **Authentication Guard:** A custom React Query hook `/api/v1/auth/session` determines route access. Unauthenticated states redirect to `/login`.
* **Forms & Setup:**

  * `/login`, `/register`: Authentication flows.
  * `/settings`: Profile details, password reset, and personal Gmail OAuth connect.
  * `/resumes`: Displays version chains (e.g., `Resume.pdf (v3)`) with a history panel.

* **Draft Preview Sandbox:** Uses an iframe wrapper:

```html
<!-- <iframe sandbox srcdoc={draft.bodyHtml} className="w-full h-96 border-none" /> -->
```

  This guarantees that HTML templates cannot execute inline javascript in the main React application window, eliminating XSS.

---

## 9. Environment & Configuration

### API `.env` Configuration


```env
DATABASE_URL=postgresql://tenant:password@ep-host.neon.tech/jobhunter?sslmode=require
PORT=4000
NODE_ENV=production

# Global Google OAuth (Used by all tenants)
GOOGLE_CLIENT_ID=your-global-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-global-client-secret
GOOGLE_REDIRECT_URI=https://your-platform-domain.com/api/v1/gmail/callback

# Master Secret Key (For GCM Encryption)
ENCRYPTION_KEY=64-character-hex-string
```

---

## 10. Implementation Phases

1. **Phase 1: Multi-Tenant Bootstrap (2 Days)**

   * Better Auth config, session middleware, base schema migrations on Neon.
   * Server startup validation of `ENCRYPTION_KEY` and Google credentials.

2. **Phase 2: Tenant Isolation & Core CRUD (3 Days)**

   * Route ownership middleware.
   * Campaign, Lead (with `source`), Template creation under tenant scope.

3. **Phase 3: Resumes & Versioning (2 Days)**

   * Soft-delete/version replacement logic in service layer.

4. **Phase 4: Gmail OAuth & Memory Caching (2 Days)**

   * Global OAuth callback and GCM encryption. In-memory access token cache.

5. **Phase 5: Email Build Engine & Bulk Sending (2 Days)**

   * Log resolved variables to `renderedVariables` JSONB.
   * Sequential background sending.

6. **Phase 6: Frontend Pages & Polish (2 Days)**

   * App pages (Login, register, settings) + React Query integration.

---

## 11. Security & Operational Notes

* **Cookie Security:** Better Auth session cookies are configured with `httpOnly: true`, `secure: true`, and `sameSite: "lax"`.
* **Rate Limiting:** Express routes are protected by `express-rate-limit` (100 requests per 15 minutes per IP) to prevent login brute-forcing.
* **Helmet Headers:** Integrated in `app.ts` to configure baseline CSP, frame options, and HSTS.
* **Neon Optimization:** Bulk operations utilize `createMany()` instead of looped mappings. Queries leverage the compound indexes (`userId` + sorting keys) to avoid costly sequence scans.
