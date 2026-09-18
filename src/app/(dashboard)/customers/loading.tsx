import { RouteLoadingSkeleton } from "@/components/ui/RouteLoadingSkeleton";

export default function CustomersLoading() {
  return <RouteLoadingSkeleton hasAction rowCount={5} />;
}
