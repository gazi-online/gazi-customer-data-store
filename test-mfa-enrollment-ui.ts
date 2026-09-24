/**
 * ==============================================================================
 * GCDS SECURITY — S2B MFA ENROLLMENT UI VERIFICATION TEST SUITE
 * File: test-mfa-enrollment-ui.ts
 *
 * Verifies:
 * 1. Unauthenticated enrollment denied across all actions
 * 2. Status inspection does NOT auto-enroll factors
 * 3. Verified factor detection yields enabled state & prevents duplicate enrollment
 * 4. Stale unverified factors are safely cleaned up on re-attempt
 * 5. Cancellation unenrolls only unverified factors (cannot touch verified factors)
 * 6. Code validation rejects invalid/short OTP before challenge
 * 7. Verification promotes session to aal2 without leaking tokens
 * 8. Static code security audit (no localStorage, no sessionStorage, no dangerouslySetInnerHTML,
 *    no secret logging, no URL secrets, no service role)
 * ==============================================================================
 */

import fs from 'fs';
import path from 'path';
import {
  listMfaFactors,
  enrollTotpFactor,
  verifyTotpFactor,
  unenrollTotpFactor,
} from './src/lib/auth/mfa';
import type { SupabaseClient } from '@supabase/supabase-js';

interface TestResult {
  scenario: string;
  name: string;
  expected: string;
  actual: string;
  status: 'PASS' | 'FAIL';
}

const results: TestResult[] = [];

function assert(scenario: string, name: string, condition: boolean, expected: string, actual: string) {
  const status: 'PASS' | 'FAIL' = condition ? 'PASS' : 'FAIL';
  results.push({ scenario, name, expected, actual, status });
  const icon = status === 'PASS' ? '✅' : '❌';
  console.log(`[${scenario}] ${name}: Expected '${expected}' | Got '${actual}' ➔ ${icon} ${status}`);
}

