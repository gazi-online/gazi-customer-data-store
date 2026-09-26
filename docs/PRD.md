# GCDS Product Requirements Document

> Canonical source of truth for Gazi Customer Data Store product requirements, user roles, core modules, data models, and functional boundaries.  
> Cross-references: [Architecture](./ARCHITECTURE.md) | [Rules](./RULES.md) | [Design](./DESIGN.md) | [Tasks](./TASKS.md) | [Memory](./MEMORY.md)

---

## 1. Product Overview

**GCDS (Gazi Customer Data Store)** is an operator-first, high-assurance digital business management platform engineered for citizen digital service centers, cyber cafes, and customer service kiosks in India.

In typical Indian digital service kiosks (such as CSC, Digital Seva, online registration desks, and utility service centers), operators manage complex, high-velocity workflows:
- Customer intake with national and local identity documents (Aadhaar, PAN, Voter ID, Ration Card, etc.).
- Multi-document digital archiving and high-volume data entry.
- Government and citizen service delivery tracking (applications, certificates, renewals, registrations).
- Micro-billing, invoicing, partial payments, waivers, and collections.
- Omni-channel customer follow-up and status updates (phone, WhatsApp, SMS).

GCDS replaces error-prone physical registers, fragmented spreadsheets, and scattered desktop folders with a centralized, secure, multi-tenant digital vault and operational workspace.

---

## 2. Product Purpose

1. **Secure Customer Data Vault**: Centrally store customer demographic details, contact information, identity identifiers, and physical document scans in an encrypted, multi-tenant environment.
2. **Accelerated Intake via Smart Import**: Rapidly ingest customer documents (PDFs, scans, office files), automatically extract structured customer attributes through OCR and document intelligence, and auto-populate intake forms with zero manual retyping.
3. **End-to-End Service Request Management**: Track every customer service job through a deterministic, state-machine-governed workflow from intake to delivery.
4. **Authoritative Financial Ledger**: Guarantee transactional financial integrity across invoicing, payments, partial allocations, refunds, and fee waivers without client-side calculation drift.
5. **High-Assurance Security**: Protect sensitive citizen identity data through mandatory Multi-Factor Authentication (TOTP MFA), strict session assurance levels (AAL2), and PostgreSQL Row Level Security (RLS).

---

## 3. Primary Users & Role Model

GCDS enforces a strictly role-bounded tenant model under `public.business_memberships`. It supports three operational roles:

| Role | Operational Scope | Permissions & Capabilities |
| :--- | :--- | :--- |
| **Owner** (`owner`) | Business Principal / Kiosk Proprietor | Full business ownership. Manages business settings, billing terms, bank/UPI configuration, team member provisioning/suspension, administrative MFA resets, and privileged financial mutations (payment voiding, payment refunds, payment unallocation, request fee waivers). |
| **Admin** (`admin`) | Senior Manager / Head Operator | Full operational oversight. Can manage services catalog, oversee all operator desks, handle customer escalations, view all financial and operational reports, and execute privileged financial operations (voids, refunds, fee waivers). |
| **Operator** (`operator`) | Counter Staff / Kiosk Desk Attendant | Frontline daily operations. Creates/edits customer records, uploads documents, runs Smart Import, initiates and advances service requests through allowed FSM transitions, issues standard invoices, and records incoming payments. Cannot void payments, issue refunds, grant fee waivers, modify business legal/bank settings, or manage team members. |

*Note: GCDS is strictly an operator and staff back-office platform. There is no public, unauthenticated customer portal.*

---

## 4. Core Product Areas

The GCDS application is partitioned into eleven operational modules accessible from the persistent navigation shell:

### 4.1 Dashboard (`/dashboard`)
- **Daily Attention Queue**: Real-time counter feed highlighting overdue follow-ups, pending customer actions, and unbilled delivered services.
- **KPI Metrics**: Real-time rollups of active customers, pending requests, month-to-date revenue, and total receivables.
- **Visual Analytics**: Customer growth trends, customer status distributions, service request workload mix, and collections payment gauge.
- **Quick Action Triggers**: Instant modal launches for Add Customer, Smart Import, New Service Request, and Record Payment.

