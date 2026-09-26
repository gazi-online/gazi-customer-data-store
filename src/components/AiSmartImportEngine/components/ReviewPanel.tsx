import { MergedResult, NormalizedData, Conflict, ConflictField } from "../types";
import { AlertCircle, CheckCircle2, ChevronRight, Check, Loader2, UserCheck, Sparkles, Languages } from "lucide-react";
import { useState, useEffect, useMemo, useRef } from "react";
import { getProfilePhotoSignedUrl, cropAndUploadProfilePhoto } from "@/app/(dashboard)/customers/ai-actions";
import { IndiaPincodeProvider } from "@/lib/address/IndiaPincodeProvider";
import { PincodeLookupResult } from "@/lib/address/address-types";
import { toast } from "sonner";
import { suggestNameComponentsFromFullName } from "../nameUtils";
import { isBengaliScript } from "@/lib/names/BengaliNameTransliterator";
import { hasMeaningfulNativeScript } from "@/lib/names/nameSafety";
import { resolveRelationshipConflictPayload, resolveConflictTransition } from "../relationshipUtils";
import { getPhotoIdentityKey, resolvePhotoConfirmationPayload, resolveUsePhotoAction, resolveRejectPhotoAction } from "../photoUtils";

// Bengali suggestion fetched from Google Input Tools via /api/bengali-suggestions
interface GoogleBengaliSuggestion {
  value: string;
  source: 'google_input_tools';
}

