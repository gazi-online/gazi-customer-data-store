import Link from "next/link";
import { ArrowLeft, FileQuestion } from "lucide-react";

export default function RequestNotFound() {
  return (
    <div className="max-w-md mx-auto py-16 px-4 text-center space-y-5">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 mx-auto flex items-center justify-center">
        <FileQuestion className="h-7 w-7" />
      </div>

      <div className="space-y-2">
        <h1 className="text-xl font-bold text-slate-900 dark:text-zinc-100">
          Service Request Not Found
        </h1>
        <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-sm mx-auto leading-relaxed">
          The requested service request could not be found, has been removed, or is not accessible.
        </p>
      </div>

      <div className="pt-2">
        <Link
          href="/requests"
          className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-xs"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Requests Desk</span>
        </Link>
      </div>
    </div>
  );
}
