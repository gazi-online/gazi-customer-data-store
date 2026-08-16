import { getServices } from "./actions";
import { ServiceTable } from "@/components/tables/ServiceTable";
import { Briefcase } from "lucide-react";

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; category?: string }>;
}) {
  const { search, status, category } = await searchParams;
  const services = await getServices(search, status, category);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center">
            <Briefcase className="mr-3 h-8 w-8 text-indigo-600 dark:text-indigo-500" />
            Service Catalog
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1 ml-11">
            Manage the master list of services available for your customers.
          </p>
        </div>
      </div>

      <ServiceTable services={services || []} />
    </div>
  );
}
