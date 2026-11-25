import { AdminSettingsClient } from "@/components/admin/AdminSettingsClient";
import {
  ADMIN_LOCKED_EVENT_DETAILS,
  getEffectiveRsvpPolicy,
  getEventSettingsState,
  getSafeSystemHealth,
} from "@/lib/admin/settings";
import { getRetentionSummary } from "@/lib/rsvp/retention";
import type { AdminSettingsResponse } from "@/types/admin";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const [settings, effectivePolicy, retentionSummary, systemHealth] =
    await Promise.all([
      getEventSettingsState(),
      getEffectiveRsvpPolicy(),
      getRetentionSummary(),
      getSafeSystemHealth(),
    ]);

  const initialData: AdminSettingsResponse = {
    ok: true,
    eventDetails: ADMIN_LOCKED_EVENT_DETAILS,
    settings,
    effectivePolicy,
    retentionSummary,
    systemHealth,
  };

  return <AdminSettingsClient initialData={initialData} />;
}
