# GCDS Task Tracker

> Living project execution tracker, verification record, and candidate task roadmap for Gazi Customer Data Store.  
> Cross-references: [PRD](./PRD.md) | [Architecture](./ARCHITECTURE.md) | [Rules](./RULES.md) | [Design](./DESIGN.md) | [Memory](./MEMORY.md)

---

## 1. Production Baseline

- **Active Branch**: `main`
- **Application Baseline**: Documented against verified application code baseline at commit `4a3d3fce4679c617a0b1137c7719d089a341116f`.
- **Documentation Revision**: Canonical documentation tracked in local commits (initial baseline `c23fd680e174cb3f14eb54cba56a97ebf3c1d6a3`, updated in subsequent correction passes). Not claimed as deployed to remote unless explicitly verified.
- **Production Status**: Production-ready, code-hardened application baseline with mandatory multi-factor authentication route policy, server action AAL2 guards, privileged financial RPC role checks, and Smart Import v13.2. (Live production operational acceptance remains pending on items detailed in Section 3).

---

## 2. Completed Milestones & Implemented Product Areas

Summarized from real repository commit history and migration records:

### 2.1 Security & Authentication Foundation
- **Mandatory MFA Foundation & Route Policy**: Built 4-state authentication route evaluator (`src/lib/auth/mfaEnforcement.ts`), preventing unauthenticated or AAL1 access to protected routes.
- **MFA Challenge & Enrollment UI**: Implemented interactive TOTP enrollment (`/settings/security/mfa`) and challenge verification (`/mfa/verify`) with QR code display and secret key backup.
- **MFA Recovery Boundary & Account Recovery**: Implemented secure recovery session flows, password reset, and owner-only administrative MFA factor reset (`adminMfaReset.ts`).
- **Server Action AAL2 Guard Hardening (Phase S3A)**: Enforced `requireAal2()` across every protected dashboard server action, including customer, request, document, billing, communications, and settings actions.
- **Privileged Financial RPC Role Hardening (Phase S3B)**: Hardened `void_payment_atomic`, `refund_payment_atomic`, `set_request_payment_waiver`, and `unallocate_payment_atomic` in migration `20260925183000_phase3b_privileged_financial_rpc_hardening.sql`. Added `SET search_path = ''`, fail-closed `auth.uid()` checks, AAL2 token claims, owner/admin role verification, and revoked execution from `PUBLIC`, `anon`, and `service_role`.
- **Logout Confirmation**: Added accessible logout confirmation modal preventing accidental operator signouts.

### 2.2 Customer Data Store & UI Polish
- **Customer Intake Workflows**: Unified customer creation into a single form (`/customers/new`) featuring dual modes: "Upload Documents" (Smart Import) and "Enter Manually".
- **Structured Name Trio**: Separated customer naming into `first_name`, `middle_name`, and `last_name` across forms, database schema, and listing tables.
- **Native Script Name Input**: Restored and standardized `original_language_name` (labeled for Bengali, Hindi, etc.) without introducing non-standard DB columns.
- **India Pincode Auto-Fill**: Integrated automated postal PIN code lookup populating post office, district, and state.
- **Customer Profile Hub**: Five dedicated profile tabs: Details, Requests, Documents Vault, Billing Statement, and Activity Timeline.

### 2.3 Smart Import Engine (v13.2)
- **Multi-Format Dropzone**: Ingestion for images (JPG, PNG, WEBP), PDFs, and Office documents (DOCX, XLSX) up to 10MB per file and 10 files per batch.
- **Document Preprocessing Router**: Integration of MarkItDown adapter for DOCX/XLSX and searchable PDFs, with fallback to OCR.Space for scanned PDFs.
- **Side Assignment & Pairing**: Flexible document side assignment (`Front`, `Back`, `Both`, `Single`), with Office files automatically forced to `Single`.
- **Field Origins & Conflict Resolution**: Origin tracking (`'user' | 'ai' | 'lookup'`) preventing automatic overwriting of operator-corrected fields.
- **Safe Fallback**: Graceful manual review fallback when OCR keys are missing without leaking credentials or forwarding files to unauthorized AI providers.

### 2.4 Service Request Workflow & FSM (Milestone 10 Phase 2A/2B)
- **11-State Finite State Machine**: Canonical request lifecycle enforced by PostgreSQL trigger `trg_validate_service_request_status_transition`.
- **Requests Desk**: Interactive dual-view desk (Kanban board and filterable tabular list).
- **Request Workspace Drawer**: Full operational drawer for status transitions, document attachments, billing links, and operator notes.

### 2.5 Atomic Billing, Ledger & Invoicing (Phase 2C/3C)
- **Atomic Financial Transactions**: Invoices, payments, and payment allocations execute atomically via stored procedures.
- **Draft Invoice Semantics**: Draft invoices strictly do not establish customer debt or alter receivables.
- **GST Print View**: Print-ready invoice rendering with shop branding, customer details, line items, bank information, and UPI QR code.

### 2.6 Operations & Communications (Phase 2D/2E)
- **Daily Attention Queue**: Highlights overdue follow-ups and unbilled jobs in Asia/Kolkata timezone.
- **Communications Center**: Centralized customer contact queue with one-click WhatsApp message generation.

