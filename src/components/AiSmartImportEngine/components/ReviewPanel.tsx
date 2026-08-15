import { MergedResult, NormalizedData, Conflict } from "../types";
import { AlertCircle, CheckCircle2, ChevronRight, Check, Activity } from "lucide-react";
import { useState, useEffect } from "react";
import { getProfilePhotoSignedUrl } from "@/app/(dashboard)/customers/ai-actions";

export function ReviewPanel({ 
  result, 
  onConfirm 
}: { 
  result: MergedResult, 
  onConfirm: (finalData: Record<string, any>) => void 
}) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [usePhoto, setUsePhoto] = useState<boolean>(true);

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
  'date_of_birth',
  'gender',
  'address',
  'city',
  'district',
  'state',
  'pincode',
  'country'
];

  const [resolvedData, setResolvedData] = useState<Record<string, any>>(() => {
    // Flatten the MergedResult to a simple key-value object using the highest priority values
    const flat: Record<string, any> = {};
    Object.keys(result.data).forEach(key => {
      if (key !== 'profile_photo') {
        flat[key] = (result.data as any)[key].value;
      }
    });
    return flat;
  });

  useEffect(() => {
    async function fetchPhoto() {
      if (result.data.profile_photo?.storage_path) {
        const url = await getProfilePhotoSignedUrl(result.data.profile_photo.storage_path);
        setPhotoUrl(url);
      }
    }
    fetchPhoto();
  }, [result.data.profile_photo]);

  const handleResolveConflict = (field: keyof NormalizedData, value: any) => {
    setResolvedData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleConfirm = () => {
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
                    <p className="font-bold mb-2 uppercase text-indigo-700 dark:text-indigo-400 border-b border-indigo-200 dark:border-indigo-800/50 pb-1">{job.documentType}</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                      <span>Provider:</span> <span className="font-semibold text-right">{job.perfSummary!.provider}</span>
                      <span>Model:</span> <span className="font-semibold text-right">{job.perfSummary!.model}</span>
                      <span>Docs Count:</span> <span className="font-semibold text-right">{job.perfSummary!.documentCount}</span>
                      <hr className="col-span-2 border-indigo-200/50 dark:border-indigo-800/50 my-1" />
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

        {result.data.profile_photo && result.data.profile_photo.available && result.data.profile_photo.storage_path && (
          <div className="mb-6 space-y-4">
            <h4 className="text-sm font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800 pb-2">
              Profile Photo Extracted
            </h4>
            <div className="flex items-center space-x-6 bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/50 rounded-lg p-4">
              <div className="h-24 w-24 rounded-full border-4 border-white dark:border-zinc-800 bg-zinc-200 overflow-hidden shadow-sm shrink-0">
                {photoUrl ? (
                  <img src={photoUrl} alt="Extracted profile" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full animate-pulse bg-zinc-300 dark:bg-zinc-700" />
                )}
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">AI found a portrait</p>
                  <p className="text-xs text-zinc-500">Source: {result.data.profile_photo.source_document}</p>
                </div>
                <div className="flex space-x-3">
                  <button
                    onClick={() => setUsePhoto(true)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      usePhoto 
                        ? 'bg-indigo-600 text-white shadow-sm' 
                        : 'bg-white text-zinc-700 border border-zinc-300 hover:bg-zinc-50'
                    }`}
                  >
                    Use Photo
                  </button>
                  <button
                    onClick={() => setUsePhoto(false)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      !usePhoto 
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
          <h4 className="text-sm font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-4 border-b border-zinc-100 dark:border-zinc-800 pb-2">
            Final Merged Data
          </h4>
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
                    {key.replace(/_/g, ' ')}
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
