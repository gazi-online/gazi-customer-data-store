import { CheckCircle2, Clock, FileText, AlertCircle, Trash2 } from "lucide-react";
import { ImportJob } from "../types";

export function QueuePanel({ jobs, onRemoveJob }: { jobs: ImportJob[], onRemoveJob: (id: string) => void }) {
  if (jobs.length === 0) return null;

  return (
    <div className="mt-4 border border-indigo-100 dark:border-indigo-800/50 rounded-lg overflow-hidden bg-white dark:bg-zinc-900 shadow-sm">
      <div className="bg-indigo-50/50 dark:bg-indigo-900/20 px-4 py-2 border-b border-indigo-100 dark:border-indigo-800/50 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-indigo-900 dark:text-indigo-200 uppercase tracking-wider">Import Queue</h3>
        <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">{jobs.length} items</span>
      </div>
      
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50 max-h-48 overflow-y-auto">
        {jobs.map(job => (
          <div key={job.id} className="p-3 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
            <div className="flex items-center space-x-3">
              {job.status === 'completed' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
              {job.status === 'processing' && <Clock className="h-4 w-4 text-amber-500 animate-pulse" />}
              {job.status === 'pending' && <FileText className="h-4 w-4 text-zinc-400" />}
              {job.status === 'error' && <AlertCircle className="h-4 w-4 text-red-500" />}
              
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {job.documentType} 
                  {job.version > 1 && <span className="ml-2 text-[10px] bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 px-1.5 py-0.5 rounded">v{job.version}</span>}
                </p>
                <p className="text-xs text-zinc-500 flex items-center mt-0.5">
                  via {job.provider} • {job.source === 'json' ? 'JSON Paste' : 'File Upload'}
                </p>
              </div>
            </div>
            
            <button 
              onClick={() => onRemoveJob(job.id)}
              className="p-1.5 text-zinc-400 hover:text-red-500 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
