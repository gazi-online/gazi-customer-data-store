/**
 * ==============================================================================
 * GCDS SECURITY VERIFICATION SUITE: S2C MFA CHALLENGE / VERIFICATION UI
 * ==============================================================================
 * Comprehensive tests covering:
 *  1. Unauthenticated access rejected
 *  2. AAL2 user does not need challenge
 *  3. AAL1 + verified factor can challenge
 *  4. Unverified factor cannot challenge
 *  5. No factor cannot fabricate challenge
 *  6. OTP must be exactly 6 digits
 *  7. Invalid OTP fails safely
 *  8. Successful verification results in AAL2
 *  9. Raw provider errors not exposed
 * 10. OTP not persisted
 * 11. Token not persisted
 * 12. No localStorage / sessionStorage / IndexedDB
 * 13. No dangerous HTML
 * 14. No service role
 * 15. Double-submit protection verified
 * 16. Refresh requires trusted state re-check
 * 17. External next URL rejected
 * 18. Protocol-relative redirect rejected
 * 19. Javascript / data redirect rejected
 * 20. Valid internal next path accepted
 * 21. Fallback is /dashboard
 * 22. No auto-enrollment
 * 23. Verified factor is never removed
 * 24. Middleware / global enforcement unchanged
 * 25. AAL1 dashboard behavior unchanged
 * 26. S2B misleading mandatory-login wording corrected
 * ==============================================================================
 */

