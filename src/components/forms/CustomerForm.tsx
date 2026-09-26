"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ArrowLeft } from "lucide-react";
import { Customer, CustomerFormData } from "@/types/customer";
import { getProfilePhotoSignedUrl } from "@/app/(dashboard)/customers/ai-actions";
import { createClient } from "@/lib/supabase/client";
import { v4 as uuidv4 } from "uuid";
import { createCustomer, updateCustomer, checkDuplicateCustomer } from "@/app/(dashboard)/customers/actions";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys, DASHBOARD_MEMORY_SCOPE } from "@/lib/queryKeys";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { AiSmartImportEngine, SmartImportMetadata } from "../AiSmartImportEngine";
import { IndiaPincodeProvider } from "@/lib/address/IndiaPincodeProvider";
import { useRef, useMemo } from "react";
import {
  FieldOrigins,
  initializeFieldOrigins,
  canLookupOverwriteField,
  resolveAutoFillPayload,
  checkLookupFreshness,
  VALID_FORM_FIELDS,
} from "./customerFormUpdatePolicy";

const customerSchema = z.object({
  customer_code: z.string().optional().or(z.literal("")),
  first_name: z.string().min(1, "First name is required"),
  middle_name: z.string().optional().or(z.literal("")),
  last_name: z.string().min(1, "Last name is required"),
  phone: z.string().min(1, "Phone number is required"),
  whatsapp: z.string().optional().or(z.literal("")),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  date_of_birth: z.string().optional().or(z.literal("")),
  gender: z.enum(["male", "female", "other", ""]).optional(),
  father_name: z.string().optional().or(z.literal("")),
  mother_name: z.string().optional().or(z.literal("")),
  marital_status: z.string().optional().or(z.literal("")),
  spouse_name: z.string().optional().or(z.literal("")),
  
  aadhaar_number: z.string().optional().or(z.literal("")),
  pan_number: z.string().optional().or(z.literal("")),
  gst_number: z.string().optional().or(z.literal("")),
  voter_id_number: z.string().optional().or(z.literal("")),
  
  address: z.string().min(1, "Address is required"),
  city: z.string().optional().or(z.literal("")),
  district: z.string().optional().or(z.literal("")),
  state: z.string().optional().or(z.literal("")),
  pincode: z.string().optional().or(z.literal("")),
  post_office: z.string().optional().or(z.literal("")),
  country: z.string().optional().or(z.literal("")),
  photo_url: z.string().optional(),
  photo_source: z.string().optional(),
  original_language_name: z.string().optional().or(z.literal("")),
  
  status: z.enum(["active", "inactive", "lead"]),
});

interface CustomerFormProps {
  initialData?: Customer;
}