---

## 3. Verification Pending (Live Operational Testing)

The following capabilities are implemented and unit/regression tested in code, but require periodic operational validation in live staging/production environments:
- [ ] Real production account enrollment and second-factor challenge smoke testing on physical authenticator devices (Google Authenticator, Microsoft Authenticator) across iOS and Android.
- [ ] Authenticator-device validation across diverse counter hardware where not yet evidenced.
- [ ] Required production environment variables, redirect paths, and administrative MFA reset configuration where repository evidence cannot prove deployment configuration.
- [ ] Live print testing of invoice output (`/invoices/[id]/print`) on standard thermal and A4 kiosk printers.
- [ ] High-latency mobile network testing (2G/3G conditions) for multi-file Smart Import uploads.
- [ ] Live WhatsApp Web deep-link handoff testing on mobile Chrome/Edge browsers.
- [ ] Periodic review of PostgreSQL query execution plans on `customers` and `service_requests` tables under high row volume.

---

## 4. Current Work

> **No active implementation phase.**  
> Current focus is canonical knowledge base consolidation (`docs/` audit and baseline documentation).

---

## 5. Next Candidate Tasks

All candidate items are non-binding proposals requiring explicit user/stakeholder approval before execution:

### 5.1 Security
- [Candidate / Needs approval] **Session Inactivity Timeout**: Implement automatic session timeout after 30 minutes of counter inactivity.
- [Candidate / Needs approval] **Audit Log Viewer**: Build an owner-only dashboard view to inspect the historical audit trail of privileged financial operations.

### 5.2 UX & Workflow
- [Candidate / Needs approval] **Keyboard Shortcuts**: Introduce kiosk hotkeys (e.g., `N` for new customer, `P` for record payment, `Escape` to close drawers).
- [Candidate / Needs approval] **Compact Receipt Printing**: Offer a 58mm/80mm thermal roll print layout alongside the existing A4 invoice layout.
- [Candidate / Needs approval] **Multi-Document Batch Download**: Allow one-click ZIP packaging of all documents attached to a customer or service request.

### 5.3 Performance & Reliability
- [Candidate / Needs approval] **Client-Side Image Resizing**: Pre-compress image files in the browser before transmission to reduce bandwidth consumption on cellular connections.
- [Candidate / Needs approval] **Pagination Optimization**: Migrate large customer and request tables from offset pagination to keyset pagination for high data volumes.

### 5.4 Operations & Reporting
- [Candidate / Needs approval] **Automated Daily Close-out Report**: Generate an end-of-day summary detailing total cash collected, UPI transfers, and new requests opened.
- [Candidate / Needs approval] **Service TAT Alerts**: Automated visual highlight for service requests approaching their turnaround time SLA.

### 5.5 Integrations
- [Candidate / Needs approval] **Direct WhatsApp Business API**: Optional server-side integration for sending automated status alerts when applications are completed.
- [Candidate / Needs approval] **Local Backup Export**: One-click encrypted JSON/CSV archive export for local offline backup by shop proprietors.

### 5.6 Documentation
- [Candidate / Needs approval] **Operator Training Guide**: Concise step-by-step cheatsheet for onboarding new desk attendants.

---

## 6. Known Technical Debt

1. **TIFF Document Rejection**: TIFF images (`.tif`, `.tiff`) are currently rejected at the upload boundary. Expanding support would require server-side multi-page TIFF splitting via Sharp.
2. **ImportJob Single vs Both Representation**: In `AiSmartImportEngine`, the `ImportJob` type maps `frontFile` and `backFile`, but lacks a discrete `bothFile` field, requiring side normalization.
3. **Office Document Parsing Dependency**: DOCX/XLSX text extraction relies on the `MarkItDown` preprocessor. Very complex spreadsheet formulas or embedded password-protected files are not parsed.
4. **Historical Migration Coexistence**: The migrations directory contains both legacy migration files and subsequent consolidation scripts. While reconciled via `df6c0f9`, migrations must remain untouched to prevent production drift.

---

## 7. Release & Deployment Checklist

Before triggering production deployments or merges:
- [ ] **Typecheck**: `npm run typecheck` passes with zero errors (`tsc --noEmit`).
- [ ] **Lint**: `npm run lint` passes with zero unresolved errors.
- [ ] **Test Suites**:
  - `npx tsx test-server-actions-aal2.ts` passes (109/109 assertions).
  - `npx tsx test-financial-rpc-hardening.ts` passes (115/115 assertions).
  - `npx tsx test-v132-ai-smart-import-upload-ui.ts` passes (47/47 assertions).
  - `npx tsx test-service-request-fsm.ts` passes.
  - `npx tsx test-phase2c-3c-payment-status-ledger.ts` passes.
- [ ] **Secret Scan**: Confirm zero API keys, service role keys, or database credentials exist in source code or docs.
- [ ] **Git Scope**: Verify `git status --short` contains only authorized files.
- [ ] **No Destructive Operations**: Ensure no uncommitted user work has been lost or overwritten.
