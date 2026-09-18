import { RouteLoadingSkeleton } from "@/components/ui/RouteLoadingSkeleton";

/**
 * Initial route-level loading for /reports.
 * NOTE: This covers only the first navigation to /reports.
 * Internal client-side fetch loading (useEffect / Loader2) is NOT
 * changed in Phase 1A and will be addressed in a later performance phase.
 */
export default function ReportsLoading() {
  return <RouteLoadingSkeleton rowCount={3} />;
}
