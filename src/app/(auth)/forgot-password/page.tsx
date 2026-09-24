import { ForgotPasswordView } from "@/components/auth/ForgotPasswordView";

export const dynamic = "force-dynamic";

interface ForgotPasswordPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function ForgotPasswordPage({
  searchParams,
}: ForgotPasswordPageProps) {
  const resolvedParams = await searchParams;
  return <ForgotPasswordView initialError={resolvedParams?.error} />;
}
