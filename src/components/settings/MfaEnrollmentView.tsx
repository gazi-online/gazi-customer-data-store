"use client";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Smartphone,
  KeyRound,
  Loader2,
} from "lucide-react";
import {
  getMfaStatusAction,
  startMfaEnrollmentAction,
  verifyMfaEnrollmentAction,
  cancelMfaEnrollmentAction,
} from "@/app/(dashboard)/settings/security/mfa/actions";
import { toast } from "sonner";

type ViewState =
  | "LOADING"
  | "ALREADY_ENABLED"
  | "READY_TO_ENROLL"
  | "ENROLLING"
  | "SUCCESS";

export function MfaEnrollmentView() {
  const router = useRouter();
  const [viewState, setViewState] = useState<ViewState>("LOADING");

  // Transient enrollment data (held ONLY in memory during this active session)
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCodeSvg, setQrCodeSvg] = useState<string | null>(null);
  const [manualSecret, setManualSecret] = useState<string | null>(null);

  // Form & UI states
  const [totpCode, setTotpCode] = useState("");
  const [showManualKey, setShowManualKey] = useState(false);
  const [hasCopiedSecret, setHasCopiedSecret] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Transitions for double-submit protection
  const [isStartingEnrollment, startEnrollTransition] = useTransition();
  const [isVerifying, startVerifyTransition] = useTransition();
  const [isCancelling, startCancelTransition] = useTransition();

  // Load initial MFA status
  useEffect(() => {
    let isMounted = true;

    async function checkStatus() {
      try {
        const res = await getMfaStatusAction();
        if (!isMounted) return;

        if (res.hasVerifiedFactor) {
          setViewState("ALREADY_ENABLED");
        } else {
          setViewState("READY_TO_ENROLL");
        }
      } catch {
        if (!isMounted) return;
        setErrorMessage("Failed to load security status. Please refresh the page.");
        setViewState("READY_TO_ENROLL");
      }
    }

    checkStatus();

    return () => {
      isMounted = false;
    };
  }, []);

  // Handle explicit start enrollment click
  const handleStartEnrollment = () => {
    setErrorMessage(null);
    startEnrollTransition(async () => {
      try {
        const res = await startMfaEnrollmentAction();
        if (res.alreadyVerified) {
          setViewState("ALREADY_ENABLED");
          return;
        }

        if (res.success && res.factorId && res.totp) {
          setFactorId(res.factorId);
          setQrCodeSvg(res.totp.qrCodeSvg);
          setManualSecret(res.totp.secret);
          setTotpCode("");
          setShowManualKey(false);
          setViewState("ENROLLING");
        } else {
          setErrorMessage(res.error || "Unable to start setup. Please try again.");
        }
      } catch {
        setErrorMessage("An unexpected error occurred while starting setup.");
      }
    });
  };

  // Handle code change with strictly 6-digit numeric filtering
  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    const sanitized = rawVal.replace(/\D/g, "").slice(0, 6);
    setTotpCode(sanitized);
    if (errorMessage) {
      setErrorMessage(null);
    }
  };

  // Handle verification submit
  const handleVerifySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId || totpCode.length !== 6) return;

    setErrorMessage(null);
    startVerifyTransition(async () => {
      try {
        const res = await verifyMfaEnrollmentAction(factorId, totpCode);
        if (res.success) {
          setViewState("SUCCESS");
          // Clear transient secrets from state immediately
          setManualSecret(null);
          setQrCodeSvg(null);
          toast.success("Two-step verification enabled successfully!");
        } else {
          setErrorMessage(
            res.error ||
              "The code is incorrect or expired. Try the latest code from your authenticator app."
          );
        }
      } catch {
        setErrorMessage("Verification failed. Please try again.");
      }
    });
  };

  // Handle cancel setup
  const handleCancelEnrollment = () => {
    if (!factorId) {
      setViewState("READY_TO_ENROLL");
      return;
    }

    startCancelTransition(async () => {
      try {
        await cancelMfaEnrollmentAction(factorId);
      } finally {
        setFactorId(null);
        setQrCodeSvg(null);
        setManualSecret(null);
        setTotpCode("");
        setErrorMessage(null);
        setViewState("READY_TO_ENROLL");
      }
    });
  };

  // Copy manual key to clipboard
  const handleCopySecret = async () => {
    if (!manualSecret) return;
    try {
      await navigator.clipboard.writeText(manualSecret);
      setHasCopiedSecret(true);
      setTimeout(() => setHasCopiedSecret(false), 2500);
      toast.info("Setup key copied to clipboard");
    } catch {
      toast.error("Could not copy key. Please select and copy manually.");
    }
  };

  // Safe SVG rendering via Data URI (using img tag, zero HTML injection)
  const getQrDataUri = (svgStr: string) => {
    if (svgStr.startsWith("data:image/svg+xml")) {
      return svgStr;
    }
    return `data:image/svg+xml;utf-8,${encodeURIComponent(svgStr)}`;
  };

  return (
    <div className="p-3.5 sm:p-6 md:p-8 space-y-6 max-w-3xl mx-auto w-full">
      {/* Breadcrumb / Back button */}
      <div className="flex items-center gap-2">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors py-1 px-2 -ml-2 rounded-lg hover:bg-slate-100"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Settings</span>
        </Link>
      </div>

      {/* Page Header */}
      <div className="border-b border-slate-200/80 pb-5">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-violet-50 border border-violet-100 flex items-center justify-center text-violet-600 shrink-0 shadow-xs">
            <ShieldCheck className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Two-Step Verification
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Protect your GCDS account with an authenticator app.
            </p>
          </div>
        </div>
      </div>

      {/* 1. LOADING STATE */}
      {viewState === "LOADING" && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-8 shadow-xs flex flex-col items-center justify-center space-y-3 min-h-[260px]">
          <Loader2 className="h-7 w-7 text-violet-600 animate-spin" />
          <p className="text-xs sm:text-sm font-medium text-slate-500">
            Checking verification status...
          </p>
        </div>
      )}

      {/* 2. ALREADY ENABLED STATE */}
      {viewState === "ALREADY_ENABLED" && (
        <div className="bg-white rounded-2xl border border-emerald-200/80 p-5 sm:p-7 shadow-xs space-y-5">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  Two-Step Verification is Enabled
                </h2>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Active
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Your authenticator app is configured and ready for two-step verification.
              </p>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 flex items-center gap-3">
            <Smartphone className="h-5 w-5 text-slate-500 shrink-0" />
            <div className="text-xs text-slate-600">
              <span className="font-semibold text-slate-800">Authenticator App</span>
              <p className="text-slate-500 text-[11px] mt-0.5">
                Standard Time-based One-Time Password (TOTP)
              </p>
            </div>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => router.push("/settings")}
              className="inline-flex items-center justify-center px-4 py-2.5 min-h-[44px] sm:min-h-[38px] bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors"
            >
              Back to Settings
            </button>
          </div>
        </div>
      )}

      {/* 3. READY TO ENROLL STATE */}
      {viewState === "READY_TO_ENROLL" && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-7 shadow-xs space-y-6">
          <div className="space-y-2">
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              Set Up an Authenticator App
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              When two-step verification is enabled, you can use a 6-digit security code generated by your authenticator app to protect your account.
            </p>
          </div>

          {/* Simple step-by-step guidance */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-slate-50/80 rounded-xl p-4 border border-slate-100 space-y-1.5">
              <div className="text-xs font-bold text-violet-700 bg-violet-100/60 w-6 h-6 rounded-full flex items-center justify-center mb-2">
                1
              </div>
              <h3 className="text-xs font-bold text-slate-900">Open App</h3>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Open Google Authenticator, Microsoft Authenticator, 1Password, or Authy on your phone.
              </p>
            </div>

            <div className="bg-slate-50/80 rounded-xl p-4 border border-slate-100 space-y-1.5">
              <div className="text-xs font-bold text-violet-700 bg-violet-100/60 w-6 h-6 rounded-full flex items-center justify-center mb-2">
                2
              </div>
              <h3 className="text-xs font-bold text-slate-900">Scan QR Code</h3>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Use your authenticator app to scan the QR code displayed on the next screen.
              </p>
            </div>

            <div className="bg-slate-50/80 rounded-xl p-4 border border-slate-100 space-y-1.5">
              <div className="text-xs font-bold text-violet-700 bg-violet-100/60 w-6 h-6 rounded-full flex items-center justify-center mb-2">
                3
              </div>
              <h3 className="text-xs font-bold text-slate-900">Enter Code</h3>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Enter the 6-digit code shown in your app to confirm setup and activate protection.
              </p>
            </div>
          </div>

          {errorMessage && (
            <div
              aria-live="polite"
              className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={handleStartEnrollment}
              disabled={isStartingEnrollment}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] sm:min-h-[40px] bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs sm:text-sm font-bold rounded-xl shadow-xs transition-colors"
            >
              {isStartingEnrollment ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Preparing Setup...</span>
                </>
              ) : (
                <>
                  <Smartphone className="h-4 w-4" />
                  <span>Set Up Authenticator</span>
                </>
              )}
            </button>
            <Link
              href="/settings"
              className="inline-flex items-center justify-center px-4 py-2.5 min-h-[44px] sm:min-h-[40px] text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
            >
              Cancel
            </Link>
          </div>
        </div>
      )}

      {/* 4. ENROLLING / QR DISPLAY STATE */}
      {viewState === "ENROLLING" && qrCodeSvg && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-7 shadow-xs space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              Scan the QR Code
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
              Open your authenticator app and point your phone camera at this QR code.
            </p>
          </div>

          {/* Centered high-contrast QR display */}
          <div className="flex flex-col items-center justify-center p-4 sm:p-6 bg-slate-50/60 rounded-2xl border border-slate-100">
            <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200/80 shadow-xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getQrDataUri(qrCodeSvg)}
                alt="Two-step verification QR code"
                width={220}
                height={220}
                className="w-44 h-44 sm:w-52 sm:h-52 object-contain mx-auto"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-3 text-center">
              Works with Google Authenticator, Microsoft Authenticator, 1Password, or Authy.
            </p>
          </div>

          {/* Collapsible Manual Setup Key Fallback */}
          {manualSecret && (
            <div className="border border-slate-200/80 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowManualKey(!showManualKey)}
                className="w-full flex items-center justify-between p-3.5 text-xs font-semibold text-slate-700 bg-slate-50/60 hover:bg-slate-100/80 transition-colors text-left"
              >
                <span className="flex items-center gap-2">
                  <KeyRound className="h-3.5 w-3.5 text-slate-500" />
                  <span>Can&apos;t scan the QR code? Use manual setup key</span>
                </span>
                {showManualKey ? (
                  <ChevronUp className="h-4 w-4 text-slate-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                )}
              </button>

              {showManualKey && (
                <div className="p-4 bg-white border-t border-slate-100 space-y-3">
                  <p className="text-[11px] text-slate-500">
                    If you cannot scan the code, enter this key manually into your authenticator app:
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs text-slate-800 tracking-wider break-all select-all">
                      {manualSecret}
                    </div>
                    <button
                      type="button"
                      onClick={handleCopySecret}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors shrink-0"
                    >
                      {hasCopiedSecret ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="text-emerald-700">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span>Copy Key</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[11px] flex items-start gap-2">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>
                      Keep this key private. Never share it with anyone.
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Verification Code Form */}
          <form onSubmit={handleVerifySubmit} className="space-y-4 pt-2 border-t border-slate-100">
            <div className="space-y-1.5">
              <label
                htmlFor="totp-code-input"
                className="block text-xs font-bold text-slate-900"
              >
                Enter the 6-Digit Code from Your Authenticator App
              </label>
              <input
                id="totp-code-input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                value={totpCode}
                onChange={handleCodeChange}
                placeholder="000000"
                className="w-full max-w-xs px-4 py-3 bg-white border border-slate-300 rounded-xl text-center text-xl sm:text-2xl font-mono tracking-[0.3em] font-bold text-slate-900 placeholder:text-slate-300 focus:outline-hidden focus:ring-2 focus:ring-violet-600 focus:border-violet-600 transition-all shadow-xs"
              />
              <p className="text-[11px] text-slate-500">
                Codes refresh every 30 seconds in your app.
              </p>
            </div>

            {errorMessage && (
              <div
                aria-live="polite"
                className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5"
              >
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <button
                type="submit"
                disabled={totpCode.length !== 6 || isVerifying || isCancelling}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] sm:min-h-[40px] bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs sm:text-sm font-bold rounded-xl shadow-xs transition-colors"
              >
                {isVerifying ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Verifying Code...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Verify and Enable</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleCancelEnrollment}
                disabled={isCancelling || isVerifying}
                className="inline-flex items-center justify-center px-4 py-2.5 min-h-[44px] sm:min-h-[40px] text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors disabled:opacity-50"
              >
                {isCancelling ? "Cancelling..." : "Cancel"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 5. SUCCESS STATE */}
      {viewState === "SUCCESS" && (
        <div className="bg-white rounded-2xl border border-emerald-200/80 p-6 sm:p-8 shadow-xs space-y-5 text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 mx-auto shadow-xs">
            <CheckCircle2 className="h-7 w-7" />
          </div>

          <div className="space-y-1.5 max-w-md mx-auto">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900">
              Two-Step Verification is Enabled
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Your authenticator app is configured and ready for two-step verification.
            </p>
          </div>

          <div className="pt-3">
            <button
              type="button"
              onClick={() => router.push("/settings")}
              className="inline-flex items-center justify-center px-6 py-2.5 min-h-[44px] sm:min-h-[40px] bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-bold rounded-xl shadow-xs transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
