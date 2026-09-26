# GCDS Project Memory

> Persistent architectural memory and context handoff for future AI coding agents and engineering contributors.  
> Read this document first when onboarding onto a new task in this repository.  
> Cross-references: [PRD](./PRD.md) | [Architecture](./ARCHITECTURE.md) | [Rules](./RULES.md) | [Design](./DESIGN.md) | [Tasks](./TASKS.md)

---

## 1. Identity & Purpose

- **Project Name**: Gazi Customer Data Store (GCDS)
- **Repository**: `gazi-online/gazi-customer-data-store`
- **Purpose**: Secure customer data store, document vault, and operational kiosk management system for Indian digital citizen-service centers (CSC / Digital Seva / Cyber Cafes).
- **Core Workflows**: Rapid customer intake, Smart Import document OCR, service job tracking, GST invoicing, micro-payments, and omni-channel follow-ups.

---

## 2. Current Baseline

- **Active Branch**: `main`
- **Current HEAD Commit**: `4a3d3fce4679c617a0b1137c7719d089a341116f`
- **Platform Stack**: Next.js 16.3.0 (App Router), React 19.2.8, Tailwind CSS v4, TypeScript 5, Supabase (PostgreSQL with RLS), TanStack React Query 5.103.1.
- **Production Status**: Production-hardened with active TOTP MFA, Server Action AAL2 guards, privileged financial RPC role checks, and Smart Import v13.2.

---

## 3. Critical Architecture Decisions

### 3.1 Security & Multi-Factor Authentication
- **4-State Security Model**: Evaluated in `src/lib/auth/mfaEnforcement.ts` via middleware and Server Actions:
  - State A (Unauthenticated) -> `/login`
  - State B (AAL1 with 0 factors) -> `/settings/security/mfa` (Mandatory Enrollment)
  - State C (AAL1 with factor) -> `/mfa/verify` (Mandatory TOTP Challenge)
  - State D (AAL2 verified) -> Protected application
- **Server Action AAL2 Guard**: Every protected server action calls `await requireAal2(supabase)`. Password authentication alone never permits reading or writing protected tenant data.
- **SECURITY DEFINER Hardening**: All privileged PostgreSQL functions declare `SET search_path = ''` to prevent search path hijacking. Objects are schema-qualified (`pg_catalog.*`, `public.*`).
- **Zero service_role Bypass**: Privileged financial operations (`void_payment_atomic`, `refund_payment_atomic`, `set_request_payment_waiver`, `unallocate_payment_atomic`) revoke execution from `PUBLIC`, `anon`, and `service_role`. They are granted strictly to `authenticated` and verify active `owner`/`admin` membership.
- **Non-Recursive RLS Helper**: Table RLS policies use `private.is_active_business_member(business_id)` residing in a separate `private` schema to avoid infinite recursion.

### 3.2 Smart Import Pipeline
- **Tiered Processing**:
  1. *Images (JPG, PNG, WEBP)*: Processed by `OcrSpaceProvider` -> `DocumentClassifier` -> `DocumentTextParser`.
  2. *Office Documents (DOCX, XLSX)*: Processed strictly by `DocumentPreprocessorRouter` (MarkItDown adapter) and locked to side `'single'`. Office files are **never** passed to image OCR.
  3. *PDFs*: Structured PDFs extracted via MarkItDown; scanned/image PDFs fall back to OCR.Space.
- **Credential Fallback Isolation**: When `OCR_SPACE_API_KEY` is absent or encounters authentication errors, the engine flags items for manual review. It **never** silently redirects customer files into external LLMs (Gemini / OpenRouter) unless `SMART_IMPORT_AI_ENHANCEMENT_ENABLED === 'true'`.
- **Field Origins Tracking**: Fields carry origin tags (`'user' | 'ai' | 'lookup'`). User-edited fields are protected from automatic overwrite during subsequent auto-fills.

### 3.3 Customer Data Model & Regional Names
- **Structured Name Trio**: Names are partitioned into `first_name`, `middle_name`, and `last_name`.
- **Native Language Name**: Non-Latin script names (Bengali, Hindi, etc.) are stored strictly in **`original_language_name`**.
- **Rule on Regional Columns**: **Never invent language-specific database columns** (e.g., `bengali_name`, `bangla_name`). The single generic column `original_language_name` is canonical.

