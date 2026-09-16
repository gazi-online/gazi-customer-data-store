"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { login } from "./actions";

// ── Validation schema (unchanged) ─────────────────────────────────────────────
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

  // ── Preserved auth submission flow ────────────────────────────────────────────
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
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-5 py-10">
      {/* Card */}
      <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-sm px-8 py-10 sm:px-10">

        {/* Brand */}
        <div className="mb-8 flex flex-col items-start gap-1">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-violet-100 mb-3">
            <span className="font-black text-lg leading-none">G</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            GCDS
          </h1>
          <p className="text-sm text-slate-500">
            Sign in to your account
          </p>
        </div>

        {/* Auth error */}
        <div aria-live="polite" aria-atomic="true">
          {authError && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              <span className="font-bold shrink-0" aria-hidden="true">!</span>
              <span>{authError}</span>
            </div>
          )}
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="space-y-4"
        >
          {/* Email */}
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
              className={`block w-full rounded-xl border px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-0 ${
                errors.email
                  ? "border-red-400 focus:border-red-400 focus:ring-red-100"
                  : "border-slate-300 hover:border-slate-400 focus:border-violet-500 focus:ring-violet-100"
              }`}
            />
            {errors.email && (
              <p id="email-error" role="alert" className="text-xs text-red-600 font-medium">
                {errors.email.message}
              </p>
            )}
          </div>

          {/* Password */}
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
                className={`block w-full rounded-xl border px-4 py-3 pr-11 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-0 ${
                  errors.password
                    ? "border-red-400 focus:border-red-400 focus:ring-red-100"
                    : "border-slate-300 hover:border-slate-400 focus:border-violet-500 focus:ring-violet-100"
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                tabIndex={0}
                className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 hover:text-slate-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 rounded-r-xl"
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

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading}
            className="mt-2 w-full flex items-center justify-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 active:bg-violet-800 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>Signing in…</span>
              </>
            ) : (
              <span>Sign in</span>
            )}
          </button>
        </form>
      </div>

      {/* Footer */}
      <p className="mt-6 text-xs text-slate-400 select-none">
        © 2026 Gazi Customer Data Store
      </p>
    </div>
  );
}
