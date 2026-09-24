"use client";

import React, { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { Lock, Eye, EyeOff, AlertCircle, CheckCircle2, Loader2, ArrowRight } from "lucide-react";
import { updatePasswordAction } from "@/app/(auth)/update-password/actions";

interface UpdatePasswordViewProps {
  hasValidSession: boolean;
}

export function UpdatePasswordView({ hasValidSession }: UpdatePasswordViewProps) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || !confirmPassword || isPending) return;

    if (newPassword.length < 6) {
      setErrorMessage("Password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setErrorMessage(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.append("newPassword", newPassword);
      formData.append("confirmPassword", confirmPassword);

      const res = await updatePasswordAction(formData);
      if (res.success) {
        setIsSuccess(true);
      } else {
        setErrorMessage(res.error || "Failed to update password. Please try again.");
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
            <Lock className="h-5 w-5" />
          </div>

          <h1 className="text-[22px] sm:text-[24px] font-semibold text-slate-900 tracking-tight leading-tight">
            {isSuccess ? "Password Updated" : "Create New Password"}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 font-normal leading-relaxed">
            {isSuccess
              ? "Your password has been reset successfully."
              : "Please choose a strong password of at least 6 characters."}
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
        </div>

        {/* Invalid/Expired Session State */}
        {!hasValidSession && !isSuccess ? (
          <div className="space-y-4 text-center">
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs sm:text-sm leading-relaxed">
              Your recovery link is invalid or has expired. Please request a new link to reset your password.
            </div>
            <Link
              href="/forgot-password"
              className="inline-flex items-center justify-center gap-2 w-full h-11 bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-bold rounded-xl shadow-xs transition-colors"
            >
              <span>Request New Recovery Link</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : isSuccess ? (
          /* Success State */
          <div className="space-y-5 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 mx-auto">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Your password has been changed. You can now sign in with your new credentials.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 w-full h-11 bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-bold rounded-xl shadow-xs transition-colors"
            >
              <span>Return to Sign In</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          /* Password Form */
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="new-password-input"
                className="block text-sm font-medium text-slate-700"
              >
                New password
              </label>
              <div className="relative">
                <input
                  id="new-password-input"
                  type={showNewPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  className="block w-full h-12 rounded-[13px] border border-slate-200 hover:border-slate-300 pl-4 pr-11 text-sm text-slate-900 placeholder:text-slate-400 transition-all duration-150 focus:outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-500/15"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((p) => !p)}
                  aria-label={showNewPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 w-11 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 rounded-r-[13px]"
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="confirm-password-input"
                className="block text-sm font-medium text-slate-700"
              >
                Confirm new password
              </label>
              <div className="relative">
                <input
                  id="confirm-password-input"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="block w-full h-12 rounded-[13px] border border-slate-200 hover:border-slate-300 pl-4 pr-11 text-sm text-slate-900 placeholder:text-slate-400 transition-all duration-150 focus:outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-500/15"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((p) => !p)}
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 w-11 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 rounded-r-[13px]"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={!newPassword || !confirmPassword || isPending}
              className="inline-flex items-center justify-center gap-2 w-full h-11 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs sm:text-sm font-bold rounded-xl shadow-xs transition-colors"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Updating Password...</span>
                </>
              ) : (
                <span>Update Password</span>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
