# GCDS Architecture

> Canonical technical architecture specification and system design source of truth for Gazi Customer Data Store.  
> Cross-references: [PRD](./PRD.md) | [Rules](./RULES.md) | [Design](./DESIGN.md) | [Tasks](./TASKS.md) | [Memory](./MEMORY.md)

---

## 1. Technology Stack

Verified directly from repository configuration and `package.json`:

| Layer | Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Framework** | Next.js (App Router) | `16.3.0` | React server-side rendering, Server Actions, Route Handlers |
| **Runtime / UI** | React / React DOM | `19.2.8` | Component model, concurrent rendering |
| **Language** | TypeScript | `^5` | Strict static typing (`strict: true`) |
| **Styling** | Tailwind CSS / PostCSS | `^4` / `@tailwindcss/postcss ^4` | Utility styling with CSS-first configuration (`globals.css`) |
| **Backend / DB** | Supabase (PostgreSQL) | Managed Cloud | Multi-tenant relational DB, RLS, Auth, Private Storage |
| **Database SDK** | `@supabase/ssr` / `@supabase/supabase-js` | `^0.12.4` / `^2.112.2` | Cookie-based server client and client-side browser client |
| **Forms & Validation** | React Hook Form & Zod | `^7.84.0` / `^4.4.3` (`@hookform/resolvers ^5.7.1`) | Client/server form validation and schema parsing |
| **State / Cache** | TanStack React Query | `5.103.1` | Client-side cache, query key management, optimistic updates |
| **Image Processing** | Sharp | `^0.35.3` | High-performance server-side image optimization & avatar resizing |
| **AI / Intelligence** | Google GenAI SDK | `^2.16.0` | Gemini extraction for unstructured documents (optional tier) |
| **UI Components** | Lucide React | `^1.30.0` | Production icon set |
| **Data Viz** | Recharts | `^3.10.1` | Dashboard metrics, workload distribution, and revenue charts |
| **Notifications** | Sonner | `^2.0.7` | Modern toast notifications system |
| **Utilities** | UUID | `^14.0.1` | Client/server unique identifier generation |

---

## 2. Repository Structure

A concise view of the active production workspace:

```text
c:\GCDS/
├── docs/                                  # Canonical project knowledge base
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   ├── RULES.md
│   ├── DESIGN.md
│   ├── TASKS.md
│   └── MEMORY.md
├── src/
│   ├── app/
│   │   ├── (auth)/                        # Public authentication & verification flows
│   │   │   ├── login/
│   │   │   ├── forgot-password/
│   │   │   ├── update-password/
│   │   │   └── mfa/verify/                # Mandatory AAL2 challenge screen
│   │   ├── (dashboard)/                   # Protected application routes (AAL2 enforced)
│   │   │   ├── layout.tsx                 # Persistent navigation shell & drawer
│   │   │   ├── dashboard/
│   │   │   ├── operations/
│   │   │   ├── communications/
│   │   │   ├── requests/
│   │   │   ├── customers/
│   │   │   │   ├── new/                   # Customer intake (Smart Import + Manual)
│   │   │   │   └── [id]/                  # Customer profile tabs & edit
│   │   │   ├── invoices/
│   │   │   │   ├── new/
│   │   │   │   └── [id]/print/            # GST-ready invoice print view
│   │   │   ├── payments/
│   │   │   ├── documents/
│   │   │   ├── services/
│   │   │   ├── reports/
│   │   │   └── settings/
│   │   │       └── security/mfa/          # Mandatory MFA enrollment screen
│   │   ├── api/                           # Route handlers (dashboard metrics, suggestions)
│   │   ├── auth/                          # OAuth & email verification callback endpoints
│   │   ├── globals.css                    # Tailwind v4 import, tokens & keyframe animations
│   │   └── layout.tsx                     # Root HTML shell & query providers
│   ├── components/                        # Modular React components by feature
│   │   ├── AiSmartImportEngine/           # Multi-document dropzone, review & normalizer
│   │   ├── auth/                          # MFA challenge, enrollment & logout modals
│   │   ├── customers/                     # Customer profile tabs, timeline, followups
│   │   ├── dashboard/                     # Daily attention queue, KPI cards, charts
│   │   ├── forms/                         # CustomerForm, Indian pincode auto-fill
│   │   ├── invoices/                      # Invoice creation, print layouts, row actions
│   │   ├── operations/                    # Operations inbox, quick followup resolve modals
│   │   ├── payments/                      # Payment register, record payment modal
│   │   ├── reports/                       # Analytics, receivables ageing, tax readiness
│   │   ├── requests/                      # Requests desk, Kanban board, workspace drawer
│   │   ├── tables/                        # CustomerTable, ServiceTable
│   │   └── ui/                            # EmptyState, InlineErrorState, PageHeader
│   ├── lib/
│   │   ├── address/                       # IndiaPincodeProvider & address lookups
│   │   ├── ai/                            # Multi-provider registry (Gemini, OpenRouter, Cache)
│   │   ├── auth/                          # MFA policy, safeRedirect, adminMfaReset
│   │   ├── billing/                       # Billing ledger calculation & draft semantics
│   │   ├── document-preprocessing/        # MarkItDown router for PDF/DOCX/XLSX
│   │   ├── names/                         # Name segmenter & Bengali transliterator helpers
│   │   ├── ocr/                           # OcrSpaceProvider, DocumentClassifier, Parser
│   │   ├── operations/                    # Asia/Kolkata date utilities
│   │   └── supabase/                      # Server, Client & Middleware Supabase factories
│   ├── providers/                         # QueryProvider (TanStack React Query)
│   └── types/                             # TypeScript interfaces (customer, service, billing)
├── supabase/
│   └── migrations/                        # Chronological SQL migrations & RLS policies
└── test-*.ts                              # Deterministic regression test suites (executed via tsx)
```

---

## 3. Next.js App Router Architecture

GCDS leverages Next.js 16 App Router principles:

1. **Route Groups**:
   - `(auth)`: Unauthenticated entry points and the intermediate AAL1 MFA challenge screen.
   - `(dashboard)`: All operational business desks wrapped by a unified responsive layout shell (`layout.tsx`).
2. **Server Actions First**:
   - Application mutations (creating customers, scheduling follow-ups, advancing request FSM, generating invoices) run exclusively as Server Actions (`'use server'`).
   - Server Actions execute securely on the server with direct database connectivity and strict session validation.
3. **Optimized Client Boundaries**:
   - Leaf forms and interactive desks declare `"use client"` while receiving server-fetched initial data or invoking server actions directly.
   - TanStack React Query coordinates client-side query caching, background polling, and optimistic UI transitions.
4. **Cache Revalidation**:
   - Server Actions invoke `revalidatePath()` targeting modified routes (e.g., `/customers`, `/requests`, `/invoices`) to ensure instant client freshness without page reloads.

---

## 4. Authentication Architecture & MFA Policy

GCDS implements a high-assurance **4-State Security Model** governed by Supabase Auth and TOTP Multi-Factor Authentication:

```
                  ┌───────────────────────────────┐
                  │       Visitor / Browser       │
                  └───────────────┬───────────────┘
                                  │
                                  ▼
               ┌─────────────────────────────────────┐
               │         Next.js Middleware          │
               │   (src/lib/supabase/middleware.ts)  │
               └──────────────────┬──────────────────┘
                                  │
                  ┌───────────────┴───────────────┐
                  │ Evaluate Route Auth State     │
                  └───────────────┬───────────────┘
                                  │
       ┌──────────────────────────┼──────────────────────────┐
       │ (State A)                │ (State B)                │ (State C)
       ▼                          ▼                          ▼
  Unauthenticated            AAL1 Session               AAL1 Session
  No Active Session          0 Verified Factors         Verified Factor Present
       │                          │                          │
       ▼                          ▼                          ▼
 Redirect to:              Redirect to:               Redirect to:
  /login                    /settings/security/mfa     /mfa/verify
                            (Mandatory Enrollment)     (MFA Challenge)
                                  │                          │
                                  └──────────────┬───────────┘
                                                 │ TOTP Verified
                                                 ▼
                                     ┌─────────────────────────┐
                                     │ (State D)               │
                                     │ Authenticated AAL2      │
                                     │ Verified Factor Active  │
                                     └───────────┬─────────────┘
                                                 │
                                                 ▼
                                      Protected Application
                                      (/dashboard, /requests, ...)
```

