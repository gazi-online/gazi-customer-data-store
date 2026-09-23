import Link from "next/link";
import { getCustomerById } from "../actions";
import { getCustomerDocuments, getCustomerAiImports } from "@/app/(dashboard)/documents/actions";
import { notFound } from "next/navigation";
import { ArrowLeft, Edit, Calendar, Hash, ShieldCheck, Phone, MessageCircle, Mail, Users, MapPin, Receipt, ClipboardList } from "lucide-react";
import { DocumentUploadForm } from "@/components/forms/DocumentUploadForm";
import { getProfilePhotoSignedUrl } from "@/app/(dashboard)/customers/ai-actions";
import { CustomerProfileTabs } from "@/components/customers/CustomerProfileTabs";
import { getCustomerServices } from "@/app/(dashboard)/services/actions";
import { CustomerDeleteButton } from "@/components/customers/CustomerDeleteButton";

import { CustomerDocument } from "@/types/document";

// Helper function to mask Aadhaar
function maskAadhaar(aadhaar: string | null) {
  if (!aadhaar) return null;
  const clean = aadhaar.replace(/\s/g, '');
  if (clean.length === 12) {
    return `XXXX XXXX ${clean.slice(-4)}`;
  }
  return 'XXXX XXXX XXXX';
}

// Helper function to mask PAN
function maskPan(pan: string | null) {
  if (!pan) return null;
  if (pan.length === 10) {
    return `${pan.slice(0, 5)}****${pan.slice(-1)}`;
  }
  return '**********';
}

