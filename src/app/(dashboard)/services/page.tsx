import { ServiceTable } from "@/components/tables/ServiceTable";
import { Briefcase } from "lucide-react";

export default function ServicesPage() {
  return (
    <div className="space-y-5 sm:space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-200 w-full max-w-full overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sm:gap-4">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-xs shrink-0 mt-0.5 sm:mt-0">
            <Briefcase className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-slate-900 leading-tight">
              Service Catalog
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Manage the master list of services available for your customers.
            </p>
          </div>
        </div>
      </div>

      <ServiceTable />
    </div>
  );
}