### 4.1 Four-State Enforcement
1. **State A (Unauthenticated)**: User has no active Supabase session. Redirected immediately to `/login`.
2. **State B (AAL1 without Factor)**: User authenticated with password only and has not enrolled an authenticator factor. Bound strictly to `/settings/security/mfa` for mandatory enrollment. Protected app routes are inaccessible.
3. **State C (AAL1 with Factor)**: User authenticated with password, and has a verified TOTP factor enrolled. Bound strictly to `/mfa/verify` to complete the second-factor challenge.
4. **State D (AAL2 Complete)**: Session holds authoritative `aal2` assurance. Full access to protected routes granted.

### 4.2 Server-Side Action Guard (`requireAal2`)
Middleware alone is insufficient for defense-in-depth. Every protected Server Action in the `(dashboard)` domain imports and calls:

```typescript
import { requireAal2 } from "@/lib/auth/mfaEnforcement";

export async function someProtectedAction() {
  const supabase = await createClient();
  const { user, assurance } = await requireAal2(supabase);
  // Authoritative AAL2 verified; proceed safely with mutation
}
```

### 4.3 Implementation Status vs Operational Acceptance
- **Code-Hardened Implementation**: The 4-state authentication route evaluator (`src/lib/auth/mfaEnforcement.ts`), middleware route gates, `requireAal2` server-action guards across all protected mutations, and database-level privileged financial RPC role checks are fully implemented and verified via automated test suites (`test-server-actions-aal2.ts` with 109 assertions).
- **Pending Operational Acceptance**: Live operational smoke testing on physical authenticator devices (Google Authenticator, Microsoft Authenticator across iOS/Android) and production environment configuration verification remain pending live staging/production deployment testing.

If the session lacks valid `aal2` assurance or active verified factors, `requireAal2()` throws an authentication error, failing closed before reading or modifying tenant data.

### 4.4 Safe Redirection
All login and post-auth redirect paths pass through `getSafeNextPath()` (`src/lib/auth/safeRedirect.ts`) to prevent open redirect vulnerabilities.

---

## 5. Authorization & Multi-Tenant Boundary

GCDS employs strict Multi-Tenant Data Isolation enforced at the PostgreSQL database layer.

### 5.1 Business Membership Model
- Each tenant is identified by a unique `business_id` in `public.businesses`.
- User access is mapped via `public.business_memberships`:
  - `user_id`: UUID matching `auth.users.id`.
  - `business_id`: UUID of the business.
  - `role`: Enum: `'owner' | 'admin' | 'operator'`.
  - `status`: Enum: `'active' | 'suspended'`.

### 5.2 Non-Recursive RLS Helper
To prevent PostgreSQL Row Level Security policy infinite recursion, GCDS uses a dedicated private schema function:

```sql
CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.is_active_business_member(p_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.business_memberships bm
    WHERE bm.business_id = p_business_id
      AND bm.user_id = auth.uid()
      AND bm.status = 'active'
  );
$$;
```

Permissions on `private.is_active_business_member` are revoked from `PUBLIC` and `anon`, and granted strictly to `authenticated`. All table RLS policies on `customers`, `customer_documents`, `service_requests`, `invoices`, `payments`, and `communications` evaluate against this helper.

---

## 6. Customer Architecture

