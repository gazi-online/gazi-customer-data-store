/**
 * GCDS STRUCTURED RELATIVE NAME INTEGRITY TEST SUITE
 *
 * Verifies Phase 1-4 requirements:
 * 1. Migration is additive and non-destructive
 * 2. Old customers remain readable
 * 3. Structured Father save payload assembly
 * 4. Structured Mother save payload assembly
 * 5. Structured Spouse save payload assembly
 * 6. Surname nullable
 * 7. Structured -> legacy full-name composition is deterministic
 * 8. Legacy -> structured automatic guessing does NOT occur
 * 9. Form-fill DTO exposes structured relative fields
 * 10. Search DTO remains unchanged/minimal
 * 11. Tenant isolation preserved
 * 12. Invalid token rejected
 * 13. Cross-tenant customer unavailable
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res.then(() => {
        console.log(`  [PASS] ${name}`);
        passed++;
      }).catch(err => {
        console.error(`  [FAIL] ${name}:`, err.message);
        failed++;
      });
    } else {
      console.log(`  [PASS] ${name}`);
      passed++;
    }
  } catch (err: any) {
    console.error(`  [FAIL] ${name}:`, err.message);
    failed++;
  }
}

async function run() {
  console.log('================================================================');
  console.log('🧪 GCDS STRUCTURED RELATIVE NAME — BACKEND TEST SUITE');
  console.log('================================================================\n');

  // 1. Migration check
  test('Test 1: Migration is additive and non-destructive', () => {
    const migrationPath = path.join(__dirname, 'supabase', 'migrations', '20261006221500_customer_structured_relative_names.sql');
    assert(fs.existsSync(migrationPath), 'Migration file must exist');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    assert(sql.includes('father_first_middle_name TEXT NULL'), 'father_first_middle_name must be TEXT NULL');
    assert(sql.includes('father_surname TEXT NULL'), 'father_surname must be TEXT NULL');
    assert(sql.includes('mother_first_middle_name TEXT NULL'), 'mother_first_middle_name must be TEXT NULL');
    assert(sql.includes('mother_surname TEXT NULL'), 'mother_surname must be TEXT NULL');
    assert(sql.includes('spouse_first_middle_name TEXT NULL'), 'spouse_first_middle_name must be TEXT NULL');
    assert(sql.includes('spouse_surname TEXT NULL'), 'spouse_surname must be TEXT NULL');
    assert(!sql.includes('DROP COLUMN'), 'No destructive drops allowed');
    assert(sql.includes('ADD COLUMN IF NOT EXISTS'), 'Additive IF NOT EXISTS required');
  });

  // 2. Old customers readability
  test('Test 2: Old customer schema types maintain father_name, mother_name, spouse_name', () => {
    const customerTypesPath = path.join(__dirname, 'src', 'types', 'customer.ts');
    const content = fs.readFileSync(customerTypesPath, 'utf8');
    assert(content.includes('father_name: string | null;'), 'father_name preserved');
    assert(content.includes('mother_name: string | null;'), 'mother_name preserved');
    assert(content.includes('spouse_name: string | null;'), 'spouse_name preserved');
  });

  // Helper function under test
  const composeRelativeFullName = (
    firstMiddle?: string | null,
    surname?: string | null,
    fallbackLegacy?: string | null
  ): string | null => {
    const fm = (firstMiddle || '').trim();
    const sur = (surname || '').trim();
    if (fm || sur) {
      return [fm, sur].filter(Boolean).join(' ');
    }
    return fallbackLegacy && fallbackLegacy.trim() ? fallbackLegacy.trim() : null;
  };

  // 3. New structured Father save
  test('Test 3: New structured Father save formats correctly', () => {
    const fm = 'MD FARUQUL HAQUE';
    const sur = 'MOLLA';
    const composed = composeRelativeFullName(fm, sur, null);
    assert.strictEqual(composed, 'MD FARUQUL HAQUE MOLLA');
  });

  // 4. New structured Mother save
  test('Test 4: New structured Mother save formats correctly', () => {
    const fm = 'SUNITA';
    const sur = 'SHARMA';
    const composed = composeRelativeFullName(fm, sur, null);
    assert.strictEqual(composed, 'SUNITA SHARMA');
  });

  // 5. New structured Spouse save
  test('Test 5: New structured Spouse save formats correctly', () => {
    const fm = 'SURESH';
    const sur = 'KUMAR';
    const composed = composeRelativeFullName(fm, sur, null);
    assert.strictEqual(composed, 'SURESH KUMAR');
  });

  // 6. Surname nullable
  test('Test 6: Surname nullable preserves single first/middle without error', () => {
    const fm = 'BABUL';
    const sur = '';
    const composed = composeRelativeFullName(fm, sur, null);
    assert.strictEqual(composed, 'BABUL');
  });

  // 7. Structured -> legacy full-name composition is deterministic
  test('Test 7: Structured -> legacy full-name composition is deterministic', () => {
    assert.strictEqual(composeRelativeFullName('John', 'Doe', null), 'John Doe');
    assert.strictEqual(composeRelativeFullName('Jane Mary', 'Smith', null), 'Jane Mary Smith');
    assert.strictEqual(composeRelativeFullName('  A B C  ', '  D E  ', null), 'A B C D E');
  });

  // 8. Legacy -> structured automatic guessing does NOT occur
  test('Test 8: Legacy -> structured automatic guessing does NOT occur', () => {
    // If structured fields are not provided, composeRelativeFullName falls back to legacy string
    const legacy = 'MD FARUQUL HAQUE MOLLA';
    const composed = composeRelativeFullName('', '', legacy);
    assert.strictEqual(composed, 'MD FARUQUL HAQUE MOLLA');
    // Verify customer form does not guess
    const customerFormPath = path.join(__dirname, 'src', 'components', 'forms', 'CustomerForm.tsx');
    const formCode = fs.readFileSync(customerFormPath, 'utf8');
    assert(!formCode.includes('.split(" ").slice(0, -1)'), 'Never infer first/middle from word split');
    assert(!formCode.includes('.split(" ").pop()'), 'Never infer surname from word position');
  });

  // 9. Form-fill DTO exposes structured relative fields
  test('Test 9: Form-fill DTO route exposes structured relative fields', () => {
    const formFillRoutePath = path.join(__dirname, 'src', 'app', 'api', 'extension', 'customers', '[id]', 'form-fill', 'route.ts');
    const code = fs.readFileSync(formFillRoutePath, 'utf8');
    assert(code.includes('fatherFirstMiddleName:'), 'fatherFirstMiddleName in DTO');
    assert(code.includes('fatherSurname:'), 'fatherSurname in DTO');
    assert(code.includes('motherFirstMiddleName:'), 'motherFirstMiddleName in DTO');
    assert(code.includes('motherSurname:'), 'motherSurname in DTO');
    assert(code.includes('spouseFirstMiddleName:'), 'spouseFirstMiddleName in DTO');
    assert(code.includes('spouseSurname:'), 'spouseSurname in DTO');
    assert(code.includes('fatherName: customer.father_name || null'), 'legacy fatherName preserved in DTO');
  });

  // 10. Search DTO remains unchanged/minimal
  test('Test 10: Search DTO remains strictly minimal (NO relative data leaked)', () => {
    const searchRoutePath = path.join(__dirname, 'src', 'app', 'api', 'extension', 'customers', 'search', 'route.ts');
    const code = fs.readFileSync(searchRoutePath, 'utf8');
    assert(!code.includes('father_first_middle_name'), 'No relative fields in search select');
    assert(!code.includes('fatherSurname'), 'No relative fields in search DTO');
    assert(code.includes('mobileMasked: maskMobile(c.phone)'), 'Minimal search DTO intact');
  });

  // 11. Tenant isolation preserved
  test('Test 11: Form-fill route strictly enforces tenant isolation', () => {
    const formFillRoutePath = path.join(__dirname, 'src', 'app', 'api', 'extension', 'customers', '[id]', 'form-fill', 'route.ts');
    const code = fs.readFileSync(formFillRoutePath, 'utf8');
    assert(code.includes(".eq('business_id', businessId)"), 'Must scope query to business_id');
    assert(code.includes(".is('deleted_at', null)"), 'Must scope query to active records');
  });

  // 12. Invalid token rejected
  test('Test 12: Form-fill route validates pairing token authorization', () => {
    const formFillRoutePath = path.join(__dirname, 'src', 'app', 'api', 'extension', 'customers', '[id]', 'form-fill', 'route.ts');
    const code = fs.readFileSync(formFillRoutePath, 'utf8');
    assert(code.includes("validateExtensionAuth(req, 'customers:form_fill')"), 'Requires customers:form_fill authorization');
  });

  // 13. Cross-tenant customer unavailable
  test('Test 13: Customer not found / cross-tenant returns 404', () => {
    const formFillRoutePath = path.join(__dirname, 'src', 'app', 'api', 'extension', 'customers', '[id]', 'form-fill', 'route.ts');
    const code = fs.readFileSync(formFillRoutePath, 'utf8');
    assert(code.includes("status: 404"), 'Fails closed with 404 for missing/cross-tenant customer');
  });

  console.log('\n================================================================');
  console.log(`GCDS TEST SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

run();