### 3.4 Service Request Workflow
- **11-State FSM**: Governed strictly by PostgreSQL trigger `trg_validate_service_request_status_transition`:
  `pending` -> `documents_pending` -> `ready_to_submit` -> `submitted` -> `in_process` -> `action_required` -> `completed` -> `delivered` -> `rejected` (requires reason) -> `cancelled` -> `archived` (terminal).
- **Audit Logging**: Status transitions automatically generate append-only records in `service_request_status_history`.

### 3.5 Billing & Financial Ledger
- **Draft Invoice Semantics**: An invoice in `draft` status is a calculation preview. It does not establish customer debt and does not alter request payment status.
- **Ledger Formula**: Active debt and payment statuses are derived exclusively from `issued`, `partially_paid`, and `paid` invoices.
- **Atomic Stored Procedures**: Payment creation, allocation, voiding, and refunds execute through atomic database transactions.

### 3.6 Ephemeral Signed URLs
- Supabase Storage signed URLs expire in 900 seconds (15 minutes).
- Database tables store only canonical storage paths (`${customerId}/${documentId}_${filename}`). Signed URLs are generated dynamically on demand and never persisted.

---

## 4. Key Entry Points & Code Locations

| Domain | Key Files & Entry Points |
| :--- | :--- |
| **Auth & MFA** | `src/lib/auth/mfaEnforcement.ts`, `src/lib/auth/mfa.ts`, `src/app/(auth)/mfa/verify/` |
| **Middleware** | `src/middleware.ts`, `src/lib/supabase/middleware.ts` |
| **Customer Form** | `src/components/forms/CustomerForm.tsx`, `src/types/customer.ts`, `src/app/(dashboard)/customers/actions.ts` |
| **Smart Import** | `src/components/AiSmartImportEngine/index.tsx`, `src/app/(dashboard)/customers/ai-actions.ts`, `src/lib/ocr/` |
| **Requests Desk** | `src/app/(dashboard)/requests/`, `src/components/requests/RequestWorkspace.tsx`, `src/lib/services/serviceRequestWorkflow.ts` |
| **Invoices & Billing**| `src/app/(dashboard)/invoices/`, `src/components/invoices/`, `src/app/(dashboard)/payments/actions.ts` |
| **Documents Vault** | `src/app/(dashboard)/documents/actions.ts`, `src/components/shared/DocumentGrid.tsx` |
| **Operations Queue**| `src/app/(dashboard)/operations/`, `src/components/operations/OperationsInboxView.tsx` |
| **Communications** | `src/app/(dashboard)/communications/`, `src/components/communications/CommunicationCenterView.tsx` |
| **DB Migrations** | `supabase/migrations/20260925183000_phase3b_privileged_financial_rpc_hardening.sql`, `20260913082805_service_requests_fsm_transition_migration.sql` |

---

## 5. Things Future Agents Must Never Assume

1. **Do not assume password login grants app access**: An operator cannot access `/dashboard` without completing TOTP verification (AAL2).
2. **Do not assume server actions are protected by middleware alone**: Every protected Server Action must explicitly call `await requireAal2(supabase)`.
3. **Do not assume Bengali names have a dedicated DB column**: They are stored in `original_language_name`. Do not alter database schemas to add `bengali_name`.
4. **Do not assume draft invoices create receivables**: Draft invoices have zero impact on customer ledger balances.
5. **Do not assume arbitrary request status updates will succeed**: The database trigger validates every transition. Skipping intermediate states throws an unhandled database exception.
6. **Do not assume signed URLs can be saved to the database**: Storing signed URLs causes broken links after 15 minutes. Store storage paths only.
7. **Do not use destructive git commands**: Commands such as `git reset --hard` or `git clean -fd` are strictly prohibited.

---

## 6. How To Continue Safely

When given a new task in this repository:
1. **Audit First**: Read the relevant files listed in the entry points table.
2. **Review Rules**: Check [Rules](./RULES.md) to ensure compliance.
3. **Check Test Coverage**: Run existing relevant test suites via `npx tsx test-*.ts` to verify the baseline before making changes.
4. **Make Surgical Edits**: Modify only the code strictly required for the feature or fix.
5. **Verify**:
   - `npm run typecheck` (`tsc --noEmit`)
   - `npm run lint`
   - Re-run test suites (`npx tsx test-*.ts`)
6. **Commit Safely**: Stage specific modified files by name. Never push to remote without explicit user authorization.
