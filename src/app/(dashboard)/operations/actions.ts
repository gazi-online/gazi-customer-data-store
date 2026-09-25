"use server";

import { getOperationsInboxAlerts as queryOperationsInboxAlerts } from "@/lib/operations/operationsInboxQuery";
import type { OperationsInboxSummary } from "@/lib/operations/operationsInboxQuery";
import { requireAal2 } from "@/lib/auth/mfaEnforcement";

/**
 * Server action to fetch operations inbox alerts for client SWR query.
 *
 * ARCHITECTURAL SAFETY BOUNDARY:
 * - Operations alerts are a DISPLAY-ONLY derived summary.
 * - This data is NEVER used for financial mutations, invoice balances, or request FSM transitions.
 */
export async function getOperationsInboxAlerts(): Promise<OperationsInboxSummary> {
  await requireAal2();
  return queryOperationsInboxAlerts();
}