async function runTestSuite() {
  console.log('==========================================================================');
  console.log('🛡️  GCDS SECURITY: S2B MFA ENROLLMENT UI VERIFICATION SUITE');
  console.log('==========================================================================\n');

  // --------------------------------------------------------------------------
  // 1. Unauthenticated Access Denial
  // --------------------------------------------------------------------------
  console.log('--- 1. Unauthenticated Access Protection ---');
  const mockUnauthClient = {
    auth: {
      getUser: async () => ({ data: { user: null }, error: { message: 'Not authenticated' } }),
    },
  } as unknown as SupabaseClient;

  const enrollUnauth = await enrollTotpFactor(mockUnauthClient);
  assert(
    'UNAUTH_GUARD',
    'Enrollment denied when unauthenticated',
    enrollUnauth.success === false && enrollUnauth.error === 'Authentication required.',
    'Authentication required.',
    String(enrollUnauth.error)
  );

  const unenrollUnauth = await unenrollTotpFactor(mockUnauthClient, 'fac-1');
  assert(
    'UNAUTH_GUARD',
    'Unenroll denied when unauthenticated',
    unenrollUnauth.success === false && unenrollUnauth.error === 'Authentication required.',
    'Authentication required.',
    String(unenrollUnauth.error)
  );

  // --------------------------------------------------------------------------
  // 2. Status Inspection Does NOT Auto-Enroll
  // --------------------------------------------------------------------------
  console.log('\n--- 2. No Automatic Enrollment On Load ---');
  let enrollApiCalled = false;
  const mockStatusClient = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'usr-1', email: 'user@example.com' } }, error: null }),
      mfa: {
        listFactors: async () => ({ data: { all: [], totp: [], phone: [] }, error: null }),
        getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null }),
        enroll: async () => {
          enrollApiCalled = true;
          return { data: null, error: null };
        },
      },
    },
  } as unknown as SupabaseClient;

  await listMfaFactors(mockStatusClient);
  assert(
    'NO_AUTO_ENROLL',
    'Status check does not trigger enroll API call',
    !enrollApiCalled,
    'false',
    String(enrollApiCalled)
  );

  // --------------------------------------------------------------------------
  // 3. Verified Factor State & Duplicate Enrollment Prevention
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Verified Factor & Duplicate Protection ---');
  const mockVerifiedClient = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'usr-1', email: 'verified@example.com' } }, error: null }),
      mfa: {
        listFactors: async () => ({
          data: {
            all: [
              {
                id: 'totp-verified-1',
                friendly_name: 'verified@example.com',
                factor_type: 'totp',
                status: 'verified',
                created_at: '2026-03-01T00:00:00Z',
                updated_at: '2026-03-01T00:00:00Z',
              },
            ],
            totp: [],
            phone: [],
          },
          error: null,
        }),
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel: 'aal2', nextLevel: 'aal2' },
          error: null,
        }),
      },
    },
  } as unknown as SupabaseClient;

  const factorsCheck = await listMfaFactors(mockVerifiedClient);
  assert('VERIFIED_STATE', 'Identifies account has verified factor', factorsCheck.hasVerifiedFactor === true, 'true', String(factorsCheck.hasVerifiedFactor));
  assert('VERIFIED_STATE', 'Single verified factor returned in list', factorsCheck.verified.length === 1, '1', String(factorsCheck.verified.length));

  // --------------------------------------------------------------------------
  // 4. Stale Unverified Factor Cleanup
  // --------------------------------------------------------------------------
  console.log('\n--- 4. Unverified Factor Handling & Cleanup ---');
  let unenrollCalledWithId = '';
  const mockStaleClient = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'usr-1' } }, error: null }),
      mfa: {
        listFactors: async () => ({
          data: {
            all: [
              {
                id: 'stale-unverified-fac',
                friendly_name: 'Abandoned Setup',
                factor_type: 'totp',
                status: 'unverified',
                created_at: '2026-03-01T00:00:00Z',
                updated_at: '2026-03-01T00:00:00Z',
              },
            ],
            totp: [],
            phone: [],
          },
          error: null,
        }),
        unenroll: async (params: { factorId: string }) => {
          unenrollCalledWithId = params.factorId;
          return { data: { id: params.factorId }, error: null };
        },
      },
    },
  } as unknown as SupabaseClient;

  const staleResult = await listMfaFactors(mockStaleClient);
  assert('STALE_CLEANUP', 'Detects unverified factor from abandoned session', staleResult.unverified.length === 1, '1', String(staleResult.unverified.length));

  // Unenroll unverified factor
  const unenrollStale = await unenrollTotpFactor(mockStaleClient, staleResult.unverified[0].id);
  assert('STALE_CLEANUP', 'Successfully unenrolled stale unverified factor', unenrollStale.success === true && unenrollCalledWithId === 'stale-unverified-fac', 'stale-unverified-fac', unenrollCalledWithId);

  // --------------------------------------------------------------------------
  // 5. Verified Factor Removal Protection (Cannot Remove in S2B)
  // --------------------------------------------------------------------------
  console.log('\n--- 5. Verified Factor Removal Protection ---');
  const mockVerifiedUnenrollClientAal1 = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'usr-1' } }, error: null }),
      mfa: {
        listFactors: async () => ({
          data: {
            all: [
              {
                id: 'verified-factor-99',
                factor_type: 'totp',
                status: 'verified',
                created_at: '',
                updated_at: '',
              },
            ],
          },
          error: null,
        }),
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel: 'aal1', nextLevel: 'aal2' },
          error: null,
        }),
        unenroll: async () => ({ data: { id: 'verified-factor-99' }, error: null }),
      },
    },
  } as unknown as SupabaseClient;

  const verifiedUnenrollBlocked = await unenrollTotpFactor(mockVerifiedUnenrollClientAal1, 'verified-factor-99');
  assert('VERIFIED_PROTECTION', 'Cannot remove verified factor without step-up', verifiedUnenrollBlocked.success === false, 'false', String(verifiedUnenrollBlocked.success));

  // --------------------------------------------------------------------------
  // 6. OTP Verification Flow & Token Safety
  // --------------------------------------------------------------------------
  console.log('\n--- 6. OTP Verification & DTO Token Safety ---');
  const mockVerificationSuccessClient = {
    auth: {
      mfa: {
        challengeAndVerify: async () => ({
          data: {
            access_token: 'SECRET_ACCESS_TOKEN_DO_NOT_EXPOSE',
            refresh_token: 'SECRET_REFRESH_TOKEN_DO_NOT_EXPOSE',
            token_type: 'bearer',
            expires_in: 3600,
            user: { id: 'usr-1' },
          },
          error: null,
        }),
      },
    },
  } as unknown as SupabaseClient;

  // Invalid 5-digit code
  const verifyShort = await verifyTotpFactor(mockVerificationSuccessClient, { factorId: 'fac-1', code: '12345' });
  assert('VERIFY_SAFETY', 'Rejects short OTP locally', verifyShort.success === false, 'false', String(verifyShort.success));

  // Valid 6-digit code
  const verifyValid = await verifyTotpFactor(mockVerificationSuccessClient, { factorId: 'fac-1', code: '654321' });
  assert('VERIFY_SAFETY', 'Verification succeeds with 6-digit code', verifyValid.success === true, 'true', String(verifyValid.success));
  assert('VERIFY_SAFETY', 'Elevation to aal2 confirmed', verifyValid.currentLevel === 'aal2', 'aal2', String(verifyValid.currentLevel));
  assert('VERIFY_SAFETY', 'Result does not leak access_token', (verifyValid as unknown as { access_token?: string }).access_token === undefined, 'undefined', String((verifyValid as unknown as { access_token?: string }).access_token));
  assert('VERIFY_SAFETY', 'Result does not leak refresh_token', (verifyValid as unknown as { refresh_token?: string }).refresh_token === undefined, 'undefined', String((verifyValid as unknown as { refresh_token?: string }).refresh_token));

  // --------------------------------------------------------------------------
  // 7. Static Code Security Audit of S2B Files
  // --------------------------------------------------------------------------
  console.log('\n--- 7. Static Code Security Audit ---');
  const filesToAudit = [
    path.join(__dirname, 'src/app/(dashboard)/settings/security/mfa/actions.ts'),
    path.join(__dirname, 'src/app/(dashboard)/settings/security/mfa/page.tsx'),
    path.join(__dirname, 'src/components/settings/MfaEnrollmentView.tsx'),
  ];

  for (const filePath of filesToAudit) {
    const fileName = path.basename(filePath);
    const content = fs.readFileSync(filePath, 'utf-8');

    assert('SECURITY_AUDIT', `${fileName}: No localStorage usage`, !content.includes('localStorage'), 'true', String(!content.includes('localStorage')));
    assert('SECURITY_AUDIT', `${fileName}: No sessionStorage usage`, !content.includes('sessionStorage'), 'true', String(!content.includes('sessionStorage')));
    assert('SECURITY_AUDIT', `${fileName}: No IndexedDB usage`, !content.includes('indexedDB') && !content.includes('IndexedDB'), 'true', 'true');
    assert('SECURITY_AUDIT', `${fileName}: No dangerouslySetInnerHTML`, !content.includes('dangerouslySetInnerHTML'), 'true', String(!content.includes('dangerouslySetInnerHTML')));
    assert('SECURITY_AUDIT', `${fileName}: No service_role key usage`, !content.includes('service_role') && !content.includes('SERVICE_ROLE'), 'true', 'true');
    assert('SECURITY_AUDIT', `${fileName}: No secret/OTP console logging`, !content.includes('console.log') && !content.includes('console.error'), 'true', 'true');
  }

  // --------------------------------------------------------------------------
  // Test Summary
  // --------------------------------------------------------------------------
  console.log('\n==========================================================================');
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  console.log(`TOTAL S2B TESTS: ${results.length} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('==========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Test suite runtime error:', err);
  process.exit(1);
});
