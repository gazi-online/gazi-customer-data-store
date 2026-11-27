"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Save, MessageSquare, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { createEnquiry } from "@/app/(dashboard)/enquiries/actions";
import type {
  EnquiryFormCustomerOption,
  EnquiryFormServiceOption,
  EnquiryPriority,
  EnquirySource,
} from "@/app/(dashboard)/enquiries/types";

interface EnquiryFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  customers: EnquiryFormCustomerOption[];
  services: EnquiryFormServiceOption[];
}

export function EnquiryFormModal({
  isOpen,
  onClose,
  onSuccess,
  customers,
  services,
}: EnquiryFormModalProps) {
  const [customerId, setCustomerId] = useState<string>("");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [serviceId, setServiceId] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [details, setDetails] = useState("");
  const [source, setSource] = useState<EnquirySource>("walk_in");
  const [priority, setPriority] = useState<EnquiryPriority>("normal");
  const [quotedAmount, setQuotedAmount] = useState("");
  const [followUpAt, setFollowUpAt] = useState("");
  const [sendWhatsApp, setSendWhatsApp] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const handleCustomerPick = (id: string) => {
    setCustomerId(id);
    const found = customers.find((c) => c.id === id);
    if (found) {
      const fullName = [found.first_name, found.middle_name, found.last_name]
        .filter(Boolean)
        .join(" ");
      setCustomerName(fullName);
      setPhone(found.phone || "");
      setEmail(found.email || "");
    }
  };

  const handleServicePick = (id: string) => {
    setServiceId(id);
    const found = services.find((s) => s.id === id);
    if (found) {
      if (!subject.trim()) {
        setSubject(found.service_name);
      }
      if (!quotedAmount && found.default_price > 0) {
        setQuotedAmount(String(found.default_price));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !phone.trim() || !subject.trim()) {
      toast.error("Please enter customer name, phone, and enquiry subject.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createEnquiry({
        customer_id: customerId || null,
        customer_name: customerName.trim(),
        phone: phone.trim(),
        email: email.trim() || null,
        service_id: serviceId || null,
        subject: subject.trim(),
        details: details.trim() || null,
        source,
        priority,
        quoted_amount: quotedAmount ? Number(quotedAmount) : null,
        follow_up_at: followUpAt || null,
        sendWhatsApp,
      });

      if (res.error) {
        toast.error(res.error);
        return;
      }

      toast.success(
        res.whatsappSent
          ? "Enquiry saved & WhatsApp confirmation sent!"
          : "Enquiry saved successfully!"
      );
      setCustomerId("");
      setCustomerName("");
      setPhone("");
      setEmail("");
      setServiceId("");
      setSubject("");
      setDetails("");
      setQuotedAmount("");
      setFollowUpAt("");
      onSuccess();
    } catch {
      toast.error("Failed to save enquiry.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/50 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-200 dark:border-zinc-800">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between bg-slate-50/70 dark:bg-zinc-900 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center">
              <HelpCircle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-zinc-50">
                New Customer Enquiry
              </h2>
              <p className="text-xs text-slate-500">
                Store query details, schedule follow-up &amp; notify via WhatsApp
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close modal"
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <form id="new-enquiry-form" onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
          {/* Existing Customer Picker (optional) */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Existing Customer (Optional)
            </label>
            <select
              value={customerId}
              onChange={(e) => handleCustomerPick(e.target.value)}
              className="w-full px-3 py-2.5 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
            >
              <option value="">-- New / Walk-in Customer --</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {[c.first_name, c.middle_name, c.last_name].filter(Boolean).join(" ")}{" "}
                  {c.phone ? `(${c.phone})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                Customer Name *
              </label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Rasek Molla"
                className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                Phone / WhatsApp Number *
              </label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 9876543210"
                className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                Related Service (Optional)
              </label>
              <select
                value={serviceId}
                onChange={(e) => handleServicePick(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
              >
                <option value="">-- Select Service --</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.service_name} (₹{s.default_price})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                Enquiry Subject *
              </label>
              <input
                type="text"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. New PAN Card / Passport"
                className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
              Enquiry Details / Notes
            </label>
            <textarea
              rows={3}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="What did the customer ask? Required documents, fees discussed, etc."
              className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                Source
              </label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value as EnquirySource)}
                className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
              >
                <option value="walk_in">Walk-in</option>
                <option value="phone">Phone Call</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="referral">Referral</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as EnquiryPriority)}
                className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                Quoted Price (₹)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={quotedAmount}
                onChange={(e) => setQuotedAmount(e.target.value)}
                placeholder="Optional"
                className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
              Next Follow-up Date &amp; Time (Optional)
            </label>
            <input
              type="datetime-local"
              value={followUpAt}
              onChange={(e) => setFollowUpAt(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
            />
          </div>

          <label className="flex items-start gap-3 p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-900/50 cursor-pointer">
            <input
              type="checkbox"
              checked={sendWhatsApp}
              onChange={(e) => setSendWhatsApp(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
            />
            <div className="text-xs">
              <span className="font-semibold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5 text-emerald-600" />
                Send WhatsApp confirmation automatically
              </span>
              <span className="text-emerald-700 dark:text-emerald-400 block mt-0.5">
                Customer will receive an instant WhatsApp message confirming their enquiry reference.
              </span>
            </div>
          </label>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-900 shrink-0 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 min-h-[44px] sm:min-h-0 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="new-enquiry-form"
            disabled={isSubmitting}
            className="inline-flex items-center justify-center px-5 py-2 min-h-[44px] sm:min-h-0 bg-violet-600 hover:bg-violet-700 text-white rounded-xl transition-colors shadow-xs font-semibold text-sm disabled:opacity-70"
          >
            <Save className="mr-2 h-4 w-4" />
            {isSubmitting ? "Saving..." : "Save Enquiry"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
