"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { RsvpClosedNotice } from "@/components/rsvp/RsvpClosedNotice";
import { RsvpConfirmationView } from "@/components/rsvp/RsvpConfirmationView";
import {
  RsvpFormFields,
  type RsvpFormValues,
} from "@/components/rsvp/RsvpFormFields";
import { ActionLinkButton } from "@/components/ui/ActionLinkButton";
import { SectionShell } from "@/components/ui/SectionShell";
import { EVENT_DETAILS } from "@/lib/event-config";
import { DECORATIVE_ASSETS, RSVP_CONTENT } from "@/lib/invitation-data";
import {
  DEFAULT_PHONE_COUNTRY,
  validateCreateRsvpInput,
} from "@/lib/rsvp/validation";
import type {
  CreateRsvpSuccessResponse,
  RsvpErrorResponse,
  RsvpFieldErrors,
  RsvpGuestSummary,
} from "@/types/rsvp";

export interface RsvpSectionProps {
  isClosed?: boolean;
}

const INITIAL_FORM_VALUES: RsvpFormValues = {
  fullName: "",
  phoneCountry: DEFAULT_PHONE_COUNTRY,
  phoneNumber: "",
  attendance: "",
  dietaryRequirements: "",
  congratulatoryMessage: "",
  privacyAcknowledged: false,
  honeypot: "",
};

function generateIdempotencyKey(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const rand = (Math.random() * 16) | 0;
    const val = char === "x" ? rand : (rand & 0x3) | 0x8;
    return val.toString(16);
  });
}

function focusFirstInvalidField(
  dialog: HTMLDivElement | null,
  fieldErrors: RsvpFieldErrors,
) {
  if (!dialog) return;
  const order: Array<{ key: keyof RsvpFieldErrors; selector: string }> = [
    { key: "fullName", selector: "#rsvp-modal-full-name" },
    { key: "phoneCountry", selector: "#rsvp-modal-phone-country" },
    { key: "phoneNumber", selector: "#rsvp-modal-phone-number" },
    { key: "attendance", selector: '[role="radio"][tabindex="0"]' },
    { key: "dietaryRequirements", selector: "#rsvp-modal-dietary" },
    { key: "congratulatoryMessage", selector: "#rsvp-modal-message" },
    { key: "privacyAcknowledged", selector: "#rsvp-modal-privacy" },
  ];

  for (const item of order) {
    if (fieldErrors[item.key]) {
      const target = dialog.querySelector<HTMLElement>(item.selector);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.focus();
      }
      return;
    }
  }
}

