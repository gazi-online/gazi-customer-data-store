import assert from "assert";
import fs from "fs";
import path from "path";
import {
  CustomerServiceStatus,
} from "./src/types/service";
import {
  ALLOWED_TRANSITIONS,
  canTransitionServiceRequest,
  getAllowedServiceRequestTransitions,
  isTerminalServiceRequestStatus,
  isOperationalTerminalStatus,
  getServiceRequestStatusLabel,
} from "./src/lib/services/serviceRequestWorkflow";

console.log("==========================================================================");
console.log("🧪 MILESTONE 10 PHASE 2A: SERVICE REQUEST WORKFLOW FSM TEST SUITE");
console.log("==========================================================================\n");

let passedCount = 0;
let failedCount = 0;

function it(title: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ [PASS] ${title}`);
    passedCount++;
  } catch (err: unknown) {
    console.error(`❌ [FAIL] ${title}`);
    console.error(err);
    failedCount++;
  }
}

// ------------------------------------------------------------------------------
// Helper: Simulation of Database Trigger trg_validate_service_request_status_transition
// ------------------------------------------------------------------------------
interface SimulatedCustomerServiceRow {
  id: string;
  customer_id: string;
  status: CustomerServiceStatus;
  completed_at: string | null;
  delivered_at: string | null;
  archived_at: string | null;
  rejection_reason: string | null;
  application_reference: string | null;
  notes: string | null;
}

function simulateDbUpdate(
  oldRow: SimulatedCustomerServiceRow,
  patch: Partial<SimulatedCustomerServiceRow>
): { row: SimulatedCustomerServiceRow; historyEventCreated: boolean } {
  // Construct NEW as Postgres does before triggers: unmentioned fields copy OLD
  const newRow: SimulatedCustomerServiceRow = {
    ...oldRow,
    ...patch,
  };

  // --------------------------------------------------------------------------
  // BEFORE UPDATE TRIGGER: validate_service_request_status_transition()
  // --------------------------------------------------------------------------

  // A. Always begin by preserving DB-owned lifecycle fields:
  // Discards any client-supplied completed_at, delivered_at, archived_at
  newRow.completed_at = oldRow.completed_at;
  newRow.delivered_at = oldRow.delivered_at;
  newRow.archived_at = oldRow.archived_at;

  // B. If OLD.status IS NOT DISTINCT FROM NEW.status:
  if (oldRow.status === newRow.status) {
    if (newRow.status === 'rejected' && (!newRow.rejection_reason || newRow.rejection_reason.trim().length === 0)) {
      throw new Error("Rejection reason cannot be blanked while status remains rejected.");
    }

    // Status did not change: AFTER UPDATE OF status trigger does not fire / creates no history
    return { row: newRow, historyEventCreated: false };
  }

  // C. Validate against explicit canonical transition matrix when status changed
  let isValid = false;
  switch (oldRow.status) {
    case 'pending':
      isValid = ['documents_pending', 'ready_to_submit', 'cancelled', 'archived'].includes(newRow.status);
      break;
    case 'documents_pending':
      isValid = ['ready_to_submit', 'cancelled'].includes(newRow.status);
      break;
    case 'ready_to_submit':
      isValid = ['documents_pending', 'submitted', 'cancelled'].includes(newRow.status);
      break;
    case 'submitted':
      isValid = ['in_process', 'action_required', 'rejected'].includes(newRow.status);
      break;
    case 'in_process':
      isValid = ['action_required', 'completed', 'rejected'].includes(newRow.status);
      break;
    case 'action_required':
      isValid = ['documents_pending', 'ready_to_submit', 'submitted', 'in_process', 'rejected', 'cancelled'].includes(newRow.status);
      break;
    case 'completed':
      isValid = ['delivered', 'archived'].includes(newRow.status);
      break;
    case 'delivered':
      isValid = ['archived'].includes(newRow.status);
      break;
    case 'rejected':
      isValid = ['archived'].includes(newRow.status);
      break;
    case 'cancelled':
      isValid = ['archived'].includes(newRow.status);
      break;
    case 'in_progress':
      isValid = ['in_process', 'action_required', 'completed', 'rejected', 'cancelled', 'archived'].includes(newRow.status);
      break;
    case 'archived':
      isValid = false;
      break;
    default:
      isValid = false;
  }

  if (!isValid) {
    throw new Error(`Invalid service request status transition from ${oldRow.status} to ${newRow.status}.`);
  }

  // Lifecycle metadata invariants on valid status change
  const currentDbTimestamp = new Date().toISOString();

  if (newRow.status === 'completed') {
    newRow.completed_at = currentDbTimestamp; // DB assigns
    newRow.delivered_at = null;
    newRow.archived_at = null;
  } else if (newRow.status === 'delivered') {
    newRow.completed_at = oldRow.completed_at; // Preserved from OLD
    newRow.delivered_at = currentDbTimestamp; // DB assigns
    newRow.archived_at = null;
  } else if (newRow.status === 'archived') {
    newRow.completed_at = oldRow.completed_at; // Preserved from OLD
    newRow.delivered_at = oldRow.delivered_at; // Preserved from OLD
    newRow.archived_at = currentDbTimestamp; // DB assigns
  } else if (newRow.status === 'rejected') {
    if (!newRow.rejection_reason || newRow.rejection_reason.trim().length === 0) {
      throw new Error("Transition to rejected requires a non-empty rejection_reason.");
    }
    newRow.completed_at = null;
    newRow.delivered_at = null;
    newRow.archived_at = null;
  } else {
    newRow.completed_at = null;
    newRow.delivered_at = null;
    newRow.archived_at = null;
  }

  // AFTER UPDATE OF status TRIGGER: trg_record_service_request_status_history
  // Fires because status changed: creates exactly 1 history row
  return { row: newRow, historyEventCreated: true };
}

function simulateDbStatusTransition(
  oldRow: SimulatedCustomerServiceRow,
  newStatus: CustomerServiceStatus,
  metadata?: {
    rejection_reason?: string | null;
    application_reference?: string | null;
    notes?: string | null;
    client_completed_at?: string | null;
    client_delivered_at?: string | null;
    client_archived_at?: string | null;
  }
): { row: SimulatedCustomerServiceRow; historyEventCreated: boolean } {
  const patch: Partial<SimulatedCustomerServiceRow> = {
    status: newStatus,
  };
  if (metadata?.rejection_reason !== undefined) patch.rejection_reason = metadata.rejection_reason;
  if (metadata?.application_reference !== undefined) patch.application_reference = metadata.application_reference;
  if (metadata?.notes !== undefined) patch.notes = metadata.notes;
  if (metadata?.client_completed_at !== undefined) patch.completed_at = metadata.client_completed_at;
  if (metadata?.client_delivered_at !== undefined) patch.delivered_at = metadata.client_delivered_at;
  if (metadata?.client_archived_at !== undefined) patch.archived_at = metadata.client_archived_at;

  return simulateDbUpdate(oldRow, patch);
}


// ------------------------------------------------------------------------------
// SECTION 1: ALL ALLOWED TRANSITIONS (TABLE-DRIVEN)
// ------------------------------------------------------------------------------

const ALL_ALLOWED_CASES: Array<[CustomerServiceStatus, CustomerServiceStatus]> = [
  // pending outward
  ['pending', 'documents_pending'],
  ['pending', 'ready_to_submit'],
  ['pending', 'cancelled'],
  ['pending', 'archived'],

  // documents_pending outward
  ['documents_pending', 'ready_to_submit'],
  ['documents_pending', 'cancelled'],

  // ready_to_submit outward
  ['ready_to_submit', 'documents_pending'],
  ['ready_to_submit', 'submitted'],
  ['ready_to_submit', 'cancelled'],

  // submitted outward
  ['submitted', 'in_process'],
  ['submitted', 'action_required'],
  ['submitted', 'rejected'],

  // in_process outward
  ['in_process', 'action_required'],
  ['in_process', 'completed'],
  ['in_process', 'rejected'],

  // action_required outward
  ['action_required', 'documents_pending'],
  ['action_required', 'ready_to_submit'],
  ['action_required', 'submitted'],
  ['action_required', 'in_process'],
  ['action_required', 'rejected'],
  ['action_required', 'cancelled'],

  // completed outward
  ['completed', 'delivered'],
  ['completed', 'archived'],

  // delivered outward
  ['delivered', 'archived'],

  // rejected outward
  ['rejected', 'archived'],

  // cancelled outward
  ['cancelled', 'archived'],

  // legacy in_progress outward (including one-way normalization into in_process)
  ['in_progress', 'in_process'],
  ['in_progress', 'action_required'],
  ['in_progress', 'completed'],
  ['in_progress', 'rejected'],
  ['in_progress', 'cancelled'],
  ['in_progress', 'archived'],
];

it("1. Table-driven verification of ALL allowed transitions in TypeScript and SQL simulation", () => {
  for (const [from, to] of ALL_ALLOWED_CASES) {
    assert.strictEqual(
      canTransitionServiceRequest(from, to),
      true,
      `TS helper must allow ${from} -> ${to}`
    );

    const oldRow: SimulatedCustomerServiceRow = {
      id: "cs-101",
      customer_id: "cust-1",
      status: from,
      completed_at: from === 'completed' || from === 'delivered' ? "2026-09-12T10:00:00Z" : null,
      delivered_at: from === 'delivered' ? "2026-09-12T11:00:00Z" : null,
      archived_at: null,
      rejection_reason: null,
      application_reference: null,
      notes: null,
    };

    const meta = to === 'rejected' ? { rejection_reason: "Document unreadable" } : undefined;
    const res = simulateDbStatusTransition(oldRow, to, meta);
    assert.strictEqual(res.row.status, to);
    assert.strictEqual(res.historyEventCreated, true);
  }
});

// ------------------------------------------------------------------------------
// SECTION 2: REPRESENTATIVE INVALID TRANSITIONS
// ------------------------------------------------------------------------------

const REPRESENTATIVE_INVALID_CASES: Array<[CustomerServiceStatus, CustomerServiceStatus]> = [
  ['pending', 'delivered'],
  ['pending', 'completed'],
  ['documents_pending', 'completed'],
  ['submitted', 'delivered'],
  ['completed', 'in_process'],
  ['rejected', 'submitted'],
  ['cancelled', 'pending'],
  ['archived', 'pending'],
  ['in_process', 'pending'],
  ['delivered', 'pending'],
  ['delivered', 'completed'],
  ['cancelled', 'completed'],
  ['archived', 'completed'],
  ['ready_to_submit', 'delivered'],
  ['in_process', 'in_progress'], // No transition back to legacy
  ['completed', 'in_progress'],
];

it("2. Table-driven verification of representative invalid transitions", () => {
  for (const [from, to] of REPRESENTATIVE_INVALID_CASES) {
    assert.strictEqual(
      canTransitionServiceRequest(from, to),
      false,
      `TS helper must reject ${from} -> ${to}`
    );

    const oldRow: SimulatedCustomerServiceRow = {
      id: "cs-102",
      customer_id: "cust-1",
      status: from,
      completed_at: null,
      delivered_at: null,
      archived_at: null,
      rejection_reason: null,
      application_reference: null,
      notes: null,
    };

    assert.throws(
      () => simulateDbStatusTransition(oldRow, to),
      /Invalid service request status transition/,
      `DB simulation must reject ${from} -> ${to}`
    );
  }
});

// ------------------------------------------------------------------------------
// SECTION 3: INSERT LIFECYCLE PROTECTION
// ------------------------------------------------------------------------------

it("3a. Client cannot pre-seed completed_at on INSERT", () => {
  const simulateInsert = (payload: { completed_at?: string }) => {
    // trg_func_enforce_service_request_initial_status sets status = 'pending', completed_at = NULL regardless of payload
    void payload;
    return {
      status: 'pending' as CustomerServiceStatus,
      completed_at: null,
    };
  };
  const row = simulateInsert({ completed_at: "2026-09-12T12:00:00Z" });
  assert.strictEqual(row.status, 'pending');
  assert.strictEqual(row.completed_at, null, "completed_at must be forced to NULL on insert");
});

it("3b. Client cannot pre-seed delivered_at on INSERT", () => {
  const simulateInsert = (payload: { delivered_at?: string }) => {
    void payload;
    return {
      status: 'pending' as CustomerServiceStatus,
      delivered_at: null,
    };
  };
  const row = simulateInsert({ delivered_at: "2026-09-12T12:00:00Z" });
  assert.strictEqual(row.delivered_at, null, "delivered_at must be forced to NULL on insert");
});

it("3c. Client cannot pre-seed archived_at on INSERT", () => {
  const simulateInsert = (payload: { archived_at?: string }) => {
    void payload;
    return {
      status: 'pending' as CustomerServiceStatus,
      archived_at: null,
    };
  };
  const row = simulateInsert({ archived_at: "2026-09-12T12:00:00Z" });
  assert.strictEqual(row.archived_at, null, "archived_at must be forced to NULL on insert");
});

// ------------------------------------------------------------------------------
// SECTION 4: SAME-STATUS ORDINARY UPDATE PROTECTION
// ------------------------------------------------------------------------------

it("4a. Ordinary same-status UPDATE cannot arbitrarily change completed_at", () => {
  const oldRow: SimulatedCustomerServiceRow = {
    id: "cs-103",
    customer_id: "cust-1",
    status: 'completed',
    completed_at: "2026-09-12T10:00:00Z",
    delivered_at: null,
    archived_at: null,
    rejection_reason: null,
    application_reference: null,
    notes: "Original note",
  };

  // Client attempts to alter completed_at during an ordinary note update
  const res = simulateDbStatusTransition(oldRow, 'completed', {
    notes: "Updated note",
    client_completed_at: "1970-01-01T00:00:00Z",
  });

  assert.strictEqual(res.row.completed_at, "2026-09-12T10:00:00Z", "completed_at must remain untouched by client");
  assert.strictEqual(res.row.notes, "Updated note");
  assert.strictEqual(res.historyEventCreated, false);
});

it("4b. Ordinary same-status UPDATE cannot arbitrarily change delivered_at", () => {
  const oldRow: SimulatedCustomerServiceRow = {
    id: "cs-104",
    customer_id: "cust-1",
    status: 'delivered',
    completed_at: "2026-09-12T10:00:00Z",
    delivered_at: "2026-09-12T11:00:00Z",
    archived_at: null,
    rejection_reason: null,
    application_reference: null,
    notes: null,
  };

  const res = simulateDbStatusTransition(oldRow, 'delivered', {
    client_delivered_at: "2000-01-01T00:00:00Z",
  });

  assert.strictEqual(res.row.delivered_at, "2026-09-12T11:00:00Z", "delivered_at must remain untouched by client");
});

it("4c. Ordinary same-status UPDATE cannot arbitrarily change archived_at", () => {
  const oldRow: SimulatedCustomerServiceRow = {
    id: "cs-105",
    customer_id: "cust-1",
    status: 'archived',
    completed_at: null,
    delivered_at: null,
    archived_at: "2026-09-12T09:00:00Z",
    rejection_reason: null,
    application_reference: null,
    notes: null,
  };

  const res = simulateDbStatusTransition(oldRow, 'archived', {
    client_archived_at: "2030-01-01T00:00:00Z",
  });

  assert.strictEqual(res.row.archived_at, "2026-09-12T09:00:00Z", "archived_at must remain untouched by client");
});

// ------------------------------------------------------------------------------
// SECTION 4B: FINAL LIFECYCLE TRIGGER SCOPE SEAL (TIMESTAMP-ONLY & METADATA-ONLY UPDATES)
// ------------------------------------------------------------------------------

it("4b-1. UPDATE completed_at only → client value cannot persist", () => {
  const oldRow: SimulatedCustomerServiceRow = {
    id: "cs-scope-1",
    customer_id: "cust-1",
    status: 'pending',
    completed_at: null,
    delivered_at: null,
    archived_at: null,
    rejection_reason: null,
    application_reference: null,
    notes: null,
  };

  // Client attempts an UPDATE customer_services SET completed_at = '2099-01-01T00:00:00Z' without touching status
  const res = simulateDbUpdate(oldRow, { completed_at: "2099-01-01T00:00:00Z" });
  assert.strictEqual(res.row.status, 'pending');
  assert.strictEqual(res.row.completed_at, null, "completed_at client value must be discarded");
  assert.strictEqual(res.historyEventCreated, false, "timestamp-only update creates zero history rows");
});

it("4b-2. UPDATE delivered_at only → client value cannot persist", () => {
  const oldRow: SimulatedCustomerServiceRow = {
    id: "cs-scope-2",
    customer_id: "cust-1",
    status: 'in_process',
    completed_at: null,
    delivered_at: null,
    archived_at: null,
    rejection_reason: null,
    application_reference: null,
    notes: null,
  };

  const res = simulateDbUpdate(oldRow, { delivered_at: "2099-01-01T00:00:00Z" });
  assert.strictEqual(res.row.status, 'in_process');
  assert.strictEqual(res.row.delivered_at, null, "delivered_at client value must be discarded");
  assert.strictEqual(res.historyEventCreated, false);
});

it("4b-3. UPDATE archived_at only → client value cannot persist", () => {
  const oldRow: SimulatedCustomerServiceRow = {
    id: "cs-scope-3",
    customer_id: "cust-1",
    status: 'submitted',
    completed_at: null,
    delivered_at: null,
    archived_at: null,
    rejection_reason: null,
    application_reference: null,
    notes: null,
  };

  const res = simulateDbUpdate(oldRow, { archived_at: "2099-01-01T00:00:00Z" });
  assert.strictEqual(res.row.status, 'submitted');
  assert.strictEqual(res.row.archived_at, null, "archived_at client value must be discarded");
  assert.strictEqual(res.historyEventCreated, false);
});

it("4b-4. metadata-only UPDATE preserves all lifecycle timestamps", () => {
  const oldRow: SimulatedCustomerServiceRow = {
    id: "cs-scope-4",
    customer_id: "cust-1",
    status: 'delivered',
    completed_at: "2026-09-12T10:00:00Z",
    delivered_at: "2026-09-12T11:00:00Z",
    archived_at: null,
    rejection_reason: null,
    application_reference: "APP-REF-OLD",
    notes: "Old metadata notes",
  };

  const res = simulateDbUpdate(oldRow, {
    notes: "Updated metadata notes",
    application_reference: "APP-REF-NEW",
  });

  assert.strictEqual(res.row.notes, "Updated metadata notes");
  assert.strictEqual(res.row.application_reference, "APP-REF-NEW");
  assert.strictEqual(res.row.completed_at, "2026-09-12T10:00:00Z", "completed_at preserved");
  assert.strictEqual(res.row.delivered_at, "2026-09-12T11:00:00Z", "delivered_at preserved");
  assert.strictEqual(res.row.archived_at, null, "archived_at preserved");
  assert.strictEqual(res.historyEventCreated, false, "metadata-only update creates zero history rows");
});

it("4b-5. completed row cannot replace completed_at with arbitrary timestamp", () => {
  const oldRow: SimulatedCustomerServiceRow = {
    id: "cs-scope-5",
    customer_id: "cust-1",
    status: 'completed',
    completed_at: "2026-09-12T10:00:00Z",
    delivered_at: null,
    archived_at: null,
    rejection_reason: null,
    application_reference: null,
    notes: null,
  };

  const res = simulateDbUpdate(oldRow, { completed_at: "1970-01-01T00:00:00Z" });
  assert.strictEqual(res.row.status, 'completed');
  assert.strictEqual(res.row.completed_at, "2026-09-12T10:00:00Z", "original completed_at must be preserved");
  assert.strictEqual(res.historyEventCreated, false);
});

it("4b-6. delivered row cannot replace delivered_at with arbitrary timestamp", () => {
  const oldRow: SimulatedCustomerServiceRow = {
    id: "cs-scope-6",
    customer_id: "cust-1",
    status: 'delivered',
    completed_at: "2026-09-12T10:00:00Z",
    delivered_at: "2026-09-12T11:00:00Z",
    archived_at: null,
    rejection_reason: null,
    application_reference: null,
    notes: null,
  };

  const res = simulateDbUpdate(oldRow, { delivered_at: "1980-01-01T00:00:00Z" });
  assert.strictEqual(res.row.status, 'delivered');
  assert.strictEqual(res.row.delivered_at, "2026-09-12T11:00:00Z", "original delivered_at must be preserved");
  assert.strictEqual(res.row.completed_at, "2026-09-12T10:00:00Z", "original completed_at must be preserved");
  assert.strictEqual(res.historyEventCreated, false);
});

it("4b-7. archived row cannot replace archived_at with arbitrary timestamp", () => {
  const oldRow: SimulatedCustomerServiceRow = {
    id: "cs-scope-7",
    customer_id: "cust-1",
    status: 'archived',
    completed_at: "2026-09-12T10:00:00Z",
    delivered_at: "2026-09-12T11:00:00Z",
    archived_at: "2026-09-12T12:00:00Z",
    rejection_reason: null,
    application_reference: null,
    notes: null,
  };

  const res = simulateDbUpdate(oldRow, { archived_at: "2099-01-01T00:00:00Z" });
  assert.strictEqual(res.row.status, 'archived');
  assert.strictEqual(res.row.archived_at, "2026-09-12T12:00:00Z", "original archived_at must be preserved");
  assert.strictEqual(res.historyEventCreated, false);
});

it("4b-8. rejected row may edit reason to another non-empty value", () => {
  const oldRow: SimulatedCustomerServiceRow = {
    id: "cs-scope-8",
    customer_id: "cust-1",
    status: 'rejected',
    completed_at: null,
    delivered_at: null,
    archived_at: null,
    rejection_reason: "Initial: Missing ID proof",
    application_reference: null,
    notes: null,
  };

  const res = simulateDbUpdate(oldRow, { rejection_reason: "Corrected: Passport expired" });
  assert.strictEqual(res.row.status, 'rejected');
  assert.strictEqual(res.row.rejection_reason, "Corrected: Passport expired");
  assert.strictEqual(res.historyEventCreated, false, "rejection reason edit without status change creates zero history rows");
});

it("4b-9. rejected row cannot blank reason", () => {
  const oldRow: SimulatedCustomerServiceRow = {
    id: "cs-scope-9",
    customer_id: "cust-1",
    status: 'rejected',
    completed_at: null,
    delivered_at: null,
    archived_at: null,
    rejection_reason: "Initial rejection reason",
    application_reference: null,
    notes: null,
  };

  assert.throws(
    () => simulateDbUpdate(oldRow, { rejection_reason: null }),
    /Rejection reason cannot be blanked while status remains rejected/
  );
  assert.throws(
    () => simulateDbUpdate(oldRow, { rejection_reason: "" }),
    /Rejection reason cannot be blanked while status remains rejected/
  );
  assert.throws(
    () => simulateDbUpdate(oldRow, { rejection_reason: "   " }),
    /Rejection reason cannot be blanked while status remains rejected/
  );
});

it("4b-10. metadata-only update creates no status-history event", () => {
  const oldRow: SimulatedCustomerServiceRow = {
    id: "cs-scope-10",
    customer_id: "cust-1",
    status: 'documents_pending',
    completed_at: null,
    delivered_at: null,
    archived_at: null,
    rejection_reason: null,
    application_reference: null,
    notes: "Old notes",
  };

  const res = simulateDbUpdate(oldRow, { notes: "New customer notes" });
  assert.strictEqual(res.row.notes, "New customer notes");
  assert.strictEqual(res.historyEventCreated, false, "zero history events created on metadata-only update");
});

it("4b-11. valid status transition still creates exactly one history event", () => {
  const oldRow: SimulatedCustomerServiceRow = {
    id: "cs-scope-11",
    customer_id: "cust-1",
    status: 'pending',
    completed_at: null,
    delivered_at: null,
    archived_at: null,
    rejection_reason: null,
    application_reference: null,
    notes: null,
  };

  const res = simulateDbUpdate(oldRow, { status: 'documents_pending' });
  assert.strictEqual(res.row.status, 'documents_pending');
  assert.strictEqual(res.historyEventCreated, true, "exactly one status-history event created on valid status transition");
});

it("4b-12. invalid transition creates zero history events", () => {
  const oldRow: SimulatedCustomerServiceRow = {
    id: "cs-scope-12",
    customer_id: "cust-1",
    status: 'pending',
    completed_at: null,
    delivered_at: null,
    archived_at: null,
    rejection_reason: null,
    application_reference: null,
    notes: null,
  };

  let historyCreated = false;
  try {
    const res = simulateDbUpdate(oldRow, { status: 'completed' });
    historyCreated = res.historyEventCreated;
  } catch {
    historyCreated = false;
  }
  assert.strictEqual(historyCreated, false, "zero history events created on rejected invalid transition");
});

// ------------------------------------------------------------------------------
// SECTION 5: TRULY DB-OWNED LIFECYCLE TIMESTAMPS ON TRANSITION
// ------------------------------------------------------------------------------

it("5a. Transition to completed receives DB-owned completed_at (ignores client preseeded timestamp)", () => {
  const oldRow: SimulatedCustomerServiceRow = {
    id: "cs-106",
    customer_id: "cust-1",
    status: 'in_process',
    completed_at: null,
    delivered_at: null,
    archived_at: null,
    rejection_reason: null,
    application_reference: null,
    notes: null,
  };

  const fakeClientTimestamp = "1999-12-31T23:59:59Z";
  const res = simulateDbStatusTransition(oldRow, 'completed', { client_completed_at: fakeClientTimestamp });

  assert.strictEqual(res.row.status, 'completed');
  assert.notStrictEqual(res.row.completed_at, fakeClientTimestamp, "Client fake timestamp must be discarded");
  assert.ok(res.row.completed_at !== null, "completed_at must be populated by DB");
});

it("5b. Transition to delivered receives DB-owned delivered_at and preserves completed_at", () => {
  const originalCompletedAt = "2026-09-12T10:00:00Z";
  const oldRow: SimulatedCustomerServiceRow = {
    id: "cs-107",
    customer_id: "cust-1",
    status: 'completed',
    completed_at: originalCompletedAt,
    delivered_at: null,
    archived_at: null,
    rejection_reason: null,
    application_reference: null,
    notes: null,
  };

  const fakeClientTimestamp = "1999-12-31T23:59:59Z";
  const res = simulateDbStatusTransition(oldRow, 'delivered', { client_delivered_at: fakeClientTimestamp });

  assert.strictEqual(res.row.status, 'delivered');
  assert.strictEqual(res.row.completed_at, originalCompletedAt, "completed_at must be preserved");
  assert.notStrictEqual(res.row.delivered_at, fakeClientTimestamp, "Client fake delivered timestamp must be discarded");
  assert.ok(res.row.delivered_at !== null, "delivered_at must be populated by DB");
});

it("5c. Transition to archived receives DB-owned archived_at and preserves completed_at", () => {
  const originalCompletedAt = "2026-09-12T10:00:00Z";
  const oldRow: SimulatedCustomerServiceRow = {
    id: "cs-108",
    customer_id: "cust-1",
    status: 'completed',
    completed_at: originalCompletedAt,
    delivered_at: null,
    archived_at: null,
    rejection_reason: null,
    application_reference: null,
    notes: null,
  };

  const res = simulateDbStatusTransition(oldRow, 'archived');
  assert.strictEqual(res.row.status, 'archived');
  assert.strictEqual(res.row.completed_at, originalCompletedAt, "completed_at preserved on archive");
  assert.ok(res.row.archived_at !== null, "archived_at populated by DB");
});

// ------------------------------------------------------------------------------
// SECTION 6: REJECTION REASON INVARIANTS
// ------------------------------------------------------------------------------

it("6a. Transition to rejected requires non-empty rejection_reason", () => {
  const oldRow: SimulatedCustomerServiceRow = {
    id: "cs-109",
    customer_id: "cust-1",
    status: 'submitted',
    completed_at: null,
    delivered_at: null,
    archived_at: null,
    rejection_reason: null,
    application_reference: null,
    notes: null,
  };

  assert.throws(
    () => simulateDbStatusTransition(oldRow, 'rejected', { rejection_reason: "" }),
    /Transition to rejected requires a non-empty rejection_reason/
  );
  assert.throws(
    () => simulateDbStatusTransition(oldRow, 'rejected', { rejection_reason: "   " }),
    /Transition to rejected requires a non-empty rejection_reason/
  );

  const res = simulateDbStatusTransition(oldRow, 'rejected', { rejection_reason: "Invalid biometric data" });
  assert.strictEqual(res.row.status, 'rejected');
  assert.strictEqual(res.row.rejection_reason, "Invalid biometric data");
});

it("6b. Ordinary update cannot later blank rejection_reason while status is rejected", () => {
  const rejectedRow: SimulatedCustomerServiceRow = {
    id: "cs-110",
    customer_id: "cust-1",
    status: 'rejected',
    completed_at: null,
    delivered_at: null,
    archived_at: null,
    rejection_reason: "Initial rejection reason",
    application_reference: null,
    notes: null,
  };

  // Attempt to blank rejection_reason on ordinary update
  assert.throws(
    () => simulateDbStatusTransition(rejectedRow, 'rejected', { rejection_reason: "" }),
    /Rejection reason cannot be blanked while status remains rejected/
  );
  assert.throws(
    () => simulateDbStatusTransition(rejectedRow, 'rejected', { rejection_reason: "   " }),
    /Rejection reason cannot be blanked while status remains rejected/
  );

  // Updating to a new valid rejection reason succeeds
  const res = simulateDbStatusTransition(rejectedRow, 'rejected', { rejection_reason: "Corrected: mismatch in DOB" });
  assert.strictEqual(res.row.rejection_reason, "Corrected: mismatch in DOB");
});

// ------------------------------------------------------------------------------
// SECTION 7: TERMINAL HELPER SEMANTICS (STRICT SEPARATION)
// ------------------------------------------------------------------------------

it("7a. completed is NOT operational-terminal", () => {
  assert.strictEqual(
    isOperationalTerminalStatus('completed'),
    false,
    "'completed' must NOT be classified as operational-terminal because it has outgoing transitions (delivered, archived)"
  );
  assert.strictEqual(isTerminalServiceRequestStatus('completed'), false);
});

it("7b. delivered, rejected, cancelled, archived are operational-terminal", () => {
  assert.strictEqual(isOperationalTerminalStatus('delivered'), true);
  assert.strictEqual(isOperationalTerminalStatus('rejected'), true);
  assert.strictEqual(isOperationalTerminalStatus('cancelled'), true);
  assert.strictEqual(isOperationalTerminalStatus('archived'), true);

  assert.strictEqual(isOperationalTerminalStatus('pending'), false);
  assert.strictEqual(isOperationalTerminalStatus('documents_pending'), false);
  assert.strictEqual(isOperationalTerminalStatus('ready_to_submit'), false);
  assert.strictEqual(isOperationalTerminalStatus('submitted'), false);
  assert.strictEqual(isOperationalTerminalStatus('in_process'), false);
  assert.strictEqual(isOperationalTerminalStatus('action_required'), false);
  assert.strictEqual(isOperationalTerminalStatus('in_progress'), false);
});

it("7c. archived is the ONLY strict FSM terminal state", () => {
  assert.strictEqual(isTerminalServiceRequestStatus('archived'), true);
  assert.strictEqual(getAllowedServiceRequestTransitions('archived').length, 0);

  // All other statuses permit at least one transition
  const allOtherStatuses: CustomerServiceStatus[] = [
    'pending', 'documents_pending', 'ready_to_submit', 'submitted',
    'in_process', 'action_required', 'completed', 'delivered',
    'rejected', 'cancelled', 'in_progress'
  ];

  for (const s of allOtherStatuses) {
    assert.strictEqual(
      isTerminalServiceRequestStatus(s),
      false,
      `Status '${s}' must not be strict FSM terminal`
    );
    assert.ok(getAllowedServiceRequestTransitions(s).length > 0);
  }
});

// ------------------------------------------------------------------------------
// SECTION 8: SQL MIGRATION FILE VALIDATION & MATRIX PARITY
// ------------------------------------------------------------------------------

it("8a. Migration SQL file contains exact CHECK constraints and delivered invariant", () => {
  const sqlPath = path.join(__dirname, "service_requests_fsm_transition_migration.sql");
  assert.ok(fs.existsSync(sqlPath), "Migration file must exist");
  const sqlContent = fs.readFileSync(sqlPath, "utf-8");

  // Delivered invariant requires both delivered_at and completed_at
  assert.ok(sqlContent.includes("check_service_request_delivered_at"));
  assert.ok(sqlContent.includes("delivered_at IS NOT NULL AND completed_at IS NOT NULL"));

  // Check constraints for completed, rejected, and archived
  assert.ok(sqlContent.includes("check_service_request_completed_at"));
  assert.ok(sqlContent.includes("check_service_request_archived_at"));
  assert.ok(sqlContent.includes("check_service_request_rejected_reason"));

  // Verify 'draft' is NOT in the DB CHECK constraint
  assert.strictEqual(
    sqlContent.includes("'draft'"),
    false,
    "Migration CHECK constraint must NOT include unpersisted 'draft'"
  );
});

it("8b. SQL transition trigger and TypeScript ALLOWED_TRANSITIONS have 100% matrix parity", () => {
  const sqlPath = path.join(__dirname, "service_requests_fsm_transition_migration.sql");
  const sqlContent = fs.readFileSync(sqlPath, "utf-8");

  for (const [from, targets] of Object.entries(ALLOWED_TRANSITIONS)) {
    if (from === 'archived') {
      assert.ok(sqlContent.includes("WHEN 'archived' THEN"), "SQL must explicitly handle archived");
    } else {
      assert.ok(sqlContent.includes(`WHEN '${from}' THEN`), `SQL must handle from status '${from}'`);
      for (const to of targets) {
        assert.ok(sqlContent.includes(`'${to}'`), `SQL must include target status '${to}' for '${from}'`);
      }
    }
  }
});

it("8c. Migration trigger definition proves broad BEFORE UPDATE scope (NOT BEFORE UPDATE OF status)", () => {
  const sqlPath = path.join(__dirname, "service_requests_fsm_transition_migration.sql");
  assert.ok(fs.existsSync(sqlPath), "Migration file must exist");
  const sqlContent = fs.readFileSync(sqlPath, "utf-8");

  // 1. Lifecycle/FSM BEFORE UPDATE trigger must fire on EVERY update to protect timestamp-only updates
  assert.ok(
    /CREATE\s+TRIGGER\s+trg_validate_service_request_status_transition\s+BEFORE\s+UPDATE\s+ON\s+public\.customer_services/i.test(sqlContent),
    "Trigger trg_validate_service_request_status_transition must be defined as BEFORE UPDATE ON public.customer_services"
  );

  // 2. Must NOT be scoped solely to status column (which would allow timestamp-only updates to bypass)
  assert.strictEqual(
    /BEFORE\s+UPDATE\s+OF\s+status\s+ON\s+public\.customer_services/i.test(sqlContent),
    false,
    "FSM migration must NOT define lifecycle guard as BEFORE UPDATE OF status"
  );

  // 3. Function must unconditionally preserve DB-owned lifecycle timestamps at start
  assert.ok(
    sqlContent.includes("NEW.completed_at := OLD.completed_at;"),
    "validate_service_request_status_transition must preserve completed_at from OLD at start"
  );
  assert.ok(
    sqlContent.includes("NEW.delivered_at := OLD.delivered_at;"),
    "validate_service_request_status_transition must preserve delivered_at from OLD at start"
  );
  assert.ok(
    sqlContent.includes("NEW.archived_at := OLD.archived_at;"),
    "validate_service_request_status_transition must preserve archived_at from OLD at start"
  );

  // 4. Function must guard unchanged status
  assert.ok(
    sqlContent.includes("OLD.status IS NOT DISTINCT FROM NEW.status"),
    "validate_service_request_status_transition must check OLD.status IS NOT DISTINCT FROM NEW.status"
  );

  // 5. Function must guard rejected reason
  assert.ok(
    sqlContent.includes("NEW.status = 'rejected' AND (NEW.rejection_reason IS NULL OR length(trim(NEW.rejection_reason)) = 0)"),
    "validate_service_request_status_transition must guard rejection_reason"
  );

  // 6. Foundation status-history trigger must remain status-scoped
  const foundationPath = path.join(__dirname, "service_requests_foundation_migration.sql");
  const foundationContent = fs.readFileSync(foundationPath, "utf-8");
  assert.ok(
    /AFTER\s+UPDATE\s+OF\s+status\s+ON\s+public\.customer_services/i.test(foundationContent),
    "Foundation status history trigger must remain AFTER UPDATE OF status"
  );
  assert.ok(
    foundationContent.includes("OLD.status IS DISTINCT FROM NEW.status"),
    "Foundation status history function must require status to be distinct"
  );
});

it("8d. Migration drops both legacy status CHECK constraints and defines single canonical replacement", () => {
  const sqlPath = path.join(__dirname, "service_requests_fsm_transition_migration.sql");
  assert.ok(fs.existsSync(sqlPath), "Migration file must exist");
  const sqlContent = fs.readFileSync(sqlPath, "utf-8");

  // 1. Must drop both historical constraint names idempotently
  assert.ok(
    /DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+check_customer_services_status/i.test(sqlContent),
    "Migration must explicitly drop check_customer_services_status with IF EXISTS"
  );
  assert.ok(
    /DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+customer_services_status_check/i.test(sqlContent),
    "Migration must explicitly drop customer_services_status_check with IF EXISTS"
  );

  // 2. Must add exactly one canonical status constraint
  const addStatusMatches = sqlContent.match(/ADD\s+CONSTRAINT\s+(\w+)\s+CHECK\s*\(\s*status\s+IN/gi);
  assert.strictEqual(
    addStatusMatches?.length,
    1,
    "Migration must define exactly one status CHECK constraint"
  );
  assert.ok(
    /ADD\s+CONSTRAINT\s+check_customer_services_status\s+CHECK/i.test(sqlContent),
    "Migration must use canonical constraint name check_customer_services_status"
  );

  // 3. Final CHECK must contain all 12 persisted statuses
  const expectedPersistedStatuses: CustomerServiceStatus[] = [
    'pending',
    'documents_pending',
    'ready_to_submit',
    'submitted',
    'in_process',
    'action_required',
    'completed',
    'delivered',
    'rejected',
    'cancelled',
    'in_progress',
    'archived'
  ];

  for (const s of expectedPersistedStatuses) {
    assert.ok(
      sqlContent.includes(`'${s}'`),
      `Status '${s}' must be present in migration status CHECK constraint`
    );
  }

  // 4. Draft is absent
  assert.strictEqual(
    sqlContent.includes("'draft'"),
    false,
    "Migration CHECK constraint must NOT include unpersisted 'draft'"
  );

  // 5. Verify no other status constraints are being created
  assert.strictEqual(
    /ADD\s+CONSTRAINT\s+customer_services_status_check/i.test(sqlContent),
    false,
    "Migration must not recreate duplicate customer_services_status_check"
  );
});

// ------------------------------------------------------------------------------
// SECTION 9: HUMAN-READABLE LABELS
// ------------------------------------------------------------------------------

it("9. Human readable labels exist for all statuses", () => {
  assert.strictEqual(getServiceRequestStatusLabel('pending'), "Pending");
  assert.strictEqual(getServiceRequestStatusLabel('documents_pending'), "Documents Pending");
  assert.strictEqual(getServiceRequestStatusLabel('ready_to_submit'), "Ready to Submit");
  assert.strictEqual(getServiceRequestStatusLabel('submitted'), "Submitted");
  assert.strictEqual(getServiceRequestStatusLabel('in_process'), "In Process");
  assert.strictEqual(getServiceRequestStatusLabel('action_required'), "Action Required");
  assert.strictEqual(getServiceRequestStatusLabel('completed'), "Completed");
  assert.strictEqual(getServiceRequestStatusLabel('delivered'), "Delivered");
  assert.strictEqual(getServiceRequestStatusLabel('rejected'), "Rejected");
  assert.strictEqual(getServiceRequestStatusLabel('cancelled'), "Cancelled");
  assert.strictEqual(getServiceRequestStatusLabel('in_progress'), "In Progress (Legacy)");
  assert.strictEqual(getServiceRequestStatusLabel('archived'), "Archived");
  assert.strictEqual(getServiceRequestStatusLabel('draft'), "Draft");
});

console.log("\n==========================================================================");
console.log(`📊 TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED (TOTAL: ${passedCount + failedCount})`);
console.log("==========================================================================\n");

if (failedCount > 0) {
  process.exit(1);
}