### 4.2 Customers (`/customers`)
- **Customer Directory**: High-performance searchable, filterable table showing customer code, structured name, phone, email, status, and creation date.
- **Add Customer Form (`/customers/new`)**: Unified intake form featuring dual workflows: "Upload Documents" (Smart Import) and "Enter Manually".
- **Customer Profile View (`/customers/[id]`)**: Deep-dive profile dashboard organized into five dedicated functional tabs:
  1. *Details Tab*: Core demographic, identity, and contact information with quick edit capability.
  2. *Requests Tab*: History and live status of all service jobs linked to this customer.
  3. *Documents Vault Tab*: Grid of uploaded customer identity proofs, photos, and supporting files with secure preview and download.
  4. *Billing & Ledger Tab*: Customer statement showing invoices, payments, outstanding balance, and transaction history.
  5. *Timeline & Followups Tab*: Unified chronological audit log of all customer activities, interactions, status updates, and scheduled follow-ups.

### 4.3 Documents (`/documents`)
- **Central Document Vault**: Business-wide repository of all customer files, supporting previews, downloads, side tagging (Front, Back, Both, Single), and lifecycle management.
- **Secure File Storage**: Backed by private Supabase storage with transient, short-lived signed URLs. Raw files are never publicly exposed.

### 4.4 Smart Import Engine
- **Intelligent Intake Pipeline**: Multi-file dropzone accepting images (JPG, PNG, WEBP), PDFs, and Office files (DOCX, XLSX).
- **Document Preprocessing**: Local text extraction, OCR.Space primary extraction for images, MarkItDown adapter for office documents, and optional Gemini/OpenRouter AI enhancement.
- **Normalization & Merge**: Standardizes Indian phone numbers, dates of birth, addresses, and identity numbers (Aadhaar, PAN, Voter ID), prompting the operator only when genuine data conflicts exist.

### 4.5 Services Catalog (`/services`)
- **Standard Service Inventory**: Catalog of digital services offered (e.g., Aadhaar Address Update, PAN Application, Income Certificate, Trade License, Passport Application, Utility Bill Payment).
- **Pricing & Fee Structure**: Configurable government fees, center service charges, total price, and turnaround SLAs.
- **Service Activation**: Toggle services active/inactive to govern availability on the front counter.

### 4.6 Service Requests (`/requests`)
- **Requests Desk**: High-density operational desk supporting dual views: interactive Kanban pipeline board and filterable tabular list.
- **Request Workspace (`/requests/[id]`)**: Comprehensive operational workspace containing:
  - Header with customer details, priority badge, and current FSM status badge.
  - Allowed status transition dropdown with validation modal (capturing mandatory rejection reasons when applicable).
  - Request document manager (attach/detach customer documents, mark verified/unverified).
  - Linked billing card (view invoice status, generate invoice, record payment, or apply fee waiver).
  - Internal operator notes and task checklists.
  - Follow-up scheduling card and communication log.

### 4.7 Invoices (`/invoices`)
- **Invoice Management**: Listing, filtering, and detail views for customer billing.
- **Draft Semantics**: Support for `draft`, `issued`, `partially_paid`, `paid`, and `cancelled` statuses. Draft invoices do not establish customer debt.
- **Print / PDF View (`/invoices/[id]/print`)**: Clean, print-ready, GST-compliant Indian invoice layout with shop header, customer details, line items, bank details, and UPI QR code.

### 4.8 Payments (`/payments`)
- **Payment Register**: Searchable history of all recorded payments with payment method tracking (Cash, UPI, Bank Transfer, Card).
- **Atomic Allocation**: Inward payments allocated against one or more issued invoices for the customer.
- **Privileged Management**: Voiding, refunding, and unallocating payments via hardened database RPCs restricted to shop owners and administrators.

### 4.9 Communications Center (`/communications`)
- **Contact Queue**: Centralized queue prioritizing customers requiring updates regarding ready documents, pending requirements, or overdue payments.
- **Direct Action Triggers**: One-click WhatsApp message generation with pre-populated contextual templates, tel: calling links, and manual interaction logging.

### 4.10 Operations Inbox (`/operations`)
- **Task & Follow-up Queue**: Daily operational hub aggregating pending follow-ups, stalled applications, and SLA deadline warnings.
- **Quick Resolution**: Fast inline follow-up reschedule, complete, or cancel modals without navigating away from the queue.

### 4.11 Reports (`/reports`)
- **Business Intelligence**: Six specialized reporting tabs:
  1. *Overview*: Revenue rollups, top services, and workload trends.
  2. *Receivables Ageing*: Outstanding customer dues segmented by ageing buckets (0-30, 31-60, 61-90, 90+ days).
  3. *Collections Analytics*: Cash flow breakdown by payment method and collection velocity.
  4. *Service Workload*: Service volume and turnaround time analysis across operators.
  5. *Tax Readiness*: Taxable turnover vs government pass-through fees for GST/IT compliance.
  6. *Customer Statement*: Date-filtered ledger statements printable for individual customers.