export default async function CustomerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let customer;

  try {
    customer = await getCustomerById(id);
    if (!customer || customer.deleted_at) {
      notFound();
    }
  } catch {
    notFound();
  }

  // Concurrently run independent secondary profile reads
  const photoPromise = (async () => {
    if (customer.photo_source) {
      return await getProfilePhotoSignedUrl(customer.photo_source);
    } else if (customer.photo_url) {
      return customer.photo_url;
    }
    return null;
  })();

  // Single document query — activeDocuments derived client/render-side to avoid duplicate DB/signing work
  const allDocumentsPromise = getCustomerDocuments(id, true);
  const aiImportsPromise = getCustomerAiImports(id);
  const customerServicesPromise = getCustomerServices(id);

  const [photoRes, allDocsRes, aiImportsRes, customerServicesRes] = await Promise.allSettled([
    photoPromise,
    allDocumentsPromise,
    aiImportsPromise,
    customerServicesPromise,
  ]);

  const displayPhotoUrl = photoRes.status === "fulfilled" ? photoRes.value : null;
  if (photoRes.status === "rejected") {
    console.error("Failed to fetch customer photo:", photoRes.reason);
  }

  const allDocuments: CustomerDocument[] = allDocsRes.status === "fulfilled" ? allDocsRes.value : [];
  if (allDocsRes.status === "rejected") {
    console.error("Failed to fetch customer documents:", allDocsRes.reason);
  }

  const activeDocuments = allDocuments.filter(
    (d) => d.status === "active" || !d.status
  );

  const aiImports = aiImportsRes.status === "fulfilled" ? aiImportsRes.value : [];
  if (aiImportsRes.status === "rejected") {
    console.error("Failed to fetch AI imports:", aiImportsRes.reason);
  }

  const customerServices = customerServicesRes.status === "fulfilled" ? customerServicesRes.value : [];
  if (customerServicesRes.status === "rejected") {
    console.error("Failed to fetch customer services:", customerServicesRes.reason);
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5 sm:space-y-6 w-full max-w-full overflow-x-hidden animate-in fade-in slide-in-from-bottom-4 duration-150">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-6">
        <Link 
          href="/customers" 
          className="inline-flex items-center text-xs sm:text-sm font-medium text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-colors min-h-[40px] sm:min-h-0"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Customers
        </Link>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Contextual Action: Create Invoice with preselected customer */}
          <Link
            href={`/invoices/new?customer_id=${id}`}
            className="inline-flex items-center justify-center px-3.5 py-2 min-h-[44px] bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors shadow-xs"
            title="Create Invoice for this customer"
          >
            <Receipt className="mr-1.5 h-4 w-4" />
            + Create Invoice
          </Link>

          {/* Contextual Action: View Requests for this customer */}
          <Link
            href={`/requests?q=${encodeURIComponent(customer.phone || customer.first_name)}`}
            className="inline-flex items-center justify-center px-3.5 py-2 min-h-[44px] bg-white dark:bg-zinc-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs sm:text-sm font-semibold hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors shadow-xs text-slate-700 dark:text-zinc-200"
            title="Search customer service requests"
          >
            <ClipboardList className="mr-1.5 h-4 w-4 text-indigo-500" />
            Requests
          </Link>

          <Link 
            href={`/customers/${id}/edit`} 
            className="inline-flex items-center justify-center px-3.5 py-2 min-h-[44px] bg-white dark:bg-zinc-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs sm:text-sm font-semibold hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors shadow-xs text-slate-700 dark:text-zinc-200"
          >
            <Edit className="mr-1.5 h-4 w-4" />
            Edit Profile
          </Link>
          <CustomerDeleteButton
            customerId={id}
            customerName={`${customer.first_name} ${customer.last_name}`}
            redirectTo="/customers"
            variant="button"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6">
        {/* Left Column - Main Profile Card */}
        <div className="lg:col-span-1 space-y-5 sm:space-y-6">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xs flex flex-col items-center text-center relative overflow-hidden">
            {/* Background accent */}
            <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-b from-violet-50/80 to-white dark:from-violet-950/20 dark:to-zinc-900 z-0"></div>
            
            <div className="relative z-10">
              {displayPhotoUrl ? (
                <img src={displayPhotoUrl} alt="Profile" className="h-28 w-28 sm:h-32 sm:w-32 rounded-full object-cover border-4 border-white dark:border-zinc-800 shadow-sm" />
              ) : (
                <div className="h-28 w-28 sm:h-32 sm:w-32 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-violet-700 dark:text-violet-300 text-3xl sm:text-4xl font-bold border-4 border-white dark:border-zinc-800 shadow-sm">
                  {customer.first_name[0]}{customer.last_name[0]}
                </div>
              )}
            </div>
            
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 mt-3 sm:mt-4 relative z-10 break-words max-w-full">
              {customer.first_name} {customer.middle_name ? `${customer.middle_name} ` : ""}{customer.last_name}
            </h1>
            
            {customer.customer_code && (
              <p className="text-slate-500 dark:text-slate-400 font-mono text-xs sm:text-sm mt-1 flex items-center justify-center relative z-10 break-all">
                <Hash className="h-3 w-3 mr-1 shrink-0" />
                {customer.customer_code}
              </p>
            )}

            <div className="mt-3 sm:mt-4 relative z-10">
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                customer.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                customer.status === 'inactive' ? 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400' :
                'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
              }`}>
                {customer.status.charAt(0).toUpperCase() + customer.status.slice(1)}
              </span>
            </div>
            
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-5 sm:mt-6 flex items-center justify-center relative z-10">
              <Calendar className="mr-1.5 h-3.5 w-3.5 shrink-0" />
              Customer since {new Date(customer.created_at).toLocaleDateString()}
            </p>
          </div>

          {/* Identity Card (India) */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-white uppercase tracking-wider mb-4 flex items-center">
              <ShieldCheck className="mr-2 h-4 w-4 text-blue-600 shrink-0" />
              Identity (KYC)
            </h2>
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-zinc-500">Aadhaar Number</p>
                <p className="text-zinc-900 dark:text-zinc-100 font-medium font-mono text-xs sm:text-sm break-all">
                  {maskAadhaar(customer.aadhaar_number) || <span className="text-zinc-400 italic">Not provided</span>}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-zinc-500">PAN Number</p>
                <p className="text-zinc-900 dark:text-zinc-100 font-medium font-mono uppercase text-xs sm:text-sm break-all">
                  {maskPan(customer.pan_number) || <span className="text-zinc-400 italic">Not provided</span>}
                </p>
              </div>
              {customer.gst_number && (
                <div>
                  <p className="text-xs font-medium text-zinc-500">GST Number</p>
                  <p className="text-zinc-900 dark:text-zinc-100 font-medium font-mono uppercase text-xs sm:text-sm break-all">
                    {customer.gst_number}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Details */}
        <div className="lg:col-span-2 space-y-5 sm:space-y-6">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-6 shadow-sm">
            <h2 className="text-base sm:text-lg font-semibold text-zinc-900 dark:text-white mb-4 sm:mb-6 border-b border-zinc-100 dark:border-zinc-800 pb-2">Contact Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 sm:gap-y-6 gap-x-6 sm:gap-x-8">
              <div className="space-y-1">
                <p className="text-xs sm:text-sm font-medium text-zinc-500 flex items-center">
                  <Phone className="mr-2 h-4 w-4 shrink-0" /> Phone
                </p>
                <p className="text-zinc-900 dark:text-zinc-100 font-medium text-sm break-all">{customer.phone}</p>
              </div>

              <div className="space-y-1">
                <p className="text-xs sm:text-sm font-medium text-zinc-500 flex items-center">
                  <MessageCircle className="mr-2 h-4 w-4 text-green-500 shrink-0" /> WhatsApp
                </p>
                <p className="text-zinc-900 dark:text-zinc-100 font-medium text-sm break-all">
                  {customer.whatsapp || <span className="text-zinc-400 italic">Not provided</span>}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-xs sm:text-sm font-medium text-zinc-500 flex items-center">
                  <Mail className="mr-2 h-4 w-4 shrink-0" /> Email
                </p>
                <p className="text-zinc-900 dark:text-zinc-100 font-medium text-sm break-all">
                  {customer.email || <span className="text-zinc-400 italic">Not provided</span>}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-6 shadow-sm">
            <h2 className="text-base sm:text-lg font-semibold text-zinc-900 dark:text-white mb-4 sm:mb-6 border-b border-zinc-100 dark:border-zinc-800 pb-2 flex items-center">
              <Users className="mr-2 h-4 w-4 sm:h-5 sm:w-5 text-indigo-500 shrink-0" />
              Family / Guardianship
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 sm:gap-y-6 gap-x-6 sm:gap-x-8">
              <div className="space-y-1">
                <p className="text-xs sm:text-sm font-medium text-zinc-500">Father / Guardian Name</p>
                <p className="text-zinc-900 dark:text-zinc-100 font-medium text-sm break-words">
                  {customer.father_name || <span className="text-zinc-400 italic">Not provided</span>}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-xs sm:text-sm font-medium text-zinc-500">Mother Name</p>
                <p className="text-zinc-900 dark:text-zinc-100 font-medium text-sm break-words">
                  {customer.mother_name || <span className="text-zinc-400 italic">Not provided</span>}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-xs sm:text-sm font-medium text-zinc-500">Marital Status</p>
                <p className="text-zinc-900 dark:text-zinc-100 font-medium text-sm">
                  {customer.marital_status || <span className="text-zinc-400 italic">Not provided</span>}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-xs sm:text-sm font-medium text-zinc-500">Spouse / Husband Name</p>
                <p className="text-zinc-900 dark:text-zinc-100 font-medium text-sm break-words">
                  {customer.spouse_name || <span className="text-zinc-400 italic">Not provided</span>}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-6 shadow-sm">
            <h2 className="text-base sm:text-lg font-semibold text-zinc-900 dark:text-white mb-4 sm:mb-6 border-b border-zinc-100 dark:border-zinc-800 pb-2">Location & Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 sm:gap-y-6 gap-x-6 sm:gap-x-8">
              <div className="space-y-1 sm:col-span-2">
                <p className="text-xs sm:text-sm font-medium text-zinc-500 flex items-center">
                  <MapPin className="mr-2 h-4 w-4 shrink-0" /> Full Address
                </p>
                <p className="text-zinc-900 dark:text-zinc-100 font-medium text-sm leading-relaxed break-words">
                  {customer.address}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-xs sm:text-sm font-medium text-zinc-500 flex items-center">City / District</p>
                <p className="text-zinc-900 dark:text-zinc-100 font-medium text-sm">
                  {[customer.city, customer.district].filter(Boolean).join(", ") || <span className="text-zinc-400 italic">-</span>}
                </p>
              </div>
              
              <div className="space-y-1">
                <p className="text-xs sm:text-sm font-medium text-zinc-500 flex items-center">State / Country</p>
                <p className="text-zinc-900 dark:text-zinc-100 font-medium text-sm">
                  {[customer.state, customer.country].filter(Boolean).join(", ") || <span className="text-zinc-400 italic">-</span>}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-xs sm:text-sm font-medium text-zinc-500 flex items-center">Pincode</p>
                <p className="text-zinc-900 dark:text-zinc-100 font-medium text-sm font-mono">
                  {customer.pincode || <span className="text-zinc-400 italic">-</span>}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-xs sm:text-sm font-medium text-zinc-500 flex items-center">Date of Birth</p>
                <p className="text-zinc-900 dark:text-zinc-100 font-medium text-sm">
                  {customer.date_of_birth ? new Date(customer.date_of_birth).toLocaleDateString() : <span className="text-zinc-400 italic">-</span>}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-xs sm:text-sm font-medium text-zinc-500 flex items-center">Gender</p>
                <p className="text-zinc-900 dark:text-zinc-100 font-medium text-sm capitalize">
                  {customer.gender || <span className="text-zinc-400 italic">-</span>}
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-6 shadow-sm space-y-6">
             <DocumentUploadForm customerId={id} />
             
             <CustomerProfileTabs
               customerId={id}
               customerName={`${customer.first_name} ${customer.last_name}`}
               documents={activeDocuments}
               allDocuments={allDocuments}
               aiImports={aiImports}
               customerServices={customerServices || []}
             />
          </div>
        </div>
      </div>
    </div>
  );
}
