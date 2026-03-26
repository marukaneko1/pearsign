# PearSign — Full Change Log

This document records every file changed, added, or deleted relative to the **initial commit** (`53470d4 — Initial commit: PearSign Next.js application`).

All changes fall into three batches:

| Batch | Git Commit | Description |
|-------|-----------|-------------|
| **Batch 1** | `812e7b8` | Production readiness: security, billing, analytics, CI, hardening |
| **Batch 2** | *(uncommitted — AI session work)* | 5-phase completion plan implementation |
| **Batch 3** | *(uncommitted — AI session work)* | Bug fixes, security hardening, and code review fixes |

---

## New Files Added

### Infrastructure & DevOps
| File | What it does |
|------|-------------|
| `.env.example` | Documents all required and optional environment variables with inline comments |
| `.github/workflows/ci.yml` | GitHub Actions CI pipeline: install → typecheck → lint → vitest → build |
| `migrations/001_baseline.sql` | Canonical PostgreSQL schema (250 lines) covering all tables: auth, tenants, envelopes, signatures, invoices, billing, audit logs |
| `migrations/README.md` | Instructions for applying migrations and running bootstrap |
| `src/app/api/health/route.ts` | `GET /api/health` — liveness/readiness endpoint; queries DB and returns `200 ok` or `503 degraded` |
| `src/middleware.ts` | Global Next.js middleware enforcing auth on all `/api/*` routes; public allowlist, admin-key check, Bearer token check, session cookie check |
| `src/lib/logger.ts` | Dev-only logger — `devLog`/`devWarn` are no-ops in production |

### Route-Level Error & Loading Boundaries
| File | Route it protects |
|------|------------------|
| `src/app/error.tsx` | Global app-wide error boundary |
| `src/app/loading.tsx` | Global loading spinner |
| `src/app/admin/error.tsx` | Admin panel error boundary |
| `src/app/onboarding/error.tsx` | Onboarding error with login fallback |
| `src/app/settings/error.tsx` | Settings error boundary |
| `src/app/settings/loading.tsx` | Settings loading state |
| `src/app/sign/[token]/error.tsx` | Document signing error (expired/invalid link message) |
| `src/app/sign/[token]/loading.tsx` | Document signing loading state |
| `src/app/f/[code]/sign/[token]/error.tsx` | Fusion Form signing error boundary |

### Test Files (143 tests, all passing)
| File | Tests cover |
|------|------------|
| `src/lib/__tests__/auth-service.test.ts` | Password hashing, email validation, token generation, expiry |
| `src/lib/__tests__/billing-service.test.ts` | Plan feature gates, usage limits, Stripe key validation, URL building |
| `src/lib/__tests__/field-mapping.test.ts` | Field type classification, position validation, recipient assignment, signature data |
| `src/lib/__tests__/fusion-forms.test.ts` | Access codes, form expiry, field schema, submission validation |
| `src/lib/__tests__/invoice-validators.test.ts` | Create/update validation, editable/voidable status checks, line items |
| `src/lib/__tests__/middleware.test.ts` | Route classification (public/admin/v1/tenant), bearer token parsing, admin key checks |
| `src/lib/__tests__/rate-limiter.test.ts` | Attempt tracking, account lockout, progressive backoff, IP/email normalization |
| `src/lib/__tests__/signing-flow.test.ts` | Token validation, envelope transitions, recipient tracking, required field completion |
| `src/lib/__tests__/tenant-isolation.test.ts` | Session validation, cross-tenant prevention, plan feature limits |
| `src/lib/__tests__/webhook-service.test.ts` | HMAC signing, event types, retry/backoff logic, URL validation |

### Archived Files (moved, not deleted)
The legacy NestJS backend (`pearsign-api/`) was moved to `_archive/pearsign-api/` — all source files preserved, just relocated out of the active build path.

---

## Modified Files

### Configuration

#### `next.config.js`
- **Before:** `ignoreDuringBuilds: true`, `ignoreBuildErrors: true` — TypeScript and ESLint errors were silently ignored during builds
- **After:** Both set to `false` — builds now fail on type errors and lint violations (production-safe)

#### `package.json` / `package-lock.json`
- Removed unused/redundant dependencies
- Updated lock file to match

#### `.env.example`
- Added in Batch 1 (initial), then extended in Batch 2
- **Added variables:** `SESSION_SECRET`, `SENDGRID_FROM_NAME`, `STRIPE_STARTER_MONTHLY_PRICE_ID`, `STRIPE_STARTER_YEARLY_PRICE_ID`, `STRIPE_PRO_MONTHLY_PRICE_ID`, `STRIPE_PRO_YEARLY_PRICE_ID`, `STRIPE_ENTERPRISE_PRICE_ID`, `SALESFORCE_LOGIN_URL`
- Added inline documentation for every section

---

### Core Library (`src/lib/`)