### 4.12 Settings & Security (`/settings`)
- **Business Profile**: Shop name, legal entity name, full physical address, phone, email, and GSTIN.
- **Financial Defaults**: Default invoice prefix (e.g., `INV-`), payment terms, bank account details, and UPI ID for instant customer payments.
- **Team Management**: Staff directory showing active members, roles, and status.
- **MFA Security (`/settings/security/mfa`)**: Mandatory TOTP enrollment interface, active factor inspection, and owner-only administrative MFA reset.

---

## 5. Customer Data Model

The customer data model represents Indian citizen identity and operational records. The database schema enforces data integrity without redundant or non-standard language columns.

### 5.1 Supported Fields

| Field Name | Type | Form Status | Operational Purpose & Validation |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | System | Immutable primary key. |
| `business_id` | `uuid` | System | Multi-tenant boundary key. |
| `customer_code` | `text` | Optional | Operator-assigned identifier (e.g., `CUST-1042`). Unique per business. |
| `first_name` | `text` | **Required** | Customer's primary/given name. |
| `middle_name` | `text` | Optional | Customer's middle name or paternal patronymic. |
| `last_name` | `text` | **Required** | Customer's surname/family name. |
| `original_language_name` | `text` | Optional | Customer's name written in native Indian script (e.g., বাংলা `রাহুল কুমার শর্মা` or हिंदी `राहुल कुमार शर्मा`). |
| `phone` | `text` | **Required** | Primary contact phone number. Must start with an international calling code, followed by a hyphen, and at least 4 digits (e.g., `+91-9876543210`). |
| `whatsapp` | `text` | Optional | WhatsApp contact number if different from primary phone. |
| `email` | `text` | Optional | Customer email address for digital correspondence. |
| `date_of_birth` | `date` | Optional | Date of birth (`YYYY-MM-DD`). |
| `gender` | `text` | Optional | Enum: `male`, `female`, `other`. |
| `father_name` | `text` | Optional | Father or guardian name (vital for Indian administrative forms). |
| `mother_name` | `text` | Optional | Mother's name. |
| `marital_status` | `text` | Optional | Single, Married, Widowed, Divorced, Separated. |
| `spouse_name` | `text` | Optional | Spouse name (displayed conditionally when married). |
| `aadhaar_number` | `text` | Optional | 12-digit UIDAI Aadhaar number (formatted with spaces or masked). |
| `pan_number` | `text` | Optional | 10-character Indian Income Tax PAN (e.g., `ABCDE1234F`). |
| `voter_id_number` | `text` | Optional | ECI Voter ID / EPIC number. |
| `gst_number` | `text` | Optional | 15-character GSTIN if business entity. |
| `address` | `text` | **Required** | Street address, village, or premise details. |
| `post_office` | `text` | Optional | Local postal delivery office. |
| `city` | `text` | Optional | Town, city, or block. |
| `district` | `text` | Optional | Administrative district. |
| `state` | `text` | Optional | Indian State or Union Territory. |
| `pincode` | `text` | Optional | 6-digit Indian Postal PIN Code. Triggers automated post office/district lookup. |
| `country` | `text` | Default: India | Country of residence. |
| `photo_url` | `text` | Optional | Legacy image URL reference. Storage must persist canonical paths/references, never ephemeral signed URLs. |
| `photo_source` | `text` | Optional | Canonical storage reference/path in private storage bucket from which transient signed URLs are generated on demand. |
| `status` | `text` | **Required** | Enum: `active`, `inactive`, `lead`. Default: `active`. |

### 5.2 Explicit Clarification on Regional / Bengali Names
- **No Invented Database Columns**: GCDS does **NOT** maintain columns such as `bengali_name`, `bangla_name`, or `native_name`.
- **Single Canonical Column**: All non-Latin script names (Bengali, Hindi, Urdu, etc.) are stored exclusively in the single database column **`original_language_name`**.
- **UI Labeling**: The customer form exposes this field with clear regional operator guidance:  
  *Label*: `Name in Native Language (বাংলা / हिंदी / অন্য ভাষায় নাম)`  
  *Placeholder*: `e.g. রাহুল কুমার শর্মা`  
  *Attribute*: `lang="bn"`, `spellCheck={false}`.

---

## 6. Smart Import Product Requirements

Smart Import provides rapid digital ingestion of customer documents, eliminating manual keyboard entry.

