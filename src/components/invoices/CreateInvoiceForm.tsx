"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ArrowLeft, Receipt, Calculator, Save } from "lucide-react";
import { BillingEngine } from "@/lib/billing/BillingEngine";
import { createInvoice } from "@/app/(dashboard)/invoices/actions";
import { toast } from "sonner";
import Link from "next/link";

interface CustomerOption {
  id: string;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  customer_code?: string;
}

interface ServiceOption {
  id: string;
  service_name: string;
  service_code: string;
  default_price: number;
}

interface CustomerServiceOption {
  id: string;
  service_id: string;
  amount: number;
  service?: ServiceOption;
}

interface CreateInvoiceFormProps {
  customers: CustomerOption[];
  services: ServiceOption[];
  customerServices?: CustomerServiceOption[];
  preselectedCustomerId?: string;
}

interface LineItemState {
  service_id: string;
  customer_service_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  tax_amount: number;
}

export function CreateInvoiceForm({
  customers,
  services,
  customerServices = [],
  preselectedCustomerId,
}: CreateInvoiceFormProps) {
  const router = useRouter();

  const [customerId, setCustomerId] = useState(preselectedCustomerId || "");
  const [invoiceDate, setInvoiceDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 15);
    return d.toISOString().split("T")[0];
  });
  const [notes, setNotes] = useState("");
  const [invoiceStatus, setInvoiceStatus] = useState<'issued' | 'draft'>('issued');
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Idempotency Key Client Contract: reused on retries, regenerated on fresh transaction
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => crypto.randomUUID());

  const [items, setItems] = useState<LineItemState[]>([
    {
      service_id: "",
      customer_service_id: "",
      description: "",
      quantity: 1,
      unit_price: 0,
      discount_amount: 0,
      tax_amount: 0,
    },
  ]);

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        service_id: "",
        customer_service_id: "",
        description: "",
        quantity: 1,
        unit_price: 0,
        discount_amount: 0,
        tax_amount: 0,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) {
      toast.error("Invoice must have at least one line item.");
      return;
    }
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (
    index: number,
    field: keyof LineItemState,
    value: any
  ) => {
    setItems((prev) => {
      const updated = [...prev];
      const current = { ...updated[index], [field]: value };

      // Snapshot service details if service_id changed
      if (field === "service_id" && value) {
        const srv = services.find((s) => s.id === value);
        if (srv) {
          current.description = srv.service_name;
          current.unit_price = Number(srv.default_price);
        }
      }

      updated[index] = current;
      return updated;
    });
  };

  // Live client financial preview using BillingEngine
  const lineTotals = items.map((item) =>
    BillingEngine.calculateLineTotal({
      quantity: item.quantity,
      unit_price: item.unit_price,
      discount_amount: item.discount_amount,
      tax_amount: item.tax_amount,
    })
  );

  const calculatedTotals = BillingEngine.calculateInvoiceTotals({
    items: items.map((item, idx) => ({
      ...item,
      line_total: lineTotals[idx],
    })) as any,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!customerId) {
      toast.error("Please select a customer.");
      return;
    }

    if (items.some((it) => !it.description.trim())) {
      toast.error("All item lines must have a valid description.");
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await createInvoice({
        customer_id: customerId,
        invoice_date: invoiceDate,
        due_date: dueDate || null,
        notes: notes || null,
        status: invoiceStatus,
        idempotency_key: idempotencyKey,
        items: items.map((it) => ({
          service_id: it.service_id || null,
          customer_service_id: it.customer_service_id || null,
          description: it.description,
          quantity: Number(it.quantity),
          unit_price: Number(it.unit_price),
          discount_amount: Number(it.discount_amount || 0),
          tax_amount: Number(it.tax_amount || 0),
        })),
      });

      if (res.error) {
        toast.error(res.error);
        return;
      }

      if (res.replayed) {
        toast.info("Invoice already created (idempotent replay).");
      } else {
        toast.success("Invoice created successfully!");
      }

      setIdempotencyKey(crypto.randomUUID());
      if (res.data?.id) {
        router.push(`/invoices/${res.data.id}`);
      } else {
        router.push("/invoices");
      }
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to create invoice.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-6">
        <div>
          <Link
            href="/invoices"
            className="inline-flex items-center text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors mb-2"
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to Invoices
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center">
            <Receipt className="mr-3 h-7 w-7 text-blue-600" />
            Create New Invoice
          </h1>
        </div>

        <div className="flex items-center space-x-3">
          <select
            value={invoiceStatus}
            onChange={(e) => setInvoiceStatus(e.target.value as any)}
            className="px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="issued">Save as Issued</option>
            <option value="draft">Save as Draft</option>
          </select>

          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-md hover:shadow-lg transition-all flex items-center"
          >
            <Save className="mr-2 h-4 w-4" />
            {isSubmitting ? "Generating..." : "Save Invoice"}
          </button>
        </div>
      </div>

      {/* Customer & Invoice Date Configuration */}
      <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-2">
            Customer <span className="text-red-500">*</span>
          </label>
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            required
            className="w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 text-zinc-900 dark:text-zinc-100"
          >
            <option value="">-- Select Customer --</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.first_name} {c.middle_name ? c.middle_name + " " : ""}{c.last_name}{" "}
                {c.customer_code ? `(${c.customer_code})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-2">
            Invoice Date <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
            required
            className="w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-zinc-900 dark:text-zinc-100"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-2">
            Due Date
          </label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-zinc-900 dark:text-zinc-100"
          />
        </div>
      </div>

      {/* Line Items Table */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
          <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Invoice Items</h3>
          <p className="text-xs text-zinc-500">Service master price snapshots are frozen upon saving.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-950 text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                <th className="py-3 px-3 w-1/3">Service / Description</th>
                <th className="py-3 px-3 text-right w-20">Qty</th>
                <th className="py-3 px-3 text-right w-28">Unit Price (₹)</th>
                <th className="py-3 px-3 text-right w-24">Discount (₹)</th>
                <th className="py-3 px-3 text-right w-24">Tax (₹)</th>
                <th className="py-3 px-3 text-right w-28">Line Total</th>
                <th className="py-3 px-3 text-center w-12">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {items.map((item, index) => (
                <tr key={index} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                  <td className="py-3 px-3 space-y-2">
                    <select
                      value={item.service_id}
                      onChange={(e) => handleItemChange(index, "service_id", e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 text-zinc-900 dark:text-zinc-100"
                    >
                      <option value="">-- Pick Service Master (Optional) --</option>
                      {services.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.service_name} (₹{s.default_price})
                        </option>
                      ))}
                    </select>

                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => handleItemChange(index, "description", e.target.value)}
                      placeholder="Line item description..."
                      required
                      className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-zinc-900 dark:text-zinc-100"
                    />
                  </td>

                  <td className="py-3 px-3 text-right vertical-align-top">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={item.quantity}
                      onChange={(e) => handleItemChange(index, "quantity", parseFloat(e.target.value) || 1)}
                      className="w-20 px-2.5 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500 text-zinc-900 dark:text-zinc-100"
                    />
                  </td>

                  <td className="py-3 px-3 text-right">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.unit_price}
                      onChange={(e) => handleItemChange(index, "unit_price", parseFloat(e.target.value) || 0)}
                      className="w-28 px-2.5 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm font-semibold text-right focus:outline-none focus:ring-2 focus:ring-blue-500 text-zinc-900 dark:text-zinc-100"
                    />
                  </td>

                  <td className="py-3 px-3 text-right">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.discount_amount}
                      onChange={(e) => handleItemChange(index, "discount_amount", parseFloat(e.target.value) || 0)}
                      className="w-24 px-2.5 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500 text-zinc-900 dark:text-zinc-100"
                    />
                  </td>

                  <td className="py-3 px-3 text-right">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.tax_amount}
                      onChange={(e) => handleItemChange(index, "tax_amount", parseFloat(e.target.value) || 0)}
                      className="w-24 px-2.5 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500 text-zinc-900 dark:text-zinc-100"
                    />
                  </td>

                  <td className="py-3 px-3 text-right font-mono font-bold text-zinc-900 dark:text-zinc-100">
                    ₹{lineTotals[index].toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </td>

                  <td className="py-3 px-3 text-center">
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(index)}
                      className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          type="button"
          onClick={handleAddItem}
          className="inline-flex items-center px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-semibold text-xs rounded-xl transition-colors"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Item Line
        </button>
      </div>

      {/* Financial Summary Preview & Notes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Notes */}
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-2">
          <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
            Notes / Payment Terms
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="Specify payment details, bank accounts, or notes for customer..."
            className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-zinc-900 dark:text-zinc-100"
          />
        </div>

        {/* Totals Preview Card */}
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3 font-mono text-sm">
          <h4 className="text-xs font-sans font-bold text-zinc-500 uppercase tracking-wider flex items-center mb-2">
            <Calculator className="mr-2 h-4 w-4 text-blue-500" /> Live Financial Calculation Preview
          </h4>

          <div className="flex justify-between py-1.5 border-b border-zinc-100 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400">
            <span>Subtotal:</span>
            <span>₹{calculatedTotals.subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-zinc-100 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400">
            <span>Total Discount:</span>
            <span>- ₹{calculatedTotals.discount_amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-zinc-100 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400">
            <span>Total Tax:</span>
            <span>+ ₹{calculatedTotals.tax_amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between py-2 text-base font-bold text-blue-600 dark:text-blue-400 border-b border-zinc-200 dark:border-zinc-700">
            <span>Total Invoice Amount:</span>
            <span>₹{calculatedTotals.total_amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between py-1 text-xs text-zinc-500">
            <span>Initial Outstanding Balance:</span>
            <span className="font-bold text-amber-600 dark:text-amber-400">
              ₹{calculatedTotals.total_amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>
    </form>
  );
}
