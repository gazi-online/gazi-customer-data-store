import { ServiceTable } from "@/components/tables/ServiceTable";
import { Briefcase } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";

export default function ServicesPage() {
  return (
    <div className="space-y-5 sm:space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-200 w-full max-w-full overflow-x-hidden">
      <PageHeader
        title="Service Catalog"
        description="Manage the master list of services available for your customers."
        icon={Briefcase}
        iconVariant="gradient"
      />

      <ServiceTable />
    </div>
  );
}
