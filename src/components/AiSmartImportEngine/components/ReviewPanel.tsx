import { MergedResult, NormalizedData, Conflict } from "../types";
import { AlertCircle, CheckCircle2, ChevronRight, Check, Activity, Loader2, UserCheck, Sparkles } from "lucide-react";
import { useState, useEffect } from "react";
import { getProfilePhotoSignedUrl, cropAndUploadProfilePhoto } from "@/app/(dashboard)/customers/ai-actions";
import { IndiaPincodeProvider } from "@/lib/address/IndiaPincodeProvider";
import { PincodeLookupResult } from "@/lib/address/address-types";
import { toast } from "sonner";
import { suggestNameComponentsFromFullName } from "../nameUtils";

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
  const [pinRefData, setPinRefData] = useState<PincodeLookupResult | null>(null);
  const [pinStatus, setPinStatus] = useState<'idle' | 'loading' | 'verified' | 'mismatch' | 'failed'>('idle');
  const [suggestionAccepted, setSuggestionAccepted] = useState<boolean>(false);

  const conflictFields = new Set(result.conflicts.map(c => c.field));

  const [resolvedData, setResolvedData] = useState<Record<string, any>>(() => {
    // Flatten the MergedResult to a simple key-value object using the highest priority values
    const flat: Record<string, any> = {};
    Object.keys(result.data).forEach(key => {
      if (key !== 'profile_photo') {
        if (conflictFields.has(key as any)) {
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

  useEffect(() => {
    async function fetchPhoto() {
      if (result.data.profile_photo?.storage_path) {
        const url = await getProfilePhotoSignedUrl(result.data.profile_photo.storage_path);
        setPhotoUrl(url);
        setUsePhoto(true);
      }
    }
    fetchPhoto();
  }, [result.data.profile_photo]);

  const handleUsePhoto = async () => {
    if (result.data.profile_photo?.storage_path) {
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

    try {
      setIsCroppingPhoto(true);
      const toastId = toast.loading("Cropping profile photo from original document...");

      const formData = new FormData();
      formData.append("file", originalFile);
      formData.append("bounding_box", JSON.stringify(result.data.profile_photo.bounding_box));

      const res = await cropAndUploadProfilePhoto(formData);

      if (res.success && res.storagePath) {
        result.data.profile_photo.storage_path = res.storagePath;
        setPhotoUrl(res.signedUrl || null);
        setUsePhoto(true);
        toast.success("Profile photo cropped & prepared!", { id: toastId });
      } else {
        toast.error(res.error || "Failed to crop profile photo", { id: toastId });
      }
    } catch (err: any) {
      toast.error("Crop error: " + err.message);
    } finally {
      setIsCroppingPhoto(false);
    }
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

  const handleResolveConflict = (field: keyof NormalizedData, value: any) => {
    setResolvedData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleConfirm = () => {
    // Task 5: Check if there are unresolved conflicts
    const unresolved = result.conflicts.filter(c => resolvedData[c.field] === undefined || resolvedData[c.field] === null || resolvedData[c.field] === "");
    if (unresolved.length > 0) {
      const fieldNames = unresolved.map(u => String(u.field).replace(/_/g, ' ')).join(', ');
      toast.error(`Please resolve conflict(s) for: ${fieldNames} before auto-filling.`);
      return;
    }

    const finalData = { ...resolvedData };
    if (result.data.profile_photo?.storage_path && usePhoto) {
      finalData.photo_source = result.data.profile_photo.storage_path;
    }
    onConfirm(finalData);
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
        {process.env.NODE_ENV === 'development' && result.jobs && result.jobs.some(j => j.perfSummary) && (
          <div className="mb-6 space-y-4">
             <h4 className="text-sm font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-wider border-b border-indigo-100 dark:border-indigo-900/30 pb-2 flex items-center">
               <Activity className="h-4 w-4 mr-2" /> Performance Summary (Dev Only)
             </h4>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               {result.jobs.filter(j => j.perfSummary).map((job, idx) => (
                 <div key={idx} className="bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/50 rounded-lg p-4 font-mono text-[11px] md:text-xs text-indigo-900 dark:text-indigo-200 shadow-sm">
                     <div className="flex items-center justify-between font-bold mb-2 uppercase text-indigo-700 dark:text-indigo-400 border-b border-indigo-200 dark:border-indigo-800/50 pb-1">
                       <span>{job.documentType}</span>
                       {job.perfSummary!.cacheHit ? (
                         <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 rounded-full text-[10px] normal-case font-bold flex items-center">
                           ⚡ Cache Hit (Saved ~{(job.perfSummary!.savedProviderMs! / 1000).toFixed(1)}s)
                         </span>
                       ) : (
                         <span className="bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 px-2 py-0.5 rounded-full text-[10px] normal-case font-semibold">
                           🔍 Cache Miss
                         </span>
                       )}
                     </div>
                     <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                       <span>Provider:</span> <span className="font-semibold text-right">{job.perfSummary!.provider}</span>
                       <span>Model:</span> <span className="font-semibold text-right">{job.perfSummary!.model}</span>
                       <span>Docs Count:</span> <span className="font-semibold text-right">{job.perfSummary!.documentCount}</span>
                       <hr className="col-span-2 border-indigo-200/50 dark:border-indigo-800/50 my-1" />
                       <span>Cache Lookup:</span> <span className="font-semibold text-right text-emerald-600 dark:emerald-400">{job.perfSummary!.cacheLookupMs || 0} ms</span>
                       {job.perfSummary!.cacheWriteMs !== undefined && job.perfSummary!.cacheWriteMs > 0 && (
                         <><span>Cache Write:</span> <span className="font-semibold text-right">{job.perfSummary!.cacheWriteMs} ms</span></>
                       )}
                       <span>Primary Attempt:</span> <span className="font-semibold text-right">{job.perfSummary!.primaryAttemptDuration} ms</span>
                       {job.perfSummary!.fallbackAttemptDuration > 0 && (
                          <><span>Fallback Attempt:</span> <span className="font-semibold text-right text-amber-600 dark:text-amber-400">{job.perfSummary!.fallbackAttemptDuration} ms</span></>
                       )}
                       <hr className="col-span-2 border-indigo-200/50 dark:border-indigo-800/50 my-1" />
                       <span>Image Prep:</span> <span className="font-semibold text-right">{job.perfSummary!.imagePrepTime} ms</span>
                       <span>JSON Parse:</span> <span className="font-semibold text-right">{job.perfSummary!.jsonParseTime} ms</span>
                       <span>Normalization:</span> <span className="font-semibold text-right">{job.perfSummary!.normalizationTime} ms</span>
                       <span>DB Logging:</span> <span className="font-semibold text-right">{job.perfSummary!.dbLogTime} ms</span>
                       <hr className="col-span-2 border-indigo-200/50 dark:border-indigo-800/50 my-1" />
                       <span className="font-bold">Total Pipeline:</span> <span className="font-bold text-right text-indigo-600 dark:text-indigo-300">{job.perfSummary!.totalTime} ms</span>
                     </div>
                 </div>
               ))}
             </div>
           </div>
         )}

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
                    onClick={() => setUsePhoto(false)}
                    disabled={isCroppingPhoto}
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
