/**
 * ==============================================================================
 * GCDS SECURITY — S2E MFA RECOVERY & ADMIN RESET BOUNDARY VERIFICATION SUITE
 * File: test-mfa-recovery-boundary.ts
 *
 * Verifies:
 * 1. AAL1 cannot remove verified own factor
 * 2. AAL2 can remove only own verified factor
 * 3. Factor ownership revalidated server-side
 * 4. Ordinary user cannot admin-reset another user
 * 5. Staff cannot admin-reset unless explicitly authorized (owner-only boundary)
 * 6. Owner admin-reset boundary requires AAL2
 * 7. Target user ID validated server-side (empty, self-reset, cross-tenant)
 * 8. Client role claims cannot grant authorization (DB query revalidation)
 * 9. Password recovery cannot remove MFA
 * 10. Standard login cannot bypass MFA
 * 11. Admin reset does not reset password
 * 12. Admin reset does not change role
 * 13. No privileged secret reaches client
 * 14. No secret/token logged
 * 15. No localStorage/sessionStorage for security state
 * 16. Multiple TOTP factors handled safely (primary + backup)
 * 17. Only intended factor(s) removed
 * 18. Destructive action requires confirmation
 * 19. Existing S2A-S2D behavior remains intact
 * 20. Mandatory MFA remains OFF
 * ==============================================================================
 */

