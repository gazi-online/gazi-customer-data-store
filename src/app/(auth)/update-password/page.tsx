import { createClient } from "@/lib/supabase/server";
import { UpdatePasswordView } from "@/components/auth/UpdatePasswordView";
import { hasRecoveryAuthorization } from "@/lib/auth/recoverySession";

export const dynamic = "force-dynamic";

export default async function UpdatePasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isRecoveryAuthorized = await hasRecoveryAuthorization();
  const hasValidSession = Boolean(user && isRecoveryAuthorized);

  return <UpdatePasswordView hasValidSession={hasValidSession} />;
}
