"use client";

import type { CountryCode } from "libphonenumber-js";
import { useRef, type KeyboardEvent } from "react";
import { PRIVACY_NOTICE_COPY, RSVP_LIMITS } from "@/lib/event-config";
import { COUNTRY_OPTIONS } from "@/lib/rsvp/validation";
import type { AttendanceStatus, RsvpFieldErrors } from "@/types/rsvp";

export interface RsvpFormValues {
  fullName: string;
  phoneCountry: CountryCode;
  phoneNumber: string;
  attendance: AttendanceStatus | "";
  dietaryRequirements: string;
  congratulatoryMessage: string;
  privacyAcknowledged: boolean;
  honeypot: string;
}

export interface RsvpFormFieldsProps {
  mode: "create" | "edit";
  idPrefix: string;
  values: RsvpFormValues;
  fieldErrors: RsvpFieldErrors;
  disabled?: boolean;
  onChange: <K extends keyof RsvpFormValues>(
    field: K,
    value: RsvpFormValues[K],
  ) => void;
  onClearFieldError?: (field: keyof RsvpFieldErrors) => void;
}

const ATTENDANCE_OPTIONS: readonly {
  value: AttendanceStatus;
  title: string;
  subtitle: string;
}[] = [
  {
    value: "attending",
    title: "Attending",
    subtitle: "Joyfully accepts",
  },
  {
    value: "declining",
    title: "Declining",
    subtitle: "Regretfully declines",
  },
] as const;

function getRemainingAnnouncement(
  label: string,
  remaining: number,
  max: number,
): string {
  if (remaining <= 0) {
    return `${label}: character limit of ${max} reached.`;
  }
  if (remaining <= 30) {
    return `${label}: ${remaining} characters remaining.`;
  }
  return "";
}

/**
 * Shared accessible RSVP form fields supporting initial submission and personal RSVP updates.
 */
