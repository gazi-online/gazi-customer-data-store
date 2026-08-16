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
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { AiSmartImportEngine } from "../AiSmartImportEngine";

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
  
  address: z.string().min(1, "Address is required"),
  city: z.string().optional().or(z.literal("")),
  district: z.string().optional().or(z.literal("")),
  state: z.string().optional().or(z.literal("")),
  pincode: z.string().optional().or(z.literal("")),
  country: z.string().optional().or(z.literal("")),
  photo_url: z.string().optional(),
  photo_source: z.string().optional(),
  
  status: z.enum(["active", "inactive", "lead"]),
});

interface CustomerFormProps {
  initialData?: Customer;
}

export function CustomerForm({ initialData }: CustomerFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [aiDataApplied, setAiDataApplied] = useState(false);
  const [duplicateWarnings, setDuplicateWarnings] = useState<string[]>([]);
  const isEditing = !!initialData;

  const { register, handleSubmit, setValue, watch, getValues, formState: { errors } } = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
    defaultValues: initialData ? {
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
      
      city: initialData.city || "",
      district: initialData.district || "",
      state: initialData.state || "",
      pincode: initialData.pincode || "",
      country: initialData.country || "India",
      photo_url: initialData.photo_url || undefined,
      photo_source: initialData.photo_source || undefined,
    } : {
      first_name: "",
      middle_name: "",
      last_name: "",
      phone: "",
      address: "",
      country: "India",
      status: "lead",
      gender: "",
    },
  });

  const maritalStatus = watch("marital_status");
  const photoSource = watch("photo_source");
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

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
      toast.success("Profile photo uploaded");
    } catch (error: any) {
      toast.error("Failed to upload photo: " + error.message);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = () => {
    setValue("photo_source", "", { shouldValidate: true, shouldDirty: true });
    setPreviewPhotoUrl(null);
  };

  const handleAutoFill = (data: Record<string, any>) => {
    const currentValues = getValues();

    Object.keys(data).forEach(field => {
      // Do not overwrite manually uploaded profile photo unless current photo is empty
      if (field === 'photo_source' && currentValues.photo_source && currentValues.photo_source.length > 0) {
        return;
      }

      // Only populate non-empty approved AI fields
      if (data[field] !== undefined && data[field] !== null && data[field] !== "") {
        setValue(field as any, data[field], { shouldValidate: true, shouldDirty: true });
      }
    });

    setAiDataApplied(true);
    toast.success("AI extracted data applied to form. Please review before saving.");
  };

  const onSubmit = async (data: CustomerFormData) => {
    setIsLoading(true);
    setDuplicateWarnings([]);

    try {
      // Task 9: Check for existing duplicates
      const dupCheck = await checkDuplicateCustomer({
        aadhaar_number: data.aadhaar_number,
        pan_number: data.pan_number,
        phone: data.phone,
        customer_code: data.customer_code,
        excludeId: initialData?.id
      });

      if (dupCheck.hasDuplicates) {
        setDuplicateWarnings(dupCheck.warnings);
        dupCheck.warnings.forEach(w => toast.warning(w));
      }

      // Clean up empty optional fields
      const cleanedData = {
        ...data,
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
      router.push("/customers");
    } catch (error: any) {
      toast.error(error.message || "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700 space-y-8 pb-12">
      <div className="flex items-center">
        <button 
          onClick={() => router.back()} 
          className="mr-4 p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            {isEditing ? "Edit Customer" : "Add New Customer"}
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1">
            {isEditing ? "Update customer details." : "Use AI Import or fill in manually."}
          </p>
        </div>
      </div>

      {/* Advanced AI Smart Import Engine */}
      {!isEditing && <AiSmartImportEngine onAutoFill={handleAutoFill} />}

      {/* Task 7: AI Data Review Banner */}
      {aiDataApplied && (
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

      <form onSubmit={handleSubmit(onSubmit)} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-8 shadow-sm space-y-8 relative">
        
        {/* Personal Details */}
        <div>
          <div className="flex items-center justify-between mb-4 border-b border-zinc-100 dark:border-zinc-800 pb-2">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Personal Details</h2>
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
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Customer Code</label>
              <input {...register("customer_code")} className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow" placeholder="e.g. CUST-001" />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">First Name <span className="text-red-500">*</span></label>
              <input {...register("first_name")} className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow" placeholder="e.g. Rahul" />
              {errors.first_name && <p className="text-sm text-red-500">{errors.first_name.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Middle Name</label>
              <input {...register("middle_name")} className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow" placeholder="e.g. Kumar" />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Last Name <span className="text-red-500">*</span></label>
              <input {...register("last_name")} className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow" placeholder="e.g. Sharma" />
              {errors.last_name && <p className="text-sm text-red-500">{errors.last_name.message}</p>}
            </div>

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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
          </div>
        </div>

        {/* Contact Details */}
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4 border-b border-zinc-100 dark:border-zinc-800 pb-2">Contact Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Phone Number <span className="text-red-500">*</span></label>
              <input {...register("phone")} className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow" placeholder="e.g. +91 98765 43210" />
              {errors.phone && <p className="text-sm text-red-500">{errors.phone.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">WhatsApp</label>
              <input {...register("whatsapp")} className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow" placeholder="e.g. +91 98765 43210" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Email Address</label>
              <input {...register("email")} type="email" className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow" placeholder="e.g. rahul@example.com" />
              {errors.email && <p className="text-sm text-red-500">{errors.email.message}</p>}
            </div>
          </div>
        </div>

        {/* Address Details */}
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4 border-b border-zinc-100 dark:border-zinc-800 pb-2">Location Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2 md:col-span-3">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Full Address <span className="text-red-500">*</span></label>
              <textarea {...register("address")} rows={2} className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow" placeholder="Enter full address" />
              {errors.address && <p className="text-sm text-red-500">{errors.address.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">City</label>
              <input {...register("city")} className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow" placeholder="e.g. Mumbai" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">District</label>
              <input {...register("district")} className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow" placeholder="e.g. Mumbai Suburban" />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">State</label>
              <input {...register("state")} className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow" placeholder="e.g. Maharashtra" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Pincode</label>
              <input {...register("pincode")} className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow" placeholder="e.g. 400001" />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Country</label>
              <input {...register("country")} className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow" placeholder="e.g. India" />
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
            {isEditing ? "Save Changes" : "Add Customer"}
          </button>
        </div>
      </form>
    </div>
  );
}