export function ReviewPanel({ 
  result, 
  onConfirm 
}: { 
  result: MergedResult, 
  onConfirm: (finalData: Record<string, any>) => void 
}) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [usePhoto, setUsePhoto] = useState<boolean>(false);
  const [isCroppingPhoto, setIsCroppingPhoto] = useState<boolean>(false);
  const [croppedStoragePath, setCroppedStoragePath] = useState<string | null>(null);

  const currentPhotoIdentity = getPhotoIdentityKey(result);
  const photoIdentityRef = useRef<string>(currentPhotoIdentity);

  const photoSeqRef = useRef<number>(0);
  const activeCropSeqRef = useRef<number>(0);
  const activePreviewSeqRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);

  const [pinRefData, setPinRefData] = useState<PincodeLookupResult | null>(null);
  const [pinStatus, setPinStatus] = useState<'idle' | 'loading' | 'verified' | 'mismatch' | 'failed'>('idle');
  const [suggestionAccepted, setSuggestionAccepted] = useState<boolean>(false);
  // Bengali transliteration suggestion state (Google Input Tools — async)
  const [selectedBengaliIdx, setSelectedBengaliIdx] = useState<number | null>(null);
  const [bengaliSuggestionAccepted, setBengaliSuggestionAccepted] = useState<boolean>(false);
  const [bengaliSuggestionForName, setBengaliSuggestionForName] = useState<string | null>(null);
  const [bengaliSuggestions, setBengaliSuggestions] = useState<GoogleBengaliSuggestion[]>([]);
  const [bengaliSuggestionsLoading, setBengaliSuggestionsLoading] = useState<boolean>(false);
  const [bengaliSuggestionsUnavailable, setBengaliSuggestionsUnavailable] = useState<boolean>(false);
  // Monotone request counter — stale responses from old full_names are silently dropped
  const bengaliReqSeqRef = useRef<number>(0);

  const conflictFields = new Set(result.conflicts.map(c => c.field));
  const hasRelConflict = result.conflicts.some(c => (c.field as string) === 'relationship_interpretation');

  const [resolvedData, setResolvedData] = useState<Record<string, any>>(() => {
    const flat: Record<string, any> = {};
    Object.keys(result.data).forEach(key => {
      if (key !== 'profile_photo') {
        if (conflictFields.has(key as any)) {
          flat[key] = undefined;
        } else if (hasRelConflict && (key === 'father_name' || key === 'spouse_name')) {
          flat[key] = undefined;
        } else {
          flat[key] = (result.data as any)[key].value;
        }
      }
    });
    return flat;
  });

  const hasExplicitNameComponents = !!(result.data.first_name?.value && result.data.last_name?.value);
  const nameSuggestion = (!hasExplicitNameComponents && resolvedData.full_name)
    ? suggestNameComponentsFromFullName(resolvedData.full_name)
    : null;

  // Document-derived native name: original_language_name from the extraction result
  const docNativeName: string | undefined = result.data.original_language_name?.value;
  // A document native name is valid only if it contains meaningful native script
  const hasDocNativeName = !!(docNativeName && hasMeaningfulNativeScript(docNativeName));

  const currentFullName: string | undefined = resolvedData.full_name;

  const pincodeVal = resolvedData.pincode;

  useEffect(() => {
    let isCurrent = true;
    if (pincodeVal && String(pincodeVal).replace(/\D/g, '').length === 6) {
      setPinStatus('loading');
      IndiaPincodeProvider.lookup(String(pincodeVal)).then(res => {
        if (!isCurrent) return;
        if (res.success && res.data) {
          setPinRefData(res.data);
          const extState = (resolvedData.state || '').trim().toLowerCase();
          const extDist = (resolvedData.district || '').trim().toLowerCase();
          const refState = res.data.state.trim().toLowerCase();
          const refDist = res.data.district.trim().toLowerCase();

          const stateMismatch = extState && extState !== refState;
          const distMismatch = extDist && extDist !== refDist;

          if (stateMismatch || distMismatch) {
            setPinStatus('mismatch');
          } else {
            setPinStatus('verified');
          }
        } else {
          setPinStatus('failed');
        }
      });
    } else {
      setPinStatus('idle');
      setPinRefData(null);
    }
    return () => { isCurrent = false; };
  }, [pincodeVal, resolvedData.state, resolvedData.district]);

  // ── Bengali suggestion fetch (Google Input Tools) ──
  // Triggered whenever full_name changes. AbortController + sequence-ID guard
  // prevent stale responses from an old name overwriting the current UI state.
  useEffect(() => {
    // Reset all Bengali UI state when full_name changes
    setSelectedBengaliIdx(null);
    setBengaliSuggestionAccepted(false);
    setBengaliSuggestionForName(currentFullName ?? null);
    setBengaliSuggestions([]);
    setBengaliSuggestionsUnavailable(false);

    // If document already has a native name, or full_name is empty/Bengali → skip
    if (hasDocNativeName) return;
    const fn = currentFullName;
    if (!fn || isBengaliScript(fn)) return;

    const mySeq = ++bengaliReqSeqRef.current;
    const controller = new AbortController();

    fetch('/api/bengali-suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: fn }),
      signal: controller.signal,
    })
      .then(r => r.json())
      .then((data: { suggestions?: GoogleBengaliSuggestion[]; unavailable?: boolean; skipped?: boolean }) => {
        if (mySeq !== bengaliReqSeqRef.current) return; // stale — ignore
        setBengaliSuggestionsLoading(false);
        if (data.unavailable) {
          setBengaliSuggestionsUnavailable(true);
          return;
        }
        setBengaliSuggestions(data.suggestions ?? []);
      })
      .catch(err => {
        if (err?.name === 'AbortError') return; // component unmounted or full_name changed
        if (mySeq !== bengaliReqSeqRef.current) return;
        setBengaliSuggestionsLoading(false);
        setBengaliSuggestionsUnavailable(true);
      });

    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFullName, hasDocNativeName]);

