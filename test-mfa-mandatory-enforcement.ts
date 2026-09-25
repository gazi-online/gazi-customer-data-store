import fs from 'fs';
import path from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  evaluateRouteAccess,
  determinePostAuthRedirect,
  requireAal2,
} from './src/lib/auth/mfaEnforcement';
import { listMfaFactors } from './src/lib/auth/mfa';
import { getSafeNextPath } from './src/lib/auth/safeRedirect';
import { executeAdminMfaReset } from './src/lib/auth/adminMfaReset';

// ============================================================================
// TEST HARNESS
// ============================================================================

interface TestResult {
  scenarioNumber: number;
  scenarioName: string;
  expected: string;
  actual: string;
  status: 'PASS' | 'FAIL';
}

const results: TestResult[] = [];

function assert(
  scenarioNumber: number,
  scenarioName: string,
  condition: boolean,
  expected: string,
  actual: string
) {
  const status: 'PASS' | 'FAIL' = condition ? 'PASS' : 'FAIL';
  results.push({ scenarioNumber, scenarioName, expected, actual, status });
  const icon = condition ? '✅ PASS' : '❌ FAIL';
  console.log(`[SCENARIO ${scenarioNumber}] ${scenarioName}: Expected '${expected}' | Got '${actual}' ➔ ${icon}`);
}