import fs from 'fs';
import path from 'path';
import {
  isValidTotpCode,
  sanitizeMfaError,
  listMfaFactors,
  verifyTotpFactor,
  getMfaAssuranceLevel,
} from './src/lib/auth/mfa';
import { getSafeNextPath } from './src/lib/auth/safeRedirect';
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
  console.log('🛡️  GCDS SECURITY: S2C MFA CHALLENGE UI VERIFICATION SUITE');
  console.log('==========================================================================\n');

  // --------------------------------------------------------------------------
  // 1. Unauthenticated Access Protection
  // --------------------------------------------------------------------------
  console.log('--- 1. Unauthenticated Access Protection ---');
  const mockUnauthClient = {
    auth: {
      getUser: async () => ({ data: { user: null }, error: { message: 'Not authenticated' } }),
    },
  } as unknown as SupabaseClient;

  const factorsUnauth = await listMfaFactors(mockUnauthClient);
  assert(
    'UNAUTH_GUARD',
    'Factor listing fails cleanly when unauthenticated',
    factorsUnauth.hasVerifiedFactor === false && factorsUnauth.verified.length === 0,
    'false',
    String(factorsUnauth.hasVerifiedFactor)
  );

  // --------------------------------------------------------------------------
  // 2. AAL2 User Does Not Need Challenge
  // --------------------------------------------------------------------------
  console.log('\n--- 2. AAL2 Session Bypass Challenge ---');
  const mockAal2Client = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'usr-aal2' } }, error: null }),
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel: 'aal2', nextLevel: 'aal2' },
          error: null,
        }),
      },
    },
  } as unknown as SupabaseClient;

  const aal2Assurance = await getMfaAssuranceLevel(mockAal2Client);
  assert(
    'AAL2_BYPASS',
    'AAL2 session reports isAal2 true',
    aal2Assurance.isAal2 === true,
    'true',
    String(aal2Assurance.isAal2)
  );
  assert(
    'AAL2_BYPASS',
    'AAL2 session does not need verification',
    aal2Assurance.needsVerification === false,
    'false',
    String(aal2Assurance.needsVerification)
  );

  // --------------------------------------------------------------------------
  // 3. AAL1 + Verified Factor Can Challenge
  // --------------------------------------------------------------------------
  console.log('\n--- 3. AAL1 + Verified Factor Challenge Flow ---');
  let challengeAndVerifyCalled = false;
  const mockAal1VerifiedClient = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'usr-aal1-verified' } }, error: null }),
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel: 'aal1', nextLevel: 'aal2' },
          error: null,
        }),
        listFactors: async () => ({
          data: {
            all: [
              {
                id: 'fac-verified-1',
                friendly_name: 'Primary Phone',
                factor_type: 'totp',
                status: 'verified',
                created_at: '2026-09-01T00:00:00Z',
                updated_at: '2026-09-01T00:00:00Z',
              },
            ],
            totp: [],
            phone: [],
          },
          error: null,
        }),
        challengeAndVerify: async ({ factorId, code }: { factorId: string; code: string }) => {
          challengeAndVerifyCalled = true;
          if (factorId === 'fac-verified-1' && code === '123456') {
            return {
              data: {
                user: { id: 'usr-aal1-verified' },
              },
              error: null,
            };
          }
          return { data: null, error: { message: 'Invalid verification code' } };
        },
      },
    },
  } as unknown as SupabaseClient;

  const aal1Factors = await listMfaFactors(mockAal1VerifiedClient);
  assert(
    'CHALLENGE_FLOW',
    'Detects verified factor available for challenge',
    aal1Factors.hasVerifiedFactor && aal1Factors.verified.length === 1,
    '1 verified factor',
    `${aal1Factors.verified.length} verified factor`
  );

  const validVerifyRes = await verifyTotpFactor(mockAal1VerifiedClient, {
    factorId: 'fac-verified-1',
    code: '123456',
  });
  assert(
    'CHALLENGE_FLOW',
    'Verification succeeds with valid code',
    validVerifyRes.success === true && challengeAndVerifyCalled,
    'true',
    String(validVerifyRes.success)
  );

  // --------------------------------------------------------------------------
  // 4. Unverified Factor Cannot Challenge
  // --------------------------------------------------------------------------
  console.log('\n--- 4. Unverified Factor Protection ---');
  const mockUnverifiedOnlyClient = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'usr-unverified' } }, error: null }),
      mfa: {
        listFactors: async () => ({
          data: {
            all: [
              {
                id: 'fac-unverified-1',
                friendly_name: 'Pending Factor',
                factor_type: 'totp',
                status: 'unverified',
                created_at: '2026-09-01T00:00:00Z',
                updated_at: '2026-09-01T00:00:00Z',
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

  const unverifiedFactors = await listMfaFactors(mockUnverifiedOnlyClient);
  assert(
    'UNVERIFIED_GUARD',
    'Unverified factor not counted as verified',
    unverifiedFactors.hasVerifiedFactor === false && unverifiedFactors.verified.length === 0,
    '0',
    String(unverifiedFactors.verified.length)
  );

  // --------------------------------------------------------------------------
  // 5. No Factor Cannot Fabricate Challenge
  // --------------------------------------------------------------------------
  console.log('\n--- 5. Zero Factors State ---');
  const mockNoFactorsClient = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'usr-nofactor' } }, error: null }),
      mfa: {
        listFactors: async () => ({
          data: { all: [], totp: [], phone: [] },
          error: null,
        }),
      },
    },
  } as unknown as SupabaseClient;

  const noFactorsRes = await listMfaFactors(mockNoFactorsClient);
  assert(
    'NO_FACTOR_GUARD',
    'Zero factors report hasVerifiedFactor false',
    noFactorsRes.hasVerifiedFactor === false && noFactorsRes.verified.length === 0,
    'false',
    String(noFactorsRes.hasVerifiedFactor)
  );

  // --------------------------------------------------------------------------
  // 6. OTP Format Validation (Strict 6 Digits)
  // --------------------------------------------------------------------------
  console.log('\n--- 6. OTP Format Validation ---');
  assert('OTP_FORMAT', 'Accepts 6 numeric digits', isValidTotpCode('123456'), 'true', String(isValidTotpCode('123456')));
  assert('OTP_FORMAT', 'Accepts 6 digits with leading zeros', isValidTotpCode('000123'), 'true', String(isValidTotpCode('000123')));
  assert('OTP_FORMAT', 'Rejects 5 digits', !isValidTotpCode('12345'), 'false', String(isValidTotpCode('12345')));
  assert('OTP_FORMAT', 'Rejects 7 digits', !isValidTotpCode('1234567'), 'false', String(isValidTotpCode('1234567')));
  assert('OTP_FORMAT', 'Rejects alpha characters', !isValidTotpCode('12a456'), 'false', String(isValidTotpCode('12a456')));
  assert('OTP_FORMAT', 'Rejects special characters', !isValidTotpCode('12-456'), 'false', String(isValidTotpCode('12-456')));
  assert('OTP_FORMAT', 'Rejects empty code', !isValidTotpCode(''), 'false', String(isValidTotpCode('')));

  // --------------------------------------------------------------------------
  // 7. Invalid OTP Fails Safely
  // --------------------------------------------------------------------------
  console.log('\n--- 7. Invalid OTP Safety ---');
  const invalidVerifyRes = await verifyTotpFactor(mockAal1VerifiedClient, {
    factorId: 'fac-verified-1',
    code: '999999',
  });
  assert(
    'INVALID_OTP',
    'Invalid OTP returns failure',
    invalidVerifyRes.success === false,
    'false',
    String(invalidVerifyRes.success)
  );
  assert(
    'INVALID_OTP',
    'Invalid OTP error is sanitized',
    invalidVerifyRes.error === 'Invalid verification code.',
    'Invalid verification code.',
    String(invalidVerifyRes.error)
  );

  // --------------------------------------------------------------------------
  // 8. Successful Verification Elevates to AAL2
  // --------------------------------------------------------------------------
  console.log('\n--- 8. AAL2 Elevation Confirmation ---');
  assert(
    'AAL2_ELEVATION',
    'Verify helper confirms currentLevel aal2',
    validVerifyRes.currentLevel === 'aal2',
    'aal2',
    String(validVerifyRes.currentLevel)
  );

  // --------------------------------------------------------------------------
  // 9. Error Message Sanitization
  // --------------------------------------------------------------------------
  console.log('\n--- 9. Error Sanitization ---');
  const sanitizedExpired = sanitizeMfaError({ message: 'challenge expired at timestamp' }, 'Fallback');
  assert(
    'ERROR_SANITIZATION',
    'Expired challenge sanitized cleanly',
    sanitizedExpired === 'Verification code expired. Please try again.',
    'Verification code expired. Please try again.',
    sanitizedExpired
  );
  const sanitizedDb = sanitizeMfaError({ message: 'PGSQL Connection failed: FATAL exception at 10.0.0.1' }, 'The code is incorrect or expired.');
  assert(
    'ERROR_SANITIZATION',
    'Database error does not leak internals',
    sanitizedDb === 'The code is incorrect or expired.',
    'The code is incorrect or expired.',
    sanitizedDb
  );

  // --------------------------------------------------------------------------
  // 10 & 11. OTP & Token Persistence Audit
  // --------------------------------------------------------------------------
  console.log('\n--- 10 & 11. Sensitive Token / Secret Leakage Audit ---');
  assert(
    'DTO_SAFETY',
    'Verify result does not include access_token',
    !('access_token' in validVerifyRes),
    'undefined',
    String((validVerifyRes as unknown as Record<string, unknown>).access_token)
  );
  assert(
    'DTO_SAFETY',
    'Verify result does not include refresh_token',
    !('refresh_token' in validVerifyRes),
    'undefined',
    String((validVerifyRes as unknown as Record<string, unknown>).refresh_token)
  );

  // --------------------------------------------------------------------------
  // 12, 13, 14. Static Code Security Audit
  // --------------------------------------------------------------------------
  console.log('\n--- 12, 13, 14. Static Code Security Audit ---');
  const targetFiles = [
    'src/app/(auth)/mfa/verify/actions.ts',
    'src/app/(auth)/mfa/verify/page.tsx',
    'src/components/auth/MfaChallengeView.tsx',
    'src/lib/auth/safeRedirect.ts',
  ];

  for (const relPath of targetFiles) {
    const fullPath = path.join(process.cwd(), relPath);
    const content = fs.readFileSync(fullPath, 'utf8');

    assert('SECURITY_AUDIT', `${relPath}: No localStorage usage`, !content.includes('localStorage'), 'true', 'true');
    assert('SECURITY_AUDIT', `${relPath}: No sessionStorage usage`, !content.includes('sessionStorage'), 'true', 'true');
    assert('SECURITY_AUDIT', `${relPath}: No IndexedDB usage`, !content.includes('indexedDB'), 'true', 'true');
    assert('SECURITY_AUDIT', `${relPath}: No dangerouslySetInnerHTML`, !content.includes('dangerouslySetInnerHTML'), 'true', 'true');
    assert('SECURITY_AUDIT', `${relPath}: No service_role key usage`, !content.includes('service_role'), 'true', 'true');
    assert('SECURITY_AUDIT', `${relPath}: No secret/OTP console logging`, !/console\.(log|error|warn)\(.*(code|secret|totp|otp)/i.test(content), 'true', 'true');
  }

  // --------------------------------------------------------------------------
  // 15. Double-Submit Protection Audit
  // --------------------------------------------------------------------------
  console.log('\n--- 15. Double-Submit Protection ---');
  const challengeViewContent = fs.readFileSync(path.join(process.cwd(), 'src/components/auth/MfaChallengeView.tsx'), 'utf8');
  const hasPendingDisable = challengeViewContent.includes('disabled={code.length !== 6 || isVerifying || isSigningOut}');
  const hasUseTransition = challengeViewContent.includes('useTransition()');
  assert(
    'DOUBLE_SUBMIT',
    'Submit button disabled while verifying transition is pending',
    hasPendingDisable && hasUseTransition,
    'true',
    String(hasPendingDisable && hasUseTransition)
  );

  // --------------------------------------------------------------------------
  // 16. Refresh Requires Trusted State Re-check
  // --------------------------------------------------------------------------
  console.log('\n--- 16. Refresh Re-checks Trusted State ---');
  const pageContent = fs.readFileSync(path.join(process.cwd(), 'src/app/(auth)/mfa/verify/page.tsx'), 'utf8');
  const isForceDynamic = pageContent.includes('export const dynamic = "force-dynamic";');
  const queriesAssuranceOnLoad = pageContent.includes('getMfaAssuranceLevel(supabase)');
  const queriesFactorsOnLoad = pageContent.includes('listMfaFactors(supabase)');
  assert(
    'REFRESH_BEHAVIOR',
    'Challenge page is dynamic and fetches fresh Supabase state on every request',
    isForceDynamic && queriesAssuranceOnLoad && queriesFactorsOnLoad,
    'true',
    String(isForceDynamic && queriesAssuranceOnLoad && queriesFactorsOnLoad)
  );

  // --------------------------------------------------------------------------
  // 17-21. Safe Next Path Validation (Open Redirect Protection)
  // --------------------------------------------------------------------------
  console.log('\n--- 17-21. Safe Return Destination Validation ---');
  assert('OPEN_REDIRECT', 'External https URL rejected', getSafeNextPath('https://evil.example') === '/dashboard', '/dashboard', getSafeNextPath('https://evil.example'));
  assert('OPEN_REDIRECT', 'External http URL rejected', getSafeNextPath('http://evil.example') === '/dashboard', '/dashboard', getSafeNextPath('http://evil.example'));
  assert('OPEN_REDIRECT', 'Protocol-relative // URL rejected', getSafeNextPath('//evil.example') === '/dashboard', '/dashboard', getSafeNextPath('//evil.example'));
  assert('OPEN_REDIRECT', 'Backslash protocol-relative /\\ URL rejected', getSafeNextPath('/\\evil.example') === '/dashboard', '/dashboard', getSafeNextPath('/\\evil.example'));
  assert('OPEN_REDIRECT', 'Windows backslash path rejected', getSafeNextPath('\\evil.example') === '/dashboard', '/dashboard', getSafeNextPath('\\evil.example'));
  assert('OPEN_REDIRECT', 'javascript: URI rejected', getSafeNextPath('javascript:alert(1)') === '/dashboard', '/dashboard', getSafeNextPath('javascript:alert(1)'));
  assert('OPEN_REDIRECT', 'data: URI rejected', getSafeNextPath('data:text/html,<script>alert(1)</script>') === '/dashboard', '/dashboard', getSafeNextPath('data:text/html,<script>alert(1)</script>'));
  assert('OPEN_REDIRECT', 'Token in redirect query rejected', getSafeNextPath('/dashboard?access_token=xyz') === '/dashboard', '/dashboard', getSafeNextPath('/dashboard?access_token=xyz'));
  assert('OPEN_REDIRECT', 'Secret in redirect query rejected', getSafeNextPath('/dashboard?totp_secret=abc') === '/dashboard', '/dashboard', getSafeNextPath('/dashboard?totp_secret=abc'));
  assert('SAFE_REDIRECT', 'Valid internal /dashboard accepted', getSafeNextPath('/dashboard') === '/dashboard', '/dashboard', getSafeNextPath('/dashboard'));
  assert('SAFE_REDIRECT', 'Valid internal /customers accepted', getSafeNextPath('/customers') === '/customers', '/customers', getSafeNextPath('/customers'));
  assert('SAFE_REDIRECT', 'Valid internal query parameter path accepted', getSafeNextPath('/reports?period=month') === '/reports?period=month', '/reports?period=month', getSafeNextPath('/reports?period=month'));
  assert('SAFE_REDIRECT', 'Null input falls back to /dashboard', getSafeNextPath(null) === '/dashboard', '/dashboard', getSafeNextPath(null));
  assert('SAFE_REDIRECT', 'Undefined input falls back to /dashboard', getSafeNextPath(undefined) === '/dashboard', '/dashboard', getSafeNextPath(undefined));
  assert('SAFE_REDIRECT', 'Empty string falls back to /dashboard', getSafeNextPath('') === '/dashboard', '/dashboard', getSafeNextPath(''));

  // --------------------------------------------------------------------------
  // 22. No Auto-Enrollment
  // --------------------------------------------------------------------------
  console.log('\n--- 22. No Auto-Enrollment During Challenge ---');
  let challengeEnrollCalled = false;
  const mockChallengeClient = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'usr-1' } }, error: null }),
      mfa: {
        enroll: async () => {
          challengeEnrollCalled = true;
          return { data: null, error: null };
        },
      },
    },
  } as unknown as SupabaseClient;

  await getMfaAssuranceLevel(mockChallengeClient);
  assert(
    'NO_AUTO_ENROLL',
    'Challenge operations never call enroll API',
    !challengeEnrollCalled,
    'false',
    String(challengeEnrollCalled)
  );

  // --------------------------------------------------------------------------
  // 23. Verified Factor Is Never Removed
  // --------------------------------------------------------------------------
  console.log('\n--- 23. Verified Factor Preservation ---');
  const actionsContent = fs.readFileSync(path.join(process.cwd(), 'src/app/(auth)/mfa/verify/actions.ts'), 'utf8');
  const hasUnenrollCall = actionsContent.includes('unenrollTotpFactor') || actionsContent.includes('unenroll(');
  assert(
    'FACTOR_PRESERVATION',
    'Challenge actions never invoke unenroll',
    !hasUnenrollCall,
    'false',
    String(hasUnenrollCall)
  );

  // --------------------------------------------------------------------------
  // 24. Middleware & Global Enforcement Unchanged
  // --------------------------------------------------------------------------
  console.log('\n--- 24. Middleware & Global Enforcement Invariant ---');
  const middlewareContent = fs.readFileSync(path.join(process.cwd(), 'src/lib/supabase/middleware.ts'), 'utf8');
  const middlewareEnforcesAal2 = middlewareContent.includes('aal2') || middlewareContent.includes('getAuthenticatorAssuranceLevel');
  const middlewareRedirectsMfa = middlewareContent.includes('/mfa/verify');
  assert(
    'GLOBAL_ENFORCEMENT',
    'Middleware does not enforce AAL2',
    !middlewareEnforcesAal2,
    'false',
    String(middlewareEnforcesAal2)
  );
  assert(
    'GLOBAL_ENFORCEMENT',
    'Middleware does not redirect to /mfa/verify',
    !middlewareRedirectsMfa,
    'false',
    String(middlewareRedirectsMfa)
  );

  // --------------------------------------------------------------------------
  // 25. AAL1 Dashboard Behavior Unchanged
  // --------------------------------------------------------------------------
  console.log('\n--- 25. AAL1 Dashboard Accessibility ---');
  const dashboardPage = fs.readFileSync(path.join(process.cwd(), 'src/app/(dashboard)/dashboard/page.tsx'), 'utf8');
  const dashboardRequiresAal2 = dashboardPage.includes('aal2') || dashboardPage.includes('/mfa/verify');
  assert(
    'DASHBOARD_AAL1',
    'Dashboard does not gate access on AAL2',
    !dashboardRequiresAal2,
    'false',
    String(dashboardRequiresAal2)
  );

  // --------------------------------------------------------------------------
  // 26. S2B Misleading Mandatory-Login Wording Corrected
  // --------------------------------------------------------------------------
  console.log('\n--- 26. S2B Wording Correction Audit ---');
  const enrollmentViewContent = fs.readFileSync(path.join(process.cwd(), 'src/components/settings/MfaEnrollmentView.tsx'), 'utf8');
  const hasMisleadingMandatoryWording =
    enrollmentViewContent.includes('each time you sign in') ||
    enrollmentViewContent.includes('is configured for sign-in.');
  assert(
    'WORDING_CORRECTION',
    'MfaEnrollmentView does not claim every login requires MFA while enforcement is off',
    !hasMisleadingMandatoryWording,
    'false',
    String(hasMisleadingMandatoryWording)
  );

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n==========================================================================');
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  console.log(`TOTAL S2C TESTS: ${results.length} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('==========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
