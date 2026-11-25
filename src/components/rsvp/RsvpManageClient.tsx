"use client";

import { parsePhoneNumberFromString } from "libphonenumber-js";
import Link from "next/link";
import { useCallback, useRef, useState, type FormEvent } from "react";
import { RsvpClosedNotice } from "@/components/rsvp/RsvpClosedNotice";
import {
  RsvpFormFields,
  type RsvpFormValues,
} from "@/components/rsvp/RsvpFormFields";
import { EVENT_DETAILS } from "@/lib/event-config";
import { validateUpdateRsvpInput } from "@/lib/rsvp/validation";
import type {
  RsvpErrorResponse,
  RsvpFieldErrors,
  RsvpGuestSummary,
  UpdateRsvpSuccessResponse,
} from "@/types/rsvp";

export interface RsvpManageClientProps {
  token: string;
  initialRsvp: RsvpGuestSummary;
  initialIsClosed: boolean;
  closureDeadlineIso: string;
  retentionDateIso: string;
}

function formatInitialPhone(phoneE164: string): string {
  const parsed = parsePhoneNumberFromString(phoneE164);
  if (parsed) {
    return parsed.formatNational();
  }
  return phoneE164;
}

function buildFormValues(rsvp: RsvpGuestSummary): RsvpFormValues {
  return {
    fullName: rsvp.fullName,
    phoneCountry: rsvp.phoneCountry,
    phoneNumber: formatInitialPhone(rsvp.phoneE164),
    attendance: rsvp.attendance,
    dietaryRequirements: rsvp.dietaryRequirements ?? "",
    congratulatoryMessage: rsvp.congratulatoryMessage ?? "",
    privacyAcknowledged: true,
    honeypot: "",
  };
}

function focusFirstManageInvalidField(
  form: HTMLFormElement | null,
  fieldErrors: RsvpFieldErrors,
) {
  if (!form) return;
  const order: Array<{ key: keyof RsvpFieldErrors; selector: string }> = [
    { key: "fullName", selector: "#rsvp-manage-full-name" },
    { key: "phoneCountry", selector: "#rsvp-manage-phone-country" },
    { key: "phoneNumber", selector: "#rsvp-manage-phone-number" },
    { key: "attendance", selector: '[role="radio"][tabindex="0"]' },
    { key: "dietaryRequirements", selector: "#rsvp-manage-dietary" },
    { key: "congratulatoryMessage", selector: "#rsvp-manage-message" },
  ];

  for (const item of order) {
    if (fieldErrors[item.key]) {
      form.querySelector<HTMLElement>(item.selector)?.focus();
      return;
    }
  }
}

/**
 * Interactive personal RSVP management client view.
 * Security: `token` is kept strictly in memory for the PATCH Authorization header
 * and is never rendered into the DOM or persisted in Web Storage.
 */
