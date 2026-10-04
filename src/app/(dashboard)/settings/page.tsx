import { Suspense } from "react";
import { SettingsTabsView } from "@/components/settings/SettingsTabsView";

export const metadata = {
  title: "Shop Settings — GCDS",
  description: "Shop identity, UPI billing details, team roles, and data export archives",
};

interface SettingsPageProps {
  searchParams?: Promise<{ tab?: string }>;
}

export default async function SettingsPage(props: SettingsPageProps) {
  const searchParams = props.searchParams ? await props.searchParams : undefined;
  const tab = searchParams?.tab?.toLowerCase();
  const initialTab =
    tab === "integrations" || tab === "extension" || tab === "form-filler" || tab === "form-filler-extension"
      ? ("integrations" as const)
      : undefined;

  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-slate-400">Loading settings...</div>}>
      <SettingsTabsView initialTab={initialTab} />
    </Suspense>
  );
}

