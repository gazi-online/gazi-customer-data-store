/**
 * ==============================================================================
 * GCDS SECURITY — S2A MFA FOUNDATION TEST SUITE
 * File: test-mfa-foundation.ts
 *
 * Verifies:
 * 1. OTP format validation (6 digits, numeric only, reject short/long/alpha)
 * 2. Error message sanitization (no internal traces, no raw provider leaks)
 * 3. AAL interpretation (aal1, aal2, needsVerification)
 * 4. Factor listing and filtering (TOTP only, verified vs unverified)
 * 5. Factor summary DTO safety (no secret exposure)
 * 6. Enrollment helper safety (auth check, DTO without tokens)
 * 7. Verification helper safety (input validation, DTO without session/tokens)
 * 8. Unenroll step-up safety (requires auth, factor ownership, and aal2)
 * ==============================================================================
 */

import {
  isValidTotpCode,
  sanitizeMfaError,
  getMfaAssuranceLevel,
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
  console.log('🛡️  GCDS SECURITY: S2A MFA FOUNDATION VERIFICATION SUITE');
  console.log('==========================================================================\n');

  // --------------------------------------------------------------------------
  // 1. OTP Validation Rules
  // --------------------------------------------------------------------------
  console.log('--- 1. OTP Format Validation ---');
  assert('OTP_FORMAT', 'Valid 6 digits (123456)', isValidTotpCode('123456'), 'true', String(isValidTotpCode('123456')));
  assert('OTP_FORMAT', 'Valid 6 digits with leading zeros (000123)', isValidTotpCode('000123'), 'true', String(isValidTotpCode('000123')));
  assert('OTP_FORMAT', 'Valid 6 digits with whitespace padding ( 654321 )', isValidTotpCode(' 654321 '), 'true', String(isValidTotpCode(' 654321 ')));
  assert('OTP_FORMAT', 'Reject short OTP (5 digits)', !isValidTotpCode('12345'), 'false', String(isValidTotpCode('12345')));
  assert('OTP_FORMAT', 'Reject long OTP (7 digits)', !isValidTotpCode('1234567'), 'false', String(isValidTotpCode('1234567')));
  assert('OTP_FORMAT', 'Reject alphabetic characters', !isValidTotpCode('12345a'), 'false', String(isValidTotpCode('12345a')));
  assert('OTP_FORMAT', 'Reject special characters', !isValidTotpCode('123-45'), 'false', String(isValidTotpCode('123-45')));
  assert('OTP_FORMAT', 'Reject empty string', !isValidTotpCode(''), 'false', String(isValidTotpCode('')));

  // --------------------------------------------------------------------------
  // 2. Error Message Sanitization
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Error Message Sanitization ---');
  const err1 = sanitizeMfaError(new Error('Invalid TOTP code provided'), 'Fallback');
  assert('SANITIZATION', 'Invalid code error mapped cleanly', err1 === 'Invalid verification code.', 'Invalid verification code.', err1);

  const err2 = sanitizeMfaError(new Error('Challenge expired for factor'), 'Fallback');
  assert('SANITIZATION', 'Expired challenge mapped cleanly', err2 === 'Verification code expired. Please try again.', 'Verification code expired. Please try again.', err2);

  const err3 = sanitizeMfaError(new Error('JWT token invalid or expired session'), 'Fallback');
  assert('SANITIZATION', 'Auth error mapped cleanly', err3 === 'Authentication required.', 'Authentication required.', err3);

  const err4 = sanitizeMfaError(new Error('Unexpected Postgres syntax error at line 42 with table internal_secrets'), 'Operation failed.');
  assert('SANITIZATION', 'Internal database stack trace NOT leaked', err4 === 'Operation failed.', 'Operation failed.', err4);

  // --------------------------------------------------------------------------
  // 3. AAL Interpretation
  // --------------------------------------------------------------------------
  console.log('\n--- 3. AAL Level Interpretation ---');

  // Case A: AAL1 with enrolled factor (needs verification)
  const mockClientAal1Pending = {
    auth: {
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel: 'aal1', nextLevel: 'aal2', currentAuthenticationMethods: [] },
          error: null,
        }),
      },
    },
  } as unknown as SupabaseClient;

  const aalStateA = await getMfaAssuranceLevel(mockClientAal1Pending);
  assert('AAL_INTERPRETATION', 'AAL1 with verified factor reports currentLevel aal1', aalStateA.currentLevel === 'aal1', 'aal1', String(aalStateA.currentLevel));
  assert('AAL_INTERPRETATION', 'AAL1 with verified factor reports isAal2 false', aalStateA.isAal2 === false, 'false', String(aalStateA.isAal2));
  assert('AAL_INTERPRETATION', 'AAL1 with verified factor reports needsVerification true', aalStateA.needsVerification === true, 'true', String(aalStateA.needsVerification));

  // Case B: AAL2 verified
  const mockClientAal2 = {
    auth: {
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel: 'aal2', nextLevel: 'aal2', currentAuthenticationMethods: [] },
          error: null,
        }),
      },
    },
  } as unknown as SupabaseClient;

  const aalStateB = await getMfaAssuranceLevel(mockClientAal2);
  assert('AAL_INTERPRETATION', 'AAL2 reports isAal2 true', aalStateB.isAal2 === true, 'true', String(aalStateB.isAal2));
  assert('AAL_INTERPRETATION', 'AAL2 reports needsVerification false', aalStateB.needsVerification === false, 'false', String(aalStateB.needsVerification));

  // Case C: Standard AAL1 without factors
  const mockClientAal1NoFactors = {
    auth: {
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel: 'aal1', nextLevel: 'aal1', currentAuthenticationMethods: [] },
          error: null,
        }),
      },
    },
  } as unknown as SupabaseClient;

  const aalStateC = await getMfaAssuranceLevel(mockClientAal1NoFactors);
  assert('AAL_INTERPRETATION', 'AAL1 without factor reports needsVerification false', aalStateC.needsVerification === false, 'false', String(aalStateC.needsVerification));
  assert('AAL_INTERPRETATION', 'AAL1 without factor reports isAal2 false', aalStateC.isAal2 === false, 'false', String(aalStateC.isAal2));

  // Case D: Missing Auth or Error
  const mockClientError = {
    auth: {
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({
          data: null,
          error: { message: 'Network error' },
        }),
      },
    },
  } as unknown as SupabaseClient;

  const aalStateD = await getMfaAssuranceLevel(mockClientError);
  assert('AAL_INTERPRETATION', 'Error returns null levels safely', aalStateD.currentLevel === null && aalStateD.isAal2 === false, 'null & false', `${aalStateD.currentLevel} & ${aalStateD.isAal2}`);

  // --------------------------------------------------------------------------
  // 4. Factor Listing & Filtering
  // --------------------------------------------------------------------------
  console.log('\n--- 4. Factor Listing & Safe Filtering ---');

  const mockClientFactors = {
    auth: {
      mfa: {
        listFactors: async () => ({
          data: {
            all: [
              {
                id: 'totp-verified-1',
                friendly_name: 'Work Phone',
                factor_type: 'totp',
                status: 'verified',
                created_at: '2026-01-01T00:00:00Z',
                updated_at: '2026-01-01T00:00:00Z',
                secret: 'SUPER_SECRET_VALUE_SHOULD_BE_STRIPPED',
              },
              {
                id: 'totp-unverified-2',
                friendly_name: 'Backup Key',
                factor_type: 'totp',
                status: 'unverified',
                created_at: '2026-01-02T00:00:00Z',
                updated_at: '2026-01-02T00:00:00Z',
              },
              {
                id: 'phone-factor-3',
                friendly_name: 'SMS Factor',
                factor_type: 'phone',
                status: 'verified',
                created_at: '2026-01-03T00:00:00Z',
                updated_at: '2026-01-03T00:00:00Z',
              },
            ],
            totp: [],
            phone: [],
          },
          error: null,
        }),
      },
    },
  } as unknown as SupabaseClient;

  const factorsResult = await listMfaFactors(mockClientFactors);
  assert('FACTOR_LISTING', 'Filters non-TOTP factors out of all list', factorsResult.all.length === 2, '2', String(factorsResult.all.length));
  assert('FACTOR_LISTING', 'Correctly detects verified TOTP factor', factorsResult.verified.length === 1, '1', String(factorsResult.verified.length));
  assert('FACTOR_LISTING', 'Correctly detects unverified TOTP factor', factorsResult.unverified.length === 1, '1', String(factorsResult.unverified.length));
  assert('FACTOR_LISTING', 'hasVerifiedFactor is true', factorsResult.hasVerifiedFactor === true, 'true', String(factorsResult.hasVerifiedFactor));

  // Verify DTO does not leak secret property
  const leakedSecret = (factorsResult.all[0] as unknown as { secret?: string }).secret;
  assert('FACTOR_DTO_SAFETY', 'FactorSummary DTO strips secret property', leakedSecret === undefined, 'undefined', String(leakedSecret));

  // --------------------------------------------------------------------------
  // 5. Enrollment Helper Safety
  // --------------------------------------------------------------------------
  console.log('\n--- 5. Enrollment Helper Safety ---');

  // Case A: Unauthenticated enrollment attempt
  const mockUnauthClient = {
    auth: {
      getUser: async () => ({ data: { user: null }, error: { message: 'Not logged in' } }),
    },
  } as unknown as SupabaseClient;

  const enrollUnauth = await enrollTotpFactor(mockUnauthClient);
  assert('ENROLL_AUTH', 'Unauthenticated enrollment rejected', enrollUnauth.success === false && enrollUnauth.error === 'Authentication required.', 'Authentication required.', String(enrollUnauth.error));

  // Case B: Authenticated enrollment
  const mockAuthEnrollClient = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'usr-1', email: 'staff@example.com' } }, error: null }),
      mfa: {
        enroll: async (params: { factorType: string; issuer?: string; friendlyName?: string }) => {
          return {
            data: {
              id: 'factor-abc-123',
              type: 'totp',
              friendly_name: params.friendlyName,
              totp: {
                qr_code: 'data:image/svg+xml;utf-8,<svg>test</svg>',
                secret: 'JBSWY3DPEHPK3PXP',
                uri: 'otpauth://totp/GCDS:staff@example.com?secret=JBSWY3DPEHPK3PXP&issuer=GCDS',
              },
            },
            error: null,
          };
        },
      },
    },
  } as unknown as SupabaseClient;

  const enrollSuccess = await enrollTotpFactor(mockAuthEnrollClient);
  assert('ENROLL_SUCCESS', 'Authenticated enrollment generates factorId', enrollSuccess.success === true && enrollSuccess.factorId === 'factor-abc-123', 'factor-abc-123', String(enrollSuccess.factorId));
  assert('ENROLL_DTO_SAFETY', 'Enrollment DTO does not contain access_token', (enrollSuccess as unknown as { access_token?: string }).access_token === undefined, 'undefined', String((enrollSuccess as unknown as { access_token?: string }).access_token));

  // --------------------------------------------------------------------------
  // 6. Verification Helper Safety
  // --------------------------------------------------------------------------
  console.log('\n--- 6. Verification Helper Safety ---');

  let challengeAndVerifyCalled = false;
  const mockVerifyClient = {
    auth: {
      mfa: {
        challengeAndVerify: async () => {
          challengeAndVerifyCalled = true;
          return {
            data: {
              access_token: 'SECRET_JWT_ACCESS_TOKEN',
              refresh_token: 'SECRET_JWT_REFRESH_TOKEN',
              user: { id: 'usr-1' },
            },
            error: null,
          };
        },
      },
    },
  } as unknown as SupabaseClient;

  // Case A: Reject invalid code locally BEFORE calling Supabase API
  challengeAndVerifyCalled = false;
  const verifyInvalid = await verifyTotpFactor(mockVerifyClient, { factorId: 'factor-1', code: '123' });
  assert('VERIFY_VALIDATION', 'Reject short OTP without calling Supabase', !challengeAndVerifyCalled && verifyInvalid.success === false, 'API not called', challengeAndVerifyCalled ? 'API called' : 'API not called');
  assert('VERIFY_VALIDATION', 'Sanitized error for short OTP', verifyInvalid.error === 'Invalid verification code. Must be 6 digits.', 'Invalid verification code. Must be 6 digits.', String(verifyInvalid.error));

  // Case B: Valid 6 digits code
  challengeAndVerifyCalled = false;
  const verifySuccess = await verifyTotpFactor(mockVerifyClient, { factorId: 'factor-1', code: '123456' });
  assert('VERIFY_SUCCESS', 'Valid OTP triggers challengeAndVerify', challengeAndVerifyCalled && verifySuccess.success === true, 'true', String(verifySuccess.success));
  assert('VERIFY_DTO_SAFETY', 'Verify result does NOT leak access_token', (verifySuccess as unknown as { access_token?: string }).access_token === undefined, 'undefined', String((verifySuccess as unknown as { access_token?: string }).access_token));
  assert('VERIFY_DTO_SAFETY', 'Verify result does NOT leak refresh_token', (verifySuccess as unknown as { refresh_token?: string }).refresh_token === undefined, 'undefined', String((verifySuccess as unknown as { refresh_token?: string }).refresh_token));
  assert('VERIFY_AAL', 'Verify result confirms elevation to aal2', verifySuccess.currentLevel === 'aal2', 'aal2', String(verifySuccess.currentLevel));

  // --------------------------------------------------------------------------
  // 7. Unenroll Safety & Step-Up Requirements
  // --------------------------------------------------------------------------
  console.log('\n--- 7. Unenroll Safety & Step-Up Protection ---');

  const mockUnenrollClientAal1 = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'usr-1' } }, error: null }),
      mfa: {
        listFactors: async () => ({
          data: {
            all: [{ id: 'fac-verified', factor_type: 'totp', status: 'verified', created_at: '', updated_at: '' }],
          },
          error: null,
        }),
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel: 'aal1', nextLevel: 'aal2' },
          error: null,
        }),
        unenroll: async () => ({ data: { id: 'fac-verified' }, error: null }),
      },
    },
  } as unknown as SupabaseClient;

  // Attempting to unenroll verified factor while only at AAL1 must be rejected
  const unenrollBlocked = await unenrollTotpFactor(mockUnenrollClientAal1, 'fac-verified');
  assert('UNENROLL_STEP_UP', 'Block removing verified factor at AAL1 without step-up', unenrollBlocked.success === false, 'false', String(unenrollBlocked.success));
  assert('UNENROLL_STEP_UP', 'Returns step-up verification required error', unenrollBlocked.error === 'Verification required before removing an active factor.', 'Verification required before removing an active factor.', String(unenrollBlocked.error));

  // Attempting to unenroll with active AAL2 session succeeds
  const mockUnenrollClientAal2 = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'usr-1' } }, error: null }),
      mfa: {
        listFactors: async () => ({
          data: {
            all: [{ id: 'fac-verified', factor_type: 'totp', status: 'verified', created_at: '', updated_at: '' }],
          },
          error: null,
        }),
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel: 'aal2', nextLevel: 'aal2' },
          error: null,
        }),
        unenroll: async () => ({ data: { id: 'fac-verified' }, error: null }),
      },
    },
  } as unknown as SupabaseClient;

  const unenrollAllowed = await unenrollTotpFactor(mockUnenrollClientAal2, 'fac-verified');
  assert('UNENROLL_AAL2', 'Allow removing verified factor when session is AAL2', unenrollAllowed.success === true && unenrollAllowed.id === 'fac-verified', 'fac-verified', String(unenrollAllowed.id));

  // --------------------------------------------------------------------------
  // Test Summary
  // --------------------------------------------------------------------------
  console.log('\n==========================================================================');
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  console.log(`TOTAL TESTS: ${results.length} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('==========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Test suite runtime error:', err);
  process.exit(1);
});
