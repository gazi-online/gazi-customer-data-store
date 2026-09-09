"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  ArrowRight,
  Database,
  Cloud,
} from "lucide-react";
import { toast } from "sonner";
import { login } from "./actions";

// ── Validation Schema (Preserved) ─────────────────────────────────────────────
const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

// ── Decorative 3×3 Dot Matrix Cluster (Variant B spec) ───────────────────────
function DotCluster({
  color = "#6366F1",
  className = "",
}: {
  color?: string;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`grid grid-cols-3 gap-2 opacity-25 pointer-events-none select-none ${className}`}
    >
      {Array.from({ length: 9 }).map((_, i) => (
        <div
          key={i}
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

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
    defaultValues: {
      email: "",
      password: "",
    },
  });

  // Preserved authentication submission flow
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
    // On success, login server action handles redirect to /dashboard
  };

  return (
    <div className="min-h-screen flex flex-col justify-center relative bg-[#F8FAFF] text-slate-900 overflow-x-hidden font-sans">
      {/* ── Ambient Multi-layered Radial Glows (#7C3AED / #6366F1 / #3B82F6) ── */}
      <div
        className="absolute inset-0 pointer-events-none overflow-hidden flex items-center justify-center"
        aria-hidden="true"
      >
        <div className="absolute w-[620px] h-[620px] -top-24 -left-20 bg-gradient-to-br from-violet-300/20 via-indigo-200/15 to-transparent blur-3xl rounded-full" />
        <div className="absolute w-[680px] h-[680px] -bottom-28 -right-20 bg-gradient-to-tl from-blue-300/20 via-indigo-200/15 to-transparent blur-3xl rounded-full" />
        <div className="absolute w-[780px] h-[550px] bg-gradient-to-tr from-purple-200/20 via-indigo-100/25 to-blue-200/15 blur-3xl rounded-full" />
      </div>

      {/* ── Central Viewport & Main Interactive Content ── */}
      <main className="relative w-full max-w-[1440px] mx-auto py-10 sm:py-14 px-4 sm:px-6 z-10 flex items-center justify-center">
        <div className="relative w-full flex items-center justify-between gap-4 lg:gap-6">
          {/* Flanking Left Tagline (Desktop XL Only) */}
          <div
            className="hidden xl:flex flex-col items-end flex-1 pr-6 select-none"
            aria-hidden="true"
          >
            <div className="max-w-[240px] text-right">
              <div className="h-1 w-12 ml-auto mb-4 rounded-full bg-gradient-to-r from-transparent via-[#8174C8] to-[#6366F1]" />
              <p className="text-[#8174C8] text-base lg:text-lg font-medium leading-relaxed tracking-tight">
                Your Data Drives A Brighter Tomorrow
              </p>
              <div className="mt-4 flex items-center justify-end gap-1.5 opacity-60">
                <span className="w-1.5 h-1.5 rounded-full bg-[#8174C8]" />
                <span className="w-6 h-0.5 rounded-full bg-gradient-to-l from-[#8174C8] to-transparent" />
              </div>
            </div>
          </div>

          {/* Centered Refined Card Column */}
          <div className="w-full max-w-[660px] mx-auto flex flex-col items-center">
            {/* Card Wrapper (Variant B — Premium Gradient) */}
            <div
              className="w-full rounded-[36px] p-[1.5px] shadow-[0_25px_60px_-15px_rgba(99,102,241,0.16),0_10px_25px_-10px_rgba(124,58,237,0.12)] transition-all duration-300"
              style={{
                background:
                  "linear-gradient(135deg, rgba(124, 58, 237, 0.45), rgba(99, 102, 241, 0.35), rgba(59, 130, 246, 0.45))",
              }}
            >
              <div className="relative bg-white rounded-[34.5px] p-6 sm:p-12 overflow-hidden shadow-2xl backdrop-blur-xl">
              {/* Luminous Card Top Edge Gradient Accent Line */}
              <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#7C3AED] via-[#6366F1] to-[#3B82F6]" />

              {/* Subtle Decorative Dot Grid Clusters in Corners (Approved Spec) */}
              <DotCluster
                color="#7C3AED"
                className="absolute top-5 left-5"
              />
              <DotCluster
                color="#3B82F6"
                className="absolute top-5 right-5"
              />
              <DotCluster
                color="#7C3AED"
                className="absolute bottom-5 left-5"
              />
              <DotCluster
                color="#6366F1"
                className="absolute bottom-5 right-5"
              />

              {/* Brand Lockup Inside Card */}
              <div className="flex items-center gap-3.5 mb-7 relative z-10">
                {/* Custom Brand Mark: Cloud & Database in Violet and Blue */}
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-violet-50 to-indigo-50 border border-indigo-100/80 flex items-center justify-center shadow-xs flex-shrink-0">
                  <div
                    className="relative w-8 h-8 flex items-center justify-center select-none"
                    aria-hidden="true"
                  >
                    <Cloud
                      className="w-6 h-6 text-[#7C3AED] absolute -top-0.5"
                      fill="#7C3AED"
                      fillOpacity={0.15}
                    />
                    <Database
                      className="w-5 h-5 text-[#3B82F6] absolute -bottom-0.5"
                      fill="#3B82F6"
                      fillOpacity={0.2}
                    />
                  </div>
                </div>
                <div className="flex flex-col">
                  <span className="text-2xl font-bold text-slate-900 tracking-tight">
                    GCDS
                  </span>
                  <span className="text-sm font-medium text-slate-500">
                    Gazi Customer Data Store
                  </span>
                </div>
              </div>

              {/* Welcome Heading Area */}
              <div className="mb-8 relative z-10">
                <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-1.5 bg-gradient-to-r from-[#7C3AED] via-[#6366F1] to-[#3B82F6] bg-clip-text text-transparent">
                  Welcome Back
                </h1>
                <p className="text-base sm:text-lg text-slate-500 font-normal">
                  Login to your account
                </p>
                {/* 110px Horizontal Gradient Bar */}
                <div className="w-[110px] h-1.5 mt-3.5 rounded-full bg-gradient-to-r from-[#7C3AED] via-[#6366F1] to-[#3B82F6]" />
              </div>

              {/* Auth Error Notification (Aria-live for accessibility) */}
              <div
                aria-live="polite"
                aria-atomic="true"
                className="relative z-10"
              >
                {authError && (
                  <div
                    role="alert"
                    className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-red-700 text-sm"
                  >
                    <span className="mt-0.5 text-red-500 font-bold" aria-hidden="true">
                      !
                    </span>
                    <span>{authError}</span>
                  </div>
                )}
              </div>

              {/* Form Controls */}
              <form
                onSubmit={handleSubmit(onSubmit)}
                className="space-y-6 relative z-10"
                noValidate
              >
                {/* Floating-Label Email Field (Height 60px) */}
                <div className="relative">
                  <div
                    className={`relative flex items-center h-[60px] w-full rounded-xl border bg-white px-4 transition-all duration-200 ${
                      errors.email
                        ? "border-red-400 ring-2 ring-red-100"
                        : "border-slate-300 hover:border-indigo-300 focus-within:border-[#6366F1] focus-within:ring-4 focus-within:ring-[#6366F1]/15"
                    }`}
                  >
                    <div className="flex items-center justify-center mr-3.5 text-[#7C3AED] flex-shrink-0">
                      <Mail className="w-5 h-5 text-[#7C3AED]" aria-hidden="true" />
                    </div>
                    <input
                      id="email-input"
                      {...register("email")}
                      type="email"
                      autoComplete="email"
                      placeholder=" "
                      aria-invalid={errors.email ? "true" : "false"}
                      aria-describedby={errors.email ? "email-error" : undefined}
                      className="peer w-full h-full bg-transparent border-0 p-0 text-slate-900 text-base focus:ring-0 focus:outline-none placeholder-transparent"
                    />
                    <label
                      htmlFor="email-input"
                      className={`absolute left-11 -top-2.5 px-2 bg-white text-xs font-semibold transition-all duration-150 pointer-events-none select-none peer-placeholder-shown:top-[18px] peer-placeholder-shown:left-12 peer-placeholder-shown:text-slate-400 peer-placeholder-shown:font-normal peer-placeholder-shown:text-base peer-focus:-top-2.5 peer-focus:left-11 peer-focus:text-xs peer-focus:font-semibold ${
                        errors.email
                          ? "text-red-500 peer-focus:text-red-500"
                          : "text-[#6366F1] peer-focus:text-[#6366F1]"
                      }`}
                    >
                      Enterprise Email Address
                    </label>
                  </div>
                  {errors.email && (
                    <p
                      id="email-error"
                      role="alert"
                      className="mt-1.5 pl-1 text-xs text-red-600 font-medium"
                    >
                      {errors.email.message}
                    </p>
                  )}
                </div>

                {/* Floating-Label Password Field (Height 60px) */}
                <div className="relative">
                  <div
                    className={`relative flex items-center h-[60px] w-full rounded-xl border bg-white px-4 transition-all duration-200 ${
                      errors.password
                        ? "border-red-400 ring-2 ring-red-100"
                        : "border-slate-300 hover:border-indigo-300 focus-within:border-[#6366F1] focus-within:ring-4 focus-within:ring-[#6366F1]/15"
                    }`}
                  >
                    <div className="flex items-center justify-center mr-3.5 text-[#7C3AED] flex-shrink-0">
                      <Lock className="w-5 h-5 text-[#7C3AED]" aria-hidden="true" />
                    </div>
                    <input
                      id="password-input"
                      {...register("password")}
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder=" "
                      aria-invalid={errors.password ? "true" : "false"}
                      aria-describedby={
                        errors.password ? "password-error" : undefined
                      }
                      className="peer w-full h-full bg-transparent border-0 p-0 text-slate-900 text-base focus:ring-0 focus:outline-none placeholder-transparent"
                    />
                    <label
                      htmlFor="password-input"
                      className={`absolute left-11 -top-2.5 px-2 bg-white text-xs font-semibold transition-all duration-150 pointer-events-none select-none peer-placeholder-shown:top-[18px] peer-placeholder-shown:left-12 peer-placeholder-shown:text-slate-400 peer-placeholder-shown:font-normal peer-placeholder-shown:text-base peer-focus:-top-2.5 peer-focus:left-11 peer-focus:text-xs peer-focus:font-semibold ${
                        errors.password
                          ? "text-red-500 peer-focus:text-red-500"
                          : "text-[#6366F1] peer-focus:text-[#6366F1]"
                      }`}
                    >
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      className="p-1.5 text-slate-400 hover:text-[#6366F1] transition-colors focus:outline-none cursor-pointer flex-shrink-0"
                    >
                      {showPassword ? (
                        <EyeOff className="w-5 h-5" aria-hidden="true" />
                      ) : (
                        <Eye className="w-5 h-5" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  {errors.password && (
                    <p
                      id="password-error"
                      role="alert"
                      className="mt-1.5 pl-1 text-xs text-red-600 font-medium"
                    >
                      {errors.password.message}
                    </p>
                  )}
                </div>

                {/* Display-Only Right-Aligned Forgot Password */}
                <div className="flex justify-end -mt-2">
                  <span
                    className="text-sm font-semibold text-[#6366F1] hover:text-[#4F46E5] hover:underline transition-colors cursor-default select-none"
                    title="Password reset is managed through your system administrator"
                    aria-disabled="true"
                  >
                    Forgot Password?
                  </span>
                </div>

                {/* Luminous Gradient Primary Button (Height 60-64px) */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-[60px] sm:h-[64px] rounded-xl text-white text-lg font-bold flex items-center justify-center gap-2 transition-all duration-200 motion-reduce:transition-none cursor-pointer active:scale-[0.99] motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-75 relative overflow-hidden"
                  style={{
                    background:
                      "linear-gradient(135deg, #7C3AED 0%, #6366F1 50%, #3B82F6 100%)",
                    boxShadow:
                      "0 12px 28px -6px rgba(99, 102, 241, 0.45), 0 4px 12px -2px rgba(124, 58, 237, 0.3)",
                  }}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                      <span>Signing in...</span>
                    </>
                  ) : (
                    <>
                      <span>Login</span>
                      <ArrowRight className="w-5 h-5 font-bold" aria-hidden="true" />
                    </>
                  )}
                </button>
              </form>

              {/* Minimal Enterprise Divider */}
              <div
                className="relative my-7 flex items-center justify-center"
                aria-hidden="true"
              >
                <div className="flex-grow h-px bg-gradient-to-r from-transparent via-slate-200 to-slate-300" />
                <span className="flex-shrink mx-4 text-xs font-semibold text-slate-400 tracking-wider select-none">
                  OR
                </span>
                <div className="flex-grow h-px bg-gradient-to-l from-transparent via-slate-200 to-slate-300" />
              </div>

              {/* Informational Card Footer */}
              <div className="text-center relative z-10">
                <p className="text-sm text-slate-600">
                  Don&apos;t have an account?{" "}
                  <span
                    className="text-[#6366F1] font-semibold hover:underline transition-colors cursor-default select-none"
                    title="Account registration is managed by your system administrator"
                    aria-disabled="true"
                  >
                    Contact your administrator
                  </span>
                </p>
              </div>
            </div>
          </div>

            {/* Subtle Page Note Below Card */}
            <p className="mt-8 text-center text-xs text-slate-400 select-none">
              &copy; 2026 Gazi Customer Data Store
            </p>
          </div>

          {/* Flanking Right Tagline (Desktop XL Only) */}
          <div
            className="hidden xl:flex flex-col items-start flex-1 pl-6 select-none"
            aria-hidden="true"
          >
            <div className="max-w-[240px] text-left">
              <div className="h-1 w-12 mr-auto mb-4 rounded-full bg-gradient-to-r from-[#6366F1] via-[#8174C8] to-transparent" />
              <p className="text-[#8174C8] text-base lg:text-lg font-medium leading-relaxed tracking-tight">
                Secure. Centralized. Smarter Insights.
              </p>
              <div className="mt-4 flex items-center justify-start gap-1.5 opacity-60">
                <span className="w-6 h-0.5 rounded-full bg-gradient-to-r from-[#8174C8] to-transparent" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#8174C8]" />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
