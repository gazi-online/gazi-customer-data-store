import { RouteLoadingSkeleton } from "@/components/ui/RouteLoadingSkeleton";

export default function PaymentsLoading() {
  return <RouteLoadingSkeleton hasAction rowCount={5} />;
}
