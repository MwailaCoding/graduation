"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { COUNTRY_OPTIONS, DEFAULT_PHONE_COUNTRY } from "@/lib/rsvp/validation";
import type { AdminFieldErrors, AdminRsvpRecord } from "@/types/admin";
import type { AttendanceStatus } from "@/types/rsvp";

export function ManualRsvpForm() {
  const [fullName, setFullName] = useState("");
  const [phoneCountry, setPhoneCountry] = useState<string>(
    DEFAULT_PHONE_COUNTRY,
  );
  const [phoneNumber, setPhoneNumber] = useState("");
  const [attendance, setAttendance] = useState<AttendanceStatus>("attending");
  const [dietaryRequirements, setDietaryRequirements] = useState("");
  const [congratulatoryMessage, setCongratulatoryMessage] = useState("");
  const [organizerNotes, setOrganizerNotes] = useState("");
  const [sharedPhoneResolution, setSharedPhoneResolution] = useState<
    "none" | "flag_duplicate" | "resolved_distinct"
  >("none");
  const [needsSharedPhoneDecision, setNeedsSharedPhoneDecision] =
    useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<AdminFieldErrors>({});
  const [createdRecord, setCreatedRecord] = useState<AdminRsvpRecord | null>(
    null,
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    try {
      const res = await fetch("/api/admin/rsvps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          phoneCountry,
          phoneNumber,
          attendance,
          dietaryRequirements:
            attendance === "attending" ? dietaryRequirements : "",
          congratulatoryMessage,
          organizerNotes,
          sharedPhoneResolution,
        }),
      });

      const payload = (await res.json().catch(() => null)) as
        | { ok: true; rsvp: AdminRsvpRecord }
        | {
            ok: false;
            code?: string;
            message?: string;
            fieldErrors?: AdminFieldErrors;
          }
        | null;

      if (!res.ok || !payload || !payload.ok) {
        setError(
          (payload && "message" in payload && payload.message) ||
            "Please check the form fields and try again.",
        );
        if (payload && "fieldErrors" in payload && payload.fieldErrors) {
          setFieldErrors(payload.fieldErrors);
        }
        if (res.status === 409) {
          setNeedsSharedPhoneDecision(true);
        }
        return;
      }

      setCreatedRecord(payload.rsvp);
      setNeedsSharedPhoneDecision(false);
      setSharedPhoneResolution("none");
    } catch {
      setError("Network error while creating the RSVP.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setFullName("");
    setPhoneCountry(DEFAULT_PHONE_COUNTRY);
    setPhoneNumber("");
    setAttendance("attending");
    setDietaryRequirements("");
    setCongratulatoryMessage("");
    setOrganizerNotes("");
    setSharedPhoneResolution("none");
    setNeedsSharedPhoneDecision(false);
    setError(null);
    setFieldErrors({});
    setCreatedRecord(null);
  }

  if (createdRecord) {
    return (
      <div className="space-y-5 border border-warm-sand bg-[#FCFBF7] p-6">
        <div
          role="status"
          className="border border-forest-green/35 bg-soft-sage/25 px-4 py-3 text-sm text-forest-green"
        >
          Manual RSVP created for <strong>{createdRecord.fullName}</strong> (
          {createdRecord.phoneE164}). Dashboard totals and reports are updated.
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={`/admin/guests/${createdRecord.id}`}
            className="inline-flex min-h-[44px] items-center bg-forest-green px-4 py-2 text-sm font-medium text-warm-ivory hover:bg-forest-green/90"
          >
            Open Guest Record
          </Link>
          <button
            type="button"
            onClick={handleReset}
            className="min-h-[44px] border border-forest-green/35 bg-warm-ivory px-4 py-2 text-sm font-medium text-forest-green hover:bg-warm-sand/60"
          >
            Add Another RSVP
          </button>
          <Link
            href="/admin/rsvps"
            className="inline-flex min-h-[44px] items-center border border-forest-green/35 bg-warm-ivory px-4 py-2 text-sm font-medium text-forest-green hover:bg-warm-sand/60"
          >
            Return to RSVP List
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 border border-warm-sand bg-[#FCFBF7] p-5 sm:p-6"
      noValidate
    >
      {error && (
        <div
          role="alert"
          className="border border-[#7A271A]/35 bg-[#FDF3F2] px-4 py-3 text-sm text-[#7A271A]"
        >
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label
            htmlFor="manual-full-name"
            className="block text-sm font-medium text-forest-green"
          >
            Full Name
          </label>
          <input
            id="manual-full-name"
            name="fullName"
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="e.g. Grace Wanjiku"
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
            htmlFor="manual-phone-country"
            className="block text-sm font-medium text-forest-green"
          >
            Country
          </label>
          <select
            id="manual-phone-country"
            name="phoneCountry"
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
            htmlFor="manual-phone-number"
            className="block text-sm font-medium text-forest-green"
          >
            Phone Number
          </label>
          <input
            id="manual-phone-number"
            name="phoneNumber"
            type="tel"
            required
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="0712 345 678"
            className="mt-1 min-h-[44px] w-full border border-forest-green/25 bg-warm-ivory px-3 py-2 text-sm text-forest-green focus:border-forest-green focus:outline-none"
          />
          {fieldErrors.phoneNumber && (
            <p className="mt-1 text-xs text-[#7A271A]">
              {fieldErrors.phoneNumber}
            </p>
          )}
        </div>

        {needsSharedPhoneDecision && (
          <div className="border border-champagne-gold bg-champagne-gold/15 p-4 sm:col-span-2">
            <label
              htmlFor="manual-shared-phone"
              className="block text-sm font-semibold text-forest-green"
            >
              Shared Phone Number Handling
            </label>
            <p className="mt-1 text-xs text-forest-green/85">
              Another RSVP already uses this phone number. Choose how to record
              this entry:
            </p>
            <select
              id="manual-shared-phone"
              value={sharedPhoneResolution}
              onChange={(e) =>
                setSharedPhoneResolution(
                  e.target.value as
                    | "none"
                    | "flag_duplicate"
                    | "resolved_distinct",
                )
              }
              className="mt-2 min-h-[44px] w-full border border-forest-green/30 bg-warm-ivory px-3 py-2 text-sm text-forest-green"
            >
              <option value="none">Block duplicate (change phone number)</option>
              <option value="flag_duplicate">
                Save and flag for side-by-side duplicate review
              </option>
              <option value="resolved_distinct">
                Save as distinct guest sharing household phone
              </option>
            </select>
          </div>
        )}

        <div className="sm:col-span-2">
          <label
            htmlFor="manual-attendance"
            className="block text-sm font-medium text-forest-green"
          >
            Attendance Status
          </label>
          <select
            id="manual-attendance"
            name="attendance"
            value={attendance}
            onChange={(e) => setAttendance(e.target.value as AttendanceStatus)}
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
              htmlFor="manual-dietary"
              className="block text-sm font-medium text-forest-green"
            >
              Dietary Requirements (Optional, max 250 characters)
            </label>
            <input
              id="manual-dietary"
              name="dietaryRequirements"
              type="text"
              maxLength={250}
              value={dietaryRequirements}
              onChange={(e) => setDietaryRequirements(e.target.value)}
              placeholder="e.g. Vegetarian, nut allergy (leave blank if none supplied)"
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
            htmlFor="manual-message"
            className="block text-sm font-medium text-forest-green"
          >
            Congratulatory Message (Optional, max 500 characters)
          </label>
          <textarea
            id="manual-message"
            name="congratulatoryMessage"
            rows={4}
            maxLength={500}
            value={congratulatoryMessage}
            onChange={(e) => setCongratulatoryMessage(e.target.value)}
            placeholder="Optional message relayed by the guest"
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
            htmlFor="manual-organizer-notes"
            className="block text-sm font-medium text-forest-green"
          >
            Organizer Notes (Internal Only, max 500 characters)
          </label>
          <textarea
            id="manual-organizer-notes"
            name="organizerNotes"
            rows={3}
            maxLength={500}
            value={organizerNotes}
            onChange={(e) => setOrganizerNotes(e.target.value)}
            placeholder="e.g. Confirmed via WhatsApp or phone call"
            className="mt-1 w-full border border-forest-green/25 bg-warm-ivory px-3 py-2 text-sm text-forest-green focus:border-forest-green focus:outline-none"
          />
          {fieldErrors.organizerNotes && (
            <p className="mt-1 text-xs text-[#7A271A]">
              {fieldErrors.organizerNotes}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-warm-sand pt-4">
        <p className="text-xs text-forest-green/75">
          Recorded internally with source <strong>Admin Manual</strong> using
          the same validation and PostgreSQL table as website RSVPs.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/rsvps"
            className="inline-flex min-h-[44px] items-center border border-forest-green/30 bg-warm-ivory px-4 py-2 text-sm font-medium text-forest-green hover:bg-warm-sand/60"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="min-h-[44px] bg-forest-green px-5 py-2 text-sm font-medium text-warm-ivory hover:bg-forest-green/90 disabled:opacity-60"
          >
            {submitting ? "Creating..." : "Create Manual RSVP"}
          </button>
        </div>
      </div>
    </form>
  );
}
