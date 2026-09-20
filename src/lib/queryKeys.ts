/**
 * GCDS Phase 3B: Query Key Factory Foundation
 *
 * Centralized, typed, hierarchical query key definitions for TanStack Query.
 *
 * SAFETY CONSTRAINTS:
 * - Requires an explicit `cacheScope` (tenant/business/account identifier); never fabricates one.
 * - Does NOT assume auth.uid === business_id.
 * - Contains NO signed URLs, raw storage paths, document secrets, or PII (Aadhaar/PAN).
 * - Contains NO financial amounts, balance states, or ledger values.
 * - Foundation only: not consumed by any active route in Phase 3B.
 */

export interface CustomerListFilters {
  search?: string;
  status?: string;
}

export interface DocumentListFilters {
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
    lists: (cacheScope: string) => ["gcds", cacheScope, "documents", "list"] as const,
    list: (cacheScope: string, filters?: DocumentListFilters) =>
      ["gcds", cacheScope, "documents", "list", filters ?? {}] as const,
    customer: (cacheScope: string, customerId: string, options?: { includeHistory?: boolean }) =>
      ["gcds", cacheScope, "documents", "customer", customerId, options ?? {}] as const,
  },
  services: {
    all: (cacheScope: string) => ["gcds", cacheScope, "services"] as const,
    catalogs: (cacheScope: string) => ["gcds", cacheScope, "services", "catalog"] as const,
    catalog: (cacheScope: string, filters?: ServiceCatalogFilters) =>
      ["gcds", cacheScope, "services", "catalog", filters ?? {}] as const,
    active: (cacheScope: string) => ["gcds", cacheScope, "services", "active"] as const,
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