1. **Structured Name Trio**: Customer names are cleanly split into `first_name`, `middle_name`, and `last_name`. This provides deterministic name sorting, duplicate lookup, and formal document rendering.
2. **Native Language Name**: Non-Latin names are stored in `original_language_name`. No duplicate or language-specific DB columns exist.
3. **Pincode Lookup Provider**: The `IndiaPincodeProvider` module queries local Postal Index Number data to auto-fill post office, district, and state upon 6-digit PIN entry.
4. **Field Origins Policy**: When auto-filling forms from Smart Import or Pincode lookups, the client tracks field provenance (`'user' | 'ai' | 'lookup'`). User-edited fields are protected from automatic overwrite.
5. **Duplicate Prevention**: Automated duplicate detection evaluates phone, Aadhaar, PAN, and Voter ID against existing tenant records, issuing non-blocking warnings to the operator.
6. **Canonical Phone Validation**: Phone numbers must start with an international calling code, followed by a hyphen, and at least 4 digits (e.g., `+91-9876543210`).

---

## 7. Document Architecture & Secure Storage

1. **Storage Buckets**: Documents are uploaded to private bucket `customer_documents` (with automated fallback to `customer-profiles`).
2. **Path Convention**: Files are partitioned by customer: `${customerId}/${documentId}_${sanitizedFilename}`.
3. **Transient Signed URLs**: GCDS **never** stores signed URLs in database tables or client caches. Persistent storage contains only canonical storage paths/references (such as in `customer_documents` or customer profile `photo_source`). Signed URLs are ephemeral (valid for 900 seconds / 15 minutes), generated dynamically on demand, and never persisted.
4. **File Constraints**: Maximum 10MB per file; strictly enforced MIME types (`image/jpeg`, `image/png`, `image/webp`, `application/pdf`).
5. **Side Tracking**: The `customer_documents` table records document side (`front`, `back`, `both`, `single`) to facilitate official multi-sided identity printing.

---

## 8. Smart Import Architecture

Smart Import implements a resilient, multi-tiered document intelligence pipeline:

```
[ Uploaded Files (1-10 Files: Images, PDFs, DOCX, XLSX) ]
                        │
                        ▼
          ┌───────────────────────────┐
          │ Document Type Dispatcher  │
          └─────────────┬─────────────┘
                        │
         ┌──────────────┼───────────────────────────┐
         │              │                           │
         ▼              ▼                           ▼
    [ Images ]        [ PDFs ]              [ DOCX / XLSX ]
  (JPG, PNG, WEBP)      │                           │
         │              ▼                           ▼
         │      DocumentPreprocessorRouter  DocumentPreprocessorRouter
         │      (MarkItDown Engine)         (MarkItDown Engine Only!)
         │              │                           │
         │        ┌─────┴──────────────┐            │
         │        │ Structured Text?   │            │
         │       YES                  NO            │
         │        │             (Scanned PDF)       │
         │        │                    │            │
         ▼        ▼                    ▼            │
     OCR.Space Provider   ◀────────────┘            │
     (Primary OCR)                                  │
         │                                          │
         ├──────────────────────────────────────────┘
         ▼
  DocumentClassifier ──▶ DocumentTextParser
         │
         ▼
  Parsed Fields & Candidate Attributes
         │
         ├──▶ (If OCR Key Missing or Low Completeness)
         │       └──▶ Optional AI Enhancement (Gemini / OpenRouter)
         │            *Strictly guarded by SMART_IMPORT_AI_ENHANCEMENT_ENABLED
         ▼
  DataNormalizer (Phones, Dates, Aadhaar, PAN)
         │
         ▼
  MergeEngine (Conflict Detection & Side Reconciliation)
         │
         ▼
  CustomerForm Auto-Fill with Field Origins Tracking
```

### 8.1 Key Pipeline Guarantees
- **No Unsolicited External AI Calls**: If `OCR_SPACE_API_KEY` is not configured, the engine defaults safely to manual review and does **not** leak customer documents to Gemini or external LLMs unless explicitly enabled by feature flag.
- **Office Document Constraint**: Office documents (`.docx`, `.xlsx`) are parsed strictly through `MarkItDown` and normalized to side `'single'`. They are never passed to image OCR providers.
- **Deterministic Classification**: `DocumentClassifier` categorizes documents (Aadhaar, PAN, Voter ID, Driving License, Passport, Utility Bill) via regex patterns before parsing.