export function RsvpManageClient({
  token,
  initialRsvp,
  initialIsClosed,
}: RsvpManageClientProps) {
  const [savedRsvp, setSavedRsvp] = useState<RsvpGuestSummary>(initialRsvp);
  const [isClosed, setIsClosed] = useState<boolean>(initialIsClosed);
  const [values, setValues] = useState<RsvpFormValues>(() =>
    buildFormValues(initialRsvp),
  );
  const [fieldErrors, setFieldErrors] = useState<RsvpFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);
  const submitLockRef = useRef(false);

  const handleFieldChange = useCallback(
    <K extends keyof RsvpFormValues>(field: K, value: RsvpFormValues[K]) => {
      setValues((prev) => ({ ...prev, [field]: value }));
      setFormError(null);
      setSuccessMessage(null);
    },
    [],
  );

  const handleClearFieldError = useCallback(
    (field: keyof RsvpFieldErrors) => {
      setFieldErrors((prev) => {
        if (!prev[field]) return prev;
        const next = { ...prev };
        delete next[field];
        return next;
      });
    },
    [],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitLockRef.current || isSubmitting || isClosed) return;

    const validation = validateUpdateRsvpInput({
      fullName: values.fullName,
      phoneNumber: values.phoneNumber,
      phoneCountry: values.phoneCountry,
      attendance: values.attendance === "" ? undefined : values.attendance,
      dietaryRequirements:
        values.attendance === "attending" ? values.dietaryRequirements : "",
      congratulatoryMessage: values.congratulatoryMessage,
    });

    if (!validation.valid) {
      setFieldErrors(validation.fieldErrors);
      setFormError(validation.message);
      setSuccessMessage(null);
      focusFirstManageInvalidField(formRef.current, validation.fieldErrors);
      return;
    }

    submitLockRef.current = true;
    setIsSubmitting(true);
    setFieldErrors({});
    setFormError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/rsvp/manage", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fullName: values.fullName,
          phoneNumber: values.phoneNumber,
          phoneCountry: values.phoneCountry,
          attendance: values.attendance,
          dietaryRequirements:
            values.attendance === "attending"
              ? values.dietaryRequirements
              : undefined,
          congratulatoryMessage: values.congratulatoryMessage,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | UpdateRsvpSuccessResponse
        | RsvpErrorResponse
        | null;

      if (!response.ok || !payload || !payload.ok) {
        if (payload && !payload.ok) {
          if (payload.code === "RSVP_CLOSED") {
            setIsClosed(true);
            setFormError(payload.message);
            return;
          }

          if (payload.fieldErrors) {
            setFieldErrors(payload.fieldErrors);
            focusFirstManageInvalidField(formRef.current, payload.fieldErrors);
          }

          const retryHint =
            payload.code === "RATE_LIMITED" &&
            typeof payload.retryAfterSeconds === "number" &&
            payload.retryAfterSeconds > 0
              ? ` Please try again in about ${payload.retryAfterSeconds} seconds.`
              : "";

          setFormError(`${payload.message}${retryHint}`);
          return;
        }

        setFormError(
          "We could not update your RSVP right now. Please check your entries and try again.",
        );
        return;
      }

      setSavedRsvp(payload.rsvp);
      setValues(buildFormValues(payload.rsvp));
      setFieldErrors({});
      setFormError(null);
      setSuccessMessage("Your RSVP has been updated.");
      if (payload.isClosed) {
        setIsClosed(true);
      }
    } catch {
      setFormError(
        "We could not reach the server right now. Please check your internet connection and try again.",
      );
    } finally {
      submitLockRef.current = false;
      setIsSubmitting(false);
    }
  };

  const isCurrentlyAttending = savedRsvp.attendance === "attending";

  if (isClosed) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-champagne-gold bg-warm-ivory p-6 text-forest-green shadow-sm sm:p-8">
        <p className="text-center font-serif text-xl text-forest-green italic sm:text-2xl">
          Hello, {savedRsvp.fullName}
        </p>

        <div className="mt-5">
          <RsvpClosedNotice framed />
        </div>

        <div className="mt-6 rounded-xl border border-champagne-gold/65 bg-warm-sand/35 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-champagne-gold/45 pb-3">
            <h3 className="font-serif text-lg font-medium text-forest-green">
              Your Recorded Response
            </h3>
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 font-sans text-xs font-semibold uppercase ${
                isCurrentlyAttending
                  ? "border-forest-green bg-forest-green text-warm-ivory"
                  : "border-champagne-gold bg-warm-ivory text-forest-green"
              }`}
            >
              {isCurrentlyAttending ? "Attending" : "Declining"}
            </span>
          </div>

          <dl className="mt-3 space-y-2.5 font-sans text-sm">
            <div>
              <dt className="text-xs font-semibold text-forest-green/75">
                Full Name
              </dt>
              <dd className="text-forest-green">{savedRsvp.fullName}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-forest-green/75">
                Phone Number
              </dt>
              <dd className="text-forest-green">{savedRsvp.phoneE164}</dd>
            </div>
            {isCurrentlyAttending && savedRsvp.dietaryRequirements ? (
              <div>
                <dt className="text-xs font-semibold text-forest-green/75">
                  Dietary Requirements
                </dt>
                <dd className="text-forest-green">
                  {savedRsvp.dietaryRequirements}
                </dd>
              </div>
            ) : null}
            {savedRsvp.congratulatoryMessage ? (
              <div>
                <dt className="text-xs font-semibold text-forest-green/75">
                  Message to Majala &amp; Florence
                </dt>
                <dd className="text-forest-green">
                  {savedRsvp.congratulatoryMessage}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>

        <div className="mt-6 flex justify-center">
          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center justify-center rounded-[10px] border border-forest-green bg-forest-green px-7 py-2.5 font-sans text-sm font-medium text-warm-ivory transition-colors duration-150 hover:bg-forest-green/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne-gold"
          >
            Return to Invitation
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-champagne-gold bg-warm-ivory p-5 text-forest-green shadow-sm sm:p-8">
      {/* Discreet Personal Greeting & Current Status */}
      <div className="border-b border-champagne-gold/55 pb-5">
        <p className="font-sans text-[11px] font-semibold tracking-[0.14em] text-forest-green/80 uppercase">
          {EVENT_DETAILS.graduatesSummary} &middot; {EVENT_DETAILS.dateLabel}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-serif text-2xl leading-tight text-forest-green italic sm:text-[1.875rem]">
            Hello, {savedRsvp.fullName}
          </h1>
          <span
            className={`inline-flex items-center rounded-full border px-3.5 py-1 font-sans text-xs font-semibold tracking-wide uppercase ${
              isCurrentlyAttending
                ? "border-forest-green bg-forest-green text-warm-ivory"
                : "border-champagne-gold bg-warm-sand text-forest-green"
            }`}
          >
            Currently: {isCurrentlyAttending ? "Attending" : "Declining"}
          </span>
        </div>
        <p className="mt-2 font-sans text-sm leading-relaxed text-forest-green/85">
          {EVENT_DETAILS.timeLabel} &bull; {EVENT_DETAILS.venueName}. You may
          review or update your response below until{" "}
          {EVENT_DETAILS.closureDeadlineLabel}.
        </p>
      </div>

      <form
        ref={formRef}
        noValidate
        onSubmit={handleSubmit}
        className="mt-6 space-y-5"
      >
        {successMessage ? (
          <div
            role="status"
            aria-live="polite"
            className="rounded-xl border border-forest-green/45 bg-warm-sand/65 px-4 py-3 font-sans text-sm font-medium text-forest-green"
          >
            {successMessage}
          </div>
        ) : null}

        {formError ? (
          <div
            role="alert"
            className="rounded-xl border border-[#8E2822]/55 bg-[#8E2822]/8 px-4 py-3 font-sans text-xs leading-relaxed font-medium text-[#8E2822] sm:text-[0.8125rem]"
          >
            {formError}
          </div>
        ) : null}

        <RsvpFormFields
          mode="edit"
          idPrefix="rsvp-manage"
          values={values}
          fieldErrors={fieldErrors}
          disabled={isSubmitting}
          onChange={handleFieldChange}
          onClearFieldError={handleClearFieldError}
        />

        {/* Privacy Reassurance */}
        <div className="rounded-xl border border-champagne-gold/70 bg-warm-sand/40 p-4 font-sans text-xs leading-relaxed text-forest-green/85">
          Your RSVP details are kept private for event coordination only and are
          never publicly displayed. All personal RSVP records will be
          irreversibly anonymized on {EVENT_DETAILS.retentionDateLabel} (90 days
          after the celebration).
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-champagne-gold/45 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center justify-center rounded-[10px] border border-champagne-gold bg-warm-ivory px-6 py-2.5 font-sans text-sm font-medium text-forest-green transition-colors duration-150 hover:bg-warm-sand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne-gold"
          >
            Back to Invitation
          </Link>

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex min-h-[48px] items-center justify-center rounded-[10px] border border-forest-green bg-forest-green px-8 py-3 font-sans text-sm font-medium text-warm-ivory transition-colors duration-150 hover:bg-forest-green/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne-gold disabled:cursor-not-allowed disabled:opacity-70 sm:text-base"
          >
            {isSubmitting ? "Saving Changes..." : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
