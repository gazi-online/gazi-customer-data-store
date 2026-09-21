"use server";

import { getOperationsInboxAlerts as queryOperationsInboxAlerts } from "@/lib/operations/operationsInboxQuery";
import type { OperationsInboxSummary } from "@/lib/operations/operationsInboxQuery";

/**
 * Server action to fetch operations inbox alerts for client SWR query.
 *
 * ARCHITECTURAL SAFETY BOUNDARY:
 * - Operations alerts are a DISPLAY-ONLY derived summary.
 * - This data is NEVER used for financial mutations, invoice balances, or request FSM transitions.
 */
export async function getOperationsInboxAlerts(): Promise<OperationsInboxSummary> {
  return queryOperationsInboxAlerts();
}
