import { getBusinessSettings, getTeamMembers } from "./actions";
import { SettingsTabsView } from "@/components/settings/SettingsTabsView";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Shop Settings — GCDS",
  description: "Shop identity, UPI billing details, team roles, and data export archives",
};

export default async function SettingsPage() {
  const [settings, teamMembers] = await Promise.all([
    getBusinessSettings(),
    getTeamMembers(),
  ]);

  return <SettingsTabsView initialSettings={settings} teamMembers={teamMembers} />;
}
