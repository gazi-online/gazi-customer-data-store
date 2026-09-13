import { CustomerServiceStatus, ServiceRequestWorkflowStatus } from "@/types/service";

/**
 * Canonical transition matrix for Service Requests (Milestone 10 Phase 2A).
 * This TypeScript mapping mirrors the database BEFORE UPDATE transition validator exactly.
 */
export const ALLOWED_TRANSITIONS: Record<CustomerServiceStatus, readonly CustomerServiceStatus[]> = {
  pending: ['documents_pending', 'ready_to_submit', 'cancelled', 'archived'],
  documents_pending: ['ready_to_submit', 'cancelled'],
  ready_to_submit: ['documents_pending', 'submitted', 'cancelled'],
  submitted: ['in_process', 'action_required', 'rejected'],
  in_process: ['action_required', 'completed', 'rejected'],
  action_required: ['documents_pending', 'ready_to_submit', 'submitted', 'in_process', 'rejected', 'cancelled'],
  completed: ['delivered', 'archived'],
  delivered: ['archived'],
  rejected: ['archived'],
  cancelled: ['archived'],
  in_progress: ['in_process', 'action_required', 'completed', 'rejected', 'cancelled', 'archived'],
  archived: [],
};

/**
 * Validates whether a status transition from `from` to `to` is permitted.
 * Unchanged status (self-transition) is always permitted as a no-op.
 */
export function canTransitionServiceRequest(
  from: CustomerServiceStatus,
  to: CustomerServiceStatus
): boolean {
  if (from === to) return true;
  const allowed = ALLOWED_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

/**
 * Returns the list of valid target statuses for a given source status.
 */
export function getAllowedServiceRequestTransitions(
  status: CustomerServiceStatus
): readonly CustomerServiceStatus[] {
  return ALLOWED_TRANSITIONS[status] ?? [];
}

/**
 * Checks whether a status is terminal (no outward transitions possible).
 * In Phase 2A, `archived` is the strictly terminal state.
 */
export function isTerminalServiceRequestStatus(
  status: CustomerServiceStatus
): boolean {
  return (ALLOWED_TRANSITIONS[status]?.length ?? 0) === 0;
}

/**
 * Checks whether a status represents an operational terminal outcome
 * (delivered, rejected, cancelled, archived).
 * Note: 'completed' is NOT operational terminal as it can transition
 * forward to 'delivered' or administratively to 'archived'.
 */
export function isOperationalTerminalStatus(
  status: CustomerServiceStatus
): boolean {
  return (
    status === 'delivered' ||
    status === 'rejected' ||
    status === 'cancelled' ||
    status === 'archived'
  );
}

/**
 * Human-readable display labels for service request statuses.
 */
export function getServiceRequestStatusLabel(
  status: CustomerServiceStatus | ServiceRequestWorkflowStatus
): string {
  switch (status) {
    case 'draft':
      return 'Draft';
    case 'pending':
      return 'Pending';
    case 'documents_pending':
      return 'Documents Pending';
    case 'ready_to_submit':
      return 'Ready to Submit';
    case 'submitted':
      return 'Submitted';
    case 'in_process':
      return 'In Process';
    case 'action_required':
      return 'Action Required';
    case 'completed':
      return 'Completed';
    case 'delivered':
      return 'Delivered';
    case 'rejected':
      return 'Rejected';
    case 'cancelled':
      return 'Cancelled';
    case 'in_progress':
      return 'In Progress (Legacy)';
    case 'archived':
      return 'Archived';
    default:
      return status;
  }
}