---

## 9. Service Request Architecture & FSM

Service requests follow a deterministic Finite State Machine (FSM) enforced by PostgreSQL database trigger `trg_validate_service_request_status_transition`. Allowed transitions are strictly determined by the canonical transition matrix; transitions do not form a single mandatory linear chain.

```
  [ pending ] ──▶ [ documents_pending ] ──▶ [ ready_to_submit ]
       │                     │                      │
       │                     ▼                      ▼
       │                [ cancelled ]          [ submitted ]
       │                                            │
       ▼                                            ▼
  [ cancelled ]                                [ in_process ]
       │                                            │
       │                         ┌──────────────────┴──────────────────┐
       │                         ▼                                     ▼
       │                [ action_required ]                       [ completed ]
       │                         │                                     │
       │                         ▼                                     ▼
       │                    [ rejected ]                          [ delivered ]
       │               (rejection_reason req.)                         │
       │                         │                                     │
       └─────────────────────────┼─────────────────────────────────────┘
                                 ▼
                           [ archived ] (Terminal)
```

### 9.1 Status Transitions
- `pending`: -> `documents_pending`, `ready_to_submit`, `cancelled`, `archived`
- `documents_pending`: -> `ready_to_submit`, `cancelled`
- `ready_to_submit`: -> `documents_pending`, `submitted`, `cancelled`
- `submitted`: -> `in_process`, `action_required`, `rejected`
- `in_process`: -> `action_required`, `completed`, `rejected`
- `action_required`: -> `documents_pending`, `ready_to_submit`, `submitted`, `in_process`, `rejected`, `cancelled`
- `completed`: -> `delivered`, `archived`
- `delivered`: -> `archived`
- `rejected`: -> `archived` (Transition to `rejected` strictly requires a non-empty `rejection_reason`)
- `cancelled`: -> `archived`
- `archived`: No further transitions allowed (terminal).
- Legacy: `in_progress` is safely supported and transitions forward into `in_process`, `action_required`, `completed`, `rejected`, `cancelled`, or `archived`.

---

## 10. Billing Architecture & Financial Ledger

GCDS manages invoicing and payments with strict double-entry ledger discipline.

### 10.1 Draft Invoice Semantics
- Invoices support statuses: `draft`, `issued`, `partially_paid`, `paid`, `cancelled`.
- **Financial Invariant**: Only `issued`, `partially_paid`, and `paid` invoices are financially active.
- Invoices in `draft` or `cancelled` status **never** establish customer debt, do not alter receivables, and do not modify the linked request payment status.

### 10.2 Request Payment Status Formula
For any service request, its canonical payment status is derived mathematically:
1. If an active waiver exists and there are zero active invoices -> `waived`.
2. If there are zero active invoices -> `unpaid`.
3. If total paid across active invoices is zero -> `unpaid`.
4. If balance due across active invoices is zero (and total paid > 0) -> `paid`.
5. Otherwise -> `partial`.

*An issued invoice clears any previous fee waiver and establishes active customer debt.*

### 10.3 Privileged Financial RPCs
High-consequence financial operations run via hardened PostgreSQL `SECURITY DEFINER` functions in migration `20260925183000_phase3b_privileged_financial_rpc_hardening.sql`:
- `void_payment_atomic(p_payment_id uuid)`
- `refund_payment_atomic(p_payment_id uuid)`
- `set_request_payment_waiver(p_request_id uuid, p_waived boolean)`
- `unallocate_payment_atomic(p_payment_id uuid, p_invoice_id uuid)`