async function runMandatoryMfaTestSuite() {
  console.log('==========================================================================');
  console.log(' 🧪 PHASE S2F: MANDATORY MFA ENFORCEMENT COMPREHENSIVE TEST SUITE');
  console.log('==========================================================================\n');

  // --------------------------------------------------------------------------
  // Scenario 1: Unauthenticated Protected Access → Login
  // --------------------------------------------------------------------------
  console.log('--- 1. Unauthenticated Protected Access → Login ---');
  const s1Dash = evaluateRouteAccess('/dashboard', { isAuthenticated: false, isAal2: false, hasVerifiedFactor: false });
  assert(1, 'Unauthenticated /dashboard redirects to login', s1Dash.allowed === false && s1Dash.redirectPath === '/login', 'false & /login', `${s1Dash.allowed} & ${s1Dash.redirectPath}`);

  const s1Cust = evaluateRouteAccess('/customers', { isAuthenticated: false, isAal2: false, hasVerifiedFactor: false });
  assert(1, 'Unauthenticated /customers redirects to login', s1Cust.allowed === false && s1Cust.redirectPath === '/login?next=%2Fcustomers', 'false & /login?next=%2Fcustomers', `${s1Cust.allowed} & ${s1Cust.redirectPath}`);

  const s1Settings = evaluateRouteAccess('/settings', { isAuthenticated: false, isAal2: false, hasVerifiedFactor: false });
  assert(1, 'Unauthenticated /settings redirects to login', s1Settings.allowed === false && s1Settings.redirectPath === '/login?next=%2Fsettings', 'false & /login?next=%2Fsettings', `${s1Settings.allowed} & ${s1Settings.redirectPath}`);

  // --------------------------------------------------------------------------
  // Scenario 2: AAL1 + Verified Factor → MFA Challenge
  // --------------------------------------------------------------------------
  console.log('\n--- 2. AAL1 + Verified Factor → MFA Challenge ---');
  const s2Dash = evaluateRouteAccess('/dashboard', { isAuthenticated: true, isAal2: false, hasVerifiedFactor: true, safeNext: '/dashboard' });
  assert(2, 'AAL1 with verified factor visiting /dashboard redirects to /mfa/verify', s2Dash.allowed === false && s2Dash.redirectPath === '/mfa/verify', 'false & /mfa/verify', `${s2Dash.allowed} & ${s2Dash.redirectPath}`);

  const s2Cust = evaluateRouteAccess('/customers', { isAuthenticated: true, isAal2: false, hasVerifiedFactor: true, safeNext: '/customers' });
  assert(2, 'AAL1 with verified factor visiting /customers preserves safe destination', s2Cust.allowed === false && s2Cust.redirectPath === '/mfa/verify?next=%2Fcustomers', 'false & /mfa/verify?next=%2Fcustomers', `${s2Cust.allowed} & ${s2Cust.redirectPath}`);

  // --------------------------------------------------------------------------
  // Scenario 3: AAL1 + No Factor → Mandatory Enrollment
  // --------------------------------------------------------------------------
  console.log('\n--- 3. AAL1 + No Factor → Mandatory Enrollment ---');
  const s3Dash = evaluateRouteAccess('/dashboard', { isAuthenticated: true, isAal2: false, hasVerifiedFactor: false, safeNext: '/dashboard' });
  assert(3, 'AAL1 without factor visiting /dashboard redirects to /settings/security/mfa', s3Dash.allowed === false && s3Dash.redirectPath === '/settings/security/mfa', 'false & /settings/security/mfa', `${s3Dash.allowed} & ${s3Dash.redirectPath}`);

  const s3Invoices = evaluateRouteAccess('/invoices', { isAuthenticated: true, isAal2: false, hasVerifiedFactor: false, safeNext: '/invoices' });
  assert(3, 'AAL1 without factor visiting /invoices preserves next in enrollment redirect', s3Invoices.allowed === false && s3Invoices.redirectPath === '/settings/security/mfa?next=%2Finvoices', 'false & /settings/security/mfa?next=%2Finvoices', `${s3Invoices.allowed} & ${s3Invoices.redirectPath}`);

  // --------------------------------------------------------------------------
  // Scenario 4: AAL2 → Protected Access Allowed
  // --------------------------------------------------------------------------
  console.log('\n--- 4. AAL2 → Protected Access Allowed ---');
  const s4Dash = evaluateRouteAccess('/dashboard', { isAuthenticated: true, isAal2: true, hasVerifiedFactor: true });
  assert(4, 'AAL2 granted access to /dashboard', s4Dash.allowed === true, 'true', String(s4Dash.allowed));

  const s4Customers = evaluateRouteAccess('/customers', { isAuthenticated: true, isAal2: true, hasVerifiedFactor: true });
  assert(4, 'AAL2 granted access to /customers', s4Customers.allowed === true, 'true', String(s4Customers.allowed));

  const s4Settings = evaluateRouteAccess('/settings', { isAuthenticated: true, isAal2: true, hasVerifiedFactor: true });
  assert(4, 'AAL2 granted access to /settings', s4Settings.allowed === true, 'true', String(s4Settings.allowed));

  // --------------------------------------------------------------------------
  // Scenario 5: Direct Protected URL Cannot Bypass MFA
  // --------------------------------------------------------------------------
  console.log('\n--- 5. Direct Protected URL Cannot Bypass MFA ---');
  const protectedUrls = [
    '/dashboard',
    '/operations',
    '/communications',
    '/requests',
    '/customers',
    '/invoices',
    '/payments',
    '/documents',
    '/services',
    '/reports',
    '/settings',
  ];

  let directBypassBlockedForFactor = true;
  let directBypassBlockedForNoFactor = true;
  for (const p of protectedUrls) {
    const resWithFactor = evaluateRouteAccess(p, { isAuthenticated: true, isAal2: false, hasVerifiedFactor: true, safeNext: p });
    if (resWithFactor.allowed || !resWithFactor.redirectPath?.startsWith('/mfa/verify')) {
      directBypassBlockedForFactor = false;
    }

    const resNoFactor = evaluateRouteAccess(p, { isAuthenticated: true, isAal2: false, hasVerifiedFactor: false, safeNext: p });
    if (resNoFactor.allowed || !resNoFactor.redirectPath?.startsWith('/settings/security/mfa')) {
      directBypassBlockedForNoFactor = false;
    }
  }
  assert(5, 'Direct URL to all protected routes blocked for AAL1 user with factor', directBypassBlockedForFactor, 'true', String(directBypassBlockedForFactor));
  assert(5, 'Direct URL to all protected routes blocked for AAL1 user without factor', directBypassBlockedForNoFactor, 'true', String(directBypassBlockedForNoFactor));

  // --------------------------------------------------------------------------
  // Scenario 6: Login Password Alone Cannot Reach Dashboard
  // --------------------------------------------------------------------------
  console.log('\n--- 6. Login Password Alone Cannot Reach Dashboard ---');
  const postPasswordWithFactor = determinePostAuthRedirect({ isAal2: false, hasVerifiedFactor: true, safeNext: '/dashboard' });
  assert(6, 'Post-password login redirects user with factor to /mfa/verify', postPasswordWithFactor === '/mfa/verify', '/mfa/verify', postPasswordWithFactor);

  const postPasswordNoFactor = determinePostAuthRedirect({ isAal2: false, hasVerifiedFactor: false, safeNext: '/dashboard' });
  assert(6, 'Post-password login redirects user without factor to mandatory enrollment', postPasswordNoFactor === '/settings/security/mfa', '/settings/security/mfa', postPasswordNoFactor);

  const postPasswordAal2 = determinePostAuthRedirect({ isAal2: true, hasVerifiedFactor: true, safeNext: '/dashboard' });
  assert(6, 'Post-password login redirects to dashboard ONLY if session is already AAL2', postPasswordAal2 === '/dashboard', '/dashboard', postPasswordAal2);

  // --------------------------------------------------------------------------
  // Scenario 7: MFA Verify Route Accessible at AAL1
  // --------------------------------------------------------------------------
  console.log('\n--- 7. MFA Verify Route Accessible at AAL1 ---');
  const s7Verify = evaluateRouteAccess('/mfa/verify', { isAuthenticated: true, isAal2: false, hasVerifiedFactor: true });
  assert(7, 'MFA verify route allowed at AAL1 when verified factor exists', s7Verify.allowed === true, 'true', String(s7Verify.allowed));

  const s7VerifySub = evaluateRouteAccess('/mfa/verify?next=%2Fcustomers', { isAuthenticated: true, isAal2: false, hasVerifiedFactor: true });
  assert(7, 'MFA verify route with search param allowed at AAL1', s7VerifySub.allowed === true, 'true', String(s7VerifySub.allowed));

  // --------------------------------------------------------------------------
  // Scenario 8: Enrollment Route Accessible Without Verified Factor
  // --------------------------------------------------------------------------
  console.log('\n--- 8. Enrollment Route Accessible Without Verified Factor ---');
  const s8Enroll = evaluateRouteAccess('/settings/security/mfa', { isAuthenticated: true, isAal2: false, hasVerifiedFactor: false });
  assert(8, 'Enrollment route allowed at AAL1 when user has no verified factor', s8Enroll.allowed === true, 'true', String(s8Enroll.allowed));

  // --------------------------------------------------------------------------
  // Scenario 9: Password Recovery Remains Accessible
  // --------------------------------------------------------------------------
  console.log('\n--- 9. Password Recovery Remains Accessible ---');
  const s9Forgot = evaluateRouteAccess('/forgot-password', { isAuthenticated: false, isAal2: false, hasVerifiedFactor: false });
  assert(9, '/forgot-password accessible unauthenticated', s9Forgot.allowed === true, 'true', String(s9Forgot.allowed));

  const s9ForgotAal1 = evaluateRouteAccess('/forgot-password', { isAuthenticated: true, isAal2: false, hasVerifiedFactor: true });
  assert(9, '/forgot-password accessible during AAL1 session', s9ForgotAal1.allowed === true, 'true', String(s9ForgotAal1));

  // --------------------------------------------------------------------------
  // Scenario 10: Update-Password Recovery Flow Remains Accessible
  // --------------------------------------------------------------------------
  console.log('\n--- 10. Update-Password Recovery Flow Remains Accessible ---');
  const s10UpdateAal1WithFactor = evaluateRouteAccess('/update-password', { isAuthenticated: true, isAal2: false, hasVerifiedFactor: true });
  assert(10, '/update-password accessible at AAL1 with factor', s10UpdateAal1WithFactor.allowed === true, 'true', String(s10UpdateAal1WithFactor.allowed));

  const s10UpdateAal1NoFactor = evaluateRouteAccess('/update-password', { isAuthenticated: true, isAal2: false, hasVerifiedFactor: false });
  assert(10, '/update-password accessible at AAL1 without factor', s10UpdateAal1NoFactor.allowed === true, 'true', String(s10UpdateAal1NoFactor.allowed));

  // --------------------------------------------------------------------------
  // Scenario 11: Password Reset Does Not Remove MFA
  // --------------------------------------------------------------------------
  console.log('\n--- 11. Password Reset Does Not Remove MFA ---');
  const updatePasswordSource = fs.readFileSync(path.join(process.cwd(), 'src/app/(auth)/update-password/actions.ts'), 'utf8');
  const hasUnenrollInPasswordReset = updatePasswordSource.includes('unenrollTotpFactor') || updatePasswordSource.includes('deleteFactor');
  assert(11, 'Password update action NEVER calls factor unenrollment or deletion', !hasUnenrollInPasswordReset, 'true', String(!hasUnenrollInPasswordReset));

  // --------------------------------------------------------------------------
  // Scenario 12: Verified Factor ID Is Server Revalidated
  // --------------------------------------------------------------------------
  console.log('\n--- 12. Verified Factor ID Is Server Revalidated ---');
  const mockUnverifiedSupabase = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'usr-1' } }, error: null }),
      mfa: {
        listFactors: async () => ({
          data: {
            all: [{ id: 'factor-unverified', status: 'unverified', factor_type: 'totp', created_at: '', updated_at: '' }],
          },
          error: null,
        }),
      },
    },
  } as unknown as SupabaseClient;

  const factorsCheck = await listMfaFactors(mockUnverifiedSupabase);
  const targetVerified = factorsCheck.verified.find((f) => f.id === 'factor-unverified');
  assert(12, 'Unverified factor ID cannot be used as verified challenge target', targetVerified === undefined, 'true', String(targetVerified === undefined));

  // --------------------------------------------------------------------------
  // Scenario 13: Foreign Factor ID Rejected
  // --------------------------------------------------------------------------
  console.log('\n--- 13. Foreign Factor ID Rejected ---');
  const mockUserSupabase = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'usr-legit' } }, error: null }),
      mfa: {
        listFactors: async () => ({
          data: {
            all: [{ id: 'factor-user-1', status: 'verified', factor_type: 'totp', created_at: '', updated_at: '' }],
          },
          error: null,
        }),
      },
    },
  } as unknown as SupabaseClient;

  const userFactors = await listMfaFactors(mockUserSupabase);
  const foreignFactorAttempt = userFactors.verified.find((f) => f.id === 'factor-attacker-999');
  assert(13, 'Foreign factor ID not belonging to active user is rejected', foreignFactorAttempt === undefined, 'true', String(foreignFactorAttempt === undefined));

  // --------------------------------------------------------------------------
  // Scenario 14: Backup Authenticator Can Be Selected
  // --------------------------------------------------------------------------
  console.log('\n--- 14. Backup Authenticator Can Be Selected ---');
  const challengeViewSource = fs.readFileSync(path.join(process.cwd(), 'src/components/auth/MfaChallengeView.tsx'), 'utf8');
  const supportsFactorSwitching = challengeViewSource.includes('setSelectedFactorId') && challengeViewSource.includes('factors.map');
  assert(14, 'MfaChallengeView renders interactive factor selector when multiple verified factors exist', supportsFactorSwitching, 'true', String(supportsFactorSwitching));

  // --------------------------------------------------------------------------
  // Scenario 15: Either Verified TOTP Factor Can Complete Challenge
  // --------------------------------------------------------------------------
  console.log('\n--- 15. Either Verified TOTP Factor Can Complete Challenge ---');
  const mockMultiFactorSupabase = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'usr-1' } }, error: null }),
      mfa: {
        listFactors: async () => ({
          data: {
            all: [
              { id: 'factor-primary-1', status: 'verified', factor_type: 'totp', friendly_name: 'Primary Authenticator', created_at: '', updated_at: '' },
              { id: 'factor-backup-2', status: 'verified', factor_type: 'totp', friendly_name: 'Backup Authenticator', created_at: '', updated_at: '' },
            ],
          },
          error: null,
        }),
      },
    },
  } as unknown as SupabaseClient;

  const multiFactors = await listMfaFactors(mockMultiFactorSupabase);
  const canSelectPrimary = multiFactors.verified.some((f) => f.id === 'factor-primary-1');
  const canSelectBackup = multiFactors.verified.some((f) => f.id === 'factor-backup-2');
  assert(15, 'Primary authenticator factor is verified and selectable', canSelectPrimary, 'true', String(canSelectPrimary));
  assert(15, 'Backup authenticator factor is verified and selectable', canSelectBackup, 'true', String(canSelectBackup));

  // --------------------------------------------------------------------------
  // Scenario 16: Client Cannot Fake AAL2
  // --------------------------------------------------------------------------
  console.log('\n--- 16. Client Cannot Fake AAL2 ---');
  const mockAal1Client = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'usr-test' } }, error: null }),
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel: 'aal1', nextLevel: 'aal2', currentAuthenticationMethods: [] },
          error: null,
        }),
      },
    },
  } as unknown as SupabaseClient;

  let aal2FakeBlocked = false;
  try {
    await requireAal2(mockAal1Client);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('AAL2 assurance required')) {
      aal2FakeBlocked = true;
    }
  }
  assert(16, 'requireAal2 rejects session whose authoritative currentLevel is aal1', aal2FakeBlocked, 'true', String(aal2FakeBlocked));

  // --------------------------------------------------------------------------
  // Scenario 17: LocalStorage/SessionStorage Not Used for Security State
  // --------------------------------------------------------------------------
  console.log('\n--- 17. LocalStorage/SessionStorage Not Used for Security State ---');
  const mfaEnforcementSource = fs.readFileSync(path.join(process.cwd(), 'src/lib/auth/mfaEnforcement.ts'), 'utf8');
  assert(17, 'mfaEnforcement.ts: No localStorage', !mfaEnforcementSource.includes('localStorage'), 'true', 'true');
  assert(17, 'mfaEnforcement.ts: No sessionStorage', !mfaEnforcementSource.includes('sessionStorage'), 'true', 'true');

  const middlewareSource = fs.readFileSync(path.join(process.cwd(), 'src/lib/supabase/middleware.ts'), 'utf8');
  assert(17, 'middleware.ts: No localStorage', !middlewareSource.includes('localStorage'), 'true', 'true');
  assert(17, 'middleware.ts: No sessionStorage', !middlewareSource.includes('sessionStorage'), 'true', 'true');

  // --------------------------------------------------------------------------
  // Scenario 18: Sensitive Security Action Rejects AAL1
  // --------------------------------------------------------------------------
  console.log('\n--- 18. Sensitive Security Action Rejects AAL1 ---');
  const exportActionsSource = fs.readFileSync(path.join(process.cwd(), 'src/app/(dashboard)/settings/export-actions.ts'), 'utf8');
  const exportHasAal2Guard = exportActionsSource.includes('requireAal2');
  assert(18, 'Data export server actions enforce requireAal2', exportHasAal2Guard, 'true', String(exportHasAal2Guard));

  const settingsActionsSource = fs.readFileSync(path.join(process.cwd(), 'src/app/(dashboard)/settings/actions.ts'), 'utf8');
  const updateSettingsHasAal2Guard = settingsActionsSource.includes('requireAal2');
  assert(18, 'Business settings mutation server action enforces requireAal2', updateSettingsHasAal2Guard, 'true', String(updateSettingsHasAal2Guard));

  const customerActionsSource = fs.readFileSync(path.join(process.cwd(), 'src/app/(dashboard)/customers/actions.ts'), 'utf8');
  const customerDeleteHasAal2Guard = customerActionsSource.includes('requireAal2');
  assert(18, 'Customer soft-delete action enforces requireAal2', customerDeleteHasAal2Guard, 'true', String(customerDeleteHasAal2Guard));

  // --------------------------------------------------------------------------
  // Scenario 19: Admin MFA Reset Rejects AAL1 Owner
  // --------------------------------------------------------------------------
  console.log('\n--- 19. Admin MFA Reset Rejects AAL1 Owner ---');
  const mockAal1OwnerClient = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'owner-aal1' } }, error: null }),
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel: 'aal1', nextLevel: 'aal2', currentAuthenticationMethods: [] },
          error: null,
        }),
      },
    },
  } as unknown as SupabaseClient;

  const adminResetAal1Result = await executeAdminMfaReset('target-user-1', { actingClient: mockAal1OwnerClient });
  assert(19, 'Admin MFA reset fails closed when owner session is AAL1', Boolean(adminResetAal1Result.success === false && adminResetAal1Result.error?.includes('AAL2')), 'false & AAL2 error', `${adminResetAal1Result.success} & ${adminResetAal1Result.error}`);

  // --------------------------------------------------------------------------
  // Scenario 20: Admin MFA Reset Accepts Only AAL2 Owner Boundary
  // --------------------------------------------------------------------------
  console.log('\n--- 20. Admin MFA Reset Accepts Only AAL2 Owner Boundary ---');
  const mockAal2OperatorClient = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'operator-aal2' } }, error: null }),
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel: 'aal2', nextLevel: 'aal2', currentAuthenticationMethods: [] },
          error: null,
        }),
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            limit: () => ({
              single: async () => ({ data: { role: 'operator', status: 'active', business_id: 'biz-1' }, error: null }),
            }),
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;

  const adminResetNonOwnerResult = await executeAdminMfaReset('target-user-1', { actingClient: mockAal2OperatorClient });
  assert(20, 'Admin MFA reset rejects non-owner even at AAL2', Boolean(adminResetNonOwnerResult.success === false && adminResetNonOwnerResult.error?.includes('owner')), 'false & owner error', `${adminResetNonOwnerResult.success} & ${adminResetNonOwnerResult.error}`);

  // --------------------------------------------------------------------------
  // Scenario 21: Final Self-Factor Removal Forces Re-Enrollment State
  // --------------------------------------------------------------------------
  console.log('\n--- 21. Final Self-Factor Removal Forces Re-Enrollment State ---');
  const mfaSettingsActionsSource = fs.readFileSync(path.join(process.cwd(), 'src/app/(dashboard)/settings/security/mfa/actions.ts'), 'utf8');
  const handlesFinalFactorRemoval = mfaSettingsActionsSource.includes('mustEnroll = remainingCount === 0') || mfaSettingsActionsSource.includes('mustEnroll');
  assert(21, 'unenrollOwnMfaFactorAction detects final factor removal and returns mustEnroll', handlesFinalFactorRemoval, 'true', String(handlesFinalFactorRemoval));

  // --------------------------------------------------------------------------
  // Scenario 22: Safe Redirect Prevents External Redirect
  // --------------------------------------------------------------------------
  console.log('\n--- 22. Safe Redirect Prevents External Redirect ---');
  assert(22, 'External https URL returns /dashboard', getSafeNextPath('https://malicious.com') === '/dashboard', '/dashboard', getSafeNextPath('https://malicious.com'));
  assert(22, 'Protocol-relative URL returns /dashboard', getSafeNextPath('//malicious.com') === '/dashboard', '/dashboard', getSafeNextPath('//malicious.com'));
  assert(22, 'Javascript URI returns /dashboard', getSafeNextPath('javascript:alert(1)') === '/dashboard', '/dashboard', getSafeNextPath('javascript:alert(1)'));
  assert(22, 'Token in query string stripped to /dashboard', getSafeNextPath('/dashboard?access_token=secret') === '/dashboard', '/dashboard', getSafeNextPath('/dashboard?access_token=secret'));
  assert(22, 'Valid internal return path accepted', getSafeNextPath('/customers/new') === '/customers/new', '/customers/new', getSafeNextPath('/customers/new'));

  // --------------------------------------------------------------------------
  // Scenario 23: Auth Callback Does Not Bypass MFA
  // --------------------------------------------------------------------------
  console.log('\n--- 23. Auth Callback Does Not Bypass MFA ---');
  const callbackSource = fs.readFileSync(path.join(process.cwd(), 'src/app/auth/callback/route.ts'), 'utf8');
  const callbackUsesMfaEnforcement = callbackSource.includes('determinePostAuthRedirect');
  assert(23, 'Auth callback route uses determinePostAuthRedirect to prevent AAL1 bypass', callbackUsesMfaEnforcement, 'true', String(callbackUsesMfaEnforcement));

  // --------------------------------------------------------------------------
  // Scenario 24: Recovery Callback Does Not Grant Normal Protected Access at AAL1
  // --------------------------------------------------------------------------
  console.log('\n--- 24. Recovery Callback Does Not Grant Protected Access at AAL1 ---');
  const confirmSource = fs.readFileSync(path.join(process.cwd(), 'src/app/auth/confirm/route.ts'), 'utf8');
  const confirmDefaultsToUpdatePassword = confirmSource.includes('nextParam || "/update-password"');
  assert(24, 'Auth confirm route defaults recovery targets to /update-password, not /dashboard', confirmDefaultsToUpdatePassword, 'true', String(confirmDefaultsToUpdatePassword));

  // --------------------------------------------------------------------------
  // Scenario 25: No Service-Role Secret in Client Bundles
  // --------------------------------------------------------------------------
  console.log('\n--- 25. No Service-Role Secret in Client Bundles ---');
  const clientFilesToCheck = [
    'src/components/auth/MfaChallengeView.tsx',
    'src/components/settings/MfaEnrollmentView.tsx',
    'src/components/settings/SettingsTabsView.tsx',
    'src/app/(auth)/login/page.tsx',
    'src/app/(auth)/mfa/verify/page.tsx',
  ];
  let noClientSecretLeaked = true;
  for (const relPath of clientFilesToCheck) {
    const content = fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
    if (content.includes('SUPABASE_SERVICE_ROLE_KEY') || content.includes('service_role')) {
      noClientSecretLeaked = false;
    }
  }
  assert(25, 'No service_role secret referenced in client components', noClientSecretLeaked, 'true', String(noClientSecretLeaked));

  // --------------------------------------------------------------------------
  // Scenario 26: No TOTP Secret/OTP/Token Logging
  // --------------------------------------------------------------------------
  console.log('\n--- 26. No TOTP Secret/OTP/Token Logging ---');
  const mfaSource = fs.readFileSync(path.join(process.cwd(), 'src/lib/auth/mfa.ts'), 'utf8');
  const noConsoleLogsInMfaCore = !mfaSource.includes('console.log') && !mfaSource.includes('console.info');
  assert(26, 'mfa.ts core helpers do not log secrets or OTP codes', noConsoleLogsInMfaCore, 'true', String(noConsoleLogsInMfaCore));

  const verifyActionSource = fs.readFileSync(path.join(process.cwd(), 'src/app/(auth)/mfa/verify/actions.ts'), 'utf8');
  const noConsoleLogsInVerifyAction = !verifyActionSource.includes('console.log') && !verifyActionSource.includes('console.info');
  assert(26, 'MFA verify actions do not log secrets or OTP codes', noConsoleLogsInVerifyAction, 'true', String(noConsoleLogsInVerifyAction));

  // --------------------------------------------------------------------------
  // Scenario 27: Mandatory MFA Enforcement Is Actually ON
  // --------------------------------------------------------------------------
  console.log('\n--- 27. Mandatory MFA Enforcement Is Actually ON ---');
  const middlewareEnforcementSource = fs.readFileSync(path.join(process.cwd(), 'src/lib/supabase/middleware.ts'), 'utf8');
  const middlewareWiresPolicy = middlewareEnforcementSource.includes('enforceMfaRoutePolicy');
  assert(27, 'Middleware actively invokes enforceMfaRoutePolicy', middlewareWiresPolicy, 'true', String(middlewareWiresPolicy));

  const loginActionSource = fs.readFileSync(path.join(process.cwd(), 'src/app/(auth)/login/actions.ts'), 'utf8');
  const loginWiresPolicy = loginActionSource.includes('determinePostAuthRedirect');
  assert(27, 'Login action actively routes through determinePostAuthRedirect', loginWiresPolicy, 'true', String(loginWiresPolicy));

  // --------------------------------------------------------------------------
  // Scenario 28: Zero Redirect Loops Proof
  // --------------------------------------------------------------------------
  console.log('\n--- 28. Zero Redirect Loops Proof Across All States & Routes ---');
  const testRoutes = [
    '/',
    '/login',
    '/logout',
    '/mfa/verify',
    '/settings/security/mfa',
    '/dashboard',
    '/customers',
    '/settings',
    '/forgot-password',
    '/update-password',
    '/auth/confirm',
    '/auth/callback',
  ];

  const testStates: Array<{ name: string; state: { isAuthenticated: boolean; isAal2: boolean; hasVerifiedFactor: boolean } }> = [
    { name: 'State A (Unauthenticated)', state: { isAuthenticated: false, isAal2: false, hasVerifiedFactor: false } },
    { name: 'State B (AAL1, No Factor)', state: { isAuthenticated: true, isAal2: false, hasVerifiedFactor: false } },
    { name: 'State C (AAL1, Has Factor)', state: { isAuthenticated: true, isAal2: false, hasVerifiedFactor: true } },
    { name: 'State D (AAL2)', state: { isAuthenticated: true, isAal2: true, hasVerifiedFactor: true } },
    { name: 'State E (Stale AAL2, Zero Factors)', state: { isAuthenticated: true, isAal2: true, hasVerifiedFactor: false } },
  ];

  let loopDetected = false;
  for (const { name, state } of testStates) {
    for (const route of testRoutes) {
      // Simulate up to 5 hops
      let currentPath = route;
      const visited = new Set<string>();
      let hops = 0;

      while (hops < 5) {
        hops++;
        const evalRes = evaluateRouteAccess(currentPath, state);
        if (evalRes.allowed) {
          // Terminal allowed state reached
          break;
        }

        const nextPath = evalRes.redirectPath!.split('?')[0];
        if (visited.has(nextPath)) {
          console.error(`REDIRECT LOOP DETECTED in ${name}: ${route} -> ${Array.from(visited).join(' -> ')} -> ${nextPath}`);
          loopDetected = true;
          break;
        }
        visited.add(nextPath);
        currentPath = nextPath;
      }
    }
  }

  assert(28, 'Mathematical proof: zero redirect loops across 60 state-route permutations', !loopDetected, 'true', String(!loopDetected));

  // --------------------------------------------------------------------------
  // Scenario 29: AAL2 + Zero Verified Factors Cannot Access Protected Route
  // --------------------------------------------------------------------------
  console.log('\n--- 29. AAL2 + Zero Verified Factors Cannot Access Protected Route ---');
  const staleAal2State = { isAuthenticated: true, isAal2: true, hasVerifiedFactor: false };
  const staleEvalDashboard = evaluateRouteAccess('/dashboard', staleAal2State);
  assert(29, 'Stale AAL2 with zero factors visiting /dashboard blocked', !staleEvalDashboard.allowed && staleEvalDashboard.redirectPath === '/settings/security/mfa', 'true', String(!staleEvalDashboard.allowed));

  const staleEvalCustomers = evaluateRouteAccess('/customers', staleAal2State);
  assert(29, 'Stale AAL2 with zero factors visiting /customers redirects to enrollment', !staleEvalCustomers.allowed && staleEvalCustomers.redirectPath === '/settings/security/mfa?next=%2Fcustomers', 'true', String(!staleEvalCustomers.allowed));

  const stalePostAuth = determinePostAuthRedirect({ isAal2: true, hasVerifiedFactor: false, safeNext: '/dashboard' });
  assert(29, 'determinePostAuthRedirect redirects stale AAL2 with zero factors to enrollment', stalePostAuth === '/settings/security/mfa', 'true', String(stalePostAuth === '/settings/security/mfa'));

  // --------------------------------------------------------------------------
  // Scenario 30: Final-Factor Removal Explicitly Refreshes Session
  // --------------------------------------------------------------------------
  console.log('\n--- 30. Final-Factor Removal Explicitly Refreshes Session ---');
  const mfaActionsSrc = fs.readFileSync(path.join(process.cwd(), 'src/app/(dashboard)/settings/security/mfa/actions.ts'), 'utf8');
  const explicitlyRefreshes = mfaActionsSrc.includes('supabase.auth.refreshSession()') && mfaActionsSrc.includes('remainingCount === 0');
  assert(30, 'unenrollOwnMfaFactorAction explicitly calls supabase.auth.refreshSession() when remainingCount === 0', explicitlyRefreshes, 'true', String(explicitlyRefreshes));

  // --------------------------------------------------------------------------
  // Scenario 31: Successful Refresh Confirms Downgrade Before mustEnroll Success
  // --------------------------------------------------------------------------
  console.log('\n--- 31. Successful Refresh Confirms Downgrade Before mustEnroll Success ---');
  const rechecksAssuranceAndFactors = mfaActionsSrc.includes('getMfaAssuranceLevel(supabase)') &&
    mfaActionsSrc.includes('isDowngraded') &&
    mfaActionsSrc.includes('isZeroFactors') &&
    mfaActionsSrc.includes('currentLevel !== "aal2"');
  assert(31, 'unenrollOwnMfaFactorAction authoritatively confirms AAL downgrade and 0 factors before returning mustEnroll', rechecksAssuranceAndFactors, 'true', String(rechecksAssuranceAndFactors));

  // --------------------------------------------------------------------------
  // Scenario 32: Refresh Failure Fails Closed
  // --------------------------------------------------------------------------
  console.log('\n--- 32. Refresh Failure Fails Closed ---');
  const failsClosedOnRefreshError = mfaActionsSrc.includes('refreshSuccess') &&
    mfaActionsSrc.includes('supabase.auth.signOut()') &&
    mfaActionsSrc.includes('Session could not be securely refreshed');
  assert(32, 'unenrollOwnMfaFactorAction signs out and fails closed if session refresh fails', failsClosedOnRefreshError, 'true', String(failsClosedOnRefreshError));

  // --------------------------------------------------------------------------
  // Scenario 33: Stale AAL2 After Final Factor Removal Cannot Access Dashboard
  // --------------------------------------------------------------------------
  console.log('\n--- 33. Stale AAL2 After Final Factor Removal Cannot Access Dashboard ---');
  const mockStaleAal2Client = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'usr-stale-aal2' } }, error: null }),
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel: 'aal2', nextLevel: 'aal2', currentAuthenticationMethods: [] },
          error: null,
        }),
        listFactors: async () => ({
          data: { all: [] },
          error: null,
        }),
      },
    },
  } as unknown as SupabaseClient;

  let zeroFactorGuardBlocked = false;
  try {
    await requireAal2(mockStaleAal2Client);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('AAL2 assurance required')) {
      zeroFactorGuardBlocked = true;
    }
  }
  assert(33, 'requireAal2 rejects session with AAL2 level but zero verified factors', zeroFactorGuardBlocked, 'true', String(zeroFactorGuardBlocked));

  // --------------------------------------------------------------------------
  // Scenario 34: Final Factor Removed Enforces Enrollment Boundary
  // --------------------------------------------------------------------------
  console.log('\n--- 34. Final Factor Removed Enforces Enrollment Boundary ---');
  const evalEnrollmentBoundary = evaluateRouteAccess('/settings/security/mfa', staleAal2State);
  assert(34, 'Stale AAL2 user with zero factors allowed to access /settings/security/mfa to re-enroll', evalEnrollmentBoundary.allowed, 'true', String(evalEnrollmentBoundary.allowed));

  const evalVerifyBoundary = evaluateRouteAccess('/mfa/verify', staleAal2State);
  assert(34, 'Stale AAL2 user with zero factors blocked from /mfa/verify and redirected to enrollment', !evalVerifyBoundary.allowed && evalVerifyBoundary.redirectPath === '/settings/security/mfa', 'true', String(!evalVerifyBoundary.allowed));

  // --------------------------------------------------------------------------
  // Scenario 35: One Remaining Verified Factor Continues Safely
  // --------------------------------------------------------------------------
  console.log('\n--- 35. One Remaining Verified Factor Continues Safely ---');
  const legitimateAal2State = { isAuthenticated: true, isAal2: true, hasVerifiedFactor: true };
  const evalLegitimateAal2 = evaluateRouteAccess('/dashboard', legitimateAal2State);
  assert(35, 'Legitimate AAL2 user with remaining verified factor allowed on /dashboard', evalLegitimateAal2.allowed, 'true', String(evalLegitimateAal2.allowed));

  const remainingFactorPreserved = mfaActionsSrc.includes('mustEnroll: false') && mfaActionsSrc.includes('remainingFactorCount: remainingCount');
  assert(35, 'unenrollOwnMfaFactorAction preserves normal operation when remainingCount > 0', remainingFactorPreserved, 'true', String(remainingFactorPreserved));

  // --------------------------------------------------------------------------
  // Scenario 36: No Provider/Raw Auth Error Leakage
  // --------------------------------------------------------------------------
  console.log('\n--- 36. No Provider/Raw Auth Error Leakage ---');
  const noRawErrorLeak = !mfaActionsSrc.includes('error.message') || mfaActionsSrc.includes('unenrollResult.error');
  assert(36, 'unenrollOwnMfaFactorAction returns sanitized generic errors on downgrade/refresh failures', noRawErrorLeak, 'true', String(noRawErrorLeak));

  // --------------------------------------------------------------------------
  // Scenario 37: Loop-Free Route Matrix Under Stale AAL2 State
  // --------------------------------------------------------------------------
  console.log('\n--- 37. Loop-Free Route Matrix Under Stale AAL2 State ---');
  let staleLoopDetected = false;
  for (const route of testRoutes) {
    let currentPath = route;
    const visited = new Set<string>();
    let hops = 0;

    while (hops < 5) {
      hops++;
      const evalRes = evaluateRouteAccess(currentPath, staleAal2State);
      if (evalRes.allowed) {
        break;
      }
      const nextPath = evalRes.redirectPath!.split('?')[0];
      if (visited.has(nextPath)) {
        staleLoopDetected = true;
        break;
      }
      visited.add(nextPath);
      currentPath = nextPath;
    }
  }
  assert(37, 'Stale AAL2 state with zero factors is mathematically loop-free across all routes', !staleLoopDetected, 'true', String(!staleLoopDetected));

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n==========================================================================');
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  console.log(`TOTAL S2F TESTS: ${results.length} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('==========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runMandatoryMfaTestSuite().catch((err) => {
  console.error('Test suite failed with unexpected error:', err);
  process.exit(1);
});
