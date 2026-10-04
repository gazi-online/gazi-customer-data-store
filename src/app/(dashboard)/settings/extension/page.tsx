import { Suspense } from "react";
import { SettingsTabsView } from "@/components/settings/SettingsTabsView";

export const metadata = {
  title: "Form Filler Extension — Shop Settings — GCDS",
  description: "Configure browser extension pairing tokens and connected devices",
};

export default function ExtensionSettingsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-slate-400">Loading extension settings...</div>}>
      <SettingsTabsView initialTab="integrations" />
    </Suspense>
  );
}
