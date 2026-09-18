import { RouteLoadingSkeleton } from "@/components/ui/RouteLoadingSkeleton";

/**
 * Initial route-level loading for /documents.
 * NOTE: This covers only the first navigation to /documents.
 * Internal client-side fetch loading (useEffect / Loader2) is NOT
 * changed in Phase 1A and will be addressed in a later performance phase.
 */
export default function DocumentsLoading() {
  return <RouteLoadingSkeleton rowCount={4} />;
}
