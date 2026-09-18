import { RouteLoadingSkeleton } from "@/components/ui/RouteLoadingSkeleton";

export default function InvoicesLoading() {
  return <RouteLoadingSkeleton hasAction rowCount={5} />;
}
