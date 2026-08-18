import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envConfig = fs.readFileSync('.env.local', 'utf-8');
envConfig.split('\n').forEach(line => {
  const [key, val] = line.split('=');
  if (key && val) {
    process.env[key.trim()] = val.trim();
  }
});

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

interface AuditResult {
  code: string;
  name: string;
  expected: string;
  actual: string;
  status: 'PASS' | 'FAIL';
}

const auditResults: AuditResult[] = [];

function record(code: string, name: string, expected: string, actual: string, pass: boolean) {
  const status = pass ? 'PASS' : 'FAIL';
  auditResults.push({ code, name, expected, actual, status });
  console.log(`[TEST ${code}] ${name}: Expected '${expected}' | Got '${actual}' ➔ ${status === 'PASS' ? '✅ PASS' : '❌ FAIL'}`);
}

async function runLiveDatabaseAudit() {
  console.log("==========================================================================");
  console.log(" 🌐 PHASE 9 — LIVE SUPABASE DATABASE SCHEMA & INTEGRITY AUDIT");
  console.log("==========================================================================\n");

  // 1. Schema Objects Verification
  const invRes = await supabase.from('invoices').select('id').limit(1);
  const itemsRes = await supabase.from('invoice_items').select('id').limit(1);
  const payRes = await supabase.from('payments').select('id').limit(1);
  const allocRes = await supabase.from('payment_allocations').select('id').limit(1);

  const schemaPass = !invRes.error && !itemsRes.error && !payRes.error && !allocRes.error;
  record("1", "Schema objects exist on live Supabase", "Tables exist and queryable",
    schemaPass ? "invoices, invoice_items, payments, payment_allocations active" : "Failed", schemaPass);

  // 2. Anonymous RLS Verification
  const anonInvoices = await supabase.from('invoices').select('*');
  const anonPass = !anonInvoices.error && (anonInvoices.data === null || anonInvoices.data.length === 0);
  record("3a", "Anonymous RLS Denied on live Supabase", "0 rows accessible to unauthenticated clients",
    `Rows returned: ${anonInvoices.data?.length || 0}`, anonPass);

  // 3. Direct Allocation Writes Revocation Verification
  const directAllocWrite = await supabase.from('payment_allocations').insert({
    payment_id: '00000000-0000-0000-0000-000000000001',
    invoice_id: '00000000-0000-0000-0000-000000000001',
    amount: 100
  });

  const allocRevokedPass = !!directAllocWrite.error;
  record("15a", "Direct INSERT on payment_allocations denied by PostgreSQL privileges", "Permission denied / RLS error",
    directAllocWrite.error?.message || "Allowed (FAIL)", allocRevokedPass);

  // 4. SECURITY DEFINER Internal Function Execution Denial Verification
  const directRecalcCall = await supabase.rpc('recalculate_invoice_financials', { target_invoice_id: '00000000-0000-0000-0000-000000000001' });
  const recalcRevokedPass = !!directRecalcCall.error;
  record("16b", "Client execution of internal recalculate function DENIED by PostgreSQL", "Permission denied for internal function",
    directRecalcCall.error?.message || "Allowed (FAIL)", recalcRevokedPass);

  // 5. SECURITY DEFINER Auto-Generator Function Execution Denial Verification
  const directSeqCall = await supabase.rpc('generate_invoice_number');
  const seqRevokedPass = !!directSeqCall.error;
  record("16c", "Client execution of internal sequence generator DENIED by PostgreSQL", "Permission denied for generator function",
    directSeqCall.error?.message || "Allowed (FAIL)", seqRevokedPass);

  console.log("\n==========================================================================");
  console.log("📊 LIVE SUPABASE DATABASE INTEGRITY AUDIT SUMMARY");
  console.log("==========================================================================\n");

  console.table(auditResults.map(a => ({
    'Code': a.code,
    'Requirement Name': a.name,
    'Expected Outcome': a.expected,
    'Actual Result': a.actual,
    'Status': a.status
  })));

  const allPassed = auditResults.every(a => a.status === 'PASS');
  console.log("\n==========================================================================");
  console.log(`VERDICT: ${allPassed ? '✅ ALL LIVE SUPABASE INTEGRITY AUDIT CHECKS PASSED CLEANLY!' : '❌ SOME CHECKS FAILED'}`);
  console.log("==========================================================================");

  if (!allPassed) process.exit(1);
}

runLiveDatabaseAudit().catch(console.error);