export function RsvpFormFields({
  mode,
  idPrefix,
  values,
  fieldErrors,
  disabled = false,
  onChange,
  onClearFieldError,
}: RsvpFormFieldsProps) {
  const attendingRadioRef = useRef<HTMLButtonElement>(null);
  const decliningRadioRef = useRef<HTMLButtonElement>(null);

  const fullNameId = `${idPrefix}-full-name`;
  const fullNameErrorId = `${idPrefix}-full-name-error`;
  const phoneCountryId = `${idPrefix}-phone-country`;
  const phoneNumberId = `${idPrefix}-phone-number`;
  const phoneHintId = `${idPrefix}-phone-hint`;
  const phoneErrorId = `${idPrefix}-phone-error`;
  const attendanceLabelId = `${idPrefix}-attendance-label`;
  const attendanceErrorId = `${idPrefix}-attendance-error`;
  const dietaryId = `${idPrefix}-dietary`;
  const dietaryHintId = `${idPrefix}-dietary-hint`;
  const dietaryErrorId = `${idPrefix}-dietary-error`;
  const messageId = `${idPrefix}-message`;
  const messageHintId = `${idPrefix}-message-hint`;
  const messageErrorId = `${idPrefix}-message-error`;
  const privacyId = `${idPrefix}-privacy`;
  const privacyErrorId = `${idPrefix}-privacy-error`;
  const honeypotId = `${idPrefix}-website`;

  const phoneErrorMessage = fieldErrors.phoneNumber || fieldErrors.phoneCountry;
  const phoneDescribedBy = [
    phoneHintId,
    phoneErrorMessage ? phoneErrorId : null,
  ]
    .filter(Boolean)
    .join(" ");

  const dietaryLength = values.dietaryRequirements.length;
  const dietaryRemaining = Math.max(
    0,
    RSVP_LIMITS.dietaryMaxLength - dietaryLength,
  );
  const dietaryDescribedBy = [
    dietaryHintId,
    fieldErrors.dietaryRequirements ? dietaryErrorId : null,
  ]
    .filter(Boolean)
    .join(" ");

  const messageLength = values.congratulatoryMessage.length;
  const messageRemaining = Math.max(
    0,
    RSVP_LIMITS.messageMaxLength - messageLength,
  );
  const messageDescribedBy = [
    messageHintId,
    fieldErrors.congratulatoryMessage ? messageErrorId : null,
  ]
    .filter(Boolean)
    .join(" ");

  const selectAttendance = (next: AttendanceStatus) => {
    if (disabled) return;
    onChange("attendance", next);
    onClearFieldError?.("attendance");
    if (next === "declining") {
      onChange("dietaryRequirements", "");
      onClearFieldError?.("dietaryRequirements");
    }
  };

  const handleRadioKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    current: AttendanceStatus,
  ) => {
    if (disabled) return;
    if (
      event.key === "ArrowRight" ||
      event.key === "ArrowDown" ||
      event.key === "ArrowLeft" ||
      event.key === "ArrowUp"
    ) {
      event.preventDefault();
      const next: AttendanceStatus =
        current === "attending" ? "declining" : "attending";
      selectAttendance(next);
      if (next === "attending") {
        attendingRadioRef.current?.focus();
      } else {
        decliningRadioRef.current?.focus();
      }
      return;
    }

    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      selectAttendance(current);
    }
  };

  const inputBaseClasses =
    "min-h-[44px] w-full min-w-0 rounded-[10px] border bg-warm-ivory px-3.5 py-2.5 font-sans text-sm text-forest-green placeholder:text-forest-green/50 transition-colors duration-150 focus:border-forest-green focus:outline-2 focus:outline-offset-0 focus:outline-champagne-gold disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div className="space-y-5">
      {mode === "create" ? (
        <div
          aria-hidden="true"
          className="absolute -left-[9999px] h-px w-px overflow-hidden"
        >
          <label htmlFor={honeypotId}>Website</label>
          <input
            id={honeypotId}
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={values.honeypot}
            onChange={(event) => onChange("honeypot", event.target.value)}
          />
        </div>
      ) : null}

      {/* Step 1 — Personal Information */}
      <div className="space-y-4">
        <div>
          <label
            htmlFor={fullNameId}
            className="block font-sans text-sm font-semibold text-forest-green"
          >
            Full Name{" "}
            <span aria-hidden="true" className="text-[#8E2822]">
              *
            </span>
          </label>
          <input
            id={fullNameId}
            name="fullName"
            type="text"
            required
            autoComplete="name"
            disabled={disabled}
            maxLength={RSVP_LIMITS.nameMaxLength}
            value={values.fullName}
            onChange={(event) => {
              onChange("fullName", event.target.value);
              onClearFieldError?.("fullName");
            }}
            placeholder="e.g., Grace Wanjiku Mwangi"
            aria-invalid={Boolean(fieldErrors.fullName) || undefined}
            aria-describedby={
              fieldErrors.fullName ? fullNameErrorId : undefined
            }
            className={`mt-1.5 ${inputBaseClasses} ${
              fieldErrors.fullName
                ? "border-[#8E2822]"
                : "border-forest-green/35"
            }`}
          />
          {fieldErrors.fullName ? (
            <p
              id={fullNameErrorId}
              role="alert"
              className="mt-1.5 font-sans text-xs font-medium text-[#8E2822]"
            >
              {fieldErrors.fullName}
            </p>
          ) : null}
        </div>

        <div>
          <span className="block font-sans text-sm font-semibold text-forest-green">
            Phone Number{" "}
            <span aria-hidden="true" className="text-[#8E2822]">
              *
            </span>
          </span>
          <div className="mt-1.5 flex flex-col gap-2.5 sm:grid sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] sm:gap-3">
            <div className="min-w-0">
              <label htmlFor={phoneCountryId} className="sr-only">
                Phone Country Code
              </label>
              <select
                id={phoneCountryId}
                name="phoneCountry"
                disabled={disabled}
                value={values.phoneCountry}
                onChange={(event) => {
                  onChange("phoneCountry", event.target.value as CountryCode);
                  onClearFieldError?.("phoneCountry");
                  onClearFieldError?.("phoneNumber");
                }}
                aria-invalid={Boolean(fieldErrors.phoneCountry) || undefined}
                aria-describedby={phoneDescribedBy}
                className={`${inputBaseClasses} ${
                  fieldErrors.phoneCountry
                    ? "border-[#8E2822]"
                    : "border-forest-green/35"
                }`}
              >
                {COUNTRY_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-0">
              <label htmlFor={phoneNumberId} className="sr-only">
                Phone Number
              </label>
              <input
                id={phoneNumberId}
                name="phoneNumber"
                type="tel"
                inputMode="tel"
                required
                autoComplete="tel-national"
                disabled={disabled}
                value={values.phoneNumber}
                onChange={(event) => {
                  onChange("phoneNumber", event.target.value);
                  onClearFieldError?.("phoneNumber");
                }}
                placeholder={
                  values.phoneCountry === "KE"
                    ? "0712 345 678"
                    : "Enter phone number"
                }
                aria-invalid={Boolean(fieldErrors.phoneNumber) || undefined}
                aria-describedby={phoneDescribedBy}
                className={`${inputBaseClasses} ${
                  fieldErrors.phoneNumber
                    ? "border-[#8E2822]"
                    : "border-forest-green/35"
                }`}
              />
            </div>
          </div>
          <p
            id={phoneHintId}
            className="mt-1.5 font-sans text-xs leading-relaxed text-forest-green/80"
          >
            Used only for event coordination. No email or SMS reminders are
            sent.
          </p>
          {phoneErrorMessage ? (
            <p
              id={phoneErrorId}
              role="alert"
              className="mt-1 font-sans text-xs font-medium text-[#8E2822]"
            >
              {phoneErrorMessage}
            </p>
          ) : null}
        </div>
      </div>

      {/* Step 2 — Attendance */}
      <div>
        <span
          id={attendanceLabelId}
          className="block font-sans text-sm font-semibold text-forest-green"
        >
          Will you be attending?{" "}
          <span aria-hidden="true" className="text-[#8E2822]">
            *
          </span>
        </span>
        <div
          role="radiogroup"
          aria-labelledby={attendanceLabelId}
          aria-required="true"
          aria-invalid={Boolean(fieldErrors.attendance) || undefined}
          aria-describedby={
            fieldErrors.attendance ? attendanceErrorId : undefined
          }
          className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          {ATTENDANCE_OPTIONS.map((option, index) => {
            const isSelected = values.attendance === option.value;
            const tabIndex =
              values.attendance === ""
                ? index === 0
                  ? 0
                  : -1
                : isSelected
                  ? 0
                  : -1;

            return (
              <button
                key={option.value}
                ref={
                  option.value === "attending"
                    ? attendingRadioRef
                    : decliningRadioRef
                }
                type="button"
                role="radio"
                aria-checked={isSelected}
                tabIndex={tabIndex}
                disabled={disabled}
                onClick={() => selectAttendance(option.value)}
                onKeyDown={(event) => handleRadioKeyDown(event, option.value)}
                className={`flex min-h-[54px] w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne-gold disabled:cursor-not-allowed disabled:opacity-60 ${
                  isSelected
                    ? "border-forest-green bg-forest-green text-warm-ivory"
                    : "border-champagne-gold/80 bg-warm-ivory text-forest-green hover:bg-warm-sand/65"
                }`}
              >
                <span className="min-w-0">
                  <span className="block font-serif text-base leading-tight font-medium">
                    {option.title}
                  </span>
                  <span
                    className={`mt-0.5 block font-sans text-xs ${
                      isSelected ? "text-warm-ivory/85" : "text-forest-green/80"
                    }`}
                  >
                    {option.subtitle}
                  </span>
                </span>

                <span
                  aria-hidden="true"
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                    isSelected
                      ? "border-champagne-gold bg-champagne-gold text-forest-green"
                      : "border-forest-green/35 bg-warm-ivory"
                  }`}
                >
                  {isSelected ? (
                    <svg
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-3.5 w-3.5"
                    >
                      <polyline points="3.5 8.5 6.5 11.5 12.5 4.5" />
                    </svg>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
        {fieldErrors.attendance ? (
          <p
            id={attendanceErrorId}
            role="alert"
            className="mt-1.5 font-sans text-xs font-medium text-[#8E2822]"
          >
            {fieldErrors.attendance}
          </p>
        ) : null}
      </div>

      {/* Step 3 — Conditional Dietary Requirements (Attending only) */}
      {values.attendance === "attending" ? (
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <label
              htmlFor={dietaryId}
              className="block font-sans text-sm font-semibold text-forest-green"
            >
              Dietary Requirements{" "}
              <span className="font-normal text-forest-green/80">
                (Optional)
              </span>
            </label>
            <span
              aria-hidden="true"
              className="font-sans text-xs text-forest-green/80 tabular-nums"
            >
              {dietaryLength} / {RSVP_LIMITS.dietaryMaxLength} &middot;{" "}
              {dietaryRemaining} remaining
            </span>
          </div>
          <textarea
            id={dietaryId}
            name="dietaryRequirements"
            rows={2}
            disabled={disabled}
            maxLength={RSVP_LIMITS.dietaryMaxLength}
            value={values.dietaryRequirements}
            onChange={(event) => {
              onChange("dietaryRequirements", event.target.value);
              onClearFieldError?.("dietaryRequirements");
            }}
            placeholder="Allergies or dietary preferences (e.g., vegetarian, nut-free)"
            aria-invalid={Boolean(fieldErrors.dietaryRequirements) || undefined}
            aria-describedby={dietaryDescribedBy}
            className={`mt-1.5 min-h-[72px] resize-y ${inputBaseClasses} ${
              fieldErrors.dietaryRequirements
                ? "border-[#8E2822]"
                : "border-forest-green/35"
            }`}
          />
          <p
            id={dietaryHintId}
            className="mt-1 font-sans text-xs text-forest-green/80"
          >
            Up to {RSVP_LIMITS.dietaryMaxLength} characters.
          </p>
          <span className="sr-only" aria-live="polite">
            {getRemainingAnnouncement(
              "Dietary requirements",
              dietaryRemaining,
              RSVP_LIMITS.dietaryMaxLength,
            )}
          </span>
          {fieldErrors.dietaryRequirements ? (
            <p
              id={dietaryErrorId}
              role="alert"
              className="mt-1 font-sans text-xs font-medium text-[#8E2822]"
            >
              {fieldErrors.dietaryRequirements}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Step 4 — Congratulatory Message */}
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <label
            htmlFor={messageId}
            className="block font-sans text-sm font-semibold text-forest-green"
          >
            Optional message to Majala &amp; Achala
          </label>
          <span
            aria-hidden="true"
            className="font-sans text-xs text-forest-green/80 tabular-nums"
          >
            {messageLength} / {RSVP_LIMITS.messageMaxLength} &middot;{" "}
            {messageRemaining} remaining
          </span>
        </div>
        <textarea
          id={messageId}
          name="congratulatoryMessage"
          rows={3}
          disabled={disabled}
          maxLength={RSVP_LIMITS.messageMaxLength}
          value={values.congratulatoryMessage}
          onChange={(event) => {
            onChange("congratulatoryMessage", event.target.value);
            onClearFieldError?.("congratulatoryMessage");
          }}
          placeholder="Share a congratulatory note or blessing for the graduates..."
          aria-invalid={Boolean(fieldErrors.congratulatoryMessage) || undefined}
          aria-describedby={messageDescribedBy}
          className={`mt-1.5 min-h-[88px] resize-y ${inputBaseClasses} ${
            fieldErrors.congratulatoryMessage
              ? "border-[#8E2822]"
              : "border-forest-green/35"
          }`}
        />
        <p
          id={messageHintId}
          className="mt-1 font-sans text-xs text-forest-green/80"
        >
          Up to {RSVP_LIMITS.messageMaxLength} characters.
        </p>
        <span className="sr-only" aria-live="polite">
          {getRemainingAnnouncement(
            "Congratulatory message",
            messageRemaining,
            RSVP_LIMITS.messageMaxLength,
          )}
        </span>
        {fieldErrors.congratulatoryMessage ? (
          <p
            id={messageErrorId}
            role="alert"
            className="mt-1 font-sans text-xs font-medium text-[#8E2822]"
          >
            {fieldErrors.congratulatoryMessage}
          </p>
        ) : null}
      </div>

      {/* Step 5 — Privacy Notice & Required Checkbox (Create mode only) */}
      {mode === "create" ? (
        <div className="rounded-xl border border-champagne-gold/75 bg-warm-sand/45 p-4">
          <h4 className="font-serif text-base font-medium text-forest-green">
            {PRIVACY_NOTICE_COPY.title}
          </h4>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 font-sans text-xs leading-relaxed text-forest-green/90">
            {PRIVACY_NOTICE_COPY.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>

          <div className="mt-3.5 border-t border-champagne-gold/45 pt-3">
            <label
              htmlFor={privacyId}
              className={`flex min-h-[52px] cursor-pointer items-start gap-3 rounded-xl border-2 p-3 transition-colors duration-150 ${
                fieldErrors.privacyAcknowledged
                  ? "border-[#8E2822] bg-[#8E2822]/10 ring-2 ring-[#8E2822]/30"
                  : values.privacyAcknowledged
                    ? "border-forest-green bg-forest-green/10"
                    : "border-forest-green/40 bg-warm-ivory hover:border-forest-green"
              }`}
            >
              <input
                id={privacyId}
                name="privacyAcknowledged"
                type="checkbox"
                required
                disabled={disabled}
                checked={values.privacyAcknowledged}
                onChange={(event) => {
                  onChange("privacyAcknowledged", event.target.checked);
                  onClearFieldError?.("privacyAcknowledged");
                }}
                aria-invalid={
                  Boolean(fieldErrors.privacyAcknowledged) || undefined
                }
                aria-describedby={
                  fieldErrors.privacyAcknowledged ? privacyErrorId : undefined
                }
                className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-forest-green/50 accent-forest-green focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne-gold"
              />
              <span className="font-sans text-xs leading-relaxed font-medium text-forest-green sm:text-[0.8125rem]">
                {PRIVACY_NOTICE_COPY.checkboxLabel}{" "}
                <span aria-hidden="true" className="font-bold text-[#8E2822]">
                  * (Required)
                </span>
              </span>
            </label>
            {fieldErrors.privacyAcknowledged ? (
              <p
                id={privacyErrorId}
                role="alert"
                className="mt-1.5 font-sans text-xs font-semibold text-[#8E2822]"
              >
                {fieldErrors.privacyAcknowledged}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
