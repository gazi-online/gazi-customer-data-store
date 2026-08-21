# GCDS (Gazi Customer Data Store) — Disaster Recovery & Fresh Windows Restore Guide

This guide provides step-by-step instructions to restore the full **GCDS** web application on a fresh Windows installation after formatting drive `C:`.

---

## 📋 Prerequisites Installation

1. **Install Git for Windows**:
   - Download & install Git from [https://git-scm.com/download/win](https://git-scm.com/download/win).
   - Ensure `git` is added to PATH.

2. **Install Node.js (LTS v22.x)**:
   - Download & install Node.js v22.x (or v20.x) from [https://nodejs.org/](https://nodejs.org/).
   - Verify installation in Terminal:
     ```bash
     node --version
     npm --version
     git --version
     ```

---

## 🚀 Project Restoration Steps

### Option A: Restore from Uncompressed Backup (Recommended)
1. Copy `gazi-customer-data-store` folder from backup drive `D:\GCDS_FULL_BACKUP_2026-08-21\gazi-customer-data-store` to your preferred target directory (e.g. `C:\Users\<YourUser>\Desktop\GCDS\gazi-customer-data-store`).

### Option B: Restore from Git Repository Bundle (`GCDS_FULL_REPOSITORY.bundle`)
If the `.git` folder or uncompressed directory is lost or corrupted:
1. Open terminal in target directory.
2. Run:
   ```bash
   git clone D:\GCDS_FULL_BACKUP_2026-08-21\GCDS_FULL_REPOSITORY.bundle gazi-customer-data-store
   cd gazi-customer-data-store
   git checkout main
   ```

---

## 🔑 Environment & Secrets Restoration

1. Copy `.env.local` from the secrets folder:
   - Source: `D:\GCDS_FULL_BACKUP_2026-08-21\SECRETS_DO_NOT_SHARE\.env.local`
   - Destination: `<TargetProjectDir>\.env.local`
2. **Never** commit `.env.local` to Git repository (verified in `.gitignore`).

---

## 📦 Dependency Installation & Verification

1. Navigate to project root:
   ```bash
   cd gazi-customer-data-store
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run TypeScript type checking:
   ```bash
   npm run typecheck
   ```
4. Run Next.js production build:
   ```bash
   npm run build
   ```
5. Run application regression tests:
   ```bash
   npx tsx test-smart-import-regression.ts
   npx tsx test-customer-save-flow.ts
   npx tsx test-address-intelligence.ts
   npx tsx test-phase9-billing-foundation.ts
   npx tsx test-phase9-ui-server-flow.ts
   npx tsx test-phase10-reports.ts
   ```

---

## 🌐 Development Server

Start dev server:
```bash
npm run dev
```
Open browser at: **`http://localhost:3000`**

---

## 🗄️ Supabase Live Database & Storage Restore Procedure

### Database Schema & Data Restoration
If connecting to a fresh Supabase instance:
1. All SQL migration files are saved in `D:\GCDS_FULL_BACKUP_2026-08-21\DATABASE_MIGRATIONS\`.
2. Apply SQL migration files in Supabase Dashboard SQL Editor in order:
   - `services_module_migration.sql`
   - `payments_module_migration.sql`
   - `payments_number_generator_hotfix.sql`
   - `ai_import_history_migration.sql`
   - `ai_extraction_cache_migration.sql`
   - `documents_module_migration.sql`
   - `documents_audit_migration.sql`
   - `add_middle_name_migration.sql`
   - `add_post_office_migration.sql`
3. To restore live database data snapshot, execute `D:\GCDS_FULL_BACKUP_2026-08-21\SUPABASE_DATABASE\live_data_insert_backup.sql` or import `live_data_tables.json`.

### Storage Files Restoration
1. Storage bucket files are backed up at `D:\GCDS_FULL_BACKUP_2026-08-21\SUPABASE_STORAGE\customer-profiles\`.
2. In Supabase Dashboard -> Storage -> Buckets -> `customer-profiles`, upload the files matching the customer UUID subfolder paths if re-populating storage on a new Supabase project.

---

## ✅ Restoration Verification Checklist

- [ ] Node.js & Git installed
- [ ] Source project cloned / copied
- [ ] `.env.local` copied into project root
- [ ] `npm install` completed with 0 errors
- [ ] `npm run typecheck` passed cleanly
- [ ] `npm run build` completed successfully
- [ ] All 6 regression test scripts passed 100%
- [ ] `http://localhost:3000` accessible in browser
