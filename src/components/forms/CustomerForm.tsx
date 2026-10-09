"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Languages } from "lucide-react";
import { Customer, CustomerFormData } from "@/types/customer";
import { getProfilePhotoSignedUrl } from "@/app/(dashboard)/customers/ai-actions";
import { createClient } from "@/lib/supabase/client";
import { v4 as uuidv4 } from "uuid";
import { createCustomer, updateCustomer, checkDuplicateCustomer } from "@/app/(dashboard)/customers/actions";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys, DASHBOARD_MEMORY_SCOPE } from "@/lib/queryKeys";
import { CheckCircle2, AlertTriangle, MapPin, AlertCircle, Search, X } from "lucide-react";
import { AiSmartImportEngine, SmartImportMetadata } from "../AiSmartImportEngine";
import { IndiaPincodeProvider } from "@/lib/address/IndiaPincodeProvider";
import { constructCustomerCanonicalName } from "@/lib/names/NativeNameSuggestionProvider";
import { lookupElectoralConstituency } from "@/lib/electoral/electoral-action";
import { ElectoralCandidate, ElectoralLookupStatus } from "@/lib/electoral/electoral-types";
import {
  searchWestBengalConstituencies,
  ConstituencySearchResult,
} from "@/lib/electoral/data/westBengalConstituencies";
import {
  FieldOrigins,
  initializeFieldOrigins,
  canLookupOverwriteField,
  canLookupOverwriteElectoralField,
  resolveAutoFillPayload,
  checkLookupFreshness,
  VALID_FORM_FIELDS,
  CANONICAL_EMPTY_CUSTOMER,
  createCanonicalEmptyCustomer,
  resolveAutoFillPayloadForNewIntake,
  DEFAULT_PHONE_PREFIX,
} from "./customerFormUpdatePolicy";

// ---------------------------------------------------------------------------
// CUSTOMER VALIDATION SCHEMA
// Field-level rules with operator-friendly error messages.
// Required fields: first_name, last_name, phone, address, status
// Optional fields are only validated when a value is actually provided.
// ---------------------------------------------------------------------------

/** Canonical phone rule: +<code>-<digits>  e.g. +91-9876543210 */
const PHONE_REGEX = /^\+[1-9]\d{0,3}-[0-9]{4,15}$/;

/** Canonical PAN rule: 5 letters, 4 digits, 1 letter — e.g. ABCDE1234F */
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

/** EPIC / Voter ID — allow 3-4 letters + 6-7 digits (modern format) or any non-empty trimmed value per existing app acceptance */
const EPIC_REGEX = /^[A-Z]{3,4}[0-9]{6,7}$/;

/** GST — 15-char Indian GST format */
const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

/** Today's ISO date string for DOB future-date check */
function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

const customerSchema = z.object({
  // ── Optional utility field ──────────────────────────────────────────────
  customer_code: z.string().optional().or(z.literal("")),

  // ── Required name fields ────────────────────────────────────────────────
  first_name: z
    .string()
    .transform(v => v.trim())
    .pipe(z.string().min(1, "First name is required")),

  middle_name: z.string().optional().or(z.literal("")),

  last_name: z
    .string()
    .transform(v => v.trim())
    .pipe(z.string().min(1, "Last name is required")),

  // ── Required contact ────────────────────────────────────────────────────
  phone: z
    .string()
    .transform(v => v.trim())
    .pipe(
      z
        .string()
        .min(1, "Phone number is required")
        .regex(PHONE_REGEX, "Use country code and number, e.g. +91-9876543210")
    ),

  // ── Optional contact ────────────────────────────────────────────────────
  whatsapp: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform(v => (v ? v.trim() : v))
    .refine(
      v => !v || v === "" || PHONE_REGEX.test(v),
      { message: "Use country code and number, e.g. +91-9876543210" }
    ),

  email: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine(
      v => !v || v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()),
      { message: "Enter a valid email address" }
    ),

  // ── Date of birth ────────────────────────────────────────────────────────
  date_of_birth: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine(
      v => {
        if (!v || v === "") return true;
        // Must be a valid calendar date and not in the future
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
        const d = new Date(v);
        if (isNaN(d.getTime())) return false;
        return v <= todayISO();
      },
      { message: "Date of birth must be a valid past date" }
    ),

  gender: z.enum(["male", "female", "other", ""]).optional(),

  // ── Optional relationship fields ─────────────────────────────────────────
  father_name: z.string().optional().or(z.literal("")),
  father_first_middle_name: z.string().optional().or(z.literal("")),
  father_surname: z.string().optional().or(z.literal("")),
  mother_name: z.string().optional().or(z.literal("")),
  mother_first_middle_name: z.string().optional().or(z.literal("")),
  mother_surname: z.string().optional().or(z.literal("")),
  marital_status: z.string().optional().or(z.literal("")),
  spouse_name: z.string().optional().or(z.literal("")),
  spouse_first_middle_name: z.string().optional().or(z.literal("")),
  spouse_surname: z.string().optional().or(z.literal("")),

  // ── Identity / Tax IDs (all optional; validated when non-empty) ──────────
  aadhaar_number: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine(
      v => {
        if (!v || v === "") return true;
        const digits = v.replace(/[\s-]/g, "");
        return /^[0-9]{12}$/.test(digits);
      },
      { message: "Aadhaar number must contain 12 digits" }
    ),

  pan_number: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform(v => (v ? v.trim().toUpperCase() : v))
    .refine(
      v => !v || v === "" || PAN_REGEX.test(v),
      { message: "Enter a valid PAN, e.g. ABCDE1234F" }
    ),

  gst_number: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform(v => (v ? v.trim().toUpperCase() : v))
    .refine(
      v => !v || v === "" || GST_REGEX.test(v),
      { message: "Enter a valid 15-character GST number, e.g. 22AAAAA0000A1Z5" }
    ),

  voter_id_number: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform(v => (v ? v.trim().toUpperCase() : v))
    .refine(
      v => !v || v === "" || EPIC_REGEX.test(v),
      { message: "Enter a valid Voter ID / EPIC number, e.g. ABC1234567" }
    ),

  // ── Required address ─────────────────────────────────────────────────────
  address: z
    .string()
    .transform(v => v.trim())
    .pipe(z.string().min(1, "Address is required")),

  city: z.string().optional().or(z.literal("")),
  district: z.string().optional().or(z.literal("")),
  state: z.string().optional().or(z.literal("")),

  // ── PIN code ─────────────────────────────────────────────────────────────
  pincode: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine(
      v => {
        if (!v || v === "") return true;
        const digits = v.replace(/\D/g, "");
        return digits.length === 6;
      },
      { message: "PIN code must contain 6 digits" }
    ),

  post_office: z.string().optional().or(z.literal("")),
  country: z.string().optional().or(z.literal("")),
  photo_url: z.string().optional(),
  photo_source: z.string().optional(),

  // ── Native language name — unrestricted (supports all scripts) ───────────
  original_language_name: z.string().optional().or(z.literal("")),

  // ── Electoral Details ────────────────────────────────────────────────────
  assembly_constituency: z.string().optional().or(z.literal("")).transform(v => (v ? v.trim() : "")),
  assembly_constituency_number: z.string().optional().or(z.literal("")).transform(v => (v ? v.trim() : "")),
  electoral_part_number: z.string().optional().or(z.literal("")).transform(v => (v ? v.trim() : "")),
  electoral_serial_number: z.string().optional().or(z.literal("")).transform(v => (v ? v.trim() : "")),
  parliamentary_constituency: z.string().optional().or(z.literal("")).transform(v => (v ? v.trim() : "")),
  parliamentary_constituency_number: z.string().optional().or(z.literal("")).transform(v => (v ? v.trim() : "")),
  electoral_verification_status: z.enum(["unverified", "customer_confirmed", "officially_verified"]).default("unverified"),
  electoral_verified_at: z.string().nullable().optional(),

  // ── System ───────────────────────────────────────────────────────────────
  status: z.enum(["active", "inactive", "lead"]),
});

interface CustomerFormProps {
  initialData?: Customer;
}

