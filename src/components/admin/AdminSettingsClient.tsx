"use client";

import { useState, type FormEvent } from "react";
import { formatEatDateTime } from "@/lib/admin/format";
import type { AdminSettingsResponse } from "@/types/admin";

interface AdminSettingsClientProps {
  initialData: AdminSettingsResponse;
}

export function AdminSettingsClient({ initialData }: AdminSettingsClientProps) {
  const [data, setData] = useState<AdminSettingsResponse>(initialData);
  const [rsvpAccepting, setRsvpAccepting] = useState(
    initialData.settings.rsvpAcceptingResponses,
  );
  const [allowSelfEdit, setAllowSelfEdit] = useState(
    initialData.settings.allowGuestSelfEditing,
  );
  const [overrideReason, setOverrideReason] = useState(
    initialData.settings.manualOverrideReason ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [runningRetention, setRunningRetention] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSavePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rsvpAcceptingResponses: rsvpAccepting,
          allowGuestSelfEditing: allowSelfEdit,
          manualOverrideReason: overrideReason.trim() || null,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | AdminSettingsResponse
        | { ok: false; message?: string }
        | null;

      if (!res.ok || !json || !json.ok) {
        setErrorMessage(
          (json && "message" in json && json.message) ||
            "Unable to save RSVP policy settings.",
        );
        return;
      }

      setData(json);
      setStatusMessage("RSVP policy settings saved and logged.");
    } catch {
      setErrorMessage("Network error while updating settings.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRunRetentionCheck() {
    if (runningRetention) return;
    setRunningRetention(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_retention" }),
      });
      const json = (await res.json().catch(() => null)) as
        | AdminSettingsResponse
        | { ok: false; message?: string }
        | null;

      if (!res.ok || !json || !json.ok) {
        setErrorMessage(
          (json && "message" in json && json.message) ||
            "Unable to run retention check.",
        );
        return;
      }

      setData(json);
      const count = json.retentionRunResult?.anonymizedCount ?? 0;
      setStatusMessage(
        `Retention check completed (${count} expired record${count === 1 ? "" : "s"} anonymized).`,
      );
    } catch {
      setErrorMessage("Network error while running retention check.");
    } finally {
      setRunningRetention(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-warm-sand pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-forest-green/75">
          Configuration &amp; Governance
        </p>
        <h1 className="mt-1 font-serif text-2xl font-semibold text-forest-green sm:text-3xl">
          Settings
        </h1>
        <p className="mt-1 text-sm text-forest-green/80">
          Authoritative event information, RSVP submission policy, data
          retention visibility, and safe system health.
        </p>
      </div>

      {statusMessage && (
        <div
          role="status"
          className="border border-forest-green/35 bg-soft-sage/25 px-4 py-3 text-sm text-forest-green"
        >
          {statusMessage}
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="border border-[#7A271A]/35 bg-[#FDF3F2] px-4 py-3 text-sm text-[#7A271A]"
        >
          {errorMessage}
        </div>
      )}

      {/* 1. Locked Event Details */}
      <section className="border border-warm-sand bg-[#FCFBF7] p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-warm-sand pb-3">
          <h2 className="font-serif text-xl font-semibold text-forest-green">
            Event Information (Locked for V1)
          </h2>
          <span className="border border-forest-green/25 bg-warm-ivory px-2.5 py-0.5 text-xs font-medium text-forest-green">
            Read-only
          </span>
        </div>

        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          {data.eventDetails.graduates.map((grad) => (
            <div
              key={grad.name}
              className="border border-warm-sand bg-warm-ivory/60 p-3.5"
            >
              <dt className="text-xs font-semibold uppercase tracking-wider text-forest-green/75">
                Graduate
              </dt>
              <dd className="mt-1 font-serif text-base font-semibold text-forest-green">
                {grad.name}
              </dd>
              <dd className="mt-0.5 text-xs text-forest-green/80">
                {grad.degree}
              </dd>
            </div>
          ))}

          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-forest-green/75">
              Event Date
            </dt>
            <dd className="mt-1 text-sm font-medium text-forest-green">
              {data.eventDetails.dateLabel}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-forest-green/75">
              Event Time
            </dt>
            <dd className="mt-1 text-sm font-medium text-forest-green">
              {data.eventDetails.timeLabel}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-forest-green/75">
              Venue
            </dt>
            <dd className="mt-1 text-sm font-medium text-forest-green">
              {data.eventDetails.venueName}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-forest-green/75">
              Authoritative Timezone
            </dt>
            <dd className="mt-1 text-sm font-medium text-forest-green">
              {data.eventDetails.timezoneLabel}
            </dd>
          </div>
        </dl>
      </section>

      {/* 2. RSVP Closure & Self-Editing Policy */}
      <form
        onSubmit={handleSavePolicy}
        className="space-y-4 border border-warm-sand bg-[#FCFBF7] p-5"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-warm-sand pb-3">
          <h2 className="font-serif text-xl font-semibold text-forest-green">
            RSVP Submission &amp; Editing Settings
          </h2>
          <span
            className={`border px-2.5 py-0.5 text-xs font-semibold ${
              data.effectivePolicy.isClosed
                ? "border-[#7A271A]/40 bg-[#FDF3F2] text-[#7A271A]"
                : "border-forest-green/35 bg-soft-sage/25 text-forest-green"
            }`}
          >
            Effective Status:{" "}
            {data.effectivePolicy.isClosed ? "Closed" : "Accepting RSVPs"}
          </span>
        </div>

        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-forest-green/75">
              RSVP Closure &amp; Editing Deadline
            </dt>
            <dd className="mt-1 font-medium text-forest-green">
              {data.eventDetails.closureDeadlineLabel}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-forest-green/75">
              Guest Self-Editing Status
            </dt>
            <dd className="mt-1 font-medium text-forest-green">
              {data.effectivePolicy.isSelfEditingAllowed
                ? "Enabled until deadline"
                : "Paused / Closed"}
            </dd>
          </div>
        </dl>

        <div className="space-y-3 border-t border-warm-sand pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border border-warm-sand bg-warm-ivory/60 px-4 py-3">
            <span
              id="toggle-rsvp-accepting-label"
              className="text-sm font-medium text-forest-green"
            >
              Accept public website RSVP submissions before deadline
            </span>
            <button
              type="button"
              role="switch"
              aria-labelledby="toggle-rsvp-accepting-label"
              aria-checked={rsvpAccepting}
              onClick={() => setRsvpAccepting((prev) => !prev)}
              className={`min-h-[44px] min-w-[84px] border px-3 py-2 text-xs font-semibold transition-colors ${
                rsvpAccepting
                  ? "border-forest-green bg-forest-green text-warm-ivory"
                  : "border-forest-green/35 bg-warm-ivory text-forest-green"
              }`}
            >
              {rsvpAccepting ? "Enabled" : "Paused"}
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border border-warm-sand bg-warm-ivory/60 px-4 py-3">
            <span
              id="toggle-self-edit-label"
              className="text-sm font-medium text-forest-green"
            >
              Allow guests to edit their own RSVP via personal management link
            </span>
            <button
              type="button"
              role="switch"
              aria-labelledby="toggle-self-edit-label"
              aria-checked={allowSelfEdit}
              onClick={() => setAllowSelfEdit((prev) => !prev)}
              className={`min-h-[44px] min-w-[84px] border px-3 py-2 text-xs font-semibold transition-colors ${
                allowSelfEdit
                  ? "border-forest-green bg-forest-green text-warm-ivory"
                  : "border-forest-green/35 bg-warm-ivory text-forest-green"
              }`}
            >
              {allowSelfEdit ? "Enabled" : "Disabled"}
            </button>
          </div>

          <div>
            <label
              htmlFor="settings-override-reason"
              className="block text-xs font-semibold uppercase tracking-wider text-forest-green/80"
            >
              Manual Override Note (Optional, internal)
            </label>
            <input
              id="settings-override-reason"
              type="text"
              maxLength={250}
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="e.g. Paused temporarily for catering final count"
              className="mt-1 min-h-[44px] w-full border border-forest-green/25 bg-warm-ivory px-3 py-2 text-sm text-forest-green"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="min-h-[44px] bg-forest-green px-5 py-2 text-sm font-medium text-warm-ivory hover:bg-forest-green/90 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Policy Settings"}
          </button>
        </div>
      </form>

      {/* 3. Data Retention & Privacy Policy */}
      <section className="space-y-4 border border-warm-sand bg-[#FCFBF7] p-5">
        <div className="border-b border-warm-sand pb-3">
          <h2 className="font-serif text-xl font-semibold text-forest-green">
            Data Retention &amp; Privacy Protection
          </h2>
          <p className="mt-1 text-xs text-forest-green/75">
            Privacy protections cannot be disabled from the dashboard.
          </p>
        </div>

        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-forest-green/75">
              Personal Data Retention
            </dt>
            <dd className="mt-1 font-medium text-forest-green">
              {data.eventDetails.retentionPeriodDays} days after event (
              {data.eventDetails.retentionDateLabel})
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-forest-green/75">
              Backup Retention
            </dt>
            <dd className="mt-1 font-medium text-forest-green">
              {data.eventDetails.backupRetentionDays} days maximum
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-forest-green/75">
              Anonymization Policy
            </dt>
            <dd className="mt-1 font-medium text-forest-green">
              Irreversible PII removal; aggregate counts preserved
            </dd>
          </div>
        </dl>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-warm-sand pt-4 text-xs text-forest-green/85">
          <div>
            <p>
              Active records: <strong>{data.retentionSummary.activeRecordCount}</strong>{" "}
              · Anonymized:{" "}
              <strong>{data.retentionSummary.anonymizedRecordCount}</strong> · Due
              now:{" "}
              <strong>
                {data.retentionSummary.dueForAnonymizationCount}
              </strong>
            </p>
            <p className="mt-1">
              Last retention job:{" "}
              {data.retentionSummary.lastRun
                ? `${formatEatDateTime(data.retentionSummary.lastRun.ranAt)} EAT (${data.retentionSummary.lastRun.status}, ${data.retentionSummary.lastRun.recordsAnonymized} anonymized)`
                : "Not yet executed"}
            </p>
          </div>
          <button
            type="button"
            disabled={runningRetention}
            onClick={() => void handleRunRetentionCheck()}
            className="min-h-[44px] border border-forest-green/35 bg-warm-ivory px-4 py-2 text-xs font-semibold text-forest-green hover:bg-warm-sand/60 disabled:opacity-60"
          >
            {runningRetention ? "Checking..." : "Run Safe Retention Check"}
          </button>
        </div>
      </section>

      {/* 4. Safe System Health */}
      <section className="border border-warm-sand bg-[#FCFBF7] p-5">
        <h2 className="border-b border-warm-sand pb-3 font-serif text-xl font-semibold text-forest-green">
          System Health
        </h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-forest-green/75">
              PostgreSQL Database
            </dt>
            <dd className="mt-1 font-medium text-forest-green">
              {data.systemHealth.dbConnected ? "Connected" : "Unavailable"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-forest-green/75">
              Application Version
            </dt>
            <dd className="mt-1 font-mono text-xs text-forest-green">
              v{data.systemHealth.appVersion}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-forest-green/75">
              Runtime Mode
            </dt>
            <dd className="mt-1 text-forest-green">
              {data.systemHealth.nodeEnv}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-forest-green/75">
              Server Time (EAT)
            </dt>
            <dd className="mt-1 text-forest-green">
              {formatEatDateTime(data.systemHealth.serverTimeIso)}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
