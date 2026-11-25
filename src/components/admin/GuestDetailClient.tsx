"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import {
  formatDietaryLabel,
  formatDuplicateStatusLabel,
  formatEatDate,
  formatEatDateTime,
  formatSourceLabel,
} from "@/lib/admin/format";
import { COUNTRY_OPTIONS } from "@/lib/rsvp/validation";
import type { AdminFieldErrors, AdminRsvpRecord } from "@/types/admin";
import type { AttendanceStatus } from "@/types/rsvp";

interface GuestDetailClientProps {
  initialRecord: AdminRsvpRecord;
}

export function GuestDetailClient({ initialRecord }: GuestDetailClientProps) {
  const router = useRouter();
  const [record, setRecord] = useState<AdminRsvpRecord>(initialRecord);
  const [editing, setEditing] = useState(false);

  // Edit form fields
  const [fullName, setFullName] = useState(record.fullName);
  const [phoneCountry, setPhoneCountry] = useState<string>(record.phoneCountry);
  const [phoneNumber, setPhoneNumber] = useState(record.phoneE164);
  const [attendance, setAttendance] = useState<AttendanceStatus>(
    record.attendance,
  );
  const [dietaryRequirements, setDietaryRequirements] = useState(
    record.dietaryRequirements ?? "",
  );
  const [congratulatoryMessage, setCongratulatoryMessage] = useState(
    record.congratulatoryMessage ?? "",
  );
  const [organizerNotes, setOrganizerNotes] = useState(
    record.organizerNotes ?? "",
  );

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<AdminFieldErrors>({});
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function startEditing() {
    setFullName(record.fullName);
    setPhoneCountry(record.phoneCountry);
    setPhoneNumber(record.phoneE164);
    setAttendance(record.attendance);
    setDietaryRequirements(record.dietaryRequirements ?? "");
    setCongratulatoryMessage(record.congratulatoryMessage ?? "");
    setOrganizerNotes(record.organizerNotes ?? "");
    setSaveError(null);
    setFieldErrors({});
    setSaveSuccess(null);
    setEditing(true);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    setFieldErrors({});
    setSaveSuccess(null);

    try {
      const res = await fetch(`/api/admin/rsvps/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          phoneCountry,
          phoneNumber,
          attendance,
          dietaryRequirements: attendance === "attending" ? dietaryRequirements : "",
          congratulatoryMessage,
          organizerNotes,
        }),
      });

      const payload = (await res.json().catch(() => null)) as
        | { ok: true; rsvp: AdminRsvpRecord }
        | { ok: false; message?: string; fieldErrors?: AdminFieldErrors }
        | null;

      if (!res.ok || !payload || !payload.ok) {
        setSaveError(
          (payload && "message" in payload && payload.message) ||
            "Unable to save changes.",
        );
        if (payload && "fieldErrors" in payload && payload.fieldErrors) {
          setFieldErrors(payload.fieldErrors);
        }
        return;
      }

      setRecord(payload.rsvp);
      setEditing(false);
      setSaveSuccess("Guest RSVP updated and saved to PostgreSQL.");
      router.refresh();
    } catch {
      setSaveError("Network error while saving changes.");
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmDelete() {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);

    try {
      const res = await fetch(`/api/admin/rsvps/${record.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmDelete: true }),
      });

      const payload = (await res.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
      } | null;

      if (!res.ok || !payload?.ok) {
        setDeleteError(payload?.message ?? "Unable to delete this RSVP.");
        setDeleteDialogOpen(false);
        return;
      }

      setDeleteDialogOpen(false);
      router.push("/admin/rsvps");
      router.refresh();
    } catch {
      setDeleteError("Network error while deleting this RSVP.");
      setDeleteDialogOpen(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col gap-3 border-b border-warm-sand pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Link
            href="/admin/rsvps"
            className="inline-flex min-h-[44px] items-center text-xs font-semibold uppercase tracking-[0.14em] text-forest-green/80 hover:underline"
          >
            ← Back to RSVP Management
          </Link>
          <h1 className="mt-1 break-words font-serif text-2xl font-semibold text-forest-green sm:text-3xl">
            {record.fullName}
          </h1>
          <p className="mt-1 text-sm text-forest-green/80">
            {record.phoneE164} ·{" "}
            <span className="font-semibold">
              {record.attendance === "attending" ? "Attending" : "Declining"}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {!editing && (
            <button
              type="button"
              onClick={startEditing}
              className="min-h-[44px] border border-forest-green bg-forest-green px-4 py-2 text-sm font-medium text-warm-ivory hover:bg-forest-green/90"
            >
              Edit Guest
            </button>
          )}
          <button
            type="button"
            onClick={() => setDeleteDialogOpen(true)}
            className="min-h-[44px] border border-[#7A271A]/45 bg-[#FDF3F2] px-4 py-2 text-sm font-medium text-[#7A271A] hover:bg-[#7A271A] hover:text-warm-ivory"
          >
            Delete RSVP
          </button>
        </div>
      </div>

      {saveSuccess && (
        <div
          role="status"
          className="border border-forest-green/35 bg-soft-sage/25 px-4 py-3 text-sm text-forest-green"
        >
          {saveSuccess}
        </div>
      )}

      {deleteError && (
        <div
          role="alert"
          className="border border-[#7A271A]/35 bg-[#FDF3F2] px-4 py-3 text-sm text-[#7A271A]"
        >
          {deleteError}
        </div>
      )}

      {editing ? (
        <form
          onSubmit={handleSave}
          className="space-y-5 border border-warm-sand bg-[#FCFBF7] p-5 sm:p-6"
          noValidate
        >
          <div className="border-b border-warm-sand pb-3">
            <h2 className="font-serif text-xl font-semibold text-forest-green">
              Edit Guest RSVP
            </h2>
            <p className="mt-1 text-xs text-forest-green/75">
              Updating preserves the original submission timestamp and refreshes
              all live reports.
            </p>
          </div>

          {saveError && (
            <div
              role="alert"
              className="border border-[#7A271A]/35 bg-[#FDF3F2] px-4 py-3 text-sm text-[#7A271A]"
            >
              {saveError}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label
                htmlFor="edit-full-name"
                className="block text-sm font-medium text-forest-green"
              >
                Full Name
              </label>
              <input
                id="edit-full-name"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-1 min-h-[44px] w-full border border-forest-green/25 bg-warm-ivory px-3 py-2 text-sm text-forest-green focus:border-forest-green focus:outline-none"
              />
              {fieldErrors.fullName && (
                <p className="mt-1 text-xs text-[#7A271A]">
                  {fieldErrors.fullName}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="edit-phone-country"
                className="block text-sm font-medium text-forest-green"
              >
                Country
              </label>
              <select
                id="edit-phone-country"
                value={phoneCountry}
                onChange={(e) => setPhoneCountry(e.target.value)}
                className="mt-1 min-h-[44px] w-full border border-forest-green/25 bg-warm-ivory px-3 py-2 text-sm text-forest-green focus:border-forest-green focus:outline-none"
              >
                {COUNTRY_OPTIONS.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="edit-phone-number"
                className="block text-sm font-medium text-forest-green"
              >
                Phone Number
              </label>
              <input
                id="edit-phone-number"
                type="tel"
                required
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="mt-1 min-h-[44px] w-full border border-forest-green/25 bg-warm-ivory px-3 py-2 text-sm text-forest-green focus:border-forest-green focus:outline-none"
              />
              {fieldErrors.phoneNumber && (
                <p className="mt-1 text-xs text-[#7A271A]">
                  {fieldErrors.phoneNumber}
                </p>
              )}
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="edit-attendance"
                className="block text-sm font-medium text-forest-green"
              >
                Attendance Status
              </label>
              <select
                id="edit-attendance"
                value={attendance}
                onChange={(e) =>
                  setAttendance(e.target.value as AttendanceStatus)
                }
                className="mt-1 min-h-[44px] w-full border border-forest-green/25 bg-warm-ivory px-3 py-2 text-sm text-forest-green focus:border-forest-green focus:outline-none"
              >
                <option value="attending">Attending</option>
                <option value="declining">Declining</option>
              </select>
              {fieldErrors.attendance && (
                <p className="mt-1 text-xs text-[#7A271A]">
                  {fieldErrors.attendance}
                </p>
              )}
            </div>

            {attendance === "attending" && (
              <div className="sm:col-span-2">
                <label
                  htmlFor="edit-dietary"
                  className="block text-sm font-medium text-forest-green"
                >
                  Dietary Requirements (Optional, max 250 characters)
                </label>
                <input
                  id="edit-dietary"
                  type="text"
                  maxLength={250}
                  value={dietaryRequirements}
                  onChange={(e) => setDietaryRequirements(e.target.value)}
                  placeholder="Leave blank if no dietary information supplied"
                  className="mt-1 min-h-[44px] w-full border border-forest-green/25 bg-warm-ivory px-3 py-2 text-sm text-forest-green focus:border-forest-green focus:outline-none"
                />
                {fieldErrors.dietaryRequirements && (
                  <p className="mt-1 text-xs text-[#7A271A]">
                    {fieldErrors.dietaryRequirements}
                  </p>
                )}
              </div>
            )}

            <div className="sm:col-span-2">
              <label
                htmlFor="edit-message"
                className="block text-sm font-medium text-forest-green"
              >
                Congratulatory Message (Optional, max 500 characters)
              </label>
              <textarea
                id="edit-message"
                rows={4}
                maxLength={500}
                value={congratulatoryMessage}
                onChange={(e) => setCongratulatoryMessage(e.target.value)}
                className="mt-1 w-full border border-forest-green/25 bg-warm-ivory px-3 py-2 text-sm text-forest-green focus:border-forest-green focus:outline-none"
              />
              {fieldErrors.congratulatoryMessage && (
                <p className="mt-1 text-xs text-[#7A271A]">
                  {fieldErrors.congratulatoryMessage}
                </p>
              )}
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="edit-organizer-notes"
                className="block text-sm font-medium text-forest-green"
              >
                Organizer Notes (Internal Only, max 500 characters)
              </label>
              <textarea
                id="edit-organizer-notes"
                rows={3}
                maxLength={500}
                value={organizerNotes}
                onChange={(e) => setOrganizerNotes(e.target.value)}
                placeholder="Internal notes visible only to event administrators"
                className="mt-1 w-full border border-forest-green/25 bg-warm-ivory px-3 py-2 text-sm text-forest-green focus:border-forest-green focus:outline-none"
              />
              {fieldErrors.organizerNotes && (
                <p className="mt-1 text-xs text-[#7A271A]">
                  {fieldErrors.organizerNotes}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-3 border-t border-warm-sand pt-4">
            <button
              type="button"
              disabled={saving}
              onClick={() => setEditing(false)}
              className="min-h-[44px] border border-forest-green/30 bg-warm-ivory px-4 py-2 text-sm font-medium text-forest-green hover:bg-warm-sand/60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[44px] bg-forest-green px-5 py-2 text-sm font-medium text-warm-ivory hover:bg-forest-green/90 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Primary Guest Details */}
          <section className="space-y-5 border border-warm-sand bg-[#FCFBF7] p-5 lg:col-span-2">
            <h2 className="border-b border-warm-sand pb-3 font-serif text-lg font-semibold text-forest-green">
              Guest Response Details
            </h2>

            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-forest-green/70">
                  Full Name
                </dt>
                <dd className="mt-1 text-sm font-medium text-forest-green">
                  {record.fullName}
                </dd>
              </div>

              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-forest-green/70">
                  Phone Number
                </dt>
                <dd className="mt-1 font-mono text-sm text-forest-green">
                  {record.phoneE164} ({record.phoneCountry})
                </dd>
              </div>

              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-forest-green/70">
                  Attendance Status
                </dt>
                <dd className="mt-1">
                  <span
                    className={`inline-flex items-center border px-2.5 py-0.5 text-xs font-semibold ${
                      record.attendance === "attending"
                        ? "border-forest-green/35 bg-soft-sage/25 text-forest-green"
                        : "border-champagne-gold/70 bg-warm-sand/55 text-forest-green"
                    }`}
                  >
                    {record.attendance === "attending"
                      ? "Attending"
                      : "Declining"}
                  </span>
                </dd>
              </div>

              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-forest-green/70">
                  Dietary Requirements
                </dt>
                <dd className="mt-1 break-words text-sm text-forest-green">
                  {record.attendance === "declining"
                    ? "Not applicable (Declining)"
                    : formatDietaryLabel(record.dietaryRequirements)}
                </dd>
              </div>
            </dl>

            <div className="border-t border-warm-sand pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-forest-green/70">
                Congratulatory Message
              </h3>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-forest-green">
                {record.congratulatoryMessage ||
                  "No congratulatory message left."}
              </p>
            </div>

            <div className="border-t border-warm-sand pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-forest-green/70">
                Internal Organizer Notes
              </h3>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-forest-green/90">
                {record.organizerNotes || "No internal notes recorded."}
              </p>
            </div>
          </section>

          {/* Metadata Card */}
          <aside className="space-y-4 border border-warm-sand bg-[#FCFBF7] p-5">
            <h2 className="border-b border-warm-sand pb-3 font-serif text-lg font-semibold text-forest-green">
              Record Metadata
            </h2>

            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-forest-green/70">
                  Record Identifier
                </dt>
                <dd className="mt-0.5 break-all font-mono text-xs text-forest-green">
                  {record.id}
                </dd>
              </div>

              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-forest-green/70">
                  RSVP Source
                </dt>
                <dd className="mt-0.5 text-forest-green">
                  {formatSourceLabel(record.submissionSource)}
                </dd>
              </div>

              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-forest-green/70">
                  Duplicate Status
                </dt>
                <dd className="mt-0.5 text-forest-green">
                  {formatDuplicateStatusLabel(record.duplicateReviewStatus)}
                </dd>
              </div>

              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-forest-green/70">
                  Management Access
                </dt>
                <dd className="mt-0.5 text-forest-green">
                  {record.duplicateReviewStatus === "merged_archived"
                    ? "Inactive (Archived duplicate)"
                    : "Active (Personal token protected)"}
                </dd>
              </div>

              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-forest-green/70">
                  Date Submitted (EAT)
                </dt>
                <dd className="mt-0.5 text-forest-green">
                  {formatEatDateTime(record.createdAt)}
                </dd>
              </div>

              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-forest-green/70">
                  Last Updated (EAT)
                </dt>
                <dd className="mt-0.5 text-forest-green">
                  {formatEatDateTime(record.updatedAt)}
                </dd>
              </div>

              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-forest-green/70">
                  Retention Anonymization Date
                </dt>
                <dd className="mt-0.5 text-forest-green">
                  {formatEatDate(record.retentionExpiresAt)}
                </dd>
              </div>
            </dl>
          </aside>
        </div>
      )}

      <ConfirmDialog
        open={deleteDialogOpen}
        title="Delete RSVP Record?"
        description={`Are you sure you want to permanently delete the RSVP for "${record.fullName}"? This cannot be undone and will immediately update dashboard totals and reports.`}
        confirmLabel="Confirm Delete"
        cancelLabel="Cancel"
        destructive
        busy={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteDialogOpen(false)}
      />
    </div>
  );
}