function parseDataUrlToBlob(dataUrl: string): { blob: Blob; ext: string } | null {
  try {
    const parts = dataUrl.split(',');
    if (parts.length < 2) return null;
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const bstr = atob(parts[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    return { blob: new Blob([u8arr], { type: mime }), ext };
  } catch (err) {
    console.error("[parseDataUrlToBlob] Error:", err);
    return null;
  }
}

export function CustomerForm({ initialData }: CustomerFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
  const [aiDataApplied, setAiDataApplied] = useState(false);
  const [duplicateWarnings, setDuplicateWarnings] = useState<string[]>([]);
  const [nativeNameDismissed, setNativeNameDismissed] = useState(false);
  const [bengaliSuggestions, setBengaliSuggestions] = useState<string[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(null);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const [isFetchingBengali, setIsFetchingBengali] = useState(false);
  const [bengaliFetchFailed, setBengaliFetchFailed] = useState(false);
  const isEditing = !!initialData;
  const sessionGenerationRef = useRef(1);
  const isChangeDocumentsRef = useRef(false);
  const [smartImportKey, setSmartImportKey] = useState(1);

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
      father_first_middle_name: initialData.father_first_middle_name || "",
      father_surname: initialData.father_surname || "",
      mother_name: initialData.mother_name || "",
      mother_first_middle_name: initialData.mother_first_middle_name || "",
      mother_surname: initialData.mother_surname || "",
      marital_status: initialData.marital_status || "",
      spouse_name: initialData.spouse_name || "",
      spouse_first_middle_name: initialData.spouse_first_middle_name || "",
      spouse_surname: initialData.spouse_surname || "",
      
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
      assembly_constituency: initialData.assembly_constituency || "",
      assembly_constituency_number: initialData.assembly_constituency_number || "",
      electoral_part_number: initialData.electoral_part_number || "",
      electoral_serial_number: initialData.electoral_serial_number || "",
      parliamentary_constituency: initialData.parliamentary_constituency || "",
      parliamentary_constituency_number: initialData.parliamentary_constituency_number || "",
      electoral_verification_status: initialData.electoral_verification_status || "unverified",
      electoral_verified_at: initialData.electoral_verified_at || null,
      photo_url: initialData.photo_url || undefined,
      photo_source: initialData.photo_source || undefined,
      original_language_name: initialData.original_language_name || "",
    } : createCanonicalEmptyCustomer();
  }, [initialData]);

  const fieldOriginsRef = useRef<FieldOrigins | null>(null);
  if (!fieldOriginsRef.current) {
    fieldOriginsRef.current = initializeFieldOrigins(defaultValues as unknown as Record<string, unknown>, isEditing);
  }

  const formRef = useRef<HTMLFormElement>(null);

  const { register, handleSubmit, setValue, watch, getValues, reset, formState: { errors, touchedFields } } = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
    defaultValues,
    mode: 'onBlur',       // validate on blur; re-validate on change once field is touched
    reValidateMode: 'onChange',
  });

  // ---------------------------------------------------------------------------
  // VALID FIELD TICK — shows a subtle green ✓ after the operator has interacted
  // with a field AND it currently passes validation. Format-only — NOT identity
  // verification. Tick disappears the moment the field becomes invalid.
  //
  // Props:
  //   show   – boolean: render the tick?
  //   inTextarea – position tick inside a textarea (offset from top)
  // ---------------------------------------------------------------------------
  const ValidFieldTick = ({ show, inTextarea = false }: { show: boolean; inTextarea?: boolean }) => {
    if (!show) return null;
    return (
      <span
        aria-hidden="true"
        title="Valid field"
        className={`pointer-events-none absolute right-2.5 ${
          inTextarea ? 'top-3' : 'top-1/2 -translate-y-1/2'
        } flex items-center text-emerald-500 dark:text-emerald-400`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
    );
  };

  /**
   * Called when handleSubmit finds validation errors.
   * Scrolls to + focuses the first invalid field and shows ONE toast.
   */
  const onInvalidSubmit = useCallback(() => {
    toast.error("Please check the highlighted fields.", { id: "validation-error" });
    // Defer to let the DOM reflect aria-invalid before querying
    setTimeout(() => {
      const form = formRef.current;
      if (!form) return;
      const firstInvalid = form.querySelector<HTMLElement>('[aria-invalid="true"]');
      if (firstInvalid) {
        firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
        firstInvalid.focus({ preventScroll: true });
      }
    }, 50);
  }, []);

  const resetCustomerIntakeSession = useCallback(() => {
    if (isEditing) return;

    // 1. Advance session generation to invalidate any in-flight async extractions/lookups
    sessionGenerationRef.current += 1;
    lookupReqIdRef.current += 1;

    // 2. Clear change-documents flag
    isChangeDocumentsRef.current = false;

    // 3. Reset React Hook Form to canonical empty defaults
    reset(createCanonicalEmptyCustomer(), {
      keepDefaultValues: false,
      keepValues: false,
      keepDirty: false,
      keepTouched: false,
      keepErrors: false,
      keepIsSubmitted: false,
      keepSubmitCount: false,
    });

    // 4. Reset field origins to clean unowned defaults
    fieldOriginsRef.current = initializeFieldOrigins(
      CANONICAL_EMPTY_CUSTOMER as unknown as Record<string, unknown>,
      false
    );

    // 5. Reset workflow mode to smart_import
    setWorkflowMode('smart_import');

    // 6. Reset import metadata & AI applied flags
    setImportMeta(null);
    setAiDataApplied(false);
    setDuplicateWarnings([]);

    // 7. Reset native name & Bengali suggestion state
    setNativeNameDismissed(false);
    setBengaliSuggestions([]);
    setSelectedSuggestion(null);
    setSuggestionsDismissed(false);
    setIsFetchingBengali(false);
    setBengaliFetchFailed(false);

    // 8. Reset photo state
    setPreviewPhotoUrl(null);
    setUploadingPhoto(false);

    // 9. Reset address & PIN lookup state
    setIsPincodeLoading(false);
    setPincodeError(null);
    setIsManualAddressEdit(false);
    isManualAddressEditRef.current = false;
    setPostOfficeOptions([]);
    setLocalityOptions([]);
    setPinRef(null);

    // 10. Reset electoral lookup state
    electoralReqIdRef.current += 1;
    lastLookedUpLocationKeyRef.current = "";
    setIsElectoralLoading(false);
    setElectoralStatus(null);
    setElectoralMessage(null);
    setElectoralCandidates([]);
    setSelectedCandidate(null);
    setElectoralConflict(null);
    setIsFinderOpen(false);
    setFinderMode('address');
    setManualSearchQuery('');
    setManualSearchResults([]);
    setManualVisibleCount(6);
    setHasAddressSearched(false);

    // 11. Re-mount SmartImportEngine completely fresh
    setSmartImportKey(prev => prev + 1);
  }, [isEditing, reset]);

  // Ensure browser back / bfcache restorations start from a fresh intake session
  useEffect(() => {
    if (isEditing) return;

    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        resetCustomerIntakeSession();
      }
    };

    window.addEventListener("pageshow", handlePageShow);
    return () => {
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [isEditing, resetCustomerIntakeSession]);

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

  // Electoral constituency lookup state (Finder V2)
  const [isElectoralLoading, setIsElectoralLoading] = useState(false);
  const [electoralStatus, setElectoralStatus] = useState<ElectoralLookupStatus | null>(null);
  const [electoralMessage, setElectoralMessage] = useState<string | null>(null);
  const [electoralCandidates, setElectoralCandidates] = useState<ElectoralCandidate[]>([]);
  const [, setSelectedCandidate] = useState<ElectoralCandidate | null>(null);
  const [electoralConflict, setElectoralConflict] = useState<{ imported: string; lookup: string; candidate: ElectoralCandidate } | null>(null);
  const electoralReqIdRef = useRef(0);
  const lastLookedUpLocationKeyRef = useRef<string>(
    initialData?.pincode ? `${initialData.pincode}|${initialData.state || ''}|${initialData.district || ''}|${initialData.post_office || ''}|${initialData.address || ''}` : ""
  );

  // Finder V2 Panel State
  const [isFinderOpen, setIsFinderOpen] = useState(false);
  const [finderMode, setFinderMode] = useState<'address' | 'manual'>('address');
  const [manualSearchQuery, setManualSearchQuery] = useState('');
  const [manualSearchResults, setManualSearchResults] = useState<ConstituencySearchResult[]>([]);
  const [manualVisibleCount, setManualVisibleCount] = useState(6);
  const [hasAddressSearched, setHasAddressSearched] = useState(false);

  const handleManualSearchChange = useCallback((query: string) => {
    setManualSearchQuery(query);
    setManualVisibleCount(6);
    if (!query.trim()) {
      setManualSearchResults([]);
      return;
    }
    const results = searchWestBengalConstituencies(query);
    setManualSearchResults(results);
  }, []);

  const triggerElectoralLookup = useCallback((forceManual = false) => {
    const rawPin = getValues("pincode") || "";
    const cleanPin = rawPin.replace(/\D/g, "").trim();
    const state = getValues("state") || "";
    const district = getValues("district") || "";
    const postOffice = getValues("post_office") || "";
    const address = getValues("address") || "";
    const country = getValues("country") || "India";

    // Automatic triggers require a valid 6-digit PIN
    if (!forceManual && cleanPin.length !== 6) {
      return;
    }

    const locationKey = `${cleanPin}|${state}|${district}|${postOffice}|${address}`;
    if (!forceManual && lastLookedUpLocationKeyRef.current === locationKey) {
      return;
    }
    lastLookedUpLocationKeyRef.current = locationKey;

    const currentReqId = ++electoralReqIdRef.current;
    const currentSession = sessionGenerationRef.current;

    setIsElectoralLoading(true);

    lookupElectoralConstituency({
      pincode: cleanPin,
      state,
      district,
      post_office: postOffice,
      address,
      country,
    }).then(res => {
      // Async race protection: discard if session changed or newer request started
      if (sessionGenerationRef.current !== currentSession || electoralReqIdRef.current !== currentReqId) {
        return;
      }

      setIsElectoralLoading(false);
      setElectoralStatus(res.status);

      if (res.status === 'unique' && res.candidates.length === 1) {
        const candidate = res.candidates[0];
        const origins = fieldOriginsRef.current!;

        // Smart Import conflict check
        const curAc = getValues("assembly_constituency") || "";
        const curAcOrigin = origins.assembly_constituency;

        if (curAcOrigin === 'import' && curAc.trim() && curAc.trim().toLowerCase() !== candidate.assembly_constituency.toLowerCase()) {
          setElectoralCandidates([]);
          setSelectedCandidate(candidate);
          setElectoralConflict({
            imported: curAc.trim(),
            lookup: candidate.assembly_constituency,
            candidate,
          });
          setElectoralMessage(`Document imported "${curAc.trim()}" — address lookup suggests "${candidate.assembly_constituency}"`);
          return;
        }

        setElectoralConflict(null);
        setElectoralCandidates([]);
        setSelectedCandidate(candidate);

        // Safe auto-fill respecting field origin protections
        if (canLookupOverwriteElectoralField("assembly_constituency", candidate.assembly_constituency, origins.assembly_constituency)) {
          setValue("assembly_constituency", candidate.assembly_constituency, { shouldValidate: true, shouldDirty: true });
          origins.assembly_constituency = "lookup";
        }

        if (canLookupOverwriteElectoralField("assembly_constituency_number", candidate.assembly_constituency_number, origins.assembly_constituency_number)) {
          setValue("assembly_constituency_number", candidate.assembly_constituency_number, { shouldValidate: true, shouldDirty: true });
          origins.assembly_constituency_number = "lookup";
        }

        setElectoralMessage("Constituency selected");
      } else if (res.status === 'multiple') {
        setElectoralCandidates(res.candidates);
        setSelectedCandidate(null);
        setElectoralConflict(null);
        setElectoralMessage("Possible constituencies found — confirm the correct one");
      } else if (res.status === 'not_found') {
        setElectoralCandidates([]);
        setSelectedCandidate(null);
        setElectoralConflict(null);
        setElectoralMessage("Address could not be narrowed safely. Search by constituency name or number.");
      } else if (res.status === 'insufficient_data') {
        setElectoralCandidates([]);
        setSelectedCandidate(null);
        setElectoralConflict(null);
        setElectoralMessage("Need more address details. Search by constituency name or number.");
      } else {
        setElectoralCandidates([]);
        setSelectedCandidate(null);
        setElectoralConflict(null);
        setElectoralMessage("Unable to check constituency");
      }
    }).catch(() => {
      if (sessionGenerationRef.current !== currentSession || electoralReqIdRef.current !== currentReqId) {
        return;
      }
      setIsElectoralLoading(false);
      setElectoralStatus('provider_error');
      setElectoralCandidates([]);
      setSelectedCandidate(null);
      setElectoralConflict(null);
      setElectoralMessage("Unable to check constituency");
    });
  }, [getValues, setValue]);

  const applyCandidateToForm = useCallback((candidate: ElectoralCandidate) => {
    const origins = fieldOriginsRef.current!;

    setValue("assembly_constituency", candidate.assembly_constituency, { shouldValidate: true, shouldDirty: true });
    origins.assembly_constituency = "lookup";

    setValue("assembly_constituency_number", candidate.assembly_constituency_number, { shouldValidate: true, shouldDirty: true });
    origins.assembly_constituency_number = "lookup";

    setSelectedCandidate(candidate);
    setElectoralCandidates([]);
    setElectoralConflict(null);
    setElectoralStatus('unique');
    setElectoralMessage("Constituency selected");
    setIsFinderOpen(false);
  }, [setValue]);

  const handleSelectElectoralCandidate = useCallback((candidate: ElectoralCandidate) => {
    const origins = fieldOriginsRef.current!;
    const curAc = (getValues("assembly_constituency") || "").trim();
    const curAcOrigin = origins.assembly_constituency;

    // Check for conflict with existing value (import, user-edited, or initial saved in edit mode)
    if (curAc && curAc.toLowerCase() !== candidate.assembly_constituency.toLowerCase()) {
      if (curAcOrigin === 'import') {
        setElectoralConflict({
          imported: curAc,
          lookup: candidate.assembly_constituency,
          candidate,
        });
        setElectoralMessage(`Document imported "${curAc}" — selected candidate is "${candidate.assembly_constituency}"`);
        return;
      }
      if (curAcOrigin === 'user') {
        setElectoralConflict({
          imported: curAc,
          lookup: candidate.assembly_constituency,
          candidate,
        });
        setElectoralMessage(`Manual value is "${curAc}" — selected candidate is "${candidate.assembly_constituency}"`);
        return;
      }
      if (curAcOrigin === 'initial') {
        setElectoralConflict({
          imported: curAc,
          lookup: candidate.assembly_constituency,
          candidate,
        });
        setElectoralMessage(`Saved record has "${curAc}" — selected candidate is "${candidate.assembly_constituency}"`);
        return;
      }
    }

    applyCandidateToForm(candidate);
  }, [getValues, applyCandidateToForm]);

  const handleManualFindConstituency = useCallback(() => {
    setIsFinderOpen(prev => !prev);
  }, []);

  const watchedPincode = watch("pincode");
  const watchedState = watch("state");
  const watchedDistrict = watch("district");
  const watchedPostOffice = watch("post_office");

  useEffect(() => {
    const cleanPin = (watchedPincode || "").replace(/\D/g, "").trim();
    if (cleanPin.length === 6 && watchedPostOffice) {
      triggerElectoralLookup(false);
    }
  }, [watchedPostOffice, watchedPincode, triggerElectoralLookup]);

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
      electoralReqIdRef.current++;
      setIsElectoralLoading(false);
      setElectoralStatus(null);
      setElectoralMessage(null);
      setElectoralCandidates([]);
      setSelectedCandidate(null);
      setElectoralConflict(null);
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
        triggerElectoralLookup(false);
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
  }, [watchedPincode, setValue, getValues, triggerElectoralLookup]);

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

    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    const cleanExt = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    const allowedExts = ['jpg', 'jpeg', 'png', 'webp'];

    if (!allowedMimes.includes(file.type) || !allowedExts.includes(cleanExt)) {
      toast.error("Please upload a valid image (JPG, PNG, or WEBP)");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Photo must be less than 5MB");
      return;
    }

    // PHASE 1: Existing Customer Edit Flow (Canonical customer_photos bucket)
    if (isEditing && initialData?.id) {
      try {
        setUploadingPhoto(true);
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        const storagePath = `customers/${initialData.id}/${uuidv4()}.${cleanExt}`;

        const { error } = await supabase.storage
          .from('customer_photos')
          .upload(storagePath, file, {
            upsert: false,
            contentType: file.type || 'image/jpeg',
          });

        if (error) throw error;

        setValue("photo_source", storagePath, { shouldValidate: true, shouldDirty: true });
        if (fieldOriginsRef.current) {
          fieldOriginsRef.current.photo_source = 'user';
        }

        const signedUrl = await getProfilePhotoSignedUrl(storagePath);
        setPreviewPhotoUrl(signedUrl);
        setPendingPhotoFile(null);
        toast.success("Profile photo uploaded");
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "An error occurred";
        toast.error("Failed to upload photo: " + msg);
      } finally {
        setUploadingPhoto(false);
      }
      return;
    }

    // PHASE 2: New Customer Intake Flow (Deferred upload after customer record is created)
    try {
      setPendingPhotoFile(file);
      const localUrl = URL.createObjectURL(file);
      setPreviewPhotoUrl(localUrl);
      setValue("photo_source", file.name, { shouldValidate: true, shouldDirty: true });
      if (fieldOriginsRef.current) {
        fieldOriginsRef.current.photo_source = 'user';
      }
      toast.success("Profile photo selected (will be saved when customer is created)");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to select photo";
      toast.error(msg);
    }
  };

  const handleRemovePhoto = () => {
    setValue("photo_source", "", { shouldValidate: true, shouldDirty: true });
    if (fieldOriginsRef.current) {
      fieldOriginsRef.current.photo_source = 'user';
    }
    setPendingPhotoFile(null);
    setPreviewPhotoUrl(null);
  };

  const fetchBengaliNameOptions = async (
    canonicalName: string,
    docCandidate?: string | null,
    sessionToken?: number
  ) => {
    const trimmed = canonicalName.trim();
    if (!trimmed) return;
    const reqSession = sessionToken ?? sessionGenerationRef.current;
    setIsFetchingBengali(true);
    setBengaliFetchFailed(false);
    try {
      const res = await fetch('/api/bengali-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: trimmed,
          doc_candidate: docCandidate || undefined,
        }),
      });
      const data = await res.json();
      if (reqSession !== sessionGenerationRef.current) return;
      const sugs = (data.suggestions || []) as string[];
      if (sugs.length > 0) {
        setBengaliSuggestions(sugs);
        setSelectedSuggestion(sugs[0]);
        setSuggestionsDismissed(false);
      } else {
        setBengaliSuggestions([]);
        setSelectedSuggestion(null);
        setBengaliFetchFailed(true);
      }
    } catch {
      if (reqSession !== sessionGenerationRef.current) return;
      setBengaliSuggestions([]);
      setSelectedSuggestion(null);
      setBengaliFetchFailed(true);
    } finally {
      if (reqSession === sessionGenerationRef.current) {
        setIsFetchingBengali(false);
      }
    }
  };

  const handleAutoFill = (
    data: Record<string, unknown>,
    meta?: SmartImportMetadata,
    sessionToken?: number
  ) => {
    // Stale async race check
    if (sessionToken !== undefined && sessionToken !== sessionGenerationRef.current) {
      return;
    }

    const isChangeDoc = isChangeDocumentsRef.current;
    isChangeDocumentsRef.current = false; // consume flag

    if (isChangeDoc) {
      // SAME-customer "Change Documents" flow:
      // Preserves reviewed/manual fields per customerFormUpdatePolicy
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

      if (meta?.candidatePhotoStoragePath && !getValues("photo_source")) {
        setValue("photo_source", meta.candidatePhotoStoragePath, { shouldValidate: true, shouldDirty: true });
        origins.photo_source = "import";
      }

      if (meta) {
        setImportMeta(meta);
        setNativeNameDismissed(false);
        setSuggestionsDismissed(false);
      }

      const canonicalCustomerName = constructCustomerCanonicalName({
        first_name: (fieldsToUpdate.first_name || currentValues.first_name) as string | undefined,
        middle_name: (fieldsToUpdate.middle_name || currentValues.middle_name) as string | undefined,
        last_name: (fieldsToUpdate.last_name || currentValues.last_name) as string | undefined,
        full_name: data.full_name as string | undefined,
      });

      if (canonicalCustomerName && !getValues("original_language_name")) {
        const docCandidate = meta?.nativeNameCandidate?.value || null;
        fetchBengaliNameOptions(canonicalCustomerName, docCandidate, sessionGenerationRef.current);
      }

      if (skippedNotice) {
        toast.warning(skippedNotice);
      }

      setAiDataApplied(true);
      setWorkflowMode("review");
      toast.success("Details extracted — Please review and save customer.");
    } else {
      // NEW CUSTOMER INTAKE FLOW:
      // Canonical reset before applying Customer B extracted values.
      // EMPTY CUSTOMER -> Customer B extraction -> Check Customer Details
      const {
        nextFormValues,
        fieldOriginsToUpdate,
        skippedNotice,
      } = resolveAutoFillPayloadForNewIntake(data);

      if (meta?.candidatePhotoStoragePath) {
        nextFormValues.photo_source = meta.candidatePhotoStoragePath;
        fieldOriginsToUpdate.photo_source = "import";
      }

      reset(nextFormValues, {
        keepDefaultValues: false,
        keepValues: false,
        keepDirty: false,
        keepTouched: false,
        keepErrors: false,
        keepIsSubmitted: false,
        keepSubmitCount: false,
      });

      fieldOriginsRef.current = {
        ...initializeFieldOrigins(CANONICAL_EMPTY_CUSTOMER as unknown as Record<string, unknown>, false),
        ...fieldOriginsToUpdate,
      };

      setPreviewPhotoUrl(null);
      setBengaliSuggestions([]);
      setSelectedSuggestion(null);
      setSuggestionsDismissed(false);
      setNativeNameDismissed(false);

      if (meta) {
        setImportMeta(meta);
      }

      const canonicalCustomerName = constructCustomerCanonicalName({
        first_name: nextFormValues.first_name,
        middle_name: nextFormValues.middle_name,
        last_name: nextFormValues.last_name,
        full_name: data.full_name as string | undefined,
      });

      if (canonicalCustomerName && !nextFormValues.original_language_name) {
        const docCandidate = meta?.nativeNameCandidate?.value || null;
        fetchBengaliNameOptions(canonicalCustomerName, docCandidate, sessionGenerationRef.current);
      }

      if (skippedNotice) {
        toast.warning(skippedNotice);
      }

      setAiDataApplied(true);
      setWorkflowMode("review");
      toast.success("Details extracted — Please review and save customer.");
    }
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
        const composeRelativeFullName = (
          firstMiddle?: string | null,
          surname?: string | null,
          fallbackLegacy?: string | null
        ): string | null => {
          const fm = (firstMiddle || '').trim();
          const sur = (surname || '').trim();
          if (fm || sur) {
            return [fm, sur].filter(Boolean).join(' ');
          }
          return fallbackLegacy && fallbackLegacy.trim() ? fallbackLegacy.trim() : null;
        };

        const cleanedData = {
          ...data,
          customer_code: trimmedCustomerCode || undefined,
          middle_name: data.middle_name === "" ? null : data.middle_name,
          gender: data.gender === "" ? null : data.gender,
          father_first_middle_name: data.father_first_middle_name?.trim() || null,
          father_surname: data.father_surname?.trim() || null,
          father_name: composeRelativeFullName(data.father_first_middle_name, data.father_surname, data.father_name),
          mother_first_middle_name: data.mother_first_middle_name?.trim() || null,
          mother_surname: data.mother_surname?.trim() || null,
          mother_name: composeRelativeFullName(data.mother_first_middle_name, data.mother_surname, data.mother_name),
          marital_status: data.marital_status === "" ? null : data.marital_status,
          spouse_first_middle_name: data.spouse_first_middle_name?.trim() || null,
          spouse_surname: data.spouse_surname?.trim() || null,
          spouse_name: composeRelativeFullName(data.spouse_first_middle_name, data.spouse_surname, data.spouse_name),
          date_of_birth: data.date_of_birth === "" ? null : data.date_of_birth,
        aadhaar_number: data.aadhaar_number === "" ? null : data.aadhaar_number,
        pan_number: data.pan_number === "" ? null : data.pan_number,
        gst_number: data.gst_number === "" ? null : data.gst_number,
        voter_id_number: data.voter_id_number === "" ? null : data.voter_id_number,
        assembly_constituency: data.assembly_constituency?.trim() || null,
        assembly_constituency_number: data.assembly_constituency_number?.trim() || null,
        electoral_part_number: data.electoral_part_number?.trim() || null,
        electoral_serial_number: data.electoral_serial_number?.trim() || null,
        parliamentary_constituency: data.parliamentary_constituency?.trim() || null,
        parliamentary_constituency_number: data.parliamentary_constituency_number?.trim() || null,
        electoral_verification_status: data.electoral_verification_status || "unverified",
        electoral_verified_at: data.electoral_verification_status === "unverified"
          ? null
          : (data.electoral_verified_at || (initialData?.electoral_verification_status === data.electoral_verification_status ? initialData?.electoral_verified_at : null) || new Date().toISOString()),
        post_office: data.post_office === "" ? null : data.post_office,
        original_language_name: data.original_language_name === "" ? null : data.original_language_name,
        country: "India",
      } as unknown as CustomerFormData;

      // Resolve pending photo from either manual file picker or Smart Import / Review crop
      const rawPhotoSource = data.photo_source || "";
      const isDataUrlPhoto = typeof rawPhotoSource === "string" && rawPhotoSource.startsWith("data:image/");
      let pendingUploadBlob: Blob | File | null = pendingPhotoFile;
      let pendingUploadExt = "jpg";

      if (pendingPhotoFile) {
        pendingUploadExt = (pendingPhotoFile.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      } else if (isDataUrlPhoto) {
        const parsed = parseDataUrlToBlob(rawPhotoSource);
        if (parsed) {
          pendingUploadBlob = parsed.blob;
          pendingUploadExt = parsed.ext;
        }
      }

      // Strip large data URL from customer table payload so we don't store 200KB base64 in database
      const basePayloadWithoutDataUrl: CustomerFormData = {
        ...cleanedData,
        photo_source: isDataUrlPhoto ? (initialData?.photo_source || undefined) : (cleanedData.photo_source || undefined),
      };

      if (isEditing && initialData) {
        // EXISTING CUSTOMER EDIT FLOW:
        let finalPhotoSource = basePayloadWithoutDataUrl.photo_source;

        // If there is a pending photo blob from Smart Import or picker to upload
        if (pendingUploadBlob && isDataUrlPhoto) {
          try {
            const storagePath = `customers/${initialData.id}/${uuidv4()}.${pendingUploadExt}`;
            const supabase = createClient();
            const { error: photoErr } = await supabase.storage
              .from('customer_photos')
              .upload(storagePath, pendingUploadBlob, {
                upsert: false,
                contentType: pendingUploadBlob.type || 'image/jpeg',
              });

            if (!photoErr) {
              finalPhotoSource = storagePath;
            } else {
              console.warn("[CustomerForm] Edit photo upload warning:", photoErr);
            }
          } catch (uploadErr) {
            console.warn("[CustomerForm] Edit photo upload error:", uploadErr);
          }
        }

        const result = await updateCustomer(initialData.id, {
          ...basePayloadWithoutDataUrl,
          photo_source: finalPhotoSource,
        });
        if (result.error) throw new Error(result.error);
        toast.success("Customer updated successfully");
      } else {
        // NEW CUSTOMER CREATE-FIRST FLOW:
        // Create the customer row first to satisfy tenant-scoped RLS on customer_photos
        const result = await createCustomer({
          ...basePayloadWithoutDataUrl,
          photo_source: undefined,
        });
        if (result.error) throw new Error(result.error);

        const newCustomerId = result.customer?.id;
        if (pendingUploadBlob && newCustomerId) {
          try {
            const storagePath = `customers/${newCustomerId}/${uuidv4()}.${pendingUploadExt}`;
            const supabase = createClient();
            const { error: photoErr } = await supabase.storage
              .from('customer_photos')
              .upload(storagePath, pendingUploadBlob, {
                upsert: false,
                contentType: pendingUploadBlob.type || 'image/jpeg',
              });

            if (!photoErr) {
              await updateCustomer(newCustomerId, {
                ...basePayloadWithoutDataUrl,
                photo_source: storagePath,
              });
            } else {
              console.warn("[CustomerForm] Post-create photo upload warning:", photoErr);
              toast.warning("Customer created, but photo upload encountered an issue. You can re-upload from the edit page.");
            }
          } catch (photoUploadErr) {
            console.warn("[CustomerForm] Post-create photo upload error:", photoUploadErr);
            toast.warning("Customer created, but photo upload encountered an issue. You can re-upload from the edit page.");
          }
        }

        toast.success("Customer added successfully");
        resetCustomerIntakeSession();
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
        <div className="flex items-center gap-3">
          <button 
            type="button"
            onClick={() => {
              if (workflowMode === 'review') {
                resetCustomerIntakeSession();
              } else {
                router.back();
              }
            }} 
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 shrink-0"
            title={workflowMode === 'review' ? "Start New Customer" : "Go back"}
            aria-label={workflowMode === 'review' ? "Start New Customer" : "Go back"}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              {isEditing
                ? "Edit Customer"
                : workflowMode === 'review'
                  ? "Check Customer Details"
                  : "Add New Customer"}
            </h1>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
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

        {/* Stage indicator — shown during review */}
        {!isEditing && workflowMode === 'review' && (
          <div className="flex items-center self-start sm:self-auto">
            <span className="px-3.5 py-1.5 text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 rounded-lg">
              ✓ Check Details
            </span>
          </div>
        )}
      </div>

      {/* Smart Import Upload Stage */}
      {!isEditing && workflowMode === 'smart_import' && (
        <AiSmartImportEngine 
          key={smartImportKey}
          sessionToken={sessionGenerationRef.current}
          onAutoFill={handleAutoFill} 
          onSwitchToManual={() => {
            resetCustomerIntakeSession();
            setWorkflowMode('manual');
          }}
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
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              id="change-documents-btn"
              onClick={() => {
                isChangeDocumentsRef.current = true;
                setWorkflowMode('smart_import');
              }}
              className="text-xs font-semibold text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100 px-3.5 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-white dark:bg-zinc-800 hover:bg-blue-50/50 dark:hover:bg-zinc-700/50 transition-colors shadow-2xs cursor-pointer"
            >
              Change Documents
            </button>
            <button
              type="button"
              id="start-new-customer-btn"
              onClick={resetCustomerIntakeSession}
              className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 px-3.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors shadow-2xs cursor-pointer"
            >
              New Customer
            </button>
          </div>
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
        ref={formRef}
        onSubmit={handleSubmit(onSubmit, onInvalidSubmit)}
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
        noValidate
      >
        
        {/* Secondary path return to upload */}
        {!isEditing && workflowMode === 'manual' && (
          <div className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs">
            <span className="text-zinc-600 dark:text-zinc-400">
              Entering customer details manually. Have ID documents?
            </span>
            <button
              type="button"
              onClick={() => {
                resetCustomerIntakeSession();
                setWorkflowMode('smart_import');
              }}
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
              <input
                {...register("customer_code")}
                className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow"
                placeholder="e.g. CUST-001"
              />
            </div>

            {/* Name trio — clearly grouped, equal columns on desktop */}
            <div className="space-y-2">
              <label htmlFor="first_name" className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">First Name <span className="text-red-500" aria-hidden="true">*</span></label>
              <div className="relative">
                <input
                  id="first_name"
                  {...register("first_name")}
                  autoFocus={!isEditing}
                  aria-invalid={!!errors.first_name}
                  aria-describedby={errors.first_name ? "first_name-error" : undefined}
                  className={`w-full p-2.5 pr-9 border rounded-lg bg-transparent focus:ring-2 transition-shadow ${
                    errors.first_name
                      ? 'border-red-400 dark:border-red-500 focus:ring-red-400'
                      : 'border-zinc-300 dark:border-zinc-700 focus:ring-blue-500'
                  }`}
                  placeholder="e.g. Rahul"
                />
                <ValidFieldTick show={!!touchedFields.first_name && !errors.first_name && !!getValues("first_name")?.trim()} />
              </div>
              {errors.first_name && <p id="first_name-error" className="text-sm text-red-500">{errors.first_name.message}</p>}
            </div>

            <div className="space-y-2">
              <label htmlFor="middle_name" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Middle Name <span className="text-xs font-normal text-zinc-400">(optional)</span></label>
              <div className="relative">
                <input
                  id="middle_name"
                  {...register("middle_name")}
                  className="w-full p-2.5 pr-9 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow"
                  placeholder="e.g. Kumar"
                />
                <ValidFieldTick show={!!touchedFields.middle_name && !errors.middle_name && !!getValues("middle_name")?.trim()} />
              </div>
            </div>
            
            <div className="space-y-2">
              <label htmlFor="last_name" className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Last Name <span className="text-red-500" aria-hidden="true">*</span></label>
              <div className="relative">
                <input
                  id="last_name"
                  {...register("last_name")}
                  aria-invalid={!!errors.last_name}
                  aria-describedby={errors.last_name ? "last_name-error" : undefined}
                  className={`w-full p-2.5 pr-9 border rounded-lg bg-transparent focus:ring-2 transition-shadow ${
                    errors.last_name
                      ? 'border-red-400 dark:border-red-500 focus:ring-red-400'
                      : 'border-zinc-300 dark:border-zinc-700 focus:ring-blue-500'
                  }`}
                  placeholder="e.g. Sharma"
                />
                <ValidFieldTick show={!!touchedFields.last_name && !errors.last_name && !!getValues("last_name")?.trim()} />
              </div>
              {errors.last_name && <p id="last_name-error" className="text-sm text-red-500">{errors.last_name.message}</p>}
            </div>

            {/* Native / Bengali name — full-width row, clearly labeled */}
            <div className="space-y-2 md:col-span-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Name in Native Language
                  <span className="ml-1.5 text-[11px] font-normal text-zinc-400 dark:text-zinc-500">(বাংলা / हिंदी / অন্য ভাষায় নাম)</span>
                </label>

                {!getValues("original_language_name") && (
                  <button
                    type="button"
                    id="suggest-bengali-name-btn"
                    onClick={() => {
                      const canonical = constructCustomerCanonicalName(getValues());
                      if (!canonical) {
                        toast.info("Please enter customer name (First & Last name) first.");
                        return;
                      }
                      fetchBengaliNameOptions(canonical);
                    }}
                    disabled={isFetchingBengali}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <Languages className="h-3.5 w-3.5" />
                    {isFetchingBengali ? "সাজেস্ট করা হচ্ছে..." : "বাংলা নাম সাজেস্ট করুন"}
                  </button>
                )}
              </div>

              <div className="relative">
                <input
                  {...register("original_language_name")}
                  className="w-full p-2.5 pr-9 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow"
                  placeholder="e.g. রাহুল কুমার শর্মা"
                  lang="bn"
                  autoComplete="off"
                  spellCheck={false}
                />
                <ValidFieldTick show={!!touchedFields.original_language_name && !errors.original_language_name && !!getValues("original_language_name")?.trim()} />
              </div>
              <p className="text-xs text-zinc-400 dark:text-zinc-500">Optional — enter the customer&apos;s name as written in their local language or script.</p>

              {/* Hybrid Bengali Suggestions Picker */}
              {!suggestionsDismissed && bengaliSuggestions.length > 0 && !getValues("original_language_name") && (
                <div className="mt-2 p-3.5 rounded-xl bg-violet-50/70 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 animate-in fade-in slide-in-from-top-1">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-violet-900 dark:text-violet-200 flex items-center gap-1.5">
                      <Languages className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                      বাংলা নাম বেছে নিন
                    </p>
                  </div>

                  <div className="space-y-1.5 mb-3">
                    {bengaliSuggestions.map((sug, idx) => (
                      <label
                        key={idx}
                        className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${
                          selectedSuggestion === sug
                            ? 'border-violet-500 bg-white dark:bg-zinc-800 shadow-2xs ring-1 ring-violet-500'
                            : 'border-zinc-200/80 dark:border-zinc-700/80 bg-white/60 dark:bg-zinc-900/60 hover:bg-white dark:hover:bg-zinc-800'
                        }`}
                      >
                        <input
                          type="radio"
                          name="native_bengali_selection"
                          checked={selectedSuggestion === sug}
                          onChange={() => setSelectedSuggestion(sug)}
                          className="text-violet-600 focus:ring-violet-500 shrink-0 h-4 w-4"
                        />
                        <span className="text-base font-semibold text-zinc-900 dark:text-zinc-100 font-mono">
                          {sug}
                        </span>
                      </label>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      id="use-selected-native-name"
                      disabled={!selectedSuggestion}
                      onClick={() => {
                        if (!selectedSuggestion) return;
                        setValue("original_language_name", selectedSuggestion, { shouldValidate: true, shouldDirty: true });
                        if (fieldOriginsRef.current) fieldOriginsRef.current.original_language_name = 'user';
                        setSuggestionsDismissed(true);
                      }}
                      className="px-3.5 py-2 rounded-lg text-xs font-bold bg-violet-600 text-white hover:bg-violet-700 transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
                    >
                      Use selected name
                    </button>
                    <button
                      type="button"
                      id="dismiss-native-name-suggestions"
                      onClick={() => setSuggestionsDismissed(true)}
                      className="px-3.5 py-2 rounded-lg text-xs font-medium bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                    >
                      নিজে লিখুন
                    </button>
                  </div>
                </div>
              )}

              {/* Gentle notice if suggestions unavailable */}
              {bengaliFetchFailed && !suggestionsDismissed && !getValues("original_language_name") && (
                <div className="mt-2 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700 flex items-center justify-between gap-3 text-xs text-zinc-600 dark:text-zinc-400">
                  <div>
                    <p className="font-medium text-zinc-800 dark:text-zinc-200">বাংলা নাম সাজেস্ট করা যায়নি</p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">আপনি চাইলে নামটি নিজে লিখতে পারেন।</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBengaliFetchFailed(false)}
                    className="px-2.5 py-1 text-[11px] rounded bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-600 cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {/* Native name suggestion card for document candidate (backward compatibility) */}
              {importMeta?.nativeNameCandidate && !nativeNameDismissed && !getValues("original_language_name") && bengaliSuggestions.length === 0 && !bengaliFetchFailed && (
                <div className="mt-2 flex items-start gap-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 animate-in fade-in slide-in-from-top-1">
                  <Languages className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-200 uppercase tracking-wide mb-0.5">
                      Native name found
                    </p>
                    <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100 font-mono break-all">
                      {importMeta.nativeNameCandidate.value}
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                    <button
                      type="button"
                      id="use-native-name-suggestion"
                      onClick={() => {
                        if (!importMeta.nativeNameCandidate) return;
                        setValue("original_language_name", importMeta.nativeNameCandidate.value, { shouldValidate: true, shouldDirty: true });
                        if (fieldOriginsRef.current) fieldOriginsRef.current.original_language_name = 'user';
                        setNativeNameDismissed(true);
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-sm whitespace-nowrap cursor-pointer"
                    >
                      Use this name
                    </button>
                    <button
                      type="button"
                      id="ignore-native-name-suggestion"
                      onClick={() => setNativeNameDismissed(true)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      Ignore
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Date of birth and gender — secondary row */}
            <div className="space-y-2">
              <label htmlFor="date_of_birth" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Date of Birth</label>
              {/* date input: browser picker occupies the right side; tick goes to left of it via ring color only */}
              <input
                id="date_of_birth"
                {...register("date_of_birth")}
                type="date"
                max={new Date().toISOString().split('T')[0]}
                aria-invalid={!!errors.date_of_birth}
                aria-describedby={errors.date_of_birth ? "date_of_birth-error" : undefined}
                className={`w-full p-2.5 border rounded-lg bg-transparent focus:ring-2 transition-shadow ${
                  errors.date_of_birth
                    ? 'border-red-400 dark:border-red-500 focus:ring-red-400'
                    : touchedFields.date_of_birth && !errors.date_of_birth && !!getValues("date_of_birth")
                      ? 'border-emerald-400 dark:border-emerald-500 focus:ring-emerald-400'
                      : 'border-zinc-300 dark:border-zinc-700 focus:ring-blue-500'
                }`}
              />
              {errors.date_of_birth && <p id="date_of_birth-error" className="text-sm text-red-500">{errors.date_of_birth.message}</p>}
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

            {/* Father Structured Name */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Father / Guardian Name</label>
              {initialData?.father_name && !initialData?.father_first_middle_name && !initialData?.father_surname && (
                <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded px-2.5 py-1 mb-1">
                  Legacy full name: <span className="font-semibold">{initialData.father_name}</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <input
                  {...register("father_first_middle_name")}
                  className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow text-sm"
                  placeholder="First + Middle (e.g. Anil Kumar)"
                />
                <input
                  {...register("father_surname")}
                  className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow text-sm"
                  placeholder="Surname (e.g. Sharma)"
                />
              </div>
              <input type="hidden" {...register("father_name")} />
            </div>

            {/* Mother Structured Name */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Mother Name</label>
              {initialData?.mother_name && !initialData?.mother_first_middle_name && !initialData?.mother_surname && (
                <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded px-2.5 py-1 mb-1">
                  Legacy full name: <span className="font-semibold">{initialData.mother_name}</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <input
                  {...register("mother_first_middle_name")}
                  className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow text-sm"
                  placeholder="First + Middle (e.g. Sunita)"
                />
                <input
                  {...register("mother_surname")}
                  className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow text-sm"
                  placeholder="Surname (e.g. Sharma)"
                />
              </div>
              <input type="hidden" {...register("mother_name")} />
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
                {initialData?.spouse_name && !initialData?.spouse_first_middle_name && !initialData?.spouse_surname && (
                  <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded px-2.5 py-1 mb-1">
                    Legacy full name: <span className="font-semibold">{initialData.spouse_name}</span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <input
                    {...register("spouse_first_middle_name")}
                    className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow text-sm"
                    placeholder="First + Middle (e.g. Suresh)"
                  />
                  <input
                    {...register("spouse_surname")}
                    className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent focus:ring-2 focus:ring-blue-500 transition-shadow text-sm"
                    placeholder="Surname (e.g. Kumar)"
                  />
                </div>
                <input type="hidden" {...register("spouse_name")} />
              </div>
            )}
          </div>
        </div>

        {/* Identity & Tax Details (India) */}
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4 border-b border-zinc-100 dark:border-zinc-800 pb-2">Identity & Tax Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="space-y-2">
              <label htmlFor="aadhaar_number" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Aadhaar Number</label>
              <div className="relative">
                <input
                  id="aadhaar_number"
                  {...register("aadhaar_number")}
                  inputMode="numeric"
                  aria-invalid={!!errors.aadhaar_number}
                  aria-describedby={errors.aadhaar_number ? "aadhaar-error" : undefined}
                  className={`w-full p-2.5 pr-9 border rounded-lg bg-transparent focus:ring-2 transition-shadow font-mono ${
                    errors.aadhaar_number
                      ? 'border-red-400 dark:border-red-500 focus:ring-red-400'
                      : 'border-zinc-300 dark:border-zinc-700 focus:ring-blue-500'
                  }`}
                  placeholder="e.g. 1234 5678 9012"
                />
                <ValidFieldTick show={!!touchedFields.aadhaar_number && !errors.aadhaar_number && !!getValues("aadhaar_number")?.trim()} />
              </div>
              {errors.aadhaar_number && <p id="aadhaar-error" className="text-sm text-red-500">{errors.aadhaar_number.message}</p>}
            </div>

            <div className="space-y-2">
              <label htmlFor="pan_number" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">PAN Number</label>
              <div className="relative">
                <input
                  id="pan_number"
                  {...register("pan_number")}
                  aria-invalid={!!errors.pan_number}
                  aria-describedby={errors.pan_number ? "pan-error" : undefined}
                  className={`w-full p-2.5 pr-9 border rounded-lg bg-transparent focus:ring-2 transition-shadow uppercase font-mono ${
                    errors.pan_number
                      ? 'border-red-400 dark:border-red-500 focus:ring-red-400'
                      : 'border-zinc-300 dark:border-zinc-700 focus:ring-blue-500'
                  }`}
                  placeholder="e.g. ABCDE1234F"
                />
                <ValidFieldTick show={!!touchedFields.pan_number && !errors.pan_number && !!getValues("pan_number")?.trim()} />
              </div>
              {errors.pan_number && <p id="pan-error" className="text-sm text-red-500">{errors.pan_number.message}</p>}
            </div>

            <div className="space-y-2">
              <label htmlFor="gst_number" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">GST Number</label>
              <div className="relative">
                <input
                  id="gst_number"
                  {...register("gst_number")}
                  aria-invalid={!!errors.gst_number}
                  aria-describedby={errors.gst_number ? "gst-error" : undefined}
                  className={`w-full p-2.5 pr-9 border rounded-lg bg-transparent focus:ring-2 transition-shadow uppercase font-mono ${
                    errors.gst_number
                      ? 'border-red-400 dark:border-red-500 focus:ring-red-400'
                      : 'border-zinc-300 dark:border-zinc-700 focus:ring-blue-500'
                  }`}
                  placeholder="e.g. 22AAAAA0000A1Z5"
                />
                <ValidFieldTick show={!!touchedFields.gst_number && !errors.gst_number && !!getValues("gst_number")?.trim()} />
              </div>
              {errors.gst_number && <p id="gst-error" className="text-sm text-red-500">{errors.gst_number.message}</p>}
            </div>

            <div className="space-y-2">
              <label htmlFor="voter_id_number" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Voter ID / EPIC Number</label>
              <div className="relative">
                <input
                  id="voter_id_number"
                  {...register("voter_id_number")}
                  aria-invalid={!!errors.voter_id_number}
                  aria-describedby={errors.voter_id_number ? "voter-error" : undefined}
                  className={`w-full p-2.5 pr-9 border rounded-lg bg-transparent focus:ring-2 transition-shadow uppercase font-mono ${
                    errors.voter_id_number
                      ? 'border-red-400 dark:border-red-500 focus:ring-red-400'
                      : 'border-zinc-300 dark:border-zinc-700 focus:ring-blue-500'
                  }`}
                  placeholder="e.g. ABC1234567"
                />
                <ValidFieldTick show={!!touchedFields.voter_id_number && !errors.voter_id_number && !!getValues("voter_id_number")?.trim()} />
              </div>
              {errors.voter_id_number && <p id="voter-error" className="text-sm text-red-500">{errors.voter_id_number.message}</p>}
            </div>
          </div>
        </div>

        {/* Contact Details */}
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4 border-b border-zinc-100 dark:border-zinc-800 pb-2">Contact Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label htmlFor="phone" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Phone Number <span className="text-red-500" aria-hidden="true">*</span></label>
              <div className="relative">
                <input
                  id="phone"
                  {...register("phone")}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  aria-invalid={!!errors.phone}
                  aria-describedby={errors.phone ? "phone-error" : undefined}
                  className={`w-full p-2.5 pr-9 border rounded-lg bg-transparent focus:ring-2 transition-shadow font-mono ${
                    errors.phone
                      ? 'border-red-400 dark:border-red-500 focus:ring-red-400'
                      : 'border-zinc-300 dark:border-zinc-700 focus:ring-blue-500'
                  }`}
                  placeholder="e.g. +91-9876543210"
                />
                <ValidFieldTick show={!!touchedFields.phone && !errors.phone && !!getValues("phone")?.trim() && getValues("phone")?.trim() !== DEFAULT_PHONE_PREFIX} />
              </div>
              {errors.phone && <p id="phone-error" className="text-sm text-red-500">{errors.phone.message}</p>}
            </div>

            <div className="space-y-2">
              <label htmlFor="whatsapp" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">WhatsApp</label>
              <div className="relative">
                <input
                  id="whatsapp"
                  {...register("whatsapp")}
                  type="tel"
                  inputMode="tel"
                  aria-invalid={!!errors.whatsapp}
                  aria-describedby={errors.whatsapp ? "whatsapp-error" : undefined}
                  className={`w-full p-2.5 pr-9 border rounded-lg bg-transparent focus:ring-2 transition-shadow font-mono ${
                    errors.whatsapp
                      ? 'border-red-400 dark:border-red-500 focus:ring-red-400'
                      : 'border-zinc-300 dark:border-zinc-700 focus:ring-blue-500'
                  }`}
                  placeholder="e.g. +91-9876543210"
                />
                <ValidFieldTick show={!!touchedFields.whatsapp && !errors.whatsapp && !!getValues("whatsapp")?.trim()} />
              </div>
              {errors.whatsapp && <p id="whatsapp-error" className="text-sm text-red-500">{errors.whatsapp.message}</p>}
            </div>

            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Email Address</label>
              <div className="relative">
                <input
                  id="email"
                  {...register("email")}
                  type="email"
                  autoComplete="email"
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? "email-error" : undefined}
                  className={`w-full p-2.5 pr-9 border rounded-lg bg-transparent focus:ring-2 transition-shadow ${
                    errors.email
                      ? 'border-red-400 dark:border-red-500 focus:ring-red-400'
                      : 'border-zinc-300 dark:border-zinc-700 focus:ring-blue-500'
                  }`}
                  placeholder="e.g. rahul@example.com"
                />
                <ValidFieldTick show={!!touchedFields.email && !errors.email && !!getValues("email")?.trim()} />
              </div>
              {errors.email && <p id="email-error" className="text-sm text-red-500">{errors.email.message}</p>}
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
              <label htmlFor="address" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Full Address <span className="text-red-500" aria-hidden="true">*</span></label>
              <div className="relative">
                <textarea
                  id="address"
                  {...register("address")}
                  rows={2}
                  aria-invalid={!!errors.address}
                  aria-describedby={errors.address ? "address-error" : undefined}
                  className={`w-full p-2.5 pr-9 border rounded-lg bg-transparent focus:ring-2 transition-shadow ${
                    errors.address
                      ? 'border-red-400 dark:border-red-500 focus:ring-red-400'
                      : 'border-zinc-300 dark:border-zinc-700 focus:ring-blue-500'
                  }`}
                  placeholder="House / Flat No., Road, Landmark, Village details"
                />
                <ValidFieldTick show={!!touchedFields.address && !errors.address && !!getValues("address")?.trim()} inTextarea />
              </div>
              {errors.address && <p id="address-error" className="text-sm text-red-500">{errors.address.message}</p>}
            </div>

            <div className="space-y-2">
              <label htmlFor="pincode" className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
                <span>Pincode</span>
                {isPincodeLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />}
              </label>
              <div className="relative">
                <input
                  id="pincode"
                  {...register("pincode")}
                  maxLength={6}
                  inputMode="numeric"
                  autoComplete="postal-code"
                  aria-invalid={!!errors.pincode}
                  aria-describedby={errors.pincode ? "pincode-error" : undefined}
                  className={`w-full p-2.5 pr-9 border rounded-lg bg-transparent focus:ring-2 transition-shadow font-mono ${
                    errors.pincode
                      ? 'border-red-400 dark:border-red-500 focus:ring-red-400'
                      : 'border-zinc-300 dark:border-zinc-700 focus:ring-blue-500'
                  }`}
                  placeholder="e.g. 700001"
                />
                <ValidFieldTick show={!!touchedFields.pincode && !errors.pincode && !!getValues("pincode")?.trim()} />
              </div>
              {errors.pincode && <p id="pincode-error" className="text-sm text-red-500">{errors.pincode.message}</p>}
              {!errors.pincode && pincodeError && <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">{pincodeError}</p>}
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

        {/* Electoral Details */}
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 border-b border-zinc-100 dark:border-zinc-800 pb-2 gap-2">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Electoral Details</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Assembly &amp; Parliamentary constituency records for voter services and verified form filling
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                id="find_constituency_btn"
                onClick={() => handleManualFindConstituency()}
                disabled={isElectoralLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-lg transition-colors border border-blue-200 dark:border-blue-800/60 disabled:opacity-50 cursor-pointer"
              >
                {isElectoralLoading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Checking...</span>
                  </>
                ) : (
                  <>
                    <MapPin className="h-3.5 w-3.5" />
                    <span>{isFinderOpen ? "Close Finder" : "Find Constituency"}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* FIND CONSTITUENCY V2 OPERATOR PANEL */}
          {isFinderOpen && (
            <div className="mb-6 p-4 rounded-xl border border-blue-200 dark:border-blue-800/60 bg-blue-50/40 dark:bg-blue-950/20 shadow-sm space-y-4">
              {/* Mode Selector Tabs & Close Button */}
              <div className="flex items-center justify-between border-b border-blue-100 dark:border-blue-900/50 pb-3">
                <div className="flex items-center gap-1.5 p-1 bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs">
                  <button
                    type="button"
                    id="finder_mode_address_btn"
                    onClick={() => setFinderMode('address')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                      finderMode === 'address'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                    }`}
                  >
                    <MapPin className="h-3.5 w-3.5" />
                    <span>Use Customer Address</span>
                  </button>
                  <button
                    type="button"
                    id="finder_mode_manual_btn"
                    onClick={() => setFinderMode('manual')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                      finderMode === 'manual'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                    }`}
                  >
                    <Search className="h-3.5 w-3.5" />
                    <span>Search Manually</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setIsFinderOpen(false)}
                  className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-white/60 dark:hover:bg-zinc-800/60 transition-colors cursor-pointer"
                  title="Close Finder"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* MODE A: USE CUSTOMER ADDRESS */}
              {finderMode === 'address' && (
                <div className="space-y-3">
                  <div className="bg-white dark:bg-zinc-800/80 rounded-lg p-3 border border-zinc-200 dark:border-zinc-700 text-xs space-y-2">
                    <div className="text-zinc-500 dark:text-zinc-400 font-medium">Customer Address Context:</div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <div>
                        <span className="text-zinc-400 block text-[11px]">PIN</span>
                        <span className="font-semibold text-zinc-800 dark:text-zinc-200">{watchedPincode || '—'}</span>
                      </div>
                      <div>
                        <span className="text-zinc-400 block text-[11px]">District</span>
                        <span className="font-medium text-zinc-800 dark:text-zinc-200">{watchedDistrict || '—'}</span>
                      </div>
                      <div>
                        <span className="text-zinc-400 block text-[11px]">Post Office</span>
                        <span className="font-medium text-zinc-800 dark:text-zinc-200">{watchedPostOffice || '—'}</span>
                      </div>
                      <div>
                        <span className="text-zinc-400 block text-[11px]">City / Locality</span>
                        <span className="font-medium text-zinc-800 dark:text-zinc-200">{watch("city") || '—'}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-zinc-400 block text-[11px]">Address</span>
                        <span className="font-medium text-zinc-800 dark:text-zinc-200 truncate block">{watch("address") || '—'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      id="find_possible_constituencies_btn"
                      onClick={() => {
                        setHasAddressSearched(true);
                        triggerElectoralLookup(true);
                      }}
                      disabled={isElectoralLoading}
                      className="inline-flex items-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                    >
                      {isElectoralLoading ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Checking Address Records...</span>
                        </>
                      ) : (
                        <>
                          <MapPin className="h-3.5 w-3.5" />
                          <span>Find Possible Constituencies</span>
                        </>
                      )}
                    </button>
                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Searches postal &amp; locality evidence without silent auto-fill
                    </span>
                  </div>

                  {/* Address-based Results */}
                  {hasAddressSearched && !isElectoralLoading && (
                    <div className="pt-2">
                      {electoralCandidates.length > 0 ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-xs font-medium text-amber-800 dark:text-amber-300">
                            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                            <span>Possible constituencies found — click Select to confirm:</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {electoralCandidates.map((cand) => (
                              <div
                                key={`addr-${cand.assembly_constituency_number}-${cand.assembly_constituency}`}
                                className="flex items-center justify-between p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:border-blue-400 dark:hover:border-blue-600 transition-colors shadow-sm"
                              >
                                <div className="space-y-0.5 pr-2">
                                  <div className="font-semibold text-xs text-zinc-900 dark:text-zinc-100">
                                    {cand.assembly_constituency_number} — {cand.assembly_constituency}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleSelectElectoralCandidate(cand)}
                                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold shadow-sm transition-colors cursor-pointer shrink-0"
                                >
                                  Select
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 bg-zinc-100/80 dark:bg-zinc-800/60 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
                            <AlertCircle className="h-4 w-4 shrink-0 text-zinc-400" />
                            <span>Address could not be narrowed safely. Search by constituency name or number.</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setFinderMode('manual')}
                            className="px-2.5 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 bg-white dark:bg-zinc-800 border border-blue-200 dark:border-blue-800/60 rounded hover:bg-blue-50 transition-colors cursor-pointer shrink-0"
                          >
                            Switch to Search Manually →
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* MODE B: SEARCH MANUALLY */}
              {finderMode === 'manual' && (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400 pointer-events-none" />
                    <input
                      id="manual_constituency_search_input"
                      type="text"
                      value={manualSearchQuery}
                      onChange={(e) => handleManualSearchChange(e.target.value)}
                      placeholder="Search constituency name or number (e.g. Basirhat Uttar, 125, Dum Dum)"
                      className="w-full pl-9 pr-9 py-2 text-xs border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:ring-2 focus:ring-blue-500 shadow-sm"
                    />
                    {manualSearchQuery && (
                      <button
                        type="button"
                        onClick={() => handleManualSearchChange('')}
                        className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-0.5 cursor-pointer"
                        title="Clear search"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Results Area */}
                  {manualSearchQuery.trim() === '' ? (
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 p-2.5 bg-white/60 dark:bg-zinc-800/40 rounded-lg border border-dashed border-zinc-200 dark:border-zinc-700">
                      Type an AC number (e.g. 125), AC name (e.g. Basirhat Uttar), or PC name/number to search the canonical West Bengal catalog.
                    </div>
                  ) : manualSearchResults.length > 0 ? (
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-zinc-600 dark:text-zinc-400 flex items-center justify-between">
                        <span>{manualSearchResults.length} candidate(s) found — click Select to confirm:</span>
                        <span className="text-[11px] text-zinc-400">Canonical catalog</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto pr-1">
                        {manualSearchResults.slice(0, manualVisibleCount).map((cand) => (
                          <div
                            key={`manual-${cand.assembly_constituency_number}-${cand.assembly_constituency}`}
                            className="flex items-center justify-between p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:border-blue-400 dark:hover:border-blue-600 transition-colors shadow-sm"
                          >
                            <div className="space-y-0.5 pr-2">
                              <div className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5 flex-wrap">
                                <span>{cand.assembly_constituency_number} — {cand.assembly_constituency}</span>
                                {cand.match_reason === 'exact_ac_number' && (
                                  <span className="px-1.5 py-0.2 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] rounded font-mono">
                                    Exact AC
                                  </span>
                                )}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleSelectElectoralCandidate(cand)}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold shadow-sm transition-colors cursor-pointer shrink-0"
                            >
                              Select
                            </button>
                          </div>
                        ))}
                      </div>

                      {manualSearchResults.length > manualVisibleCount && (
                        <button
                          type="button"
                          onClick={() => setManualVisibleCount(prev => prev + 6)}
                          className="w-full py-1.5 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 font-medium text-center border border-dashed border-blue-200 dark:border-blue-800/60 rounded-lg hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors cursor-pointer"
                        >
                          Show more results ({manualSearchResults.length - manualVisibleCount} remaining)
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="p-3 bg-zinc-100/80 dark:bg-zinc-800/60 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-600 dark:text-zinc-300 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0 text-zinc-400" />
                      <span>No constituencies found matching &ldquo;{manualSearchQuery}&rdquo;. Try searching by AC number (e.g. 125) or PC name.</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Status feedback & Candidate selector (when Finder is closed) */}
          {electoralStatus && !isFinderOpen && (
            <div className="mb-4">
              {electoralStatus === 'unique' && (
                <div className="flex items-center gap-2 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 p-2.5 rounded-lg">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  <span>{electoralMessage || "Constituency selected"}</span>
                </div>
              )}

              {electoralStatus === 'multiple' && electoralCandidates.length > 0 && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-lg space-y-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                    <span>Possible constituencies found — confirm the correct one:</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    {electoralCandidates.map((cand) => (
                      <button
                        key={`${cand.assembly_constituency_number}-${cand.assembly_constituency}`}
                        type="button"
                        onClick={() => handleSelectElectoralCandidate(cand)}
                        className="text-left p-2.5 rounded-lg border border-amber-200 dark:border-amber-800/60 bg-white dark:bg-zinc-800 hover:bg-amber-100/50 dark:hover:bg-amber-900/30 transition-all text-xs space-y-0.5 group focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                      >
                        <div className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center justify-between">
                          <span>{cand.assembly_constituency_number} — {cand.assembly_constituency}</span>
                          <span className="text-[10px] text-blue-600 dark:text-blue-400 opacity-0 group-hover:opacity-100 font-normal">Select →</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {electoralStatus === 'not_found' && (
                <div className="flex items-center justify-between gap-2 text-xs text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 p-2.5 rounded-lg">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 text-zinc-400" />
                    <span>Address could not be narrowed safely. Search by constituency name or number.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsFinderOpen(true);
                      setFinderMode('manual');
                    }}
                    className="text-blue-600 dark:text-blue-400 hover:underline font-medium shrink-0 cursor-pointer"
                  >
                    Search Manually →
                  </button>
                </div>
              )}

              {electoralStatus === 'insufficient_data' && (
                <div className="flex items-center justify-between gap-2 text-xs text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 p-2.5 rounded-lg">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 text-zinc-400" />
                    <span>Need more address details. Search by constituency name or number.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsFinderOpen(true);
                      setFinderMode('manual');
                    }}
                    className="text-blue-600 dark:text-blue-400 hover:underline font-medium shrink-0 cursor-pointer"
                  >
                    Search Manually →
                  </button>
                </div>
              )}

              {electoralStatus === 'provider_error' && (
                <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 p-2.5 rounded-lg">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                  <span>Unable to check constituency</span>
                </div>
              )}
            </div>
          )}

          {/* Import / Lookup conflict review banner */}
          {electoralConflict && (
            <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-lg space-y-2 text-xs">
              <div className="flex items-center gap-2 font-medium text-amber-900 dark:text-amber-200">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
                <span>Constituency conflict: Current value is &ldquo;{electoralConflict.imported}&rdquo;, selected candidate is &ldquo;{electoralConflict.lookup}&rdquo;.</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => applyCandidateToForm(electoralConflict.candidate)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                >
                  Use Selected ({electoralConflict.lookup})
                </button>
                <button
                  type="button"
                  onClick={() => setElectoralConflict(null)}
                  className="px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 rounded-md text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer font-medium"
                >
                  Keep Current ({electoralConflict.imported})
                </button>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2 md:col-span-2">
              <label htmlFor="assembly_constituency" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Assembly Constituency
              </label>
              <div className="relative">
                <input
                  id="assembly_constituency"
                  {...register("assembly_constituency")}
                  className="w-full p-2.5 pr-9 border rounded-lg bg-transparent focus:ring-2 transition-shadow border-zinc-300 dark:border-zinc-700 focus:ring-blue-500"
                  placeholder="e.g. Basirhat Uttar"
                />
                <ValidFieldTick show={!!touchedFields.assembly_constituency && !!getValues("assembly_constituency")?.trim()} />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="assembly_constituency_number" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                AC Number
              </label>
              <div className="relative">
                <input
                  id="assembly_constituency_number"
                  {...register("assembly_constituency_number")}
                  className="w-full p-2.5 pr-9 border rounded-lg bg-transparent focus:ring-2 transition-shadow font-mono border-zinc-300 dark:border-zinc-700 focus:ring-blue-500"
                  placeholder="e.g. 102"
                />
                <ValidFieldTick show={!!touchedFields.assembly_constituency_number && !!getValues("assembly_constituency_number")?.trim()} />
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <label htmlFor="electoral_part_number" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Part Number
              </label>
              <div className="relative">
                <input
                  id="electoral_part_number"
                  {...register("electoral_part_number")}
                  className="w-full p-2.5 pr-9 border rounded-lg bg-transparent focus:ring-2 transition-shadow font-mono border-zinc-300 dark:border-zinc-700 focus:ring-blue-500"
                  placeholder="e.g. 123"
                />
                <ValidFieldTick show={!!touchedFields.electoral_part_number && !!getValues("electoral_part_number")?.trim()} />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="electoral_serial_number" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Serial Number in Part
              </label>
              <div className="relative">
                <input
                  id="electoral_serial_number"
                  {...register("electoral_serial_number")}
                  className="w-full p-2.5 pr-9 border rounded-lg bg-transparent focus:ring-2 transition-shadow font-mono border-zinc-300 dark:border-zinc-700 focus:ring-blue-500"
                  placeholder="e.g. 456"
                />
                <ValidFieldTick show={!!touchedFields.electoral_serial_number && !!getValues("electoral_serial_number")?.trim()} />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="electoral_verification_status" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Verification Status
              </label>
              <select
                id="electoral_verification_status"
                {...register("electoral_verification_status", {
                  onChange: (e) => {
                    const newStatus = e.target.value;
                    if (newStatus === "unverified") {
                      setValue("electoral_verified_at", null, { shouldDirty: true });
                    } else if (newStatus === "customer_confirmed") {
                      if (!getValues("electoral_verified_at")) {
                        setValue("electoral_verified_at", new Date().toISOString(), { shouldDirty: true });
                      }
                    }
                  }
                })}
                className="w-full p-2.5 border rounded-lg bg-transparent focus:ring-2 transition-shadow border-zinc-300 dark:border-zinc-700 focus:ring-blue-500"
              >
                <option value="unverified" className="dark:bg-zinc-800">Unverified</option>
                <option value="customer_confirmed" className="dark:bg-zinc-800">Customer Confirmed</option>
                {initialData?.electoral_verification_status === "officially_verified" && (
                  <option value="officially_verified" className="dark:bg-zinc-800">Officially Verified</option>
                )}
              </select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Verified At
              </label>
              <div className="p-2.5 border rounded-lg bg-zinc-50 dark:bg-zinc-800/40 border-zinc-200 dark:border-zinc-800 text-xs sm:text-sm font-mono text-zinc-600 dark:text-zinc-400 flex items-center min-h-[42px]">
                {watch("electoral_verification_status") === "unverified" || !watch("electoral_verified_at")
                  ? "—"
                  : new Date(watch("electoral_verified_at")!).toLocaleString()}
              </div>
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
            onClick={handleSubmit(onSubmit, onInvalidSubmit)}
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