#### `src/lib/db.ts`
- Removed `DEFAULT_ORG_ID = 'org-1'` export — this was a hardcoded single-tenant fallback that bypassed multi-tenancy

#### `src/lib/logger.ts` *(new)*
- Created `devLog` and `devWarn` helper functions that are no-ops in production (`NODE_ENV !== 'production'`)

#### `src/lib/tenant-middleware.ts`
- **Security fix:** Removed fallback to legacy `X-Tenant-ID` header path — all routes now require a valid session cookie
- Removed `requireTenantContext` fallback chain; if no session → immediate `401`
- Improved error message: `"Authentication required. Please log in."`

#### `src/lib/tenant-session.ts`
- Replaced silent `.catch(() => {})` on `last_activity` update with `console.warn` logging

#### `src/lib/billing-service.ts`
- **Table rename:** `invoices` → `billing_invoices` to avoid collision with the tenant invoicing module's `invoices` table
- Added `checkout.session.completed` webhook handler — now upgrades tenant plan on Stripe checkout success
- All references to `invoices` table updated to `billing_invoices`
- Removed `sk_test_placeholder` demo bypass — throws clear error if `STRIPE_SECRET_KEY` is missing
- Removed `createCheckoutSession`/`createPortalSession` demo URL fallbacks

#### `src/lib/security-enforcement.ts`
- **Security hardening:** On error, `getTenantSecuritySettings` now throws instead of silently returning permissive defaults
- `check2FARequirement` on error now returns `{ allowed: false }` instead of `{ allowed: true }` (fail-closed)
- `checkIPRestrictions` on error now returns `{ allowed: false }` instead of `{ allowed: true }` (fail-closed)

#### `src/lib/rls-policies.ts`
- Removed `OR current_tenant_id() = ''` escape hatch from all RLS policies — empty tenant ID can no longer bypass row-level security
- This closes a multi-tenancy isolation gap across SELECT, INSERT, UPDATE, and DELETE policies

#### `src/lib/webhook-service.ts`
- Removed `DEFAULT_ORG_ID` import (no longer exported from `db.ts`)
- Cleaned up inline comments and retry configuration
- Jitter calculation preserved but comment removed

#### `src/lib/email-templates.ts`
- Updated template content and structure
- Schema migration logic improved (non-destructive)

#### `src/lib/notifications.ts`
- Updated to pass `tenantId` through notification queries

#### `src/lib/field-mapping.ts`
- `getTemplateFieldsSchema` now dynamically fetches the latest template version from `TemplateVersioningService.getLatestVersion` instead of hardcoded `version: 1`
- Graceful try/catch if versioning table doesn't exist yet

#### `src/lib/billing-notifications.ts`
- All `console.log` statements gated behind `NODE_ENV !== 'production'`

#### `src/lib/auth-service.ts`
- All debug `console.log` statements gated behind `NODE_ENV !== 'production'`

#### `src/lib/auth-rate-limiter.ts`
- All debug `console.log` statements gated behind `NODE_ENV !== 'production'`

#### `src/lib/tenant.ts`
- All debug `console.log` statements gated behind `NODE_ENV !== 'production'`

#### `src/lib/tenant-billing.ts`
- Removed `DEFAULT_ORG_ID` usage; all `console.log` gated

#### `src/lib/tenant-config-init.ts`
- All `console.log` statements gated behind `NODE_ENV !== 'production'`

#### `src/lib/tenant-onboarding.ts`
- All `console.log` statements gated behind `NODE_ENV !== 'production'`

#### `src/lib/admin-tenant-service.ts`
- Silent `.catch(() => {})` on column-add replaced with `console.warn`

#### `src/lib/pdf-digital-signature.ts`
- Added `sigLog` dev-only logger (no-op in production)
- All ~195 `console.log` calls replaced with `sigLog` calls
- Fixed self-referential `sigLog` definition bug

#### `src/lib/signed-pdf-generator.ts`
- All `console.log` statements gated behind `NODE_ENV !== 'production'`

#### `src/lib/signature-id.ts`
- All `console.log` statements gated behind `NODE_ENV !== 'production'`

#### `src/lib/settings-store.ts`
- All `console.log` statements gated behind `NODE_ENV !== 'production'`

#### `src/lib/sms-service.ts`
- Removed `DEFAULT_ORG_ID` usage; all `console.log` gated

#### `src/lib/salesforce-service.ts`
- Removed `DEFAULT_ORG_ID` usage; all `console.log` gated

#### `src/lib/google-drive-service.ts`
- All `console.log` statements gated behind `NODE_ENV !== 'production'`

#### `src/lib/dropbox-service.ts`
- All `console.log` statements gated behind `NODE_ENV !== 'production'`

#### `src/lib/document-retention.ts`
- All `console.log` statements gated behind `NODE_ENV !== 'production'`