**Hardening Rules**:
- `SET search_path = ''`: Prevents schema search hijacking; all objects are schema-qualified (`pg_catalog`, `public`).
- Strict caller validation: Fails closed unless `auth.uid()` is present and active `role IN ('owner', 'admin')` in `public.business_memberships`.
- Authoritative AAL2 check: Explicitly verifies `auth.jwt()->>'aal' = 'aal2'`.
- Zero service_role bypass: Execution permissions are revoked from `PUBLIC`, `anon`, and `service_role`, and granted strictly to `authenticated`.

---

## 11. Operations & Communications Architecture

1. **Operations Inbox**: Aggregates time-sensitive operational tasks, SLA deadlines, and follow-up activities.
2. **Asia/Kolkata Canonical Timezone**: All date boundaries, overdue flags, and daily queues evaluate against Indian Standard Time (`Asia/Kolkata`) via `src/lib/operations/dateUtils.ts`.
3. **Communications Hub**: Stores interaction logs (call notes, WhatsApp sent timestamps, customer reminders) linked to customer profiles and service requests. Provides one-click WhatsApp web URL generation with URL-encoded templates.

---

## 12. Cache & Data Freshness Rules

To guarantee financial and security integrity:
1. **Server Authority**: User authentication status, AAL level, business membership, invoice balances, and request FSM states are strictly server-authoritative.
2. **Strict Client Storage & Cache Boundary**: The following authoritative and sensitive states must **never** be persisted in browser `localStorage`/`sessionStorage` or treated as client/TanStack Query cache authority:
   - Financial state, ledger transactions, and invoice/payment summaries.
   - Active transactional service states.
   - Request FSM status and authoritative transitions.
   - KYC documents, customer identity identifiers, and full customer profiles.
   - Ephemeral signed URLs.
   Display-only and non-authoritative data may use caching only where the existing implementation explicitly permits it. Server/database remains authoritative.
3. **React Query Invalidation**: Mutations in Server Actions trigger targeted React Query cache invalidation using deterministic query keys defined in `src/lib/queryKeys.ts`.

---

## 13. Deployment Architecture

```
  [ Git Push: main ] ──▶ [ GitHub Repository: gazi-online/gazi-customer-data-store ]
                                      │
                                      ▼
                        [ Vercel Deployment Pipeline ]
                                      │
                        ┌─────────────┴─────────────┐
                        ▼                           ▼
                 Production Edge            Next.js App Server
                 (Assets, Caching)          (SSR & Server Actions)
                                                    │
                                                    ▼
                                       [ Supabase Cloud (Postgres) ]
                                       - pg_auth & TOTP MFA
                                       - Multi-Tenant RLS Tables
                                       - Hardened Privileged RPCs
                                       - Private Storage Buckets
```

- **Environment Variables**: Managed securely through Vercel and Supabase dashboards.
- **Database Migrations**: Applied sequentially to Supabase PostgreSQL via version-controlled migration files in `supabase/migrations/`.

---

## 14. Testing & Verification Architecture

GCDS maintains a comprehensive suite of deterministic test runners in the repository root. Tests are executed directly with `npx tsx`:

| Test Suite | File | Focus |
| :--- | :--- | :--- |
| **Server Action AAL2** | `test-server-actions-aal2.ts` | Validates `requireAal2()` calls across all dashboard actions |
| **Financial RPC Hardening** | `test-financial-rpc-hardening.ts` | Validates owner/admin checks, AAL2 claims, and `search_path = ''` |
| **Service Request FSM** | `test-service-request-fsm.ts` | Validates all 11 FSM states and transition matrix |
| **Smart Import Uploader** | `test-v132-ai-smart-import-upload-ui.ts` | Validates upload constraints, side assignments, and Office docs |
| **Billing Ledger Formula** | `test-phase2c-3c-payment-status-ledger.ts` | Validates draft invoice semantics and request payment calculations |
| **Mandatory MFA Policy** | `test-mfa-mandatory-enforcement.ts` | Validates 4-state auth route evaluation |

Before concluding development tasks, agents and developers must execute the relevant test suites, run TypeScript typechecking (`npm run typecheck`), and verify linting (`npm run lint`).