### 6.1 Supported Formats & Constraints
- **Allowed Formats**: `.jpg`, `.jpeg`, `.png`, `.webp`, `.pdf`, `.docx`, `.xlsx`.
- **Prohibited Formats**: Legacy `.doc`, `.xls`, `.ppt`, `.pptx`, and `.tiff`/`.tif` are rejected with helpful conversion guidance.
- **File Size Limit**: Maximum 10MB per document.
- **Batch Limit**: Maximum 10 files per ingestion batch.

### 6.2 Operator Workflow vs Internal Engine Architecture
The user experience must remain clean, predictable, and operator-friendly:

```
[ Operator Workflow ]
1. Upload Documents  ──▶  2. Check Details  ──▶  3. Save Customer
        │
   (or choose)
        ▼
   Enter Manually    ──▶  Fill Details      ──▶  Save Customer
```

- **Stage 1 (Upload Documents)**: Operator drops 1-10 customer identity cards or documents. Operator assigns side metadata (`Front`, `Back`, `Both`, `Single`). Office documents default automatically to `Single`.
- **Stage 2 (Analyze & Extract)**: Operator initiates data extraction. Pipeline executes text extraction, classification, parsing, and normalization.
- **Stage 3 (Check Details / Review)**: Extracted fields populate `CustomerForm`. Form switches to *"Check Details"* mode with clear visual indicators:
  - *AI Data Applied* banner with dismiss action.
  - *Duplicate Warnings* banner if phone, Aadhaar, PAN, or Voter ID matches an existing customer in this business.
  - Field origin tracking: Fields modified manually by the operator are tagged `user` and protected from subsequent auto-fill overwrites.
- **Stage 4 (Save Customer)**: Operator reviews the populated fields, makes necessary manual corrections, and clicks *"Save Customer"*.

---

## 7. Document Management Requirements

1. **Storage Isolation**: Customer documents reside in private Supabase Storage buckets (`customer_documents` with fallback to `customer-profiles`).
2. **No Persistent Signed URLs**: Signed URLs expire within 900 seconds (15 minutes). The database stores only canonical storage paths (`${customerId}/${documentId}_${filename}`).
3. **Document Association**: Documents can be linked directly to a customer profile and selectively attached to individual service requests.
4. **Verification Status**: Request documents feature an explicit boolean `verified` toggle allowing operators to confirm authenticity of physical copies presented at the counter.

---

## 8. Service Request Requirements

1. **Deterministic Workflow FSM**: Service requests follow a strict Finite State Machine with eleven discrete statuses, governed by the transition matrix and authoritative database triggers (not a single linear chain):
   - `pending` (Initial state)
   - `documents_pending` (Awaiting customer documents)
   - `ready_to_submit` (All documents gathered and verified)
   - `submitted` (Application submitted to government/external authority)
   - `in_process` (Under official processing/scrutiny)
   - `action_required` (Objection raised or operator intervention needed)
   - `completed` (Work finished; certificate/output ready)
   - `delivered` (Final output delivered to citizen)
   - `rejected` (Application officially rejected; **requires mandatory rejection reason**)
   - `cancelled` (Customer withdrew request)
   - `archived` (Terminal administrative archive)
2. **Database Invariants & Lifecycle Timestamps**: FSM transitions are strictly validated by database trigger (`trg_validate_service_request_status_transition`). Invalid status jumps are rejected at the database level. Lifecycle timestamps (`completed_at`, `delivered_at`, `archived_at`) are database-owned and stamped exclusively by PostgreSQL triggers, never client values.
3. **Application Reference Tracking**: Requests record official government acknowledgement/tracking numbers (`application_reference`).

---

## 9. Billing, Invoicing & Payment Requirements

1. **Draft Invoices Do Not Create Debt**: An invoice in `draft` status is a preliminary calculation. It does not alter customer receivables and does not change request payment status.
2. **Canonical Payment Status Calculation**:
   - `unpaid`: Active issued balance equals total invoice amount.
   - `partial`: Part of the issued balance has been paid.
   - `paid`: All issued invoices for the request are settled in full.
   - `waived`: Formally waived by owner/admin via privileged waiver RPC.
3. **Atomic Operations**: All financial mutations (creating invoices, recording payments, allocating payments, voiding payments, refunding payments) execute through atomic PostgreSQL functions (`SECURITY DEFINER`) to prevent double-spending or partial allocation drift.
4. **Privileged Operations**: Voids, refunds, unallocations, and waivers require active `owner` or `admin` business membership and elevated `AAL2` session assurance.