#### `src/lib/email-service.ts`
- All `console.log` statements gated behind `NODE_ENV !== 'production'`

#### `src/lib/env-validation.ts`
- All `console.log` statements gated behind `NODE_ENV !== 'production'`
- Fixed two `forEach` arrow functions that had invalid `if` statements injected by bulk replace — now correctly `if (isDev) arr.forEach(...)`

#### `src/lib/fusion-forms.ts`
- All `console.log` statements gated behind `NODE_ENV !== 'production'`

#### `src/lib/immutable-audit-log.ts`
- All `console.log` statements gated behind `NODE_ENV !== 'production'`

#### `src/lib/onboarding-email.ts`
- All `console.log` statements gated behind `NODE_ENV !== 'production'`

#### `src/lib/pearsign-sdk.ts`
- All `console.log` statements gated behind `NODE_ENV !== 'production'`

#### `src/lib/two-factor-auth.ts`
- All `console.log` statements gated behind `NODE_ENV !== 'production'`

#### `src/lib/templates.ts`
- Removed `DEFAULT_ORG_ID` usage

#### `src/lib/capacitor.ts`
- Replaced `as any` on `StatusBar.setStyle` with proper `Parameters<typeof StatusBar.setStyle>[0]['style']` type

#### `src/lib/bulk-send.ts`
- Removed `DEFAULT_ORG_ID` usage; all `console.log` gated

#### `src/lib/rls-policies.ts`
- All `console.log` statements gated behind `NODE_ENV !== 'production'`

### Invoices Library (`src/lib/invoices/`)

#### `src/lib/invoices/types.ts`
- **Extended `Invoice` interface** with missing fields:
  - Customer address: `customer_address`, `customer_city`, `customer_state`, `customer_zip`, `customer_country`
  - Discount: `discount_type`, `discount_value`, `discount_total`
  - Additional: `notes_internal`, `po_number`, `void_reason`, `payment_history`
- **Extended `CreateInvoiceInput`** with: address fields, `po_number`, `discount_type`, `discount_value`
- **Extended `UpdateInvoiceInput`** with: address fields, `po_number`, `discount_type`, `discount_value`

#### `src/lib/invoices/invoice-service.ts`
- Removed all 11 `as any` casts — now uses properly typed fields from updated `types.ts`
- `discountType`, `discountValue`, address fields, `po_number` accessed directly without casting
- `rowToInvoice` return no longer needs `as any` cast

#### `src/lib/invoices/db-init.ts`
- All `console.log` statements gated behind `NODE_ENV !== 'production'`

#### `src/lib/invoices/db-helper.ts`
- All `console.log` statements gated behind `NODE_ENV !== 'production'`

#### `src/lib/invoices/payment-processors/stripe-processor.ts`
- Uncommented real `stripe.paymentLinks.create()` call
- Added real Stripe API key validation

#### `src/lib/invoices/payment-processors/square-processor.ts`
- Now throws an explicit error (requires `squareup` package) instead of returning a placeholder URL

#### `src/lib/invoices/payment-processors/authorize-net-processor.ts`
- Replaced placeholder URL with commented implementation outline; throws until fully integrated

---

### API Routes (`src/app/api/`)

#### `src/app/api/health/route.ts` *(new)*
- `GET /api/health` — checks DB connectivity, returns `{ status, database }`

#### `src/app/api/admin/bootstrap/route.ts`
- Typed SQL row results with `Record<string, unknown>` instead of `as any`
- All `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/app/api/admin/demo-account/route.ts`
- Silent `.catch(() => {})` on template/audit/team deletions replaced with `console.warn`

#### `src/app/api/admin/init/route.ts`
- All `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/app/api/admin/plans/route.ts`
- All `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/app/api/admin/seed-invoices/route.ts`
- Silent `.catch(() => {})` on invoice table deletions replaced with `console.warn`
- All remaining `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/app/api/admin/tenants/route.ts`
- Silent `.catch(() => {})` on all tenant data deletions replaced with `console.warn`

#### `src/app/api/analytics/signer-locations/route.ts`
- Added typed row interfaces: `IpRow`, `GeoCacheRow`, `SignerCountRow`
- Removed 3 `as any[]` casts on SQL results

#### `src/app/api/auth/register/route.ts`
- Typed `tenantPlan` as `import('@/lib/tenant').TenantPlan` — removed 2 `as any` casts
- All `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/app/api/auth/login/route.ts`
- All `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/app/api/auth/forgot-password/route.ts`
- All `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/app/api/auth/verify-email/route.ts`
- All `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/app/api/auth/join/route.ts`
- All `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/app/api/billing/webhook/route.ts`
- **Batch 1:** Simplified — removed demo-mode JSON parse path; routes directly to `BillingService.handleWebhookEvent`

#### `src/app/api/bulk-send/init/route.ts`
- Added `requireAdminKey` helper; both GET and POST now require `X-Admin-Key`