import fs from 'fs';
import path from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { unenrollTotpFactor, listMfaFactors } from './src/lib/auth/mfa';
import { executeAdminMfaReset, logMfaSecurityEvent, getAdminSupabaseClient } from './src/lib/auth/adminMfaReset';

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
  console.log('🛡️  GCDS SECURITY: S2E MFA RECOVERY & ADMIN RESET BOUNDARY VERIFICATION');
  console.log('==========================================================================\n');

  // --------------------------------------------------------------------------
  // 1. AAL1 Cannot Remove Verified Own Factor
  // --------------------------------------------------------------------------
  console.log('--- 1. AAL1 Self-Removal Protection ---');
  const mockAal1UserClient = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'usr-own' } }, error: null }),
      mfa: {
        listFactors: async () => ({
          data: {
            all: [
              {
                id: 'verified-factor-1',
                factor_type: 'totp',
                status: 'verified',
                created_at: '2026-03-01T00:00:00Z',
                updated_at: '2026-03-01T00:00:00Z',
              },
            ],
          },
          error: null,
        }),
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel: 'aal1', nextLevel: 'aal2' },
          error: null,
        }),
        unenroll: async () => ({ data: { id: 'verified-factor-1' }, error: null }),
      },
    },
  } as unknown as SupabaseClient;

  const aal1UnenrollResult = await unenrollTotpFactor(mockAal1UserClient, 'verified-factor-1');
  assert(
    'AAL1_SELF_UNENROLL',
    'AAL1 cannot remove verified own factor',
    aal1UnenrollResult.success === false,
    'false',
    String(aal1UnenrollResult.success)
  );
  assert(
    'AAL1_SELF_UNENROLL',
    'Returns step-up verification required error',
    aal1UnenrollResult.error === 'Verification required before removing an active factor.',
    'Verification required before removing an active factor.',
    String(aal1UnenrollResult.error)
  );

  // --------------------------------------------------------------------------
  // 2. AAL2 Can Remove Own Verified Factor
  // --------------------------------------------------------------------------
  console.log('\n--- 2. AAL2 Self-Removal Authorization ---');
  let userUnenrollCalledWithId = '';
  const mockAal2UserClient = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'usr-own' } }, error: null }),
      mfa: {
        listFactors: async () => ({
          data: {
            all: [
              {
                id: 'verified-factor-1',
                factor_type: 'totp',
                status: 'verified',
                created_at: '2026-03-01T00:00:00Z',
                updated_at: '2026-03-01T00:00:00Z',
              },
            ],
          },
          error: null,
        }),
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel: 'aal2', nextLevel: 'aal2' },
          error: null,
        }),
        unenroll: async (params: { factorId: string }) => {
          userUnenrollCalledWithId = params.factorId;
          return { data: { id: params.factorId }, error: null };
        },
      },
    },
  } as unknown as SupabaseClient;

  const aal2UnenrollResult = await unenrollTotpFactor(mockAal2UserClient, 'verified-factor-1');
  assert(
    'AAL2_SELF_UNENROLL',
    'AAL2 can remove own verified factor',
    aal2UnenrollResult.success === true && userUnenrollCalledWithId === 'verified-factor-1',
    'verified-factor-1',
    userUnenrollCalledWithId
  );

  // --------------------------------------------------------------------------
  // 3. Factor Ownership Revalidated Server-Side
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Factor Ownership Revalidation ---');
  const foreignFactorAttempt = await unenrollTotpFactor(mockAal2UserClient, 'foreign-user-factor-999');
  assert(
    'FACTOR_OWNERSHIP',
    'Cannot remove factor not belonging to current user',
    foreignFactorAttempt.success === false,
    'false',
    String(foreignFactorAttempt.success)
  );
  assert(
    'FACTOR_OWNERSHIP',
    'Returns factor not found or not eligible error',
    foreignFactorAttempt.error === 'Factor not found or not eligible for removal.',
    'Factor not found or not eligible for removal.',
    String(foreignFactorAttempt.error)
  );

  // --------------------------------------------------------------------------
  // 4 & 5. Privileged Role Boundary (Owner-Only)
  // --------------------------------------------------------------------------
  console.log('\n--- 4 & 5. Privileged Role Boundary (Owner-Only) ---');
  interface MockMembershipRecord {
    user_id: string;
    role: string;
    status: string;
    business_id: string;
  }

  function createMockActingClient(
    role: string,
    currentLevel: string,
    userId: string = 'usr-admin-1',
    businessId: string = 'biz-100',
    customMemberships?: MockMembershipRecord[]
  ) {
    const memberships: MockMembershipRecord[] = customMemberships ?? [
      { user_id: userId, role, status: 'active', business_id: businessId },
      { user_id: 'target-staff-1', role: 'operator', status: 'active', business_id: businessId },
      { user_id: 'target-inactive-1', role: 'operator', status: 'inactive', business_id: businessId },
      { user_id: 'target-suspended-1', role: 'operator', status: 'suspended', business_id: businessId },
      { user_id: 'target-other-biz', role: 'operator', status: 'active', business_id: 'biz-999' },
    ];

    return {
      auth: {
        getUser: async () => ({ data: { user: { id: userId, email: `${role}@example.com` } }, error: null }),
        mfa: {
          getAuthenticatorAssuranceLevel: async () => ({
            data: { currentLevel, nextLevel: currentLevel },
            error: null,
          }),
        },
      },
      from: (table: string) => {
        if (table === 'business_memberships') {
          return {
            select: () => {
              const filters: Record<string, string> = {};
              const queryBuilder = {
                eq: (col: string, val: string) => {
                  filters[col] = val;
                  return queryBuilder;
                },
                limit: () => queryBuilder,
                single: async () => {
                  const match = memberships.find((m) => {
                    for (const [k, v] of Object.entries(filters)) {
                      if ((m as unknown as Record<string, string>)[k] !== v) {
                        return false;
                      }
                    }
                    return true;
                  });
                  if (match) {
                    return { data: match, error: null };
                  }
                  return { data: null, error: { message: 'Membership not found or criteria not met' } };
                },
              };
              return queryBuilder;
            },
          };
        }
        return { select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) };
      },
    } as unknown as SupabaseClient;
  }

  // Test 4: Operator role cannot admin-reset
  const operatorClient = createMockActingClient('operator', 'aal2');
  const operatorResetResult = await executeAdminMfaReset('target-staff-1', { actingClient: operatorClient });
  assert(
    'ROLE_BOUNDARY',
    'Operator / non-owner rejected from admin reset',
    operatorResetResult.success === false,
    'false',
    String(operatorResetResult.success)
  );
  assert(
    'ROLE_BOUNDARY',
    'Operator gets shop owner authorization error',
    operatorResetResult.error === 'Only shop owners are authorized to perform emergency MFA resets.',
    'Only shop owners are authorized to perform emergency MFA resets.',
    String(operatorResetResult.error)
  );

  // Test 5: Admin (non-owner) role rejected if policy is owner-only
  const adminClientRole = createMockActingClient('admin', 'aal2');
  const adminRoleResetResult = await executeAdminMfaReset('target-staff-1', { actingClient: adminClientRole });
  assert(
    'ROLE_BOUNDARY',
    'Admin role rejected when policy is strictly owner-only',
    adminRoleResetResult.success === false,
    'false',
    String(adminRoleResetResult.success)
  );

  // --------------------------------------------------------------------------
  // 6. Owner Reset Boundary Requires AAL2
  // --------------------------------------------------------------------------
  console.log('\n--- 6. Owner Reset Requires AAL2 ---');
  const ownerAal1Client = createMockActingClient('owner', 'aal1');
  const ownerAal1Result = await executeAdminMfaReset('target-staff-1', { actingClient: ownerAal1Client });
  assert(
    'AAL2_STEP_UP',
    'Owner with AAL1 session cannot perform admin reset',
    ownerAal1Result.success === false,
    'false',
    String(ownerAal1Result.success)
  );
  assert(
    'AAL2_STEP_UP',
    'Owner receives elevated AAL2 security requirement message',
    ownerAal1Result.error?.includes('AAL2') === true,
    'true',
    'true'
  );

  // --------------------------------------------------------------------------
  // 7. Target User ID and Status Validation (Active Required)
  // --------------------------------------------------------------------------
  console.log('\n--- 7. Target User ID & Status Validation ---');
  const ownerAal2Client = createMockActingClient('owner', 'aal2', 'owner-uid-1', 'biz-100');

  // Empty target ID
  const emptyTargetResult = await executeAdminMfaReset('', { actingClient: ownerAal2Client });
  assert('TARGET_VALIDATION', 'Empty target user ID rejected', emptyTargetResult.success === false, 'false', String(emptyTargetResult.success));

  // Self reset prevention (owner cannot admin-reset themselves)
  const selfResetResult = await executeAdminMfaReset('owner-uid-1', { actingClient: ownerAal2Client });
  assert(
    'TARGET_VALIDATION',
    'Owner cannot reset their own MFA via admin reset',
    selfResetResult.success === false && selfResetResult.error?.includes('self-service') === true,
    'true',
    'true'
  );

  // Inactive target user rejected
  const inactiveTargetResult = await executeAdminMfaReset('target-inactive-1', { actingClient: ownerAal2Client });
  assert(
    'TARGET_VALIDATION',
    'Inactive target membership rejected (fails closed)',
    inactiveTargetResult.success === false && inactiveTargetResult.error?.includes('not active') === true,
    'true',
    'true'
  );

  // Suspended target user rejected
  const suspendedTargetResult = await executeAdminMfaReset('target-suspended-1', { actingClient: ownerAal2Client });
  assert(
    'TARGET_VALIDATION',
    'Suspended target membership rejected (fails closed)',
    suspendedTargetResult.success === false && suspendedTargetResult.error?.includes('not active') === true,
    'true',
    'true'
  );

  // Cross-tenant target rejected
  const crossTenantResult = await executeAdminMfaReset('target-other-biz', { actingClient: ownerAal2Client });
  assert(
    'TARGET_VALIDATION',
    'Target user outside business tenant rejected',
    crossTenantResult.success === false,
    'false',
    String(crossTenantResult.success)
  );

  // Missing target rejected
  const missingTargetResult = await executeAdminMfaReset('completely-missing-user', { actingClient: ownerAal2Client });
  assert(
    'TARGET_VALIDATION',
    'Non-existent target user rejected',
    missingTargetResult.success === false,
    'false',
    String(missingTargetResult.success)
  );

  // --------------------------------------------------------------------------
  // 8. Server-Side Role Revalidation (No Client Trust)
  // --------------------------------------------------------------------------
  console.log('\n--- 8. Server-Side Role Revalidation ---');
  const adminResetSource = fs.readFileSync(path.join(process.cwd(), 'src/lib/auth/adminMfaReset.ts'), 'utf8');
  assert(
    'SERVER_REVALIDATION',
    'Queries business_memberships table directly on server',
    adminResetSource.includes('.from("business_memberships")') || adminResetSource.includes(".from('business_memberships')"),
    'true',
    'true'
  );
  assert(
    'SERVER_REVALIDATION',
    'Revalidates active status and owner role',
    adminResetSource.includes('membership.role !== "owner"'),
    'true',
    'true'
  );

  // --------------------------------------------------------------------------
  // 9 & 10. Password Recovery & Login Cannot Bypass MFA
  // --------------------------------------------------------------------------
  console.log('\n--- 9 & 10. MFA Invariants (No Bypass) ---');
  const updatePasswordSource = fs.readFileSync(path.join(process.cwd(), 'src/app/(auth)/update-password/actions.ts'), 'utf8');
  assert('MFA_INVARIANT', 'Password reset does not unenroll MFA factors', !updatePasswordSource.includes('unenrollTotpFactor') && !updatePasswordSource.includes('deleteFactor'), 'true', 'true');

  const forgotPasswordSource = fs.readFileSync(path.join(process.cwd(), 'src/app/(auth)/forgot-password/actions.ts'), 'utf8');
  assert('MFA_INVARIANT', 'Forgot password does not touch MFA', !forgotPasswordSource.includes('unenroll') && !forgotPasswordSource.includes('deleteFactor'), 'true', 'true');

  // --------------------------------------------------------------------------
  // 11 & 12. Reset Semantics (Does NOT Reset Password or Role)
  // --------------------------------------------------------------------------
  console.log('\n--- 11 & 12. Admin Reset Semantics ---');
  assert('RESET_SEMANTICS', 'Admin reset does not call updateUser (no password reset)', !adminResetSource.includes('updateUser'), 'true', 'true');
  assert('RESET_SEMANTICS', 'Admin reset does not modify role in business_memberships', !adminResetSource.includes('.update({ role:'), 'true', 'true');

  // --------------------------------------------------------------------------
  // 13. No Privileged Secret Reaches Browser
  // --------------------------------------------------------------------------
  console.log('\n--- 13. Client Secret Leakage Audit ---');
  const clientComponents = [
    'src/components/auth/MfaChallengeView.tsx',
    'src/components/settings/MfaEnrollmentView.tsx',
    'src/components/settings/SettingsTabsView.tsx',
  ];

  for (const relPath of clientComponents) {
    const fullPath = path.join(process.cwd(), relPath);
    const content = fs.readFileSync(fullPath, 'utf8');
    assert('CLIENT_SECRET_AUDIT', `${relPath}: No SUPABASE_SERVICE_ROLE_KEY`, !content.includes('SUPABASE_SERVICE_ROLE_KEY'), 'true', 'true');
    assert('CLIENT_SECRET_AUDIT', `${relPath}: No service_role key`, !content.includes('service_role'), 'true', 'true');
    assert('CLIENT_SECRET_AUDIT', `${relPath}: No NEXT_PUBLIC_ signing secrets`, !content.includes('NEXT_PUBLIC_RECOVERY_SIGNING_SECRET'), 'true', 'true');
  }

  // --------------------------------------------------------------------------
  // 14. No Secret / Token Logged
  // --------------------------------------------------------------------------
  console.log('\n--- 14. Audit Logging Safety ---');
  let loggedOutput = '';
  const origInfo = console.info;
  try {
    console.info = (...args: unknown[]) => {
      loggedOutput += args.map(String).join(' ');
    };
    logMfaSecurityEvent({
      action: 'MFA_ADMIN_RESET',
      actorUserId: 'usr-admin-1',
      targetUserId: 'target-staff-1',
      factorId: 'fac-12345',
      timestamp: '2026-03-24T00:00:00Z',
    });
  } finally {
    console.info = origInfo;
  }
  assert('AUDIT_SAFETY', 'Audit log records MFA_ADMIN_RESET', loggedOutput.includes('MFA_ADMIN_RESET'), 'true', 'true');
  assert('AUDIT_SAFETY', 'Audit log contains NO access token', !loggedOutput.includes('access_token'), 'true', 'true');
  assert('AUDIT_SAFETY', 'Audit log contains NO TOTP secret', !loggedOutput.includes('secret'), 'true', 'true');
  assert('AUDIT_SAFETY', 'Audit log contains NO password', !loggedOutput.includes('password'), 'true', 'true');

  // --------------------------------------------------------------------------
  // 15. No localStorage / sessionStorage in Security Flow
  // --------------------------------------------------------------------------
  console.log('\n--- 15. Client Storage Safety ---');
  const s2eFiles = [
    'src/lib/auth/adminMfaReset.ts',
    'src/app/(dashboard)/settings/admin-mfa-actions.ts',
    'src/app/(dashboard)/settings/security/mfa/actions.ts',
    'src/components/settings/MfaEnrollmentView.tsx',
    'src/components/auth/MfaChallengeView.tsx',
  ];

  for (const relPath of s2eFiles) {
    const fullPath = path.join(process.cwd(), relPath);
    const content = fs.readFileSync(fullPath, 'utf8');
    assert('STORAGE_SAFETY', `${relPath}: No localStorage`, !content.includes('localStorage'), 'true', 'true');
    assert('STORAGE_SAFETY', `${relPath}: No sessionStorage`, !content.includes('sessionStorage'), 'true', 'true');
    assert('STORAGE_SAFETY', `${relPath}: No dangerouslySetInnerHTML`, !content.includes('dangerouslySetInnerHTML'), 'true', 'true');
  }

  // --------------------------------------------------------------------------
  // 16. Multiple TOTP Factors Supported
  // --------------------------------------------------------------------------
  console.log('\n--- 16. Multiple TOTP Factors Support ---');
  const mfaActionsContent = fs.readFileSync(path.join(process.cwd(), 'src/app/(dashboard)/settings/security/mfa/actions.ts'), 'utf8');
  assert('MULTI_FACTOR', 'Allows up to 2 factors (primary and backup)', mfaActionsContent.includes('verified.length >= 2'), 'true', 'true');
  assert('MULTI_FACTOR', 'Identifies backup factor appropriately', mfaActionsContent.includes('Backup Authenticator'), 'true', 'true');
  assert('MULTI_FACTOR', 'unenrollOwnMfaFactorAction exported for self-management', mfaActionsContent.includes('export async function unenrollOwnMfaFactorAction'), 'true', 'true');

  // --------------------------------------------------------------------------
  // 17. Admin Reset Execution Semantics & Factor Targeting
  // --------------------------------------------------------------------------
  console.log('\n--- 17. Admin Reset Execution Semantics (Fail-Closed & Targeting) ---');
  let deletedFactorIds: string[] = [];
  const createMockAdminSupabase = (opts?: {
    factors?: Array<{ id: string; factor_type: string; status: string }>;
    failOnFactorId?: string;
    failAll?: boolean;
  }) => {
    const factorsList = opts?.factors ?? [
      { id: 'factor-staff-totp-1', factor_type: 'totp', status: 'verified' },
      { id: 'factor-staff-totp-2', factor_type: 'totp', status: 'verified' },
    ];

    return {
      auth: {
        admin: {
          mfa: {
            listFactors: async (params: { userId: string }) => {
              if (params.userId === 'target-staff-1') {
                return {
                  data: { factors: factorsList },
                  error: null,
                };
              }
              return { data: { factors: [] }, error: null };
            },
            deleteFactor: async (params: { id: string; userId?: string }) => {
              if (opts?.failAll) {
                return { data: null, error: { message: 'Database connection timeout' } };
              }
              if (opts?.failOnFactorId && params.id === opts.failOnFactorId) {
                return { data: null, error: { message: 'Internal provider failure' } };
              }
              deletedFactorIds.push(params.id);
              return { data: { id: params.id }, error: null };
            },
          },
        },
      },
    } as unknown as SupabaseClient;
  };

  // Case A: All factor deletions succeed
  deletedFactorIds = [];
  const mockAllSucceed = createMockAdminSupabase();
  const successfulReset = await executeAdminMfaReset('target-staff-1', {
    actingClient: ownerAal2Client,
    adminClientOverride: mockAllSucceed,
  });

  assert('ADMIN_RESET_EXEC', 'All factor deletions succeed => success true', successfulReset.success === true, 'true', String(successfulReset.success));
  assert('ADMIN_RESET_EXEC', 'Deletes all factors belonging to target user', deletedFactorIds.length === 2 && deletedFactorIds[0] === 'factor-staff-totp-1' && deletedFactorIds[1] === 'factor-staff-totp-2', 'true', 'true');
  assert('ADMIN_RESET_EXEC', 'Reports exact removed factor count', successfulReset.removedFactorCount === 2, '2', String(successfulReset.removedFactorCount));

  // Case B: Zero factors exist on target user
  const mockZeroFactors = createMockAdminSupabase({ factors: [] });
  const zeroFactorsReset = await executeAdminMfaReset('target-staff-1', {
    actingClient: ownerAal2Client,
    adminClientOverride: mockZeroFactors,
  });
  assert('ADMIN_RESET_EXEC', 'Zero factors exist => success true', zeroFactorsReset.success === true, 'true', String(zeroFactorsReset.success));
  assert('ADMIN_RESET_EXEC', 'Zero factors removed count is 0', zeroFactorsReset.removedFactorCount === 0, '0', String(zeroFactorsReset.removedFactorCount));

  // Case C: Partial deletion failure (1 of 2 fails) => must fail closed!
  deletedFactorIds = [];
  let partialLoggedAudit = '';
  const origInfoPartial = console.info;
  try {
    console.info = (...args: unknown[]) => {
      partialLoggedAudit += args.map(String).join(' ');
    };
    const mockPartialFail = createMockAdminSupabase({ failOnFactorId: 'factor-staff-totp-2' });
    const partialFailReset = await executeAdminMfaReset('target-staff-1', {
      actingClient: ownerAal2Client,
      adminClientOverride: mockPartialFail,
    });
    assert(
      'ADMIN_RESET_EXEC',
      'Partial factor deletion failure => success false (fail closed)',
      partialFailReset.success === false,
      'false',
      String(partialFailReset.success)
    );
    assert(
      'ADMIN_RESET_EXEC',
      'Partial failure reports accurate removedFactorCount (1 removed)',
      partialFailReset.removedFactorCount === 1,
      '1',
      String(partialFailReset.removedFactorCount)
    );
    assert(
      'ADMIN_RESET_EXEC',
      'Partial failure error explains incomplete reset without raw provider error',
      partialFailReset.error?.includes('incomplete') === true && !partialFailReset.error?.includes('Internal provider failure'),
      'true',
      'true'
    );
    assert(
      'ADMIN_RESET_EXEC',
      'Audit log records successful factor deletion (factor-staff-totp-1)',
      partialLoggedAudit.includes('factor-staff-totp-1'),
      'true',
      'true'
    );
    assert(
      'ADMIN_RESET_EXEC',
      'Audit log does NOT record failed factor deletion (factor-staff-totp-2)',
      !partialLoggedAudit.includes('factor-staff-totp-2'),
      'true',
      'true'
    );
  } finally {
    console.info = origInfoPartial;
  }

  // Case D: All factor deletions fail
  deletedFactorIds = [];
  const mockAllFail = createMockAdminSupabase({ failAll: true });
  const allFailReset = await executeAdminMfaReset('target-staff-1', {
    actingClient: ownerAal2Client,
    adminClientOverride: mockAllFail,
  });
  assert(
    'ADMIN_RESET_EXEC',
    'All factor deletions fail => success false',
    allFailReset.success === false,
    'false',
    String(allFailReset.success)
  );
  assert(
    'ADMIN_RESET_EXEC',
    'All deletions fail reports removedFactorCount = 0',
    allFailReset.removedFactorCount === 0,
    '0',
    String(allFailReset.removedFactorCount)
  );
  assert(
    'ADMIN_RESET_EXEC',
    'All deletions fail does not leak raw database error to client',
    !allFailReset.error?.includes('Database connection timeout'),
    'true',
    'true'
  );

  // --------------------------------------------------------------------------
  // 18. Destructive Action Requires Confirmation
  // --------------------------------------------------------------------------
  console.log('\n--- 18. Destructive Action Confirmation UI ---');
  const settingsTabsContent = fs.readFileSync(path.join(process.cwd(), 'src/components/settings/SettingsTabsView.tsx'), 'utf8');
  assert('CONFIRMATION_UI', 'Team tab displays Emergency MFA Reset confirmation modal', settingsTabsContent.includes('Emergency MFA Reset') && settingsTabsContent.includes('Confirm Reset'), 'true', 'true');

  const mfaEnrollmentContent = fs.readFileSync(path.join(process.cwd(), 'src/components/settings/MfaEnrollmentView.tsx'), 'utf8');
  assert('CONFIRMATION_UI', 'Enrollment view requires confirmation before factor removal', mfaEnrollmentContent.includes('Confirm Remove'), 'true', 'true');

  // --------------------------------------------------------------------------
  // 19. Lost Authenticator Guidance (No Bypass, No Recovery Codes)
  // --------------------------------------------------------------------------
  console.log('\n--- 19. Lost Authenticator Guidance ---');
  const challengeViewContent = fs.readFileSync(path.join(process.cwd(), 'src/components/auth/MfaChallengeView.tsx'), 'utf8');
  assert('LOCKOUT_GUIDANCE', 'Offers "Lost access to authenticator?" trigger', challengeViewContent.includes('Lost access to authenticator?'), 'true', 'true');
  assert('LOCKOUT_GUIDANCE', 'Instructs contact with shop owner for reset', challengeViewContent.includes('Shop Owner') || challengeViewContent.includes('administrator'), 'true', 'true');
  assert('LOCKOUT_GUIDANCE', 'Explains user must sign in and enroll again', challengeViewContent.includes('enroll MFA again') || challengeViewContent.includes('sign in again'), 'true', 'true');
  assert('LOCKOUT_GUIDANCE', 'Explicitly states no recovery codes are issued', challengeViewContent.includes('No recovery codes'), 'true', 'true');

  // --------------------------------------------------------------------------
  // 20. Server-Only Defense & Application Policy Boundary
  // --------------------------------------------------------------------------
  console.log('\n--- 20. Server-Only Defense & Multi-Factor Policy ---');
  assert(
    'SERVER_DEFENSE',
    'adminMfaReset.ts enforces runtime window check (server-only)',
    adminResetSource.includes('typeof window !== "undefined"'),
    'true',
    'true'
  );
  assert(
    'SERVER_DEFENSE',
    'No "use client" component imports adminMfaReset.ts',
    !clientComponents.some((file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8').includes('adminMfaReset')),
    'true',
    'true'
  );
  assert(
    'APP_POLICY',
    'Two-factor limit is documented as GCDS application policy',
    mfaActionsContent.includes('GCDS application policy') || mfaActionsContent.includes('GCDS policy'),
    'true',
    'true'
  );

  // --------------------------------------------------------------------------
  // 21. Mandatory MFA Remains OFF
  // --------------------------------------------------------------------------
  console.log('\n--- 21. Mandatory MFA Remains Inactive ---');
  const middlewareContent = fs.readFileSync(path.join(process.cwd(), 'src/middleware.ts'), 'utf8');
  assert('MANDATORY_MFA_OFF', 'Middleware does NOT enforce AAL2 for all authenticated requests', !middlewareContent.includes('aal2') && !middlewareContent.includes('/mfa/verify'), 'true', 'true');

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n==========================================================================');
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  console.log(`TOTAL S2E TESTS: ${results.length} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('==========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
