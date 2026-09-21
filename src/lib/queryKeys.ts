/**
 * GCDS Phase 3D: Query Key Factory & In-Memory Namespace
 *
 * Centralized, typed, hierarchical query key definitions for TanStack Query.
 *
 * ARCHITECTURAL SAFETY BOUNDARY:
 * - Phase 3D uses the dashboard QueryClient as the actual session isolation boundary.
 * - The QueryClient is in-memory only, instantiated once per dashboard provider lifecycle,
 *   cleared completely on logout, and destroyed on dashboard tree unmount.
 * - DASHBOARD_MEMORY_SCOPE is strictly an opaque, in-memory namespace constant inside
 *   the isolated QueryClient.
 * - DASHBOARD_MEMORY_SCOPE is NOT:
 *   - business_id
 *   - auth.uid()
 *   - tenant identity
 *   - authorization or permissions
 * - Never fabricates business IDs or tenant identifiers.
 * - Contains NO signed URLs, raw storage paths, document secrets, or PII (Aadhaar/PAN).
 * - Contains NO financial amounts, balance states, or ledger values.
 * - Services display catalog keys are explicitly DISPLAY-ONLY and MUST NEVER be used for
 *   transactional active service queries, request creation, billing, or FSM.
 * - Document vault keys cache metadata ONLY: strictly NO signed URLs, NO storage paths, NO KYC/Aadhaar/PAN.
 * - Customer lookup keys provide minimal name/code/phone for dropdowns only.
 * - OPERATIONS ALERT CACHE IS DISPLAY-ONLY DERIVED STATE and MUST NEVER be used for
 *   financial, invoice, billing, or request FSM authority.
 */

export const DASHBOARD_MEMORY_SCOPE = "dashboard-memory-v1";

export interface CustomerListFilters {
  search?: string;
  status?: string;
}

export interface DocumentVaultFilters {
  search?: string;
  documentType?: string;
  status?: string;
  renewalWindow?: string;
}

export interface ServiceCatalogFilters {
  search?: string;
  status?: string;
  category?: string;
}

export const queryKeys = {
  customers: {
    all: (cacheScope: string) => ["gcds", cacheScope, "customers"] as const,
    lists: (cacheScope: string) => ["gcds", cacheScope, "customers", "list"] as const,
    list: (cacheScope: string, filters?: CustomerListFilters) =>
      ["gcds", cacheScope, "customers", "list", filters ?? {}] as const,
    details: (cacheScope: string) => ["gcds", cacheScope, "customers", "detail"] as const,
    detail: (cacheScope: string, customerId: string) =>
      ["gcds", cacheScope, "customers", "detail", customerId] as const,
    lookup: (cacheScope: string) => ["gcds", cacheScope, "customers", "lookup"] as const,
  },
  documents: {
    all: (cacheScope: string) => ["gcds", cacheScope, "documents"] as const,
    vaultLists: (cacheScope: string) => ["gcds", cacheScope, "documents", "vault-list"] as const,
    vaultList: (cacheScope: string, filters?: DocumentVaultFilters) =>
      ["gcds", cacheScope, "documents", "vault-list", filters ?? {}] as const,
  },
  services: {
    all: (cacheScope: string) => ["gcds", cacheScope, "services"] as const,
    displayCatalogs: (cacheScope: string) =>
      ["gcds", cacheScope, "services", "display-catalog"] as const,
    displayCatalog: (cacheScope: string, filters?: ServiceCatalogFilters) =>
      ["gcds", cacheScope, "services", "display-catalog", filters ?? {}] as const,
  },
  communications: {
    all: (cacheScope: string) => ["gcds", cacheScope, "communications"] as const,
    queue: (cacheScope: string) => ["gcds", cacheScope, "communications", "queue"] as const,
    shopName: (cacheScope: string) => ["gcds", cacheScope, "communications", "shop_name"] as const,
    customer: (cacheScope: string, customerId: string) =>
      ["gcds", cacheScope, "communications", "customer", customerId] as const,
  },
  operations: {
    all: (cacheScope: string) => ["gcds", cacheScope, "operations"] as const,
    alerts: (cacheScope: string) => ["gcds", cacheScope, "operations", "alerts"] as const,
  },
  settings: {
    all: (cacheScope: string) => ["gcds", cacheScope, "settings"] as const,
    business: (cacheScope: string) => ["gcds", cacheScope, "settings", "business"] as const,
    team: (cacheScope: string) => ["gcds", cacheScope, "settings", "team"] as const,
  },
} as const;
