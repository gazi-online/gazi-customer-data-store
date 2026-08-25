import Link from "next/link";
import { getCustomerById } from "../actions";
import { getCustomerDocuments, getCustomerAiImports } from "@/app/(dashboard)/documents/actions";
import { notFound } from "next/navigation";
import { ArrowLeft, Edit, Calendar, Hash, ShieldCheck, Phone, MessageCircle, Mail, Users, MapPin } from "lucide-react";
import { DocumentUploadForm } from "@/components/forms/DocumentUploadForm";
import { getProfilePhotoSignedUrl } from "@/app/(dashboard)/customers/ai-actions";
import { CustomerProfileTabs } from "@/components/customers/CustomerProfileTabs";
import { getCustomerServices, getActiveServices } from "@/app/(dashboard)/services/actions";
import { getCustomerBillingSummary } from "@/app/(dashboard)/invoices/actions";
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
  let activeDocuments: CustomerDocument[] = [];
  let allDocuments: CustomerDocument[] = [];
  let aiImports: any[] = [];
  let customerServices: any[] = [];
  let availableServices: any[] = [];
  let displayPhotoUrl: string | null = null;

  try {
    customer = await getCustomerById(id);
    if (!customer || customer.deleted_at) {
      notFound();
    }
  } catch {
    notFound();
  }

  try {
    if (customer.photo_source) {
      displayPhotoUrl = await getProfilePhotoSignedUrl(customer.photo_source);
    } else if (customer.photo_url) {
      displayPhotoUrl = customer.photo_url;
    }
  } catch (err) {
    console.error("Failed to fetch customer photo:", err);
  }

  // Fetch Active Documents
  try {
    activeDocuments = await getCustomerDocuments(id, false);
  } catch (err: any) {
    console.error("Failed to fetch active documents:", err?.message || err);
  }

  // Fetch All Documents
  try {
    allDocuments = await getCustomerDocuments(id, true);
  } catch (err: any) {
    console.error("Failed to fetch all documents:", err?.message || err);
  }

  // Fetch AI Imports
  try {
    aiImports = await getCustomerAiImports(id);
  } catch (err: any) {
    console.error("Failed to fetch AI imports:", err?.message || err);
  }

  // Fetch Customer Services
  let csRes: any[] = [];
  try {
    csRes = await getCustomerServices(id);
  } catch (err: any) {
    console.error("Failed to fetch customer services:", err?.message || err);
  }
  customerServices = csRes;

  // Fetch Active Services
  let asRes: any[] = [];
  try {
    asRes = await getActiveServices();
    console.log(`[TRACE] getActiveServices() returned: ${asRes?.length || 0} rows`);
  } catch (err: any) {
    console.error(`[TRACE] getActiveServices() Error: ${err.code || 'UNKNOWN_CODE'} - ${err.message || err}`);
  }
  availableServices = asRes;

  // Fetch Customer Billing Summary safely
  let billingSummaryData: { totalBilled: number; totalPaid: number; outstanding: number; overdue: number; invoices: any[]; payments: any[] } = { totalBilled: 0, totalPaid: 0, outstanding: 0, overdue: 0, invoices: [], payments: [] };
  let billingError: string | null = null;
  try {
    const billingRes = await getCustomerBillingSummary(id);
    if (billingRes.success) {
      billingSummaryData = billingRes.data;
    } else {
      billingError = billingRes.error || "Failed to load customer billing history.";
    }
  } catch (err: any) {
    console.error("Error loading customer billing summary:", err);
    billingError = err.message || "Failed to load customer billing summary.";
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-center justify-between mb-6">
        <Link 
          href="/customers" 
          className="inline-flex items-center text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Customers
        </Link>
        <div className="flex items-center space-x-3">
          <Link 
            href={`/customers/${id}/edit`} 
            className="inline-flex items-center px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors shadow-sm"
          >
            <Edit className="mr-2 h-4 w-4" />
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Main Profile Card */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm flex flex-col items-center text-center relative overflow-hidden">
            {/* Background accent */}
            <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-b from-blue-50 to-white dark:from-blue-900/20 dark:to-zinc-900 z-0"></div>
            
            <div className="relative z-10">
              {displayPhotoUrl ? (
                <img src={displayPhotoUrl} alt="Profile" className="h-32 w-32 rounded-full object-cover border-4 border-white dark:border-zinc-800 shadow-sm" />
              ) : (
                <div className="h-32 w-32 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 text-4xl font-bold border-4 border-white dark:border-zinc-800 shadow-sm">
                  {customer.first_name[0]}{customer.last_name[0]}
                </div>
              )}
            </div>
            
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mt-4 relative z-10">
              {customer.first_name} {customer.middle_name ? `${customer.middle_name} ` : ""}{customer.last_name}
            </h1>
            
            {customer.customer_code && (
              <p className="text-zinc-500 dark:text-zinc-400 font-mono text-sm mt-1 flex items-center justify-center relative z-10">
                <Hash className="h-3 w-3 mr-1" />
                {customer.customer_code}
              </p>
            )}

            <div className="mt-4 relative z-10">
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                customer.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                customer.status === 'inactive' ? 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400' :
                'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
              }`}>
                {customer.status.charAt(0).toUpperCase() + customer.status.slice(1)}
              </span>
            </div>
            
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-6 flex items-center justify-center relative z-10">
              <Calendar className="mr-1.5 h-3.5 w-3.5" />
              Customer since {new Date(customer.created_at).toLocaleDateString()}
            </p>
          </div>

          {/* Identity Card (India) */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-white uppercase tracking-wider mb-4 flex items-center">
              <ShieldCheck className="mr-2 h-4 w-4 text-blue-600" />
              Identity (KYC)
            </h2>
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-zinc-500">Aadhaar Number</p>
                <p className="text-zinc-900 dark:text-zinc-100 font-medium font-mono">
                  {maskAadhaar(customer.aadhaar_number) || <span className="text-zinc-400 italic">Not provided</span>}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-zinc-500">PAN Number</p>
                <p className="text-zinc-900 dark:text-zinc-100 font-medium font-mono uppercase">
                  {maskPan(customer.pan_number) || <span className="text-zinc-400 italic">Not provided</span>}
                </p>
              </div>
              {customer.gst_number && (
                <div>
                  <p className="text-xs font-medium text-zinc-500">GST Number</p>
                  <p className="text-zinc-900 dark:text-zinc-100 font-medium font-mono uppercase">
                    {customer.gst_number}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Details */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-6 border-b border-zinc-100 dark:border-zinc-800 pb-2">Contact Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
              <div className="space-y-1">
                <p className="text-sm font-medium text-zinc-500 flex items-center">
                  <Phone className="mr-2 h-4 w-4" /> Phone
                </p>
                <p className="text-zinc-900 dark:text-zinc-100 font-medium">{customer.phone}</p>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium text-zinc-500 flex items-center">
                  <MessageCircle className="mr-2 h-4 w-4 text-green-500" /> WhatsApp
                </p>
                <p className="text-zinc-900 dark:text-zinc-100 font-medium">
                  {customer.whatsapp || <span className="text-zinc-400 italic">Not provided</span>}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium text-zinc-500 flex items-center">
                  <Mail className="mr-2 h-4 w-4" /> Email
                </p>
                <p className="text-zinc-900 dark:text-zinc-100 font-medium">
                  {customer.email || <span className="text-zinc-400 italic">Not provided</span>}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-6 border-b border-zinc-100 dark:border-zinc-800 pb-2 flex items-center">
              <Users className="mr-2 h-5 w-5 text-indigo-500" />
              Family / Guardianship
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
              <div className="space-y-1">
                <p className="text-sm font-medium text-zinc-500">Father / Guardian Name</p>
                <p className="text-zinc-900 dark:text-zinc-100 font-medium">
                  {customer.father_name || <span className="text-zinc-400 italic">Not provided</span>}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium text-zinc-500">Mother Name</p>
                <p className="text-zinc-900 dark:text-zinc-100 font-medium">
                  {customer.mother_name || <span className="text-zinc-400 italic">Not provided</span>}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium text-zinc-500">Marital Status</p>
                <p className="text-zinc-900 dark:text-zinc-100 font-medium">
                  {customer.marital_status || <span className="text-zinc-400 italic">Not provided</span>}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium text-zinc-500">Spouse / Husband Name</p>
                <p className="text-zinc-900 dark:text-zinc-100 font-medium">
                  {customer.spouse_name || <span className="text-zinc-400 italic">Not provided</span>}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-6 border-b border-zinc-100 dark:border-zinc-800 pb-2">Location & Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
              <div className="space-y-1 sm:col-span-2">
                <p className="text-sm font-medium text-zinc-500 flex items-center">
                  <MapPin className="mr-2 h-4 w-4" /> Full Address
                </p>
                <p className="text-zinc-900 dark:text-zinc-100 font-medium leading-relaxed">
                  {customer.address}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium text-zinc-500 flex items-center">City / District</p>
                <p className="text-zinc-900 dark:text-zinc-100 font-medium">
                  {[customer.city, customer.district].filter(Boolean).join(", ") || <span className="text-zinc-400 italic">-</span>}
                </p>
              </div>
              
              <div className="space-y-1">
                <p className="text-sm font-medium text-zinc-500 flex items-center">State / Country</p>
                <p className="text-zinc-900 dark:text-zinc-100 font-medium">
                  {[customer.state, customer.country].filter(Boolean).join(", ") || <span className="text-zinc-400 italic">-</span>}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium text-zinc-500 flex items-center">Pincode</p>
                <p className="text-zinc-900 dark:text-zinc-100 font-medium">
                  {customer.pincode || <span className="text-zinc-400 italic">-</span>}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium text-zinc-500 flex items-center">Date of Birth</p>
                <p className="text-zinc-900 dark:text-zinc-100 font-medium">
                  {customer.date_of_birth ? new Date(customer.date_of_birth).toLocaleDateString() : <span className="text-zinc-400 italic">-</span>}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium text-zinc-500 flex items-center">Gender</p>
                <p className="text-zinc-900 dark:text-zinc-100 font-medium capitalize">
                  {customer.gender || <span className="text-zinc-400 italic">-</span>}
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-6">
             <DocumentUploadForm customerId={id} />
             
             <CustomerProfileTabs
               customerId={id}
               customerName={`${customer.first_name} ${customer.last_name}`}
               documents={activeDocuments}
               allDocuments={allDocuments}
               aiImports={aiImports}
               customerServices={customerServices || []}
               availableServices={availableServices || []}
               billingSummary={billingSummaryData}
               billingError={billingError}
             />
          </div>
        </div>
      </div>
    </div>
  );
}
