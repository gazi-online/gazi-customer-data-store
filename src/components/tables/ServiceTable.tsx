"use client";

import { useState } from "react";
import { Search, Edit, Plus, Briefcase } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { ServiceFormData } from "@/app/(dashboard)/services/schema";
import { Service } from "@/types/service";
import { ServiceForm } from "@/components/forms/ServiceForm";

export function ServiceTable({ services }: { services: Service[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingService, setEditingService] = useState<ServiceFormData | undefined>(undefined);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams);
    if (search) {
      params.set("search", search);
    } else {
      params.delete("search");
    }
    router.push(`/services?${params.toString()}`);
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const params = new URLSearchParams(searchParams);
    if (e.target.value && e.target.value !== "all") {
      params.set("status", e.target.value);
    } else {
      params.delete("status");
    }
    router.push(`/services?${params.toString()}`);
  };

  const openAddForm = () => {
    setEditingService(undefined);
    setIsFormOpen(true);
  };

  const openEditForm = (service: Service) => {
    setEditingService({
      id: service.id,
      service_code: service.service_code,
      service_name: service.service_name,
      category: service.category,
      description: service.description,
      default_price: service.default_price,
      status: service.status,
    });
    setIsFormOpen(true);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs animate-in fade-in slide-in-from-bottom-2 duration-200">
      {isFormOpen && (
        <ServiceForm
          service={editingService}
          onClose={() => setIsFormOpen(false)}
          onSuccess={() => {
            setIsFormOpen(false);
            router.refresh();
          }}
        />
      )}

      {/* Toolbar */}
      <div className="p-3.5 sm:p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
        <form onSubmit={handleSearch} className="relative w-full sm:max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search services by code or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all"
          />
        </form>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <select
              onChange={handleStatusChange}
              defaultValue={searchParams.get("status") || "all"}
              aria-label="Filter by status"
              className="w-full sm:w-auto py-2.5 sm:py-2 pl-3 pr-8 min-h-[44px] sm:min-h-0 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 cursor-pointer transition-all"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <button
            type="button"
            onClick={openAddForm}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center px-4 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 bg-violet-600 hover:bg-violet-700 text-white rounded-xl transition-colors shadow-xs font-semibold text-xs sm:text-sm shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            <Plus className="mr-1.5 h-4 w-4 shrink-0" />
            <span>Add Service</span>
          </button>
        </div>
      </div>

      {/* Desktop Table View (>= md) */}
      <div className="overflow-x-auto hidden md:block">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50/80 text-slate-500 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider">
            <tr>
              <th className="px-6 py-3.5 font-medium">Code</th>
              <th className="px-6 py-3.5 font-medium">Service Name</th>
              <th className="px-6 py-3.5 font-medium">Category</th>
              <th className="px-6 py-3.5 font-medium">Default Price</th>
              <th className="px-6 py-3.5 font-medium">Status</th>
              <th className="px-6 py-3.5 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {services.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                  <div className="flex flex-col items-center justify-center space-y-2 max-w-sm mx-auto">
                    <Briefcase className="h-8 w-8 text-slate-300" />
                    <p className="font-semibold text-slate-900 text-base">No services found</p>
                    <p className="text-xs text-slate-400">
                      Try adjusting your search or add a new service to the catalog.
                    </p>
                    <button
                      type="button"
                      onClick={openAddForm}
                      className="mt-2 inline-flex items-center justify-center px-3.5 py-2 text-xs font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 rounded-xl transition-colors"
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5 shrink-0" />
                      Add New Service
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              services.map((service) => (
                <tr key={service.id} className="hover:bg-slate-50/70 transition-colors group">
                  <td className="px-6 py-4">
                    <span className="font-mono text-xs font-semibold px-2 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-200">
                      {service.service_code}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900 leading-snug">
                      {service.service_name}
                    </div>
                    {service.description && (
                      <div
                        className="text-xs text-slate-500 truncate max-w-[240px] lg:max-w-[340px] mt-0.5"
                        title={service.description}
                      >
                        {service.description}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-slate-600 text-sm">
                    {service.category ? (
                      service.category
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 font-mono font-semibold text-slate-900 tabular-nums">
                    ₹{Number(service.default_price).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide ${
                        service.status === "active"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-slate-100 text-slate-600 border border-slate-200"
                      }`}
                    >
                      {service.status.charAt(0).toUpperCase() + service.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => openEditForm(service)}
                      className="p-2 min-h-[38px] min-w-[38px] inline-flex items-center justify-center text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 group-hover:text-slate-600"
                      title="Edit Service"
                      aria-label={`Edit ${service.service_name}`}
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List View (< md) */}
      <div className="md:hidden divide-y divide-slate-100">
        {services.length === 0 ? (
          <div className="p-8 text-center text-slate-500 flex flex-col items-center justify-center space-y-2">
            <Briefcase className="h-8 w-8 text-slate-300" />
            <p className="font-semibold text-slate-900 text-sm">No services found</p>
            <p className="text-xs text-slate-400">
              Try adjusting your search or add a new service to the catalog.
            </p>
            <button
              type="button"
              onClick={openAddForm}
              className="mt-2 inline-flex items-center justify-center px-4 py-2.5 min-h-[44px] text-xs font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 rounded-xl transition-colors"
            >
              <Plus className="mr-1.5 h-4 w-4 shrink-0" />
              Add New Service
            </button>
          </div>
        ) : (
          services.map((service) => (
            <div
              key={service.id}
              className="p-4 flex flex-col gap-3 hover:bg-slate-50/50 transition-colors"
            >
              {/* Header: Service Name + Status */}
              <div className="flex items-start justify-between gap-2.5">
                <div className="min-w-0 flex-1">
                  <span className="font-semibold text-slate-900 text-sm sm:text-base leading-snug break-words">
                    {service.service_name}
                  </span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-mono text-[11px] font-semibold px-2 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-200">
                      {service.service_code}
                    </span>
                  </div>
                </div>

                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold shrink-0 ${
                    service.status === "active"
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-slate-100 text-slate-600 border border-slate-200"
                  }`}
                >
                  {service.status.charAt(0).toUpperCase() + service.status.slice(1)}
                </span>
              </div>

              {/* Description (if provided) */}
              {service.description && (
                <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">
                  {service.description}
                </p>
              )}

              {/* Meta Grid: Category & Price */}
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100/80 text-xs">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                    Category
                  </span>
                  <span className="font-medium text-slate-700 truncate block">
                    {service.category ? service.category : <span className="text-slate-400">—</span>}
                  </span>
                </div>

                <div className="text-right">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                    Default Price
                  </span>
                  <span className="font-mono font-bold text-slate-900 text-sm sm:text-base tabular-nums">
                    ₹{Number(service.default_price).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Actions Row */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => openEditForm(service)}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 min-h-[44px] text-xs font-semibold rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-violet-700 transition-colors shadow-2xs focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                  aria-label={`Edit ${service.service_name}`}
                >
                  <Edit className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span>Edit Service</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