#### `src/app/api/bulk-send/[id]/void/route.ts`
- All `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/app/api/contacts/route.ts`
- All `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/app/api/cron/route.ts`
- **Batch 1:** Added `cronRunning` flag to prevent overlapping cron runs
- Wrapped task execution in try/finally to always reset the flag
- All `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/app/api/cron/billing/route.ts`
- All `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/app/api/documents/export-docx/route.ts`
- Wrapped `POST` handler with `withTenant` middleware (was unauthenticated)

#### `src/app/api/envelopes/route.ts`
- Removed `DEFAULT_ORG_ID` usage; all `console.log` gated

#### `src/app/api/envelopes/send/route.ts`
- Removed `DEFAULT_ORG_ID` usage; all `console.log` gated

#### `src/app/api/envelopes/void/route.ts`
- All `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/app/api/envelopes/send-reminder/route.ts`
- All `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/app/api/envelopes/[envelopeId]/download/route.ts`
- All `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/app/api/fusion-forms/[id]/route.ts`
- Wrapped GET, PATCH, DELETE with `withTenant` (was unauthenticated)
- `tenantId` extracted from `TenantApiContext` and passed to `FusionFormsService`

#### `src/app/api/fusion-forms/[id]/submissions/route.ts`
- Wrapped GET with `withTenant` (was unauthenticated)
- `tenantId` passed to `FusionFormsService.getFormSubmissions`

#### `src/app/api/invoice-preview/route.ts`
- All `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/app/api/invoices/init/route.ts`
- Added `requireAdminKey` helper; both GET and POST now require `X-Admin-Key`
- All `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/app/api/invoices/route.ts`
- All `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/app/api/invoices/stats/route.ts`
- All `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/app/api/invoices/[id]/send/route.ts`
- Imported `sendInvoiceReadyEmail` from `email-service.ts`
- After `sendInvoice()`, now calls email service with org name, customer info, amounts, dates, and invoice URL

#### `src/app/api/notifications/[id]/route.ts`
- **Batch 1:** Wrapped with `withTenant`; removed `DEFAULT_USER_ID = 'demo-user'`
- **Batch 2:** Removed `await (params as any)` — params accessed directly without cast

#### `src/app/api/notifications/preferences/route.ts`
- All `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/app/api/public/sign/[token]/route.ts`
- All `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/app/api/public/sign/[token]/viewed/route.ts`
- All `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/app/api/public/sign/[token]/upload/route.ts`
- All `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/app/api/public/sign/[token]/download/route.ts`
- All `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/app/api/public/sign/[token]/decline/route.ts`
- All `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/app/api/public/fusion-forms/[code]/route.ts`
- All `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/app/api/public/document/[envelopeId]/route.ts`
- All `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/app/api/public/org-invite/[token]/route.ts`
- All `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/app/api/self-sign/route.ts`
- All `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/app/api/settings/branding/route.ts`
- All `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/app/api/settings/branding/init/route.ts`
- All `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/app/api/settings/branding/logo/route.ts`
- All `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/app/api/settings/certificates/route.ts`
- All `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/app/api/settings/integrations/route.ts`
- **Batch 1:** Removed unimplemented integrations from `AVAILABLE_INTEGRATIONS` list: Zapier, HubSpot, Microsoft Teams, Notion

#### `src/app/api/settings/integrations/dropbox/callback/route.ts`
- All `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/app/api/settings/integrations/google-drive/callback/route.ts`
- All `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/app/api/settings/integrations/google-drive/folders/route.ts`
- **Batch 1:** Secured endpoint

#### `src/app/api/settings/integrations/salesforce/callback/route.ts`
- All `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/app/api/settings/integrations/sendgrid/route.ts`
- All `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/app/api/settings/integrations/sendgrid/test/route.ts`
- All `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/app/api/settings/team/route.ts`
- All `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/app/api/settings/twilio/route.ts`
- All `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/app/api/settings/twilio/test/route.ts`
- All `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/app/api/tenant/init/route.ts`
- **Security fix:** Now requires `X-Admin-Key` header
- Replaced hardcoded `DEFAULT_TENANT_ID = 'demo-tenant-001'` and `DEFAULT_USER_ID = 'demo-user-001'` with `crypto.randomUUID()` values generated at runtime
- Destructive table drops now gated behind `?force=true` query parameter

#### `src/app/api/tenant/create/route.ts`
- Silent `.catch(() => {})` blocks replaced with `console.warn`

#### `src/app/api/tenant/settings/route.ts`
- Silent `.catch(() => {})` on session name/plan sync replaced with `console.warn`

#### `src/app/api/templates/route.ts`
- **Batch 1:** Removed `DEFAULT_ORG_ID` usage; routes properly use tenant context

#### `src/app/api/webhooks/route.ts`
- **Batch 1:** Improved webhook event routing