export function CustomerForm({ initialData }: CustomerFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [aiDataApplied, setAiDataApplied] = useState(false);
  const [duplicateWarnings, setDuplicateWarnings] = useState<string[]>([]);
  const isEditing = !!initialData;

  // UX Workflow state: 'smart_import' | 'manual' | 'review'
  const [workflowMode, setWorkflowMode] = useState<'smart_import' | 'manual' | 'review'>(
    isEditing ? 'manual' : 'smart_import'
  );
  const [importMeta, setImportMeta] = useState<SmartImportMetadata | null>(null);

  const defaultValues = useMemo<CustomerFormData>(() => {
    return initialData ? {
      first_name: initialData.first_name,
      middle_name: initialData.middle_name || "",
      last_name: initialData.last_name,
      phone: initialData.phone,
      address: initialData.address,
      status: initialData.status,
      email: initialData.email || "",
      whatsapp: initialData.whatsapp || "",
      customer_code: initialData.customer_code || "",
      date_of_birth: initialData.date_of_birth ? initialData.date_of_birth.split('T')[0] : "",
      gender: initialData.gender || "",
      father_name: initialData.father_name || "",
      mother_name: initialData.mother_name || "",
      marital_status: initialData.marital_status || "",
      spouse_name: initialData.spouse_name || "",
      
      aadhaar_number: initialData.aadhaar_number || "",
      pan_number: initialData.pan_number || "",
      gst_number: initialData.gst_number || "",
      voter_id_number: initialData.voter_id_number || "",
      
      city: initialData.city || "",
      district: initialData.district || "",
      state: initialData.state || "",
      pincode: initialData.pincode || "",
      post_office: initialData.post_office || "",
      country: "India",
      photo_url: initialData.photo_url || undefined,
      photo_source: initialData.photo_source || undefined,
      original_language_name: initialData.original_language_name || "",
    } : {
      first_name: "",
      middle_name: "",
      last_name: "",
      phone: "",
      address: "",
      country: "India",
      status: "lead",
      gender: "",
      original_language_name: "",
    };
  }, [initialData]);

  const fieldOriginsRef = useRef<FieldOrigins | null>(null);
  if (!fieldOriginsRef.current) {
    fieldOriginsRef.current = initializeFieldOrigins(defaultValues as unknown as Record<string, unknown>, isEditing);
  }

  const { register, handleSubmit, setValue, watch, getValues, formState: { errors } } = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
    defaultValues,
  });

  const maritalStatus = watch("marital_status");
  const photoSource = watch("photo_source");
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

  const [isPincodeLoading, setIsPincodeLoading] = useState(false);
  const [pincodeError, setPincodeError] = useState<string | null>(null);
  const [isManualAddressEdit, setIsManualAddressEdit] = useState(false);
  const isManualAddressEditRef = useRef(false);

  const handleToggleManualAddress = () => {
    const nextMode = !isManualAddressEditRef.current;
    isManualAddressEditRef.current = nextMode;
    setIsManualAddressEdit(nextMode);
  };

  const [postOfficeOptions, setPostOfficeOptions] = useState<string[]>([]);
  const [localityOptions, setLocalityOptions] = useState<string[]>([]);
  const [pinRef, setPinRef] = useState<{ state: string; district: string } | null>(null);
  
  const lookupReqIdRef = useRef(0);

  const watchedPincode = watch("pincode");
  const watchedState = watch("state");
  const watchedDistrict = watch("district");
  const watchedPostOffice = watch("post_office");

  useEffect(() => {
    let isCancelled = false;
    const cleanPin = (watchedPincode || "").replace(/\D/g, "").trim();

    // 1. Invalidation and clearing: non-6-digit PIN cancels any in-flight lookup
    if (cleanPin.length !== 6) {
      lookupReqIdRef.current++;
      setIsPincodeLoading(false);
      setPincodeError(null);
      setPinRef(null);
      setPostOfficeOptions([]);
      setLocalityOptions([]);
      return;
    }

    // 2. Setup: advance request ID and start loading
    const currentReqId = ++lookupReqIdRef.current;
    setIsPincodeLoading(true);
    setPincodeError(null);

    IndiaPincodeProvider.lookup(cleanPin).then(res => {
      // 3. Freshness check at response application time
      if (isCancelled || !checkLookupFreshness(getValues("pincode"), cleanPin, currentReqId, lookupReqIdRef.current)) {
        return; // Stale, superseded, or cancelled
      }

      setIsPincodeLoading(false);

      if (res.success && res.data) {
        setPinRef({ state: res.data.state, district: res.data.district });

        const origins = fieldOriginsRef.current!;
        const isManual = isManualAddressEditRef.current;

        if (canLookupOverwriteField("state", res.data.state, origins.state, isManual)) {
          setValue("state", res.data.state, { shouldValidate: true, shouldDirty: true });
          origins.state = "lookup";
        }

        if (canLookupOverwriteField("district", res.data.district, origins.district, isManual)) {
          setValue("district", res.data.district, { shouldValidate: true, shouldDirty: true });
          origins.district = "lookup";
        }

        if (canLookupOverwriteField("country", "India", origins.country, isManual)) {
          setValue("country", "India", { shouldValidate: true, shouldDirty: true });
          origins.country = "lookup";
        }

        const poNames = res.data.postOffices.map(po => po.name);
        setPostOfficeOptions(poNames);
        if (poNames.length === 1 && canLookupOverwriteField("post_office", poNames[0], origins.post_office, isManual)) {
          setValue("post_office", poNames[0], { shouldValidate: true, shouldDirty: true });
          origins.post_office = "lookup";
        }

        setLocalityOptions(res.data.citiesOrLocalities);
      } else {
        setPincodeError("PIN code lookup unavailable. You can enter the address manually.");
        setPinRef(null);
        setPostOfficeOptions([]);
        setLocalityOptions([]);
      }
    }).catch(() => {
      if (isCancelled || !checkLookupFreshness(getValues("pincode"), cleanPin, currentReqId, lookupReqIdRef.current)) {
        return;
      }
      setIsPincodeLoading(false);
      setPincodeError("PIN code lookup unavailable. You can enter the address manually.");
      setPinRef(null);
      setPostOfficeOptions([]);
      setLocalityOptions([]);
    });

    // 5. Cleanup invalidation: cancels in-flight on unmount or re-render
    return () => {
      isCancelled = true;
    };
  }, [watchedPincode, setValue, getValues]);

  useEffect(() => {
    async function loadPhoto() {
      if (photoSource) {
        const url = await getProfilePhotoSignedUrl(photoSource);
        setPreviewPhotoUrl(url);
      } else {
        setPreviewPhotoUrl(null);
      }
    }
    loadPhoto();
  }, [photoSource]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Photo must be less than 5MB");
      return;
    }

    try {
      setUploadingPhoto(true);
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const fileName = `${user.id}/${uuidv4()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      
      const { error } = await supabase.storage
        .from('customer-profiles')
        .upload(fileName, file, {
          upsert: false
        });

      if (error) throw error;

      setValue("photo_source", fileName, { shouldValidate: true, shouldDirty: true });
      if (fieldOriginsRef.current) {
        fieldOriginsRef.current.photo_source = 'user';
      }
      toast.success("Profile photo uploaded");
    } catch (error: any) {
      toast.error("Failed to upload photo: " + error.message);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = () => {
    setValue("photo_source", "", { shouldValidate: true, shouldDirty: true });
    if (fieldOriginsRef.current) {
      fieldOriginsRef.current.photo_source = 'user';
    }
    setPreviewPhotoUrl(null);
  };

  const handleAutoFill = (data: Record<string, unknown>, meta?: SmartImportMetadata) => {
    const currentValues = getValues();
    const origins = fieldOriginsRef.current!;

    const {
      fieldsToUpdate,
      fieldOriginsToUpdate,
      skippedNotice,
    } = resolveAutoFillPayload(currentValues as unknown as Record<string, unknown>, data, origins);

    for (const [field, value] of Object.entries(fieldsToUpdate)) {
      setValue(field as keyof CustomerFormData, value as never, { shouldValidate: true, shouldDirty: true });
    }

    for (const [field, origin] of Object.entries(fieldOriginsToUpdate)) {
      origins[field] = origin;
    }

    // Set candidate photo storage path if provided
    if (meta?.candidatePhotoStoragePath && !getValues("photo_source")) {
      setValue("photo_source", meta.candidatePhotoStoragePath, { shouldValidate: true, shouldDirty: true });
      origins.photo_source = "import";
    }

    if (meta) {
      setImportMeta(meta);
    }

    if (skippedNotice) {
      toast.warning(skippedNotice);
    }

    setAiDataApplied(true);
    setWorkflowMode("review");
    toast.success("Details extracted — Please review and save customer.");
  };

  const onSubmit = async (data: CustomerFormData) => {
    setIsLoading(true);
    setDuplicateWarnings([]);

    try {
      const trimmedCustomerCode = data.customer_code?.trim() || "";

      // Task 9: Check for existing duplicates
      const dupCheck = await checkDuplicateCustomer({
        aadhaar_number: data.aadhaar_number,
        pan_number: data.pan_number,
        phone: data.phone,
        customer_code: trimmedCustomerCode || null,
        excludeId: initialData?.id
      });

      if (dupCheck.hasDuplicates) {
        setDuplicateWarnings(dupCheck.warnings);
        dupCheck.warnings.forEach(w => toast.warning(w));
      }

      // Clean up empty optional fields
      const cleanedData = {
        ...data,
        customer_code: trimmedCustomerCode || undefined,
        middle_name: data.middle_name === "" ? null : data.middle_name,
        gender: data.gender === "" ? null : data.gender,
        father_name: data.father_name === "" ? null : data.father_name,
        mother_name: data.mother_name === "" ? null : data.mother_name,
        marital_status: data.marital_status === "" ? null : data.marital_status,
        spouse_name: data.spouse_name === "" ? null : data.spouse_name,
        date_of_birth: data.date_of_birth === "" ? null : data.date_of_birth,
        aadhaar_number: data.aadhaar_number === "" ? null : data.aadhaar_number,
        pan_number: data.pan_number === "" ? null : data.pan_number,
        gst_number: data.gst_number === "" ? null : data.gst_number,
        voter_id_number: data.voter_id_number === "" ? null : data.voter_id_number,
        post_office: data.post_office === "" ? null : data.post_office,
        original_language_name: data.original_language_name === "" ? null : data.original_language_name,
        country: "India",
      } as any;

      if (isEditing && initialData) {
        const result = await updateCustomer(initialData.id, cleanedData);
        if (result.error) throw new Error(result.error);
        toast.success("Customer updated successfully");
      } else {
        const result = await createCustomer(cleanedData);
        if (result.error) throw new Error(result.error);
        toast.success("Customer added successfully");
      }
      await queryClient.invalidateQueries({
        queryKey: queryKeys.customers.lists(DASHBOARD_MEMORY_SCOPE),
      });
      router.push("/customers");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-150 space-y-6 pb-20 sm:pb-12">
      {/* Header and Step Context */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center">
          <button 
            type="button"
            onClick={() => {
              if (workflowMode === 'review') {
                setWorkflowMode('smart_import');
              } else {
                router.back();
              }
            }} 
            className="mr-3 p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
            title={workflowMode === 'review' ? "Back to Document Upload" : "Go back"}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              {isEditing
                ? "Edit Customer"
                : workflowMode === 'review'
                  ? "Check Customer Details"
                  : "Add New Customer"}
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
              {isEditing
                ? "Update customer details."
                : workflowMode === 'review'
                  ? "Review and correct the details, then save the customer."
                  : workflowMode === 'smart_import'
                    ? "Upload documents or enter customer details manually."
                    : "Fill in the customer's details."}
            </p>
          </div>
        </div>

        {/* Stage indicator — operator-readable */}
        {!isEditing && (
          <div className="flex items-center bg-zinc-100 dark:bg-zinc-800/80 p-1 rounded-xl self-start sm:self-auto border border-zinc-200/60 dark:border-zinc-700/60">
            <button
              type="button"
              onClick={() => setWorkflowMode('smart_import')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                workflowMode === 'smart_import'
                  ? 'bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <span>📄 Upload Documents</span>
            </button>
            <button
              type="button"
              onClick={() => setWorkflowMode('manual')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                workflowMode === 'manual'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              ✍️ Enter Manually
            </button>
            {workflowMode === 'review' && (
              <span className="px-3.5 py-1.5 text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 rounded-lg">
                ✓ Check Details
              </span>
            )}
          </div>
        )}
      </div>

      {/* Smart Import Upload Stage */}
      {!isEditing && workflowMode === 'smart_import' && (
        <AiSmartImportEngine 
          onAutoFill={handleAutoFill} 
          onSwitchToManual={() => setWorkflowMode('manual')}
          autoAdvance={true}
        />
      )}

      {/* Review Banner: Source Documents context & Change Documents action */}
      {workflowMode === 'review' && (
        <div className="bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-800/50 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-2xs animate-in fade-in slide-in-from-top-2">
          <div className="space-y-1.5">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Extracted from documents — Review and edit fields
              </p>
            </div>
            {importMeta?.sourceDocuments && importMeta.sourceDocuments.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium mr-1">Source documents:</span>
                {importMeta.sourceDocuments.map((doc, idx) => (
                  <span 
                    key={idx} 
                    className="inline-flex items-center text-[11px] font-medium bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-2.5 py-0.5 rounded-md border border-zinc-200 dark:border-zinc-700 shadow-2xs"
                  >
                    {doc.name} {doc.side !== 'Single' && `(${doc.side})`}
                  </span>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setWorkflowMode('smart_import')}
            className="text-xs font-semibold text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100 self-start sm:self-auto px-3.5 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-white dark:bg-zinc-800 hover:bg-blue-50/50 dark:hover:bg-zinc-700/50 transition-colors shadow-2xs"
          >
            Change Documents
          </button>
        </div>
      )}

      {/* Name suggestion banner if available & unapplied */}
      {importMeta?.nameSuggestion && !getValues("first_name") && (
        <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-xl p-3.5 flex items-center justify-between text-xs">
          <div className="text-indigo-900 dark:text-indigo-200">
            Suggested Name Components: <span className="font-semibold">{importMeta.nameSuggestion.first_name} {importMeta.nameSuggestion.last_name}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              if (importMeta.nameSuggestion) {
                setValue("first_name", importMeta.nameSuggestion.first_name, { shouldValidate: true, shouldDirty: true });
                setValue("middle_name", importMeta.nameSuggestion.middle_name, { shouldValidate: true, shouldDirty: true });
                setValue("last_name", importMeta.nameSuggestion.last_name, { shouldValidate: true, shouldDirty: true });
                toast.success("Suggested name parts applied.");
              }
            }}
            className="text-indigo-700 dark:text-indigo-300 font-bold hover:underline"
          >
            Apply Suggested Name
          </button>
        </div>
      )}

      {/* Task 7: AI Data Review Banner */}
      {aiDataApplied && workflowMode !== 'review' && (
        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center space-x-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">AI Data Applied</p>
              <p className="text-xs text-emerald-700 dark:text-emerald-300">Form fields have been populated from AI extraction. Please review before saving.</p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={() => setAiDataApplied(false)}
            className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Task 9: Duplicate Warnings Banner */}
      {duplicateWarnings.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4 space-y-2 shadow-sm animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center space-x-2 text-amber-800 dark:text-amber-200 font-semibold text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>Duplicate Warnings Found</span>
          </div>
          <ul className="list-disc list-inside text-xs text-amber-700 dark:text-amber-300 space-y-1">
            {duplicateWarnings.map((warning, idx) => (
              <li key={idx}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {/* The Canonical Form: Rendered when in 'manual' or 'review' or editing */}
      {(isEditing || workflowMode === 'manual' || workflowMode === 'review') && (

      <form
        onSubmit={handleSubmit(onSubmit)}
        onInput={(e) => {
          const target = e.target as unknown as { name?: string };
          if (target?.name && VALID_FORM_FIELDS.has(target.name) && fieldOriginsRef.current) {
            fieldOriginsRef.current[target.name] = 'user';
          }
        }}
        onChange={(e) => {
          const target = e.target as unknown as { name?: string };
          if (target?.name && VALID_FORM_FIELDS.has(target.name) && fieldOriginsRef.current) {
            fieldOriginsRef.current[target.name] = 'user';
          }
        }}
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-8 shadow-sm space-y-8 relative"
      >
        
        {/* Secondary path return to upload */}
        {!isEditing && workflowMode === 'manual' && (
          <div className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs">
            <span className="text-zinc-600 dark:text-zinc-400">
              Entering customer details manually. Have ID documents?
            </span>
            <button
              type="button"
              onClick={() => setWorkflowMode('smart_import')}
              className="font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              ← Upload documents instead
            </button>
          </div>
        )}

        {/* ── SECTION: Name & Basic Details ── */}
        <div>
          <div className="flex items-center justify-between mb-4 border-b border-zinc-100 dark:border-zinc-800 pb-2">
            <div>
              <h2 className="text-base font-semibold text-zinc-900 dark:text-white">Name &amp; Basic Details</h2>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">Photo, name parts, date of birth, and gender</p>
            </div>
          </div>

          <div className="mb-8 flex items-center space-x-6">
            <div className="relative h-24 w-24 rounded-full border-2 border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 overflow-hidden flex items-center justify-center shrink-0">
              {uploadingPhoto ? (
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              ) : previewPhotoUrl ? (
                <img src={previewPhotoUrl} alt="Profile" className="h-full w-full object-cover" />
              ) : (
                <span className="text-zinc-400 text-sm">No Photo</span>
              )}
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Profile Photo</label>
              <div className="flex space-x-3">
                <label className="cursor-pointer bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">
                  <span>{photoSource ? "Replace Photo" : "Upload Photo"}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={uploadingPhoto} />
                </label>
                {photoSource && (
                  <button type="button" onClick={handleRemovePhoto} className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">
                    Remove
                  </button>
                )}
              </div>
              <p className="text-xs text-zinc-500">Supported: JPG, PNG. Max 5MB.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Customer Code — full-width on its own row so names stand out */}
            <div className="space-y-2 md:col-span-3 md:max-w-xs">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Customer Code <span className="text-xs font-normal text-zinc-400">(optional)</span></label>
              <input {...register("customer_code")} className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow" placeholder="e.g. CUST-001" />
            </div>

            {/* Name trio — clearly grouped, equal columns on desktop */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">First Name <span className="text-red-500">*</span></label>
              <input {...register("first_name")} autoFocus={!isEditing} className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow" placeholder="e.g. Rahul" />
              {errors.first_name && <p className="text-sm text-red-500">{errors.first_name.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Middle Name <span className="text-xs font-normal text-zinc-400">(optional)</span></label>
              <input {...register("middle_name")} className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow" placeholder="e.g. Kumar" />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Last Name <span className="text-red-500">*</span></label>
              <input {...register("last_name")} className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow" placeholder="e.g. Sharma" />
              {errors.last_name && <p className="text-sm text-red-500">{errors.last_name.message}</p>}
            </div>

            {/* Native / Bengali name — full-width row, clearly labeled */}
            <div className="space-y-2 md:col-span-3">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Name in Native Language
                <span className="ml-1.5 text-[11px] font-normal text-zinc-400 dark:text-zinc-500">(বাংলা / हिंदी / অন্য ভাষায় নাম)</span>
              </label>
              <input
                {...register("original_language_name")}
                className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow"
                placeholder="e.g. রাহুল কুমার শর্মা"
                lang="bn"
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-xs text-zinc-400 dark:text-zinc-500">Optional — enter the customer&apos;s name as written in their local language or script.</p>
            </div>

            {/* Date of birth and gender — secondary row */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Date of Birth</label>
              <input {...register("date_of_birth")} type="date" className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Gender</label>
              <select {...register("gender")} className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow">
                <option value="">Select Gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Father / Guardian Name</label>
              <input {...register("father_name")} className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow" placeholder="e.g. Anil Sharma" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Mother Name</label>
              <input {...register("mother_name")} className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow" placeholder="e.g. Sunita Sharma" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Marital Status</label>
              <select {...register("marital_status")} className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow">
                <option value="">Select Status</option>
                <option value="Single">Single</option>
                <option value="Married">Married</option>
                <option value="Widowed">Widowed</option>
                <option value="Divorced">Divorced</option>
                <option value="Separated">Separated</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
            </div>

            {maritalStatus === "Married" && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Spouse / Husband Name</label>
                <input {...register("spouse_name")} className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow" placeholder="e.g. Suresh Kumar" />
              </div>
            )}
          </div>
        </div>

        {/* Identity & Tax Details (India) */}
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4 border-b border-zinc-100 dark:border-zinc-800 pb-2">Identity & Tax Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Aadhaar Number</label>
              <input {...register("aadhaar_number")} className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow" placeholder="e.g. 1234 5678 9012" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">PAN Number</label>
              <input {...register("pan_number")} className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow uppercase" placeholder="e.g. ABCDE1234F" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">GST Number</label>
              <input {...register("gst_number")} className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow uppercase" placeholder="e.g. 22AAAAA0000A1Z5" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Voter ID / EPIC Number</label>
              <input {...register("voter_id_number")} className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow uppercase" placeholder="e.g. ABC1234567" />
            </div>
          </div>
        </div>

        {/* Contact Details */}
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4 border-b border-zinc-100 dark:border-zinc-800 pb-2">Contact Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Phone Number <span className="text-red-500">*</span></label>
              <input {...register("phone")} type="tel" inputMode="tel" autoComplete="tel" className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow font-mono" placeholder="e.g. +91 98765 43210" />
              {errors.phone && <p className="text-sm text-red-500">{errors.phone.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">WhatsApp</label>
              <input {...register("whatsapp")} type="tel" inputMode="tel" className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow font-mono" placeholder="e.g. +91 98765 43210" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Email Address</label>
              <input {...register("email")} type="email" autoComplete="email" className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow" placeholder="e.g. rahul@example.com" />
              {errors.email && <p className="text-sm text-red-500">{errors.email.message}</p>}
            </div>
          </div>
        </div>

        {/* Address Details */}
        <div>
          <div className="flex items-center justify-between mb-4 border-b border-zinc-100 dark:border-zinc-800 pb-2">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Location Details</h2>
            {pinRef && (
              <button
                type="button"
                onClick={handleToggleManualAddress}
                className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                {isManualAddressEdit ? "Lock to PIN reference" : "Edit manually"}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2 md:col-span-3">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Full Address <span className="text-red-500">*</span></label>
              <textarea {...register("address")} rows={2} className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow" placeholder="House / Flat No., Road, Landmark, Village details" />
              {errors.address && <p className="text-sm text-red-500">{errors.address.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
                <span>Pincode</span>
                {isPincodeLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />}
              </label>
              <input {...register("pincode")} maxLength={6} inputMode="numeric" autoComplete="postal-code" className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow font-mono" placeholder="e.g. 700001" />
              {pincodeError && <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">{pincodeError}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">State</label>
              <input 
                {...register("state")} 
                readOnly={!isManualAddressEdit && !!pinRef} 
                className={`w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow ${!isManualAddressEdit && !!pinRef ? 'bg-zinc-100 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400 cursor-not-allowed' : ''}`} 
                placeholder="e.g. West Bengal" 
              />
              {isManualAddressEdit && pinRef && watchedState && watchedState.trim().toLowerCase() !== pinRef.state.trim().toLowerCase() && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Address differs from PIN code reference data.</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">District</label>
              <input 
                {...register("district")} 
                readOnly={!isManualAddressEdit && !!pinRef} 
                className={`w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow ${!isManualAddressEdit && !!pinRef ? 'bg-zinc-100 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400 cursor-not-allowed' : ''}`} 
                placeholder="e.g. Kolkata" 
              />
              {isManualAddressEdit && pinRef && watchedDistrict && watchedDistrict.trim().toLowerCase() !== pinRef.district.trim().toLowerCase() && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Address differs from PIN code reference data.</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Post Office</label>
              {postOfficeOptions.length > 0 ? (
                <select {...register("post_office")} className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow">
                  <option value="">Select Post Office</option>
                  {watchedPostOffice && !postOfficeOptions.includes(watchedPostOffice) && (
                    <option key={watchedPostOffice} value={watchedPostOffice}>
                      {watchedPostOffice} (Current)
                    </option>
                  )}
                  {postOfficeOptions.map(po => (
                    <option key={po} value={po}>{po}</option>
                  ))}
                </select>
              ) : (
                <input {...register("post_office")} className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow" placeholder="e.g. G.P.O." />
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">City / Locality</label>
              {localityOptions.length > 0 ? (
                <div>
                  <input {...register("city")} list="locality-list" className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow" placeholder="e.g. Kolkata" />
                  <datalist id="locality-list">
                    {localityOptions.map(loc => (
                      <option key={loc} value={loc} />
                    ))}
                  </datalist>
                </div>
              ) : (
                <input {...register("city")} className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow" placeholder="e.g. Kolkata" />
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Country</label>
              <input {...register("country")} readOnly className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-medium cursor-not-allowed" value="India" />
            </div>
          </div>
        </div>

        {/* System Details */}
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4 border-b border-zinc-100 dark:border-zinc-800 pb-2">System Status</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Customer Status</label>
              <select {...register("status")} className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow">
                <option value="lead">Lead</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              {errors.status && <p className="text-sm text-red-500">{errors.status.message}</p>}
            </div>
          </div>
        </div>

        <div className="pt-6 mt-6 flex justify-end space-x-3 border-t border-zinc-200 dark:border-zinc-800">
          <button type="button" onClick={() => router.back()} className="px-5 py-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={isLoading} className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center shadow-sm">
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? "Save Changes" : workflowMode === 'review' ? "Save Customer" : "Add Customer"}
          </button>
        </div>
      </form>
      )}

      {/* Mobile Sticky Save Action Bar for effortless one-tap save in review/manual modes */}
      {(isEditing || workflowMode === 'manual' || workflowMode === 'review') && (
        <div className="sm:hidden fixed bottom-0 left-0 right-0 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-t border-zinc-200 dark:border-zinc-800 z-30 shadow-lg flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              if (workflowMode === 'review') {
                setWorkflowMode('smart_import');
              } else {
                router.back();
              }
            }}
            className="px-4 py-2.5 border border-zinc-300 dark:border-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-300 rounded-lg bg-zinc-50 dark:bg-zinc-800 active:bg-zinc-100 transition-colors"
          >
            {workflowMode === 'review' ? "Documents" : "Back"}
          </button>
          <button
            type="button"
            onClick={handleSubmit(onSubmit)}
            disabled={isLoading}
            className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-xs flex items-center justify-center gap-2 transition-all"
          >
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEditing ? "Save Changes" : workflowMode === 'review' ? "Save Customer" : "Add Customer"}
          </button>
        </div>
      )}
    </div>
  );
}