---

## 10. Operations & Follow-up Requirements

1. **Scheduled Follow-ups**: Operators schedule customer follow-ups with target dates, communication channels (Phone, WhatsApp, In-Person), and reason codes.
2. **Kolkata Timezone Invariant**: All daily operational queues and due dates are calculated in Indian Standard Time (`Asia/Kolkata`).
3. **Daily Attention Queue**: Highlights overdue requests, past-due follow-ups, and customer queries requiring prompt morning desk action.

---

## 11. Security & Cache Requirements

1. **Mandatory MFA (AAL2)**: Every operator and administrator must enroll a TOTP authenticator app. Access to any protected dashboard route or server action requires active AAL2 assurance. (Code guards are fully hardened; live production account enrollment/challenge smoke testing remains pending operational validation).
2. **Fail-Closed Authentication**: Unauthenticated callers, expired sessions, or AAL1 sessions attempting protected mutations fail closed immediately.
3. **Multi-Tenant Row Level Security**: All data access is bounded by `business_id`. Postgres RLS verifies membership through non-recursive helper `private.is_active_business_member()`.
4. **Search Path Hardening**: All PostgreSQL functions declared `SECURITY DEFINER` enforce `SET search_path = ''` to prevent search path hijacking.
5. **Strict Cache & Storage Boundaries**: The following authoritative and sensitive states must never be persisted or treated as client/TanStack Query cache authority: financial state, invoices/payments/ledger/billing summaries, active transactional service state, request FSM/authoritative status, KYC/customer profiles, and signed URLs. Server/database remains authoritative.

---

## 12. Performance Requirements

1. **Optimistic Counter Interactions**: Rapid table filtering, tab switching, and inline modal updates provide instant feedback without full page refreshes.
2. **Server Action Efficiency**: Mutations execute via Next.js Server Actions with granular cache revalidation (`revalidatePath`).
3. **Image Optimization**: Customer photos and document uploads are normalized and compressed via `sharp` before storage.

---

## 13. UX Requirements

1. **Mobile Responsiveness**: Complete interface usability on standard mobile device viewports:
   - Compact: `360px` (low-cost Android devices common in Indian kiosks)
   - Standard: `390px` (contemporary mobile screens)
   - Large: `430px` (plus-sized phones and small tablets)
2. **Touch Targets**: Minimum 44px touch targets on mobile for all critical action buttons, inputs, and tab triggers.
3. **Progressive Disclosure**: Advanced technical indicators (raw JSON extraction payloads, provider debugging) are kept secondary so operators focus strictly on clean intake forms.

---

## 14. Data Integrity Requirements

1. **PostgreSQL Foreign Keys**: Strong relational constraints between businesses, users, customers, documents, service requests, invoices, and payments.
2. **Database-Owned Timestamps**: Lifecycle milestones (`completed_at`, `delivered_at`, `archived_at`, `voided_at`) are stamped exclusively by server/database time, never from client input.
3. **Audit Trails**: Service request status changes generate append-only transition logs in `service_request_status_history`.

---

## 15. Explicit Non-Goals

1. **No Public Customer Portal**: GCDS is not a citizen self-service portal. Only verified business operators access the system.
2. **No Direct Gateway Processing**: GCDS records customer payments (Cash, UPI, Bank Transfer) but does not host payment gateway checkout redirects.
3. **No Redundant Language Columns**: GCDS will not add separate columns for different regional languages (`bengali_name`, `hindi_name`). All native scripts use `original_language_name`.
4. **No Native Mobile App**: GCDS is designed as a responsive, mobile-first web application running on desktop and mobile browsers.

---

## 16. Baseline & Production Status

- **Application Baseline**: Documented against verified application code baseline at commit `4a3d3fce4679c617a0b1137c7719d089a341116f`.
- **Documentation Revision**: Canonical documentation maintained in local commits (initial baseline `c23fd680e174cb3f14eb54cba56a97ebf3c1d6a3`, updated in subsequent correction passes). Not claimed as deployed to remote unless explicitly verified.
- **Security Posture**: S3A (Server Action AAL2 Enforcement) and S3B (Privileged Financial RPC Role Hardening) implemented and verified in code; live production operational verification of authenticator device enrollment is pending staging/production acceptance.
- **Smart Import Posture**: Milestone 13.2 operational with multi-format support (PDF, DOCX, XLSX, Images), document side pairing, and field origin tracking.
- **Customer Form Posture**: Structured First/Middle/Last names with native script input (`original_language_name`) and PIN code address lookup fully operational.