const ALL_FIELDS: (keyof NormalizedData)[] = [
  'full_name',
  'original_language_name',
  'first_name',
  'middle_name',
  'last_name',
  'phone',
  'email',
  'father_name',
  'mother_name',
  'spouse_name',
  'marital_status',
  'aadhaar_number',
  'pan_number',
  'gst_number',
  'voter_id_number',
  'date_of_birth',
  'gender',
  'address',
  'city',
  'district',
  'state',
  'pincode',
  'post_office',
  'country'
];

  // Unmount tracker
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Synchronize and reset photo review state when review/photo identity changes
  useEffect(() => {
    photoIdentityRef.current = currentPhotoIdentity;
    const mySeq = ++photoSeqRef.current;
    activePreviewSeqRef.current = mySeq;

    const initialStoragePath = result.data.profile_photo?.storage_path || null;
    setCroppedStoragePath(null);
    setUsePhoto(false); // New review requires explicit approval via Use Photo
    setPhotoUrl(null);
    setIsCroppingPhoto(false);

    if (initialStoragePath) {
      getProfilePhotoSignedUrl(initialStoragePath).then(url => {
        if (!isMountedRef.current) return;
        if (photoIdentityRef.current !== currentPhotoIdentity) return;
        if (activePreviewSeqRef.current !== mySeq) return;
        setPhotoUrl(url);
      }).catch(() => {
        // Safe non-sensitive error notice without leaking backend/storage/customer metadata
      });
    }
  }, [currentPhotoIdentity, result.data.profile_photo?.storage_path]);

  const handleUsePhoto = async () => {
    const action = resolveUsePhotoAction(croppedStoragePath, result.data.profile_photo?.storage_path);

    if (action.type === 'reuse') {
      setUsePhoto(true);
      return;
    }

    if (!result.data.profile_photo?.bounding_box) {
      toast.error("No profile photo bounding box available.");
      return;
    }

    const jobWithFile = result.jobs?.find(j => j.frontFile);
    const originalFile = jobWithFile?.frontFile;

    if (!originalFile) {
      toast.error("Original document file is unavailable for cropping.");
      return;
    }

    const cropSeq = ++photoSeqRef.current;
    activeCropSeqRef.current = cropSeq;
    activePreviewSeqRef.current = cropSeq;
    const requestIdentity = currentPhotoIdentity;
    let toastId: string | number | undefined;

    try {
      setIsCroppingPhoto(true);
      toastId = toast.loading("Cropping profile photo from original document...");

      const formData = new FormData();
      formData.append("file", originalFile);
      formData.append("bounding_box", JSON.stringify(result.data.profile_photo.bounding_box));

      const res = await cropAndUploadProfilePhoto(formData);

      // Check if superseded, unmounted, or rejected while in-flight
      const isStillFresh = isMountedRef.current &&
        photoIdentityRef.current === requestIdentity &&
        activeCropSeqRef.current === cropSeq;

      if (!isStillFresh) {
        if (toastId !== undefined) {
          toast.dismiss(toastId);
        }
        return;
      }

      if (res.success && res.storagePath) {
        setCroppedStoragePath(res.storagePath);
        if (res.signedUrl) {
          setPhotoUrl(res.signedUrl);
        }
        setUsePhoto(true);
        toast.success("Profile photo cropped & prepared!", { id: toastId });
      } else {
        toast.error(res.error || "Failed to crop profile photo", { id: toastId });
      }
    } catch (err: any) {
      const isStillFresh = isMountedRef.current &&
        photoIdentityRef.current === requestIdentity &&
        activeCropSeqRef.current === cropSeq;

      if (!isStillFresh) {
        if (toastId !== undefined) {
          toast.dismiss(toastId);
        }
        return;
      }
      toast.error("Crop error: " + (err?.message || "Failed to crop"));
    } finally {
      if (isMountedRef.current && photoIdentityRef.current === requestIdentity && activeCropSeqRef.current === cropSeq) {
        setIsCroppingPhoto(false);
      }
    }
  };

  const handleRejectPhoto = () => {
    const { nextSeq, usePhoto: nextUsePhoto } = resolveRejectPhotoAction(photoSeqRef.current);
    photoSeqRef.current = nextSeq;
    activeCropSeqRef.current = nextSeq;
    activePreviewSeqRef.current = nextSeq;
    setUsePhoto(nextUsePhoto);
    setIsCroppingPhoto(false);
  };

  const handleApplyNameSuggestion = () => {
    if (!nameSuggestion) return;
    setResolvedData(prev => ({
      ...prev,
      first_name: nameSuggestion.first_name,
      middle_name: nameSuggestion.middle_name,
      last_name: nameSuggestion.last_name
    }));
    setSuggestionAccepted(true);
    toast.success("Suggested name components applied for Auto Fill.");
  };

  const handleResolveConflict = (field: ConflictField, value: any) => {
    setResolvedData(prev =>
      resolveConflictTransition(prev, field as string, value, result.conflicts, result.data)
    );
  };

  const handleConfirm = () => {
    // Task 5: Check if there are unresolved conflicts
    const unresolved = result.conflicts.filter(c => resolvedData[c.field] === undefined || resolvedData[c.field] === null || resolvedData[c.field] === "");
    if (unresolved.length > 0) {
      const fieldNames = unresolved.map(u => String(u.field).replace(/_/g, ' ')).join(', ');
      toast.error(`Please resolve conflict(s) for: ${fieldNames} before auto-filling.`);
      return;
    }

    const finalData = resolveRelationshipConflictPayload(
      resolvedData,
      result.conflicts,
      result.data
    );

    // --- Original language native name safety ---
    // Only allow original_language_name in finalData if:
    //   A) it came from the document (hasDocNativeName), OR
    //   B) user explicitly accepted a generated suggestion (bengaliSuggestionAccepted)
    //      AND that suggestion belongs to the current full_name (stale guard)
    if (!hasDocNativeName) {
      // Only pass original_language_name when the user explicitly accepted a suggestion
      // AND that suggestion is still valid for the current full_name (stale guard).
      const suggestionIsStillValid =
        bengaliSuggestionAccepted &&
        selectedBengaliIdx !== null &&
        bengaliSuggestions[selectedBengaliIdx] !== undefined &&
        bengaliSuggestionForName === currentFullName;

      if (suggestionIsStillValid) {
        // User-approved Google Input Tools suggestion
        finalData.original_language_name = bengaliSuggestions[selectedBengaliIdx!].value;
      } else {
        // Unaccepted suggestion — do NOT auto-populate.
        delete finalData.original_language_name;
      }
    }
    // If hasDocNativeName: resolvedData already contains the document value — pass through unchanged.

    // Photo approval and payload resolution (Finding 6)
    const confirmedPayload = resolvePhotoConfirmationPayload(
      finalData,
      usePhoto,
      croppedStoragePath,
      result.data.profile_photo?.storage_path
    );

    onConfirm(confirmedPayload);
  };

  return (
    <div className="mt-6 border border-indigo-200 dark:border-indigo-800/50 rounded-xl overflow-hidden bg-white dark:bg-zinc-900 shadow-lg">
      <div className="bg-indigo-600 px-6 py-4 flex items-center justify-between">
        <div>
          <h3 className="text-white font-semibold flex items-center">
            <CheckCircle2 className="h-5 w-5 mr-2" />
            AI Review & Merge
          </h3>
          <p className="text-indigo-100 text-xs mt-1">Review the extracted data and resolve any conflicts before auto-filling.</p>
        </div>
        <button 
          onClick={handleConfirm}
          className="bg-white text-indigo-700 hover:bg-indigo-50 px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors flex items-center"
        >
          Confirm & Auto Fill <ChevronRight className="ml-1 h-4 w-4" />
        </button>
      </div>

      <div className="p-6">

        {result.conflicts.length > 0 && (
          <div className="mb-6 space-y-4">
            <h4 className="text-sm font-bold text-amber-600 dark:text-amber-500 flex items-center uppercase tracking-wider border-b border-amber-100 dark:border-amber-900/30 pb-2">
              <AlertCircle className="h-4 w-4 mr-2" />
              Conflicts Detected ({result.conflicts.length})
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {result.conflicts.map((conflict, idx) => (
                <div key={idx} className="bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-lg p-4">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3 capitalize">{conflict.field.replace('_', ' ')}</p>
                  
                  <div className="space-y-2">
                    {conflict.options.map((opt, oIdx) => (
                      <label 
                        key={oIdx} 
                        className={`flex items-start p-3 border rounded-lg cursor-pointer transition-colors ${
                          resolvedData[conflict.field] === opt.value 
                            ? 'border-amber-500 bg-amber-100 dark:bg-amber-900/40 ring-1 ring-amber-500' 
                            : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                        }`}
                      >
                        <input 
                          type="radio" 
                          name={conflict.field} 
                          value={opt.value} 
                          checked={resolvedData[conflict.field] === opt.value}
                          onChange={() => handleResolveConflict(conflict.field, opt.value)}
                          className="mt-0.5 text-amber-600 focus:ring-amber-500"
                        />
                        <div className="ml-3 flex-1">
                          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{opt.value}</p>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-[10px] uppercase font-bold text-zinc-500">
                              {opt.documentType} {opt.source_side && opt.source_side !== 'unknown' ? `(${opt.source_side})` : ''}
                            </span>
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                              opt.confidence >= 0.8 ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
                            }`}>
                              {(opt.confidence * 100).toFixed(0)}% Match
                            </span>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {result.data.profile_photo && result.data.profile_photo.available && (
          <div className="mb-6 space-y-4">
            <h4 className="text-sm font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800 pb-2">
              Profile Photo Extracted
            </h4>
            <div className="flex items-center space-x-6 bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/50 rounded-lg p-4">
              <div className="h-24 w-24 rounded-full border-4 border-white dark:border-zinc-800 bg-zinc-200 overflow-hidden shadow-sm shrink-0 flex items-center justify-center">
                {photoUrl ? (
                  <img src={photoUrl} alt="Extracted profile" className="h-full w-full object-cover" />
                ) : isCroppingPhoto ? (
                  <Loader2 className="h-8 w-8 text-indigo-600 animate-spin" />
                ) : (
                  <div className="text-xs text-zinc-400 text-center px-2">Click "Use Photo" to crop</div>
                )}
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">AI detected portrait</p>
                  <p className="text-xs text-zinc-500">Source: {result.data.profile_photo.source_document || 'Uploaded Document'}</p>
                </div>
                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={handleUsePhoto}
                    disabled={isCroppingPhoto}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center ${
                      usePhoto 
                        ? 'bg-indigo-600 text-white shadow-sm' 
                        : 'bg-white text-zinc-700 border border-zinc-300 hover:bg-indigo-50 hover:text-indigo-700'
                    }`}
                  >
                    {isCroppingPhoto && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                    {usePhoto ? "✓ Photo Selected" : "Use Photo"}
                  </button>
                  <button
                    type="button"
                    onClick={handleRejectPhoto}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      !usePhoto && !isCroppingPhoto
                        ? 'bg-red-600 text-white shadow-sm' 
                        : 'bg-white text-zinc-700 border border-zinc-300 hover:bg-red-50 hover:text-red-600'
                    }`}
                  >
                    Reject
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div>
          {/* Auto Detected Documents Summary */}
          {result.data.detected_documents && result.data.detected_documents.length > 0 && (
            <div className="mb-6 space-y-3">
              <h4 className="text-sm font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800 pb-2 flex items-center justify-between">
                <span>Auto-Detected Documents</span>
                <span className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold">
                  {result.data.detected_documents.length} document(s) detected
                </span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {result.data.detected_documents.map((doc, idx) => {
                  const typeTitle = doc.detected_type
                    .replace(/_/g, ' ')
                    .replace(/\b\w/g, l => l.toUpperCase());
                  const isUnknown = doc.detected_type === 'unknown';

                  return (
                    <div 
                      key={idx} 
                      className={`p-3 rounded-lg border flex items-center justify-between ${
                        isUnknown 
                          ? 'border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20'
                          : 'border-indigo-100 bg-indigo-50/40 dark:border-indigo-900/40 dark:bg-indigo-950/20'
                      }`}
                    >
                      <div>
                        <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center">
                          {typeTitle}
                        </p>
                        {doc.source_filename && (
                          <p className="text-[10px] text-zinc-500 font-mono mt-0.5 truncate max-w-[150px]" title={doc.source_filename}>
                            {doc.source_filename}
                          </p>
                        )}
                        {isUnknown && (
                          <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 font-medium">
                            ⚠️ Document type could not be confidently identified.
                          </p>
                        )}
                      </div>
                      {!isUnknown && doc.confidence > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200 shrink-0">
                          {(doc.confidence * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Suggested Name Components Banner */}
          {nameSuggestion && (
            <div className="mb-6 p-4 rounded-xl bg-blue-50 border border-blue-200 dark:bg-blue-950/20 dark:border-blue-800">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Sparkles className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h5 className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                        Suggested Name Components
                      </h5>
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                        Suggested from Full Name — please verify
                      </span>
                    </div>
                    
                    <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                      Original Full Name: <strong className="font-mono text-zinc-900 dark:text-zinc-100">{resolvedData.full_name}</strong>
                    </p>

                    <div className="mt-3 grid grid-cols-3 gap-3 bg-white/80 dark:bg-zinc-900/60 p-3 rounded-lg border border-blue-100 dark:border-blue-900/40 text-xs">
                      <div>
                        <span className="text-zinc-500 block text-[10px] uppercase font-bold">First Name</span>
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">{nameSuggestion.first_name || '—'}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block text-[10px] uppercase font-bold">Middle Name</span>
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">{nameSuggestion.middle_name || '—'}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block text-[10px] uppercase font-bold">Last Name</span>
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">{nameSuggestion.last_name || '—'}</span>
                      </div>
                    </div>

                    {!nameSuggestion.isReliable && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2 font-medium">
                        ⚠️ Unable to reliably suggest separate name components.
                      </p>
                    )}
                  </div>
                </div>

                <div className="shrink-0 self-start sm:self-center">
                  <button
                    type="button"
                    onClick={handleApplyNameSuggestion}
                    disabled={suggestionAccepted}
                    className={`px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center shadow-sm ${
                      suggestionAccepted
                        ? 'bg-emerald-600 text-white cursor-default'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {suggestionAccepted ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Applied to Review
                      </>
                    ) : (
                      <>
                        <UserCheck className="h-3.5 w-3.5 mr-1.5" /> Use Suggested Name Components
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================
              BENGALI ORIGINAL-LANGUAGE NAME SECTION
              ============================================================ */}

          {/* Case A: Document already contains a valid native person name */}
          {hasDocNativeName && docNativeName && (
            <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800">
              <div className="flex items-start gap-3">
                <Languages className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h5 className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                      Original Language Name
                    </h5>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 uppercase tracking-wide">
                      From document
                    </span>
                  </div>
                  <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100 font-mono">
                    {docNativeName}
                  </p>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1">
                    Exact spelling preserved from source document. Will be used in Confirm &amp; Auto Fill.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Case B: Loading state — Google Input Tools in flight */}
          {!hasDocNativeName && bengaliSuggestionsLoading && (
            <div className="mb-6 p-4 rounded-xl bg-violet-50 border border-violet-200 dark:bg-violet-950/20 dark:border-violet-800">
              <div className="flex items-center gap-3 text-violet-700 dark:text-violet-300">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                <span className="text-sm">Generating Bengali suggestions…</span>
              </div>
            </div>
          )}

          {/* Case B-err: Google Input Tools unavailable */}
          {!hasDocNativeName && !bengaliSuggestionsLoading && bengaliSuggestionsUnavailable && (
            <div className="mb-6 p-4 rounded-xl bg-zinc-50 border border-zinc-200 dark:bg-zinc-800/50 dark:border-zinc-700">
              <div className="flex items-center gap-3 text-zinc-500 dark:text-zinc-400">
                <Languages className="h-4 w-4 shrink-0" />
                <span className="text-xs">Bengali name suggestions are temporarily unavailable.</span>
              </div>
            </div>
          )}

          {/* Case B: Suggestions loaded — user must explicitly accept */}
          {!hasDocNativeName && !bengaliSuggestionsLoading && bengaliSuggestions.length > 0 && (
            <div className="mb-6 p-4 rounded-xl bg-violet-50 border border-violet-200 dark:bg-violet-950/20 dark:border-violet-800">
              <div className="flex items-start gap-3">
                <Languages className="h-5 w-5 text-violet-600 dark:text-violet-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h5 className="text-sm font-semibold text-violet-900 dark:text-violet-200">
                      Original Language Name
                    </h5>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900 text-violet-800 dark:text-violet-200 uppercase tracking-wide">
                      Not found in Bengali in document
                    </span>
                  </div>

                  <p className="text-xs text-violet-700 dark:text-violet-300 mb-1">
                    Suggested Bengali spellings for{' '}
                    <strong className="font-mono text-zinc-900 dark:text-zinc-100">{resolvedData.full_name}</strong>
                    {' '}— select one and click <em>Use Selected Bengali Name</em> to accept.
                  </p>
                  <p className="text-[10px] text-violet-500 dark:text-violet-400 mb-3">
                    Suggested by Google Input Tools
                  </p>

                  <div className="space-y-2 mb-3">
                    {bengaliSuggestions.map((sug, idx) => (
                      <label
                        key={idx}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          selectedBengaliIdx === idx && !bengaliSuggestionAccepted
                            ? 'border-violet-500 bg-violet-100 dark:bg-violet-900/40 ring-1 ring-violet-500'
                            : bengaliSuggestionAccepted && selectedBengaliIdx === idx
                            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 ring-1 ring-emerald-500'
                            : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-violet-50 dark:hover:bg-violet-900/20'
                        }`}
                      >
                        <input
                          type="radio"
                          name="bengali_name_suggestion"
                          disabled={bengaliSuggestionAccepted}
                          checked={selectedBengaliIdx === idx}
                          onChange={() => {
                            setSelectedBengaliIdx(idx);
                            setBengaliSuggestionAccepted(false);
                          }}
                          className="text-violet-600 focus:ring-violet-500 shrink-0"
                        />
                        <div className="flex-1">
                          <span className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{sug.value}</span>
                          <span className="ml-2 text-[10px] uppercase font-medium text-violet-400 dark:text-violet-500">
                            Google Input Tools
                          </span>
                        </div>
                        {bengaliSuggestionAccepted && selectedBengaliIdx === idx && (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                        )}
                      </label>
                    ))}
                  </div>

                  {!bengaliSuggestionAccepted ? (
                    <button
                      type="button"
                      id="use-selected-bengali-name"
                      disabled={selectedBengaliIdx === null}
                      onClick={() => {
                        if (selectedBengaliIdx === null) return;
                        setBengaliSuggestionAccepted(true);
                        setBengaliSuggestionForName(currentFullName ?? null);
                        toast.success('Bengali name accepted — will be used in Confirm & Auto Fill.');
                      }}
                      className={`px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center shadow-sm ${
                        selectedBengaliIdx === null
                          ? 'bg-zinc-200 text-zinc-400 cursor-not-allowed dark:bg-zinc-700 dark:text-zinc-500'
                          : 'bg-violet-600 text-white hover:bg-violet-700'
                      }`}
                    >
                      <Languages className="h-3.5 w-3.5 mr-1.5" />
                      Use Selected Bengali Name
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center">
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> User-approved transliteration — will be used in Auto Fill
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setBengaliSuggestionAccepted(false);
                          setSelectedBengaliIdx(null);
                        }}
                        className="text-[11px] text-zinc-500 hover:text-red-600 underline ml-2"
                      >
                        Undo
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <h4 className="text-sm font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-4 border-b border-zinc-100 dark:border-zinc-800 pb-2">
            Final Merged Data
          </h4>

          {/* PIN Reference Validation Banner */}
          {pinStatus === 'mismatch' && pinRefData && (
            <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h5 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                    Address Mismatch vs PIN Reference Data ({pinRefData.pincode})
                  </h5>
                  <div className="mt-2 text-xs space-y-2 text-amber-800 dark:text-amber-300">
                    {resolvedData.state && resolvedData.state.trim().toLowerCase() !== pinRefData.state.trim().toLowerCase() && (
                      <div className="flex items-center justify-between gap-4 p-2 bg-amber-100/50 dark:bg-amber-900/30 rounded-lg">
                        <span>Extracted State: <strong className="font-mono text-zinc-900 dark:text-zinc-100">{resolvedData.state}</strong> | PIN Reference: <strong className="font-mono text-emerald-700 dark:text-emerald-400">{pinRefData.state}</strong></span>
                        <div className="flex gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setResolvedData(prev => ({ ...prev, state: pinRefData.state }))}
                            className="px-2.5 py-1 bg-amber-600 text-white rounded text-[11px] font-medium hover:bg-amber-700 transition-colors"
                          >
                            Use PIN Ref ({pinRefData.state})
                          </button>
                        </div>
                      </div>
                    )}
                    {resolvedData.district && resolvedData.district.trim().toLowerCase() !== pinRefData.district.trim().toLowerCase() && (
                      <div className="flex items-center justify-between gap-4 p-2 bg-amber-100/50 dark:bg-amber-900/30 rounded-lg">
                        <span>Extracted District: <strong className="font-mono text-zinc-900 dark:text-zinc-100">{resolvedData.district}</strong> | PIN Reference: <strong className="font-mono text-emerald-700 dark:text-emerald-400">{pinRefData.district}</strong></span>
                        <div className="flex gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setResolvedData(prev => ({ ...prev, district: pinRefData.district }))}
                            className="px-2.5 py-1 bg-amber-600 text-white rounded text-[11px] font-medium hover:bg-amber-700 transition-colors"
                          >
                            Use PIN Ref ({pinRefData.district})
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {pinStatus === 'verified' && pinRefData && (
            <div className="mb-6 p-3 rounded-lg bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>PIN Verified — State ({pinRefData.state}) and District ({pinRefData.district}) match India Post reference data for PIN {pinRefData.pincode}.</span>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-y-4 gap-x-6">
            {ALL_FIELDS.map((key) => {
              const original = (result.data as any)[key];
              const isConflict = result.conflicts.some(c => c.field === key);
              const confidence = original?.confidence || 0;
              const sourceDoc = original?.source_document || 'Unknown';
              const sourceSide = original?.source_side;
              const value = resolvedData[key] || 'Not found';
              
              return (
                <div key={key} className={`p-3 rounded-lg border ${
                  isConflict ? 'border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-900/10' : 'border-zinc-100 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50'
                }`}>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 capitalize flex items-center justify-between">
                    {key === 'voter_id_number' ? 'Voter ID / EPIC Number' : key === 'aadhaar_number' ? 'Aadhaar Number' : key === 'pan_number' ? 'PAN Number' : key === 'gst_number' ? 'GST Number' : key.replace(/_/g, ' ')}
                    {!isConflict && confidence > 0 && confidence < 0.7 && (
                      <span title="Low Confidence">
                        <AlertCircle className="h-3 w-3 text-amber-500" />
                      </span>
                    )}
                  </p>
                  <p className={`text-sm font-medium mt-1 truncate font-mono ${value === 'Not found' ? 'text-zinc-400 italic' : 'text-zinc-900 dark:text-zinc-100'}`} title={value}>
                    {value}
                  </p>
                  {value !== 'Not found' && (
                    <div className="mt-2 text-[10px] text-zinc-500 flex justify-between">
                      <span className="truncate pr-2">{sourceDoc}{sourceSide && sourceSide !== 'unknown' ? ` (${sourceSide})` : ''}</span>
                      <span className="shrink-0">{(confidence * 100).toFixed(0)}%</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