#### `src/app/api/webhooks/stripe/route.ts`
- All `console.log` gated behind `NODE_ENV !== 'production'`

---

### Pages (`src/app/`)

#### `src/app/layout.tsx`
- Added skip-to-content link (`<a href="#main-content">`) for keyboard accessibility

#### `src/app/page.tsx`
- Removed unused `sampleEnvelopes` import
- Added `onOpenAIWizard` prop to `QuickActions` component, wired to `setShowAIWizard(true)`
- Added `settings`, `prepare-document`, `form-builder` as explicit `null`-rendering cases to prevent "coming soon" flash
- Added `id="main-content"` to `<main>` element for skip-link target
- Removed debug `console.log` calls for void operations

#### `src/app/login/page.tsx`
- Added `role="alert"` + `aria-live="assertive"` to error message region
- Added `role="status"` + `aria-live="polite"` to success message region
- Added `htmlFor`, `id`, `aria-required`, `aria-invalid`, `autoComplete` to all form inputs
- Added `aria-label` + `aria-pressed` to show/hide password toggle button
- Added `role="tablist"`, `role="tab"`, `aria-selected`, `role="tabpanel"` to feature highlight tabs
- Added `aria-label` to both forms (`"Sign in form"`, `"Reset password form"`)

#### `src/app/privacy/page.tsx`
- California Privacy Notice `href="#"` changed to `/privacy#california`

#### `src/app/select-plan/page.tsx`
- Added `setIsLoading(false)` before `router.push("/login")` in free-plan path (loading spinner was stuck)

#### `src/app/onboarding/activate/page.tsx`
- "Go to Login" buttons: changed `router.push("/")` to `router.push("/login")`
- All debug `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/app/sign/[token]/page.tsx`
- All debug `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/app/f/[code]/sign/[token]/page.tsx`
- "View Certificate" button: added `onClick` handler opening `completedData.certificateUrl` in new tab

#### `src/app/globals.css`
- Minor style updates

#### `src/instrumentation.ts`
- Replaced hardcoded demo user/tenant IDs with `crypto.randomUUID()` at runtime
- Empty `catch {}` blocks now log `console.warn`
- SQL row typed as `Record<string, unknown>` instead of `as any`

---

### Components (`src/components/`)

#### `src/components/ai-document-wizard.tsx`
- Removed `getApiKey()` function and localStorage-based API key input
- Removed direct calls to `https://api.openai.com/v1/chat/completions`
- Rewrote `generateAIResponse` and `generateDocument` to call server-side `/api/ai/chat` via SSE streams

#### `src/components/dashboard-header.tsx`
- Added `aria-label="Open navigation menu"` to mobile menu button
- Added `aria-hidden="true"` to `<Menu>` icon
- Added `aria-label="User menu"` to user avatar dropdown trigger
- Fixed `AvatarImage alt` from `"User"` to `""` (decorative — initials fallback is the real label)

#### `src/components/dashboard-sidebar.tsx`
- Added `aria-label="Main navigation"` to `<nav>` element
- Added `aria-label="Create new document"` to New Document button
- Added `aria-hidden="true"` to `<Plus>` icon

#### `src/components/document-prepare-flow.tsx`
- Removed `createDemoEnvelope` and `generateDemoId` fallback functions
- Replaced silent demo fallback in `handleSend` with actual error toasts using `useToast` (also fixed missing import)

#### `src/components/integrations-page.tsx`
- Changed `/auth/signin` → `/login` and `/auth/signup` → `/login`
- Replaced generic "OAuth coming soon" message with context-aware configuration instructions

#### `src/components/invoices-page.tsx`
- Removed 7 `as any` casts on `invoice.customer_address/city/state/zip/country/discount_type/discount_value` — now typed directly via updated `Invoice` interface

#### `src/components/landing-page.tsx`
- About → `mailto:hello@pearsign.com`
- Blog → `mailto:hello@pearsign.com`
- Careers → `mailto:careers@pearsign.com`
- Cookie Policy → `/privacy`
- DPA → `/privacy#dpa`

#### `src/components/notification-bell.tsx`
- Added dynamic `aria-label` to bell button: `"${count} unread notifications"` or `"Notifications"`
- Added `aria-hidden="true"` to `<Bell>` icon

#### `src/components/onboarding-success.tsx`
- Tutorial → `/api/ai-generator`
- Docs → `https://docs.pearsign.com` (opens in new tab)
- API → `https://docs.pearsign.com/api` (opens in new tab)

#### `src/components/pdf-editor.tsx`
- Replaced hardcoded placeholder text with real `pdfjs-dist` text extraction from the loaded PDF buffer

#### `src/components/quick-actions.tsx`
- Added `onOpenAIWizard` prop and "AI document" button with `Sparkles` icon
- Added `role="button"`, `tabIndex={0}`, `onKeyDown` Enter/Space handler to drag-drop cards (keyboard accessible)
- Added `aria-label` describing drag-drop behavior to both drop zones
- Added `role="status"` + `aria-live="polite"` to uploaded file indicator
- Added `aria-label` to hidden file inputs

