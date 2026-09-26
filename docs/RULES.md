# GCDS Engineering Rules

> Non-negotiable engineering, security, data integrity, and operational rules for every AI coding agent and human developer working on GCDS.  
> Cross-references: [PRD](./PRD.md) | [Architecture](./ARCHITECTURE.md) | [Design](./DESIGN.md) | [Tasks](./TASKS.md) | [Memory](./MEMORY.md)

---

## Rule 1 — Existing Production System
**Never rebuild GCDS from scratch.** This repository is an active, production codebase with hardened database schemas, migration histories, and running businesses. All contributions must be surgical, incremental modifications honoring established conventions.

## Rule 2 — Audit Before Modification
**Inspect real implementation before changing code or behavior.** Never guess APIs, database columns, or workflows from generic framework knowledge. Always read source code, migration files, and existing test suites before authoring changes.

## Rule 3 — Preserve Data Security & Zero Secret Leakage
**Never expose secrets, credentials, or private customer data.**
- Prohibited in code and documentation: passwords, API keys, service-role keys, access tokens, customer identity numbers (Aadhaar, PAN), or customer phone numbers.
- Secret keys (`OCR_SPACE_API_KEY`, `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) must never be leaked to client bundles or error messages.

## Rule 4 — Supabase / RLS Tenant Authority
**Never weaken Row Level Security or bypass tenant boundaries.**
- All queries and mutations must be scoped to the caller's active business via `business_id`.
- Tenant checks must use the non-recursive security helper `private.is_active_business_member(business_id)`.
- Never create policies granting unrestricted table access.

## Rule 5 — SECURITY DEFINER Hardening
**Explicit auth, AAL2, and role checks are mandatory in PostgreSQL functions.**
- Every `SECURITY DEFINER` function must execute `SET search_path = ''` to prevent search path hijacking.
- All database objects must be explicitly schema-qualified (`pg_catalog.*`, `public.*`).
- Caller identity must be extracted strictly from `auth.uid()` and verified JWT claims. Never trust client-supplied user IDs.

## Rule 6 — Mandatory MFA & AAL2 Enforcement
**Protected operations must enforce authoritative AAL2 assurance.**
- Every protected Server Action in the `(dashboard)` route hierarchy must call `await requireAal2(supabase)`.
- The 4-state authentication route policy in middleware must be preserved: unauthenticated -> `/login`, AAL1 no factor -> `/settings/security/mfa`, AAL1 with factor -> `/mfa/verify`, AAL2 -> protected app.
- Never grant dashboard access based on password validation alone.
- Note: MFA route policy, Server Action requireAal2 guards, and database role checks are implemented and code-hardened; live production operational verification across physical authenticator devices remains pending.

## Rule 7 — Financial Integrity & Idempotency
**Financial mutations must remain authoritative, atomic, and idempotent.**
- Draft invoices (`draft`) **never** create customer debt, do not alter receivables, and do not modify service request payment statuses.
- Privileged operations (`void_payment_atomic`, `refund_payment_atomic`, `set_request_payment_waiver`, `unallocate_payment_atomic`) require `owner` or `admin` role AND AAL2 assurance.
- Never perform multi-step financial calculations in client-side React code.

## Rule 8 — Canonical Request Workflow FSM
**Never bypass canonical service request status transitions or assume a simple linear pipeline.**
- All status changes must obey the 11-state transition matrix enforced by `trg_validate_service_request_status_transition`. Allowed transitions are defined non-linearly by the matrix.
- Transitions to `rejected` strictly require an operator-provided non-empty `rejection_reason`.
- Lifecycle timestamps (`completed_at`, `delivered_at`, `archived_at`) are owned and stamped exclusively by PostgreSQL triggers, ignoring client-supplied values.

## Rule 9 — Smart Import Data Preservation
**Do not silently overwrite manually reviewed customer data.**
- Forms must maintain field origins (`'user' | 'ai' | 'lookup'`). Fields modified by the operator are protected from auto-fill overwrites.
- The Smart Import pipeline must preserve the canonical mental model: `Upload Documents -> Check Details -> Save Customer`.
- If an OCR provider key is missing, fail safely to manual entry without disclosing secret keys or falling back to unapproved third-party APIs.

## Rule 10 — Non-Persistent Signed URLs
**Do not persist signed URLs to database tables or client caches.**
- Persistent storage must contain only canonical storage paths or references (e.g., `${customerId}/${documentId}_${filename}` or customer `photo_source`).
- Supabase storage signed URLs expire in 900 seconds (15 minutes).
- Generate signed URLs dynamically on demand for viewing or downloading; never store or cache them across sessions.

## Rule 11 — Client Storage Security
**No sensitive customer information in insecure browser storage.**
- Never persist customer identity documents, Aadhaar numbers, PANs, phone numbers, or authentication tokens to `localStorage` or `sessionStorage`.
- Temporary upload previews must revoke Object URLs upon component unmount to prevent browser memory leaks.

## Rule 12 — Strict Cache Boundary
**Do NOT treat client/TanStack Query cache as authoritative for sensitive or transactional state.**
- The following authoritative states must **never** be client-cached as source of truth:
  - Financial state, ledger balances, invoices, payments, and billing summaries.
  - Active transactional service state and request FSM status.
  - KYC documents, customer identity identifiers, and full customer profiles.
  - Ephemeral signed URLs.
- Display-only/non-authoritative data may use caching only where existing implementation explicitly permits it. Server/database remains authoritative.
- Server Actions must invoke `revalidatePath()` on modified views.

## Rule 13 — Database Schema Changes
**Every schema change requires a versioned migration file.**
- Schema changes must be authored as SQL scripts in `supabase/migrations/` using timestamped naming (`YYYYMMDDHHMMSS_*.sql`).
- Never make ad-hoc, untracked changes to the production Supabase database.
- Migrations must be backwards-compatible with active code.

## Rule 14 — Mandatory Verification
**Verify typecheck, lint, and relevant test suites before marking tasks complete.**
- Run `npm run typecheck` (`tsc --noEmit`).
- Run `npm run lint`.
- Execute relevant test suites via `npx tsx test-*.ts`.
- Zero compiler errors, zero unresolved lint failures, and zero broken test assertions.

## Rule 15 — Git Command Safety
**Destructive git commands are strictly prohibited.**
- **NEVER** run `git reset --hard`.
- **NEVER** run `git clean` or `git clean -fd`.
- **NEVER** run destructive `git checkout -- .` or `git restore .` that wipes untracked or modified user work.
- Always stage specific files by name (e.g., `git add file1 file2`). Never run blanket `git add .` without checking untracked files.

## Rule 16 — Deployment Boundary
**Do not push, merge, or deploy unless explicitly authorized by the user.**
- Local commits are permitted when authorized by task instructions.
- Never run `git push origin ...`.
- Never trigger remote Vercel production deployments or Supabase remote database pushes autonomously.

## Rule 17 — Scope Discipline & Surgical Edits
**Do not refactor unrelated areas of the codebase.**
- Restrict modifications strictly to the files required for the immediate task.
- Do not reformat entire files or alter established architecture without an explicit directive.

## Rule 18 — Backward Compatibility
**Preserve compatibility with historical data and migrations.**
- Do not alter or reorder historical migration files that have already run on production.
- Respect legacy database enum values and status mappings (e.g., legacy `in_progress` status).

## Rule 19 — Accessibility & Mobile-First UX
**Target standard mobile viewports with accessible touch targets.**
- All user-facing views must remain fully functional and horizontally contained across mobile viewports: `360px`, `390px`, and `430px`.
- Minimum 44px touch targets on buttons, form controls, and navigation elements.
- Accessible focus rings (`focus-visible:ring-2 focus-visible:ring-violet-500`) on all interactive controls.

## Rule 20 — Canonical Documentation Maintenance
**Keep canonical documentation in sync with codebase reality.**
- If architecture, schemas, rules, or workflows evolve, update `docs/` concurrently.
- If `graphify-out/` exists, run `graphify update .` to synchronize the project knowledge graph.

## Rule 21 — Structured Names & Native Script Column Rule
**Always use structured names; never invent Bengali-specific database columns.**
- Use `first_name`, `middle_name`, and `last_name` for customer naming.
- All native/regional script names (Bengali, Hindi, etc.) must reside exclusively in `original_language_name`.
- Never create or reference fictitious columns such as `bengali_name`, `bangla_name`, or `customer_bengali_name`.

## Rule 22 — Zero service_role Bypass on Privileged Operations
**Revoke execution of privileged financial functions from service_role, anon, and PUBLIC.**
- Functions modifying balances, waivers, voids, or refunds must be granted strictly to `authenticated`.
- PostgREST requests must present valid user authentication and active owner/admin membership.

## Rule 23 — Canonical Phone Validation Rule
**Customer phone numbers must follow the canonical international format.**
- Phone numbers must start with an international calling code, followed by a hyphen, and at least 4 digits (e.g., `+91-9876543210`).
- Do not document or treat phone numbers as simple unqualified 10-digit strings.