export function RsvpSection({ isClosed = false }: RsvpSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [runtimeClosed, setRuntimeClosed] = useState(false);
  const [values, setValues] = useState<RsvpFormValues>(INITIAL_FORM_VALUES);
  const [fieldErrors, setFieldErrors] = useState<RsvpFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedResult, setSubmittedResult] = useState<{
    rsvp: RsvpGuestSummary;
    managementPath: string;
  } | null>(null);

  const triggerWrapRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);
  const submitLockRef = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);

  const { capMagnolia, magnoliaBloom } = DECORATIVE_ASSETS;
  const effectiveClosed = isClosed || runtimeClosed;

  const handleClose = useCallback(() => {
    if (submitLockRef.current) return;
    setIsOpen(false);
    if (submittedResult) {
      setSubmittedResult(null);
      setValues(INITIAL_FORM_VALUES);
      setFieldErrors({});
      setFormError(null);
      idempotencyKeyRef.current = null;
    }
  }, [submittedResult]);

  useEffect(() => {
    const handleOpenModal = () => {
      if (!effectiveClosed) {
        setIsOpen(true);
      }
    };
    window.addEventListener("open-rsvp-modal", handleOpenModal);
    return () => window.removeEventListener("open-rsvp-modal", handleOpenModal);
  }, [effectiveClosed]);

  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
      closeButtonRef.current?.focus();

      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          handleClose();
          return;
        }

        if (event.key === "Tab" && dialogRef.current) {
          const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]):not([tabindex="-1"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          );
          if (focusables.length === 0) {
            event.preventDefault();
            return;
          }
          const first = focusables[0];
          const last = focusables[focusables.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          } else if (!dialogRef.current.contains(document.activeElement)) {
            event.preventDefault();
            first.focus();
          }
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => {
        document.body.style.overflow = previousOverflow;
        window.removeEventListener("keydown", handleKeyDown);
      };
    }

    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      triggerWrapRef.current?.querySelector("button")?.focus();
    }
  }, [isOpen, handleClose]);

  const handleFieldChange = useCallback(
    <K extends keyof RsvpFormValues>(field: K, value: RsvpFormValues[K]) => {
      setValues((prev) => ({ ...prev, [field]: value }));
      setFormError(null);
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
    if (submitLockRef.current || isSubmitting) return;

    const validation = validateCreateRsvpInput({
      fullName: values.fullName,
      phoneNumber: values.phoneNumber,
      phoneCountry: values.phoneCountry,
      attendance: values.attendance === "" ? undefined : values.attendance,
      dietaryRequirements:
        values.attendance === "attending" ? values.dietaryRequirements : "",
      congratulatoryMessage: values.congratulatoryMessage,
      privacyAcknowledged: values.privacyAcknowledged,
      honeypot: values.honeypot,
    });

    if (!validation.valid) {
      setFieldErrors(validation.fieldErrors);
      setFormError(validation.message);
      focusFirstInvalidField(dialogRef.current, validation.fieldErrors);
      return;
    }

    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = generateIdempotencyKey();
    }

    submitLockRef.current = true;
    setIsSubmitting(true);
    setFieldErrors({});
    setFormError(null);

    try {
      const response = await fetch("/api/rsvp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
          privacyAcknowledged: values.privacyAcknowledged,
          honeypot: values.honeypot,
          idempotencyKey: idempotencyKeyRef.current,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | CreateRsvpSuccessResponse
        | RsvpErrorResponse
        | null;

      if (!response.ok || !payload || !payload.ok) {
        if (payload && !payload.ok) {
          if (payload.code === "RSVP_CLOSED") {
            setRuntimeClosed(true);
            setFormError(payload.message);
            return;
          }

          if (payload.fieldErrors) {
            setFieldErrors(payload.fieldErrors);
            focusFirstInvalidField(dialogRef.current, payload.fieldErrors);
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
          "We could not submit your RSVP right now. Please check your entries and try again.",
        );
        return;
      }

      idempotencyKeyRef.current = null;
      setSubmittedResult({
        rsvp: payload.rsvp,
        managementPath: payload.managementPath,
      });
      setValues(INITIAL_FORM_VALUES);
      setFieldErrors({});
      setFormError(null);
      closeButtonRef.current?.focus();
    } catch {
      setFormError(
        "We could not reach the server right now. Please check your internet connection and try again.",
      );
    } finally {
      submitLockRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <SectionShell
      id="rsvp"
      surface="ivory"
      textured
      spacing="none"
      maxWidth="full"
      ariaLabelledBy="rsvp-heading"
    >
      <div className="relative mx-auto w-full max-w-[1160px] px-5 pt-8 pb-10 sm:px-6 md:px-8 md:pt-12 md:pb-8 lg:px-10">
        {/* Desktop & tablet bottom-left cap & magnolia resting near wave transition */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-3 z-0 hidden w-32 select-none md:block md:left-6 md:w-36 lg:left-10 lg:w-44"
        >
          <Image
            src={capMagnolia.src}
            alt={capMagnolia.alt}
            width={capMagnolia.width}
            height={capMagnolia.height}
            loading="eager"
            aria-hidden="true"
            className="h-auto w-full"
          />
        </div>

        {/* Mobile flanking lower-left & lower-right ivory magnolia accents */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 -left-3 z-0 w-[84px] -rotate-12 select-none sm:w-[96px] md:hidden"
        >
          <Image
            src={magnoliaBloom.src}
            alt={magnoliaBloom.alt}
            width={magnoliaBloom.width}
            height={magnoliaBloom.height}
            loading="eager"
            aria-hidden="true"
            className="h-auto w-full"
          />
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-3 bottom-0 z-0 w-[84px] -scale-x-100 rotate-12 select-none sm:w-[96px] md:hidden"
        >
          <Image
            src={magnoliaBloom.src}
            alt={magnoliaBloom.alt}
            width={magnoliaBloom.width}
            height={magnoliaBloom.height}
            loading="eager"
            aria-hidden="true"
            className="h-auto w-full"
          />
        </div>

        {/* Content row */}
        {effectiveClosed ? (
          <div className="relative z-10 mx-auto max-w-xl md:pl-36 lg:pl-44">
            <RsvpClosedNotice headingId="rsvp-heading" />
          </div>
        ) : (
          <div className="relative z-10 flex flex-col items-center gap-5 md:flex-row md:items-center md:justify-center md:gap-10 md:pl-36 lg:gap-14 lg:pl-44">
            <div className="text-center">
              <h2
                id="rsvp-heading"
                className="font-serif text-[1.75rem] leading-tight tracking-tight text-forest-green italic sm:text-[2.125rem]"
              >
                {RSVP_CONTENT.heading}
              </h2>
              <p className="mx-auto mt-2 max-w-[340px] font-sans text-sm leading-relaxed text-forest-green/85 sm:text-[0.9375rem]">
                {RSVP_CONTENT.copy}
              </p>
            </div>

            <div ref={triggerWrapRef} className="flex shrink-0 justify-center">
              <ActionLinkButton
                variant="forest"
                size="lg"
                onClick={() => setIsOpen(true)}
                ariaHasPopup="dialog"
                ariaExpanded={isOpen}
                ariaControls="rsvp-notice-dialog"
              >
                {RSVP_CONTENT.ctaLabel}
              </ActionLinkButton>
            </div>
          </div>
        )}
      </div>

      {isOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-forest-green/60 px-3 py-4 sm:px-4 sm:py-6"
          onClick={handleClose}
        >
          <div
            ref={dialogRef}
            id="rsvp-notice-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rsvp-dialog-title"
            className="relative flex max-h-[90dvh] w-full max-w-xl flex-col overflow-y-auto rounded-2xl border border-champagne-gold bg-warm-ivory p-5 text-left text-forest-green shadow-sm sm:p-8"
            onClick={(event) => event.stopPropagation()}
          >
            {/* Dialog Header */}
            <div className="flex items-start justify-between gap-4 border-b border-champagne-gold/55 pb-4">
              <div className="min-w-0">
                <p className="font-sans text-[11px] font-semibold tracking-[0.14em] text-forest-green/80 uppercase">
                  {EVENT_DETAILS.graduatesSummary} &middot;{" "}
                  {EVENT_DETAILS.dateLabel}
                </p>
                <h3
                  id="rsvp-dialog-title"
                  className="mt-1 font-serif text-2xl leading-tight text-forest-green italic sm:text-[1.75rem]"
                >
                  {submittedResult
                    ? "Your response has been received."
                    : RSVP_CONTENT.heading}
                </h3>
              </div>

              <button
                ref={closeButtonRef}
                type="button"
                aria-label="Close"
                onClick={handleClose}
                disabled={isSubmitting}
                className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-[10px] border border-champagne-gold/75 bg-warm-ivory text-forest-green transition-colors duration-150 hover:bg-warm-sand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne-gold disabled:cursor-not-allowed disabled:opacity-60"
              >
                <svg
                  aria-hidden="true"
                  focusable="false"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.75}
                  strokeLinecap="round"
                  className="h-5 w-5"
                >
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </button>
            </div>

            {/* Dialog Body */}
            <div className="mt-5">
              {effectiveClosed && !submittedResult ? (
                <div className="space-y-5">
                  <RsvpClosedNotice framed />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleClose}
                      className="inline-flex min-h-[44px] items-center justify-center rounded-[10px] border border-forest-green bg-forest-green px-6 py-2.5 font-sans text-sm font-medium text-warm-ivory transition-colors duration-150 hover:bg-forest-green/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne-gold"
                    >
                      Close
                    </button>
                  </div>
                </div>
              ) : submittedResult ? (
                <RsvpConfirmationView
                  rsvp={submittedResult.rsvp}
                  managementPath={submittedResult.managementPath}
                  onReturnToInvitation={handleClose}
                />
              ) : (
                <form noValidate onSubmit={handleSubmit} className="space-y-5">
                  <p className="font-sans text-sm leading-relaxed text-forest-green/85">
                    {RSVP_CONTENT.copy}
                  </p>

                  {formError ? (
                    <div
                      role="alert"
                      className="rounded-xl border border-[#8E2822]/55 bg-[#8E2822]/8 px-4 py-3 font-sans text-xs leading-relaxed font-medium text-[#8E2822] sm:text-[0.8125rem]"
                    >
                      {formError}
                    </div>
                  ) : null}

                  <RsvpFormFields
                    mode="create"
                    idPrefix="rsvp-modal"
                    values={values}
                    fieldErrors={fieldErrors}
                    disabled={isSubmitting}
                    onChange={handleFieldChange}
                    onClearFieldError={handleClearFieldError}
                  />

                  {!values.privacyAcknowledged ? (
                    <p className="flex items-center gap-1.5 rounded-lg border border-amber-600/30 bg-amber-50/80 px-3 py-2 font-sans text-xs font-semibold text-amber-900">
                      <span aria-hidden="true">⚠️</span> Please check the required Privacy Notice box above before submitting.
                    </p>
                  ) : null}

                  <div className="flex flex-col-reverse gap-3 border-t border-champagne-gold/45 pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <button
                      type="button"
                      onClick={handleClose}
                      disabled={isSubmitting}
                      className="inline-flex min-h-[44px] items-center justify-center rounded-[10px] border border-champagne-gold bg-warm-ivory px-6 py-2.5 font-sans text-sm font-medium text-forest-green transition-colors duration-150 hover:bg-warm-sand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne-gold disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Cancel
                    </button>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="inline-flex min-h-[48px] items-center justify-center rounded-[10px] border border-forest-green bg-forest-green px-8 py-3 font-sans text-sm font-medium text-warm-ivory transition-colors duration-150 hover:bg-forest-green/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne-gold disabled:cursor-not-allowed disabled:opacity-70 sm:text-base"
                    >
                      {isSubmitting ? "Sending RSVP..." : "Submit RSVP"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </SectionShell>
  );
}
