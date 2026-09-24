"use client";

import React, { useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ShieldCheck, AlertCircle, Loader2, LogOut, KeyRound } from "lucide-react";
import {
  verifyMfaChallengeAction,
  signOutChallengeAction,
} from "@/app/(auth)/mfa/verify/actions";
import { toast } from "sonner";

interface MfaChallengeViewProps {
  factorId: string;
  factorName: string;
  safeNext: string;
}

export function MfaChallengeView({
  factorId,
  factorName,
  safeNext,
}: MfaChallengeViewProps) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isVerifying, startVerifyTransition] = useTransition();
  const [isSigningOut, startSignOutTransition] = useTransition();

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const digitsOnly = raw.replace(/\D/g, "").slice(0, 6);
    setCode(digitsOnly);
    if (errorMessage) {
      setErrorMessage(null);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text");
    const digitsOnly = pasted.replace(/\D/g, "").slice(0, 6);
    setCode(digitsOnly);
    if (errorMessage) {
      setErrorMessage(null);
    }
  };

  const handleVerifySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6 || isVerifying || isSigningOut) {
      return;
    }

    setErrorMessage(null);
    startVerifyTransition(async () => {
      try {
        const res = await verifyMfaChallengeAction({
          factorId,
          code,
          next: safeNext,
        });

        if (res.success && res.next) {
          toast.success("Verification successful");
          router.push(res.next);
          router.refresh();
        } else {
          setErrorMessage(
            res.error ||
              "The code is incorrect or expired. Enter the latest code from your authenticator app."
          );
        }
      } catch {
        setErrorMessage(
          "The code is incorrect or expired. Enter the latest code from your authenticator app."
        );
      }
    });
  };

  const handleSignOut = () => {
    if (isSigningOut || isVerifying) return;
    startSignOutTransition(async () => {
      try {
        await signOutChallengeAction();
      } catch {
        // Redirection handles navigation
      }
    });
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-[420px] bg-white rounded-[22px] border border-slate-200/80 shadow-[0_12px_36px_-6px_rgba(99,102,241,0.09),0_2px_8px_-2px_rgba(0,0,0,0.04)] p-6 sm:p-8">
        {/* Brand Logo & Icon */}
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
            Verify It&apos;s You
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 font-normal leading-relaxed">
            Enter the 6-digit code from your authenticator app.
          </p>
          <span className="inline-flex items-center gap-1 mt-2 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
            <ShieldCheck className="h-3 w-3 text-violet-600" />
            {factorName}
          </span>
        </div>

        {/* Error Alert with aria-live */}
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

        {/* Verification Form */}
        <form onSubmit={handleVerifySubmit} noValidate className="space-y-5">
          <div className="space-y-2">
            <label
              htmlFor="totp-code-input"
              className="block text-xs font-semibold text-slate-700 text-center uppercase tracking-wider"
            >
              Security Code
            </label>
            <input
              id="totp-code-input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              autoFocus
              value={code}
              onChange={handleCodeChange}
              onPaste={handlePaste}
              placeholder="000000"
              aria-label="6-digit authentication code"
              aria-invalid={errorMessage ? "true" : "false"}
              className="w-full h-13 px-4 py-3 bg-white border border-slate-200 rounded-[13px] text-center text-2xl font-mono tracking-[0.35em] font-bold text-slate-900 placeholder:text-slate-300 transition-all duration-150 focus:outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-500/15"
            />
            <p className="text-[11px] text-slate-500 text-center">
              Codes refresh every 30 seconds.
            </p>
          </div>

          <div className="space-y-2.5 pt-1">
            <button
              type="submit"
              disabled={code.length !== 6 || isVerifying || isSigningOut}
              className="inline-flex items-center justify-center gap-2 w-full h-11 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs sm:text-sm font-bold rounded-xl shadow-xs transition-colors"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                <span>Continue</span>
              )}
            </button>

            <button
              type="button"
              onClick={handleSignOut}
              disabled={isSigningOut || isVerifying}
              className="inline-flex items-center justify-center gap-1.5 w-full h-10 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors disabled:opacity-50"
            >
              {isSigningOut ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <LogOut className="h-3.5 w-3.5" />
              )}
              <span>Sign out</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
