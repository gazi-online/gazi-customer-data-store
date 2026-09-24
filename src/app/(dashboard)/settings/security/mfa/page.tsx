import { MfaEnrollmentView } from "@/components/settings/MfaEnrollmentView";

export const metadata = {
  title: "Two-Step Verification — GCDS Settings",
  description: "Set up authenticator app two-step verification for your GCDS account",
};

export default function MfaEnrollmentPage() {
  return <MfaEnrollmentView />;
}
