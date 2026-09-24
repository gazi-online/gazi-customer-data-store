"use client";

import React, { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Mail, AlertCircle, CheckCircle2, Loader2, KeyRound } from "lucide-react";
import { requestPasswordResetAction } from "@/app/(auth)/forgot-password/actions";

interface ForgotPasswordViewProps {
  initialError?: string | null;
}

export function ForgotPasswordView({ initialError }: ForgotPasswordViewProps) {
  const [email, setEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(
    initialError === "invalid_link"
      ? "The recovery link was invalid or has expired. Please request a new one below."
      : null
  );
  const [submittedMessage, setSubmittedMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || isPending) return;

    setErrorMessage(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.append("email", email);

      const res = await requestPasswordResetAction(formData);
      if (res.success) {
        setSubmittedMessage(res.message);
      } else {
        setErrorMessage(res.error || "Unable to send recovery link. Please try again.");
      }
    });
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-[420px] bg-white rounded-[22px] border border-slate-200/80 shadow-[0_12px_36px_-6px_rgba(99,102,241,0.09),0_2px_8px_-2px_rgba(0,0,0,0.04)] p-6 sm:p-8">
        {/* Brand & Heading */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="mb-3 flex justify-center">
            <Image
              src="/branding/gazi-online-logo.jpg"
              alt="Gazi Online"
              width={88}
              height={88}
              priority
              className="w-16 h-16 sm:w-20 sm:h-20 object-contain rounded-full shadow-xs"
            />
          </div>

          <div className="w-10 h-10 rounded-2xl bg-violet-100/70 border border-violet-200/60 flex items-center justify-center text-violet-700 mb-2.5">
            <KeyRound className="h-5 w-5" />
          </div>

          <h1 className="text-[22px] sm:text-[24px] font-semibold text-slate-900 tracking-tight leading-tight">
            Forgot Password
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 font-normal leading-relaxed">
            Enter your email to receive a password recovery link.
          </p>
        </div>

        {/* Live Status Region */}
        <div aria-live="polite" aria-atomic="true">
          {errorMessage && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-2.5 rounded-[13px] border border-red-200 bg-red-50/90 px-3.5 py-2.5 text-xs text-red-700"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span className="break-words leading-relaxed">{errorMessage}</span>
            </div>
          )}

          {submittedMessage && (
            <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50/90 p-4 text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-700 mx-auto">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <p className="text-xs sm:text-sm text-emerald-800 font-medium leading-relaxed">
                {submittedMessage}
              </p>
              <p className="text-[11px] text-emerald-600">
                Check your inbox and spam folder for instructions.
              </p>
            </div>
          )}
        </div>

        {!submittedMessage ? (
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="email-input"
                className="block text-sm font-medium text-slate-700"
              >
                Email address
              </label>
              <div className="relative">
                <input
                  id="email-input"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="block w-full h-12 rounded-[13px] border border-slate-200 hover:border-slate-300 px-4 text-sm text-slate-900 placeholder:text-slate-400 transition-all duration-150 focus:outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-500/15"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={!email || isPending}
              className="inline-flex items-center justify-center gap-2 w-full h-11 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs sm:text-sm font-bold rounded-xl shadow-xs transition-colors"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Sending Link...</span>
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4" />
                  <span>Send Recovery Link</span>
                </>
              )}
            </button>
          </form>
        ) : null}

        <div className="mt-6 pt-4 border-t border-slate-100 text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Sign In</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
