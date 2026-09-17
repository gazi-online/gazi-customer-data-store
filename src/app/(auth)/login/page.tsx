"use client";

import { useState } from "react";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { login } from "./actions";

// ── Validation schema (strictly preserved) ──────────────────────────────────
const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  // ── Preserved auth submission flow ──────────────────────────────────────────
  const onSubmit = async (data: LoginFormValues) => {
    if (isLoading) return;
    setIsLoading(true);
    setAuthError(null);

    const formData = new FormData();
    formData.append("email", data.email);
    formData.append("password", data.password);

    const result = await login(formData);

    if (result?.error) {
      const safeMessage =
        result.error === "Invalid login credentials"
          ? "Invalid email or password. Please try again."
          : "Login failed. Please check your credentials and try again.";
      setAuthError(safeMessage);
      toast.error(safeMessage);
      setIsLoading(false);
    }
    // On success the server action redirects to /dashboard
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center px-4 py-8 sm:py-12">
      {/* Login Card */}
      <div className="w-full max-w-[400px] bg-white rounded-[22px] border border-slate-200/80 shadow-[0_12px_36px_-6px_rgba(99,102,241,0.09),0_2px_8px_-2px_rgba(0,0,0,0.04)] p-6 sm:p-8">

        {/* Brand & Heading */}
        <div className="flex flex-col items-center text-center mb-5 sm:mb-6">
          <div className="mb-3 flex justify-center">
            <Image
              src="/branding/gazi-online-logo.jpg"
              alt="Gazi Online"
              width={120}
              height={120}
              priority
              className="w-[104px] h-[104px] sm:w-[120px] sm:h-[120px] object-contain rounded-full"
            />
          </div>

          <h1 className="text-[23px] sm:text-[26px] font-semibold text-slate-900 tracking-tight leading-tight">
            Welcome Back
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 font-normal">
            Login to your account
          </p>
        </div>

        {/* Auth error message (rendered only when actual error occurs) */}
        <div aria-live="polite" aria-atomic="true">
          {authError && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-2.5 rounded-[13px] border border-red-200 bg-red-50/90 px-3.5 py-2.5 text-sm text-red-700"
            >
              <span className="font-bold shrink-0 mt-0.5" aria-hidden="true">!</span>
              <span className="break-words leading-snug">{authError}</span>
            </div>
          )}
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="space-y-4"
        >
          {/* Email field */}
          <div className="space-y-1.5">
            <label
              htmlFor="email-input"
              className="block text-sm font-medium text-slate-700"
            >
              Email
            </label>
            <input
              id="email-input"
              {...register("email")}
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="you@example.com"
              aria-invalid={errors.email ? "true" : "false"}
              aria-describedby={errors.email ? "email-error" : undefined}
              className={`block w-full h-12 rounded-[13px] border px-4 text-sm text-slate-900 placeholder:text-slate-400 transition-all duration-150 focus:outline-none focus:ring-4 ${
                errors.email
                  ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                  : "border-slate-200 hover:border-slate-300 focus:border-violet-500 focus:ring-violet-500/15"
              }`}
            />
            {errors.email && (
              <p id="email-error" role="alert" className="text-xs text-red-600 font-medium">
                {errors.email.message}
              </p>
            )}
          </div>

          {/* Password field */}
          <div className="space-y-1.5">
            <label
              htmlFor="password-input"
              className="block text-sm font-medium text-slate-700"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="password-input"
                {...register("password")}
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                aria-invalid={errors.password ? "true" : "false"}
                aria-describedby={errors.password ? "password-error" : undefined}
                className={`block w-full h-12 rounded-[13px] border pl-4 pr-11 text-sm text-slate-900 placeholder:text-slate-400 transition-all duration-150 focus:outline-none focus:ring-4 ${
                  errors.password
                    ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                    : "border-slate-200 hover:border-slate-300 focus:border-violet-500 focus:ring-violet-500/15"
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 w-11 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 rounded-r-[13px]"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
            {errors.password && (
              <p id="password-error" role="alert" className="text-xs text-red-600 font-medium">
                {errors.password.message}
              </p>
            )}
          </div>

          {/* Login button */}
          <button
            type="submit"
            disabled={isLoading}
            className="mt-2 w-full h-12 rounded-[13px] bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 active:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 flex items-center justify-center gap-2 transition-all duration-150 shadow-sm hover:shadow-md hover:shadow-blue-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>Logging in…</span>
              </>
            ) : (
              <span>Login</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