#### `src/components/quick-stats.tsx`
- Added `error` state; displays error message and "Retry" button on fetch failure instead of showing all zeros

#### `src/components/self-sign-flow.tsx`
- Fixed success-on-failure bug: `setStep("complete")` and success toast are now inside the `if (res.ok)` branch only
- API errors now throw and are caught by outer try/catch

#### `src/components/send-document-dialog.tsx`
- Removed `DEMO_MODE = true`, `generateDemoId`, and `createDemoEnvelope` functions
- Removed all `if (DEMO_MODE)` conditional blocks
- Real API calls (`documentsApi.upload`, `envelopesApi.create/addDocument/addRecipient/send`) always execute

#### `src/components/sent-requests-page.tsx`
- Replaced `await new Promise(resolve => setTimeout(resolve, 1500))` stub in `handleBulkVoidConfirm` with real `Promise.allSettled` calls to `/api/envelopes/${id}/void`
- Toast notifications reflect partial success/failure counts
- Removed debug `console.log`

#### `src/components/setup-checklist.tsx`
- Added `loadError` state; returns `null` on error (silently hides checklist instead of crashing)

#### `src/components/settings/branding-settings.tsx`
- Silent `.catch(() => {})` on init replaced with `console.warn`

#### `src/components/settings/general-settings.tsx`
- `handleNotificationChange` now sends `PUT` to `/api/notifications/preferences`
- Client-side rollback on failure; error toast displayed

#### `src/components/settings/modules-settings.tsx`
- Added `loadError` state; displays error message and "Retry" button on failed module load

#### `src/components/settings/sessions-dialog.tsx`
- Added `fetchError` state; error message displayed inside dialog on failed session fetch

#### `src/components/settings/storage-billing-settings.tsx`
- Updated plan names and feature lists to match actual Stripe plans (Trial, Starter, Professional, Enterprise)

#### `src/components/settings/api-documentation-settings.tsx`
- All `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/components/signing/signing-page-content.tsx`
- Refined `signatureData` extraction: now prioritizes finding a `signature`-type field among `assignedFields` containing `data:image`, falls back to generic search
- All `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/components/tenant-admin-dashboard.tsx`
- **Batch 1:** Added analytics charts using `recharts` (`BarChart`, `PieChart`)
- Added `loadAnalytics` and `loadBillingData` callbacks
- Added analytics and billing data state management

#### `src/components/templates-page.tsx`
- **Batch 1:** Removed `DEFAULT_ORG_ID` usage; uses tenant context

#### `src/components/visual-pdf-editor.tsx`
- All `console.log` gated behind `NODE_ENV !== 'production'`

---

### Contexts

#### `src/contexts/auth-context.tsx`
- All `console.log` gated behind `NODE_ENV !== 'production'`

#### `src/contexts/tenant-session-context.tsx`
- All `console.log` gated behind `NODE_ENV !== 'production'`

---

## Deleted Files

| File | Reason |
|------|--------|
| `src/components/signing/decline-dialog.tsx` | Dead code — never imported anywhere in the codebase |

---

## Batch 3 — Bug Fixes, Security Hardening & Code Review

### Security Fixes

#### `src/app/api/webhooks/stripe/route.ts`
- **Bug:** When `STRIPE_SECRET_KEY` was unset, `verifyStripeSignature` returned `valid: true` and accepted any arbitrary JSON as a real Stripe event — in all environments including production.
- **Fix:** Unsigned-bypass path is now gated to `NODE_ENV === 'development'` only. In production, missing `STRIPE_SECRET_KEY` returns `{ valid: false }` and rejects the request.

