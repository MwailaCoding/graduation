"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { EVENT_DETAILS } from "@/lib/event-config";
import type { RsvpGuestSummary } from "@/types/rsvp";

export interface RsvpConfirmationViewProps {
  rsvp: RsvpGuestSummary;
  managementPath: string;
  onReturnToInvitation: () => void;
}

const emptySubscribe = () => () => {};

/**
 * Celebration confirmation view shown inside the RSVP modal after submission.
 */
export function RsvpConfirmationView({
  rsvp,
  managementPath,
  onReturnToInvitation,
}: RsvpConfirmationViewProps) {
  const [copied, setCopied] = useState(false);
  const origin = useSyncExternalStore(
    emptySubscribe,
    () => window.location.origin,
    () => "",
  );
  const fullManagementUrl = origin ? `${origin}${managementPath}` : managementPath;

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 3000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const handleCopyLink = async () => {
    const urlToCopy = `${window.location.origin}${managementPath}`;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(urlToCopy);
        setCopied(true);
        return;
      }
    } catch {
      // Fallback below for restricted clipboard contexts
    }

    try {
      const textarea = document.createElement("textarea");
      textarea.value = urlToCopy;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "absolute";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const isAttending = rsvp.attendance === "attending";
  const graduatesDisplay = EVENT_DETAILS.graduates
    .map((grad) => grad.name)
    .join(" & ");

  return (
    <div className="space-y-5 text-forest-green">
      {/* Celebration Summary Banner */}
      <div className="rounded-xl border border-champagne-gold/80 bg-warm-sand/45 p-4 text-center sm:p-5">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-champagne-gold bg-forest-green text-warm-ivory">
          <svg
            aria-hidden="true"
            focusable="false"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <p className="mt-3 font-serif text-lg font-medium text-forest-green sm:text-xl">
          {graduatesDisplay}
        </p>
        <p className="mt-1 font-sans text-xs leading-relaxed text-forest-green/85 sm:text-[0.8125rem]">
          {EVENT_DETAILS.dateLabel} &bull; {EVENT_DETAILS.timeLabel} &bull;{" "}
          {EVENT_DETAILS.venueName}
        </p>

        <div className="mt-3 flex justify-center">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1 font-sans text-xs font-semibold tracking-wide uppercase ${
              isAttending
                ? "border-forest-green bg-forest-green text-warm-ivory"
                : "border-champagne-gold bg-warm-ivory text-forest-green"
            }`}
          >
            {isAttending ? "Attending" : "Declining"}
          </span>
        </div>

        <p className="mt-3 font-sans text-sm leading-relaxed text-forest-green">
          {isAttending
            ? "We look forward to celebrating with you!"
            : "Thank you for being part of this special milestone and for sending your love."}
        </p>
      </div>

      {/* Recorded Guest Summary */}
      <dl className="grid grid-cols-1 gap-2.5 rounded-xl border border-champagne-gold/55 bg-warm-ivory p-4 font-sans text-xs sm:grid-cols-2 sm:text-[0.8125rem]">
        <div>
          <dt className="font-semibold text-forest-green/75">Guest Name</dt>
          <dd className="mt-0.5 font-medium text-forest-green">
            {rsvp.fullName}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-forest-green/75">Phone Number</dt>
          <dd className="mt-0.5 font-medium text-forest-green">
            {rsvp.phoneE164}
          </dd>
        </div>
        {isAttending && rsvp.dietaryRequirements ? (
          <div className="sm:col-span-2">
            <dt className="font-semibold text-forest-green/75">
              Dietary Requirements
            </dt>
            <dd className="mt-0.5 text-forest-green">
              {rsvp.dietaryRequirements}
            </dd>
          </div>
        ) : null}
        {rsvp.congratulatoryMessage ? (
          <div className="sm:col-span-2">
            <dt className="font-semibold text-forest-green/75">
              Message to Graduates
            </dt>
            <dd className="mt-0.5 text-forest-green">
              {rsvp.congratulatoryMessage}
            </dd>
          </div>
        ) : null}
      </dl>

      {/* Personal RSVP Management Link Box */}
      <div className="rounded-xl border border-champagne-gold bg-warm-sand/50 p-4 text-left sm:p-5">
        <h4 className="font-serif text-base font-medium text-forest-green sm:text-lg">
          Personal RSVP Management Link
        </h4>
        <p className="mt-1.5 font-sans text-xs leading-relaxed text-forest-green/90 sm:text-[0.8125rem]">
          Please save or bookmark this link to review or update your response
          anytime before {EVENT_DETAILS.closureDeadlineLabel}.
        </p>

        <div className="mt-3 rounded-lg border border-champagne-gold/75 bg-warm-ivory px-3 py-2.5">
          <p className="font-mono text-xs break-all text-forest-green select-all sm:text-[0.8125rem]">
            {fullManagementUrl}
          </p>
        </div>

        <div className="mt-3 flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={handleCopyLink}
            className="inline-flex min-h-[44px] items-center justify-center rounded-[10px] border border-forest-green bg-forest-green px-5 py-2.5 font-sans text-sm font-medium text-warm-ivory transition-colors duration-150 hover:bg-forest-green/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne-gold"
          >
            {copied ? "Copied" : "Copy Link"}
          </button>

          <Link
            href={managementPath}
            className="inline-flex min-h-[44px] items-center justify-center rounded-[10px] border border-champagne-gold bg-warm-ivory px-5 py-2.5 font-sans text-sm font-medium text-forest-green transition-colors duration-150 hover:bg-warm-sand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne-gold"
          >
            Review or Update RSVP
          </Link>
        </div>

        <span
          role="status"
          aria-live="polite"
          className="mt-2 block min-h-[1rem] font-sans text-xs font-medium text-forest-green"
        >
          {copied ? "Management link copied" : ""}
        </span>
      </div>

      <div className="flex justify-end border-t border-champagne-gold/45 pt-4">
        <button
          type="button"
          onClick={onReturnToInvitation}
          className="inline-flex min-h-[44px] w-full items-center justify-center rounded-[10px] border border-champagne-gold bg-warm-ivory px-6 py-2.5 font-sans text-sm font-medium text-forest-green transition-colors duration-150 hover:bg-warm-sand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne-gold sm:w-auto"
        >
          Return to Invitation
        </button>
      </div>
    </div>
  );
}
