import { SettingsTabsView } from "@/components/settings/SettingsTabsView";

export const metadata = {
  title: "Shop Settings — GCDS",
  description: "Shop identity, UPI billing details, team roles, and data export archives",
};

export default function SettingsPage() {
  return <SettingsTabsView />;
}