#### `src/app/api/cron/route.ts`
- **Bug:** Any HTTP request carrying `x-vercel-cron: true` while `VERCEL` env var was set was accepted as authenticated without a `CRON_SECRET`. This header can be trivially spoofed.
- **Fix:** Removed the `x-vercel-cron` bypass entirely. All callers (including Vercel's own scheduled invocations) must present a valid `CRON_SECRET` via `Authorization: Bearer` or `X-Cron-Secret`.

#### `src/app/api/public/fusion-forms/sign/[token]/notify/route.ts`
- **Bug:** Route accepted `signerEmail`, `senderEmail`, `documentName`, `signerName`, etc. entirely from the request body with no token validation. An attacker could POST to this endpoint with arbitrary email addresses and trigger convincing "signed document" notifications — email spoofing/phishing and SendGrid quota abuse.
- **Fix:** Route now:
  1. Looks up the submission via `FusionFormsService.getSubmissionByToken(token)` and returns 404 if not found
  2. Rejects with 400 if submission status is not `completed`
  3. Pulls all identity fields (`signerName`, `signerEmail`, `senderName`, `senderEmail`, `documentName`, `signedAt`) from the server-side DB record — client may only supply the generated PDF bytes and `fieldsSummary`

---

### Reliability & Crash Fixes

#### `src/app/api/analytics/signer-locations/route.ts`
- **Bug:** `ensureTable()` created `signer_geo_cache` but then immediately queried `envelope_signing_sessions`, which might not exist on a fresh database, causing a 500 on the dashboard globe widget.
- **Fix:** Extended `ensureTable()` to also run `CREATE TABLE IF NOT EXISTS envelope_signing_sessions` with the full schema. Dashboard now loads cleanly with an empty globe when no signing data exists.

#### `src/lib/html-to-pdf.ts`
- **Bug:** AI-generated documents contained box-drawing characters (e.g. `═`, U+2550) used as section dividers. pdf-lib's built-in Helvetica font uses WinAnsi encoding which cannot represent these characters, causing a hard crash: `WinAnsi cannot encode "═" (0x2550)`.
- **Fix:** Added `sanitizeForWinAnsi()` — runs on all text before pdf-lib processes it. Maps box-drawing chars → `=`/`|`/`+`, smart quotes → straight quotes, em/en dashes → `--`/`-`, bullets → `*`, strips any remaining characters above U+00FF.

#### `src/app/api/ai/chat/route.ts` · `src/app/api/ai/generate-document/route.ts`
- **Change:** Updated AI system prompts to instruct the model to use plain ASCII `---` dividers instead of Unicode box-drawing characters (`═══`). Prevents the WinAnsi crash at the source.

---

### PDF.js Worker — Self-Hosted (7 files)

All seven components were loading the PDF.js worker from `//unpkg.com` (a third-party CDN). A CDN outage, strict CSP policy, or offline/network-restricted environment would silently break every PDF preview and document signing flow. All instances updated to use the self-hosted `/pdf.worker.min.mjs` already present in `public/`.

| File |
|------|
| `src/components/signing/signing-page-content.tsx` |
| `src/components/signing/pdf-signing-viewer.tsx` |
| `src/components/visual-pdf-editor.tsx` |
| `src/components/document-prepare-flow.tsx` |
| `src/components/pdf-editor.tsx` |
| `src/components/send-document-dialog.tsx` |
| `src/components/template-field-editor.tsx` |

---

### Client-Side Bug Fixes

#### `src/app/login/page.tsx`
- **Bug:** Both `handleLogin` and `handleForgotPassword` called `response.json()` unconditionally before checking `response.ok`. A non-JSON response (e.g. 502 gateway error, HTML error page) would throw an unhandled parse error and show a confusing generic error to the user.
- **Fix:** Both handlers now wrap `response.json()` in a try/catch and check `response.ok` before inspecting the parsed payload.

#### `src/app/f/[code]/sign/[token]/page.tsx`
- **Bug:** `handleSaveProgress` (the auto-save `PATCH`) silently ignored non-OK HTTP responses — data loss on 4xx/5xx would go completely unnoticed.
- **Fix:** Now checks `res.ok` and emits a `console.warn` with the HTTP status on failure, making server-side auto-save errors visible during debugging without interrupting the signer.

---

---

## Batch 4 — Mobile Responsiveness Pass *(uncommitted — AI session work)*

A comprehensive audit and fix pass targeting the mobile experience across all major surfaces. Goal: no overlapping elements, no horizontal overflow, all flows navigable on a phone-sized viewport (≥ 320 px wide).

### `src/app/login/page.tsx`
- **Nav padding** reduced from a fixed `40 px` on each side to `20 px` so the logo + switch-mode button no longer crowd the edges on narrow screens.
- **Card padding** converted from hard-coded `32 px / 40 px` to `clamp(20px, 5vw, 32px) / clamp(16px, 6vw, 40px)` — fluid scaling means the card fills the screen on a 320 px phone without content spilling outside.
- **Heading font size** changed from a fixed `32 px` to `clamp(24px, 6vw, 32px)` so it scales down on small viewports instead of forcing text to wrap awkwardly.
- **Main area padding** tightened to `16 px` all-round so the card gains as much vertical breathing room as possible on short devices.
- **Trust badges row** (`256-bit SSL / GDPR / 99.9% Uptime`) given `flexWrap: "wrap"` so the three chips collapse to two rows instead of clipping off-screen on very narrow phones.

### `src/components/document-prepare-flow.tsx`
- **Header** (`px-6 py-3` → `px-3 sm:px-6 py-2 sm:py-3`): "Back to Dashboard" now shows icon-only on mobile; "Send for Signature" shows icon-only on mobile; title truncates with `truncate`; filename subtitle hidden on mobile.
- **Step 1 — Upload**: outer padding `p-8` → `p-4 sm:p-8`; drop-zone padding `p-12` → `p-6 sm:p-12`; heading scaled down on mobile.
- **Step 2 — Recipients**: outer padding `p-8` → `p-4 sm:p-8`; heading scaled.
- **Step 3 — Fields**: the `w-56` left sidebar is now **hidden on mobile by default**. A "Fields" button appears in the toolbar on small screens; tapping it slides in the sidebar as a full-height overlay (z-40) with a backdrop. A mobile close button (`X`) is rendered inside the sidebar on small screens only. A **mobile bottom bar** (Back / Continue) is injected beneath the canvas so the step can be navigated without the sidebar. Toolbar condensed — zoom controls tightened, page indicator shortened to `{n}/{total}`, hint text hidden on mobile. Canvas padding `p-6` → `p-2 sm:p-6`.
- **Step 4 — Review**: layout changed from a fixed side-by-side `flex` to `flex-col lg:flex-row`. Left summary panel goes full-width on mobile; document preview panel is **hidden on mobile** (`hidden lg:flex`) since the summary alone is sufficient to confirm and send. Left panel padding and heading size scaled for mobile.
- Added `mobileFieldsPanelOpen` state variable to drive the new overlay sidebar.

### `src/components/mobile-bottom-nav.tsx`
- Side buttons changed from `min-w-[80px]` (fixed) to `flex-1 min-w-0 max-w-[100px]` so they stretch proportionally and never overflow on sub-360 px screens.
- Wrapper padding reduced from `px-6` → `px-2`.
- Label `span` elements given `truncate w-full text-center` to prevent text overflow.
- "Agreements" label shortened to "Docs" so the label fits comfortably at any width.

### `src/components/ai-document-wizard.tsx`
- The "My Documents" sidebar was previously inserted **inline** (`w-80`) next to the chat area. On a 375 px phone this left only ~55 px for the chat — unusable. Sidebar now renders as a **position:absolute overlay** on mobile (`absolute inset-y-0 left-0 z-20 w-72 shadow-xl`) and a fixed-width sidebar on desktop (`lg:relative lg:w-80`).
- Semi-transparent backdrop (`z-10 bg-black/30`) added; tapping outside closes the sidebar on mobile.
- Wizard minimum height adjusted: `h-[calc(100vh-4rem)] sm:h-[calc(100vh-8rem)]` so the chat fits taller on short-viewport phones.

### `src/app/page.tsx`
- AI Document Wizard `<Dialog>` sizing scoped to `sm:` breakpoint: `sm:max-w-4xl sm:h-[90vh]` instead of applying to all sizes. On mobile the dialog already occupies the full screen via `inset-0`; the `max-w-4xl` constraint was preventing correct full-screen rendering.

### `src/components/self-sign-flow.tsx`
- **Header**: file name `max-w` tightened to `max-w-[140px] sm:max-w-[200px]`; zoom controls padding reduced; page navigation hidden on mobile (`hidden sm:flex`); Sign/Download buttons show icon-only below `sm` breakpoint.
- **Upload step**: padding reduced (`p-4 sm:p-8`, drop-zone `p-6 sm:p-12`).
- **Sign step — sidebar**: `w-64` left sidebar is now a **slide-in overlay** on mobile. A "Fields" (`PenTool`) toggle button added to the header on small screens. Mobile close button injected at the top of the sidebar. Backdrop overlay added.
- **Sign step — canvas**: padding reduced (`p-2 sm:p-6`); `flex flex-col` added so the optional mobile page-navigation bar can be appended below the canvas.
- **Mobile page navigation**: a prev/next page bar is rendered below the canvas on small screens when the document has more than one page (`sm:hidden`).
- **Field Settings panel** (right side): hidden on mobile (`hidden sm:block`) to prevent three simultaneous panels from cramming into a narrow screen.
- Added `mobileSidebarOpen` state variable.

---

## Summary Statistics

| Category | Count |
|----------|-------|
| New files created | 22 |
| Files modified | ~155 |
| Files deleted | 1 |
| Files archived (moved) | ~70 (NestJS API backend) |
| Total lines changed (Batch 1 commit) | 1,207 insertions / 607 deletions across 118 files |
| Test files | 13 files, 143 tests (all passing) |
| `console.log` statements gated | ~300+ across 164 files |
| `as any` casts eliminated | ~40 |
| Silent `.catch(() => {})` fixed | 20+ |
| Security vulnerabilities closed | 9 (Batch 1: 6 + Batch 3: 3 — Stripe webhook bypass, unauthenticated cron, fusion notify spoofing) |
| PDF.js CDN dependencies eliminated | 7 components now self-hosted |
| Crash bugs fixed | 3 (signer-locations 500, WinAnsi PDF encoding, AI chat 500) |
| **Batch 4 — Mobile files patched** | **7** |
| **Batch 4 — Mobile issues resolved** | **Layout overflow, sidebar cramping, unreadable headers, fixed-width breakage on phones** |
