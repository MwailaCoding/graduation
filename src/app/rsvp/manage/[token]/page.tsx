import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { RsvpManageClient } from "@/components/rsvp/RsvpManageClient";
import { ThankYouSection } from "@/components/sections/ThankYouSection";
import { BrandCrestIcon } from "@/components/ui/EditorialMotifs";
import { EVENT_DETAILS } from "@/lib/event-config";
import {
  checkRateLimit,
  isRateLimitBlocked,
} from "@/lib/rsvp/rate-limit";
import { extractClientKeyFromHeaders } from "@/lib/rsvp/request-helpers";
import { ensureRetentionEnforcedIfDue } from "@/lib/rsvp/retention";
import { getRsvpByToken } from "@/lib/rsvp/service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Manage Your RSVP — Majala & Florence",
  robots: {
    index: false,
    follow: false,
  },
};

function renderStatusMessageCard(options: {
  title: string;
  body: string;
}) {
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-champagne-gold bg-warm-ivory p-6 text-center text-forest-green shadow-sm sm:p-8">
      <p className="font-sans text-[11px] font-semibold tracking-[0.16em] text-forest-green/80 uppercase">
        {EVENT_DETAILS.graduatesSummary} &middot; {EVENT_DETAILS.dateLabel}
      </p>
      <h1 className="mt-2 font-serif text-2xl leading-tight text-forest-green italic sm:text-[1.875rem]">
        {options.title}
      </h1>
      <p className="mx-auto mt-3 max-w-md font-sans text-sm leading-relaxed text-forest-green/90 sm:text-[0.9375rem]">
        {options.body}
      </p>
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

export default async function ManageRsvpPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  await ensureRetentionEnforcedIfDue().catch(() => {});

  const { token } = await params;
  const headerList = await headers();
  const clientKey = extractClientKeyFromHeaders(headerList);

  let rateLimitedRetryAfter: number | null = null;
  let result: Awaited<ReturnType<typeof getRsvpByToken>> | null = null;

  try {
    const failedBlock = await isRateLimitBlocked("manage_failed", clientKey);
    if (failedBlock.blocked) {
      rateLimitedRetryAfter = failedBlock.retryAfterSeconds;
    } else {
      const readLimit = await checkRateLimit("manage_read", clientKey);
      if (!readLimit.allowed) {
        rateLimitedRetryAfter = readLimit.retryAfterSeconds;
      } else {
        result = await getRsvpByToken(token);
        if (!result.ok && result.error.code === "INVALID_TOKEN") {
          const failedLimit = await checkRateLimit("manage_failed", clientKey);
          if (!failedLimit.allowed) {
            rateLimitedRetryAfter = failedLimit.retryAfterSeconds;
          }
        }
      }
    }
  } catch {
    result = await getRsvpByToken(token);
  }

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-champagne-gold/45 bg-warm-ivory md:bg-forest-green">
        <div className="mx-auto flex h-14 max-w-[1160px] items-center justify-between gap-2 px-4 sm:gap-4 sm:px-5 md:h-16 md:px-7 lg:px-10">
          <Link
            href="/"
            className="flex min-w-0 shrink items-center gap-2 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-champagne-gold sm:gap-2.5"
          >
            <BrandCrestIcon tone="responsive" className="h-6 w-9 shrink-0" />
            <span className="truncate font-serif text-[16px] leading-none italic text-forest-green sm:text-[17px] md:text-[18px] md:text-warm-ivory lg:text-[20px]">
              {EVENT_DETAILS.graduatesSummary}
            </span>
          </Link>

          <Link
            href="/"
            aria-label="Back to Invitation"
            className="inline-flex min-h-[44px] shrink-0 items-center rounded-md px-1.5 font-sans text-xs font-medium whitespace-nowrap text-forest-green transition-colors duration-150 hover:text-muted-olive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne-gold sm:px-2 sm:text-sm md:text-warm-ivory md:hover:text-champagne-gold"
          >
            <span aria-hidden="true" className="min-[375px]:hidden">
              &larr; Back
            </span>
            <span aria-hidden="true" className="hidden min-[375px]:inline">
              &larr; Back to Invitation
            </span>
          </Link>
        </div>
      </header>

      <main
        id="main-content"
        className="paper-texture min-h-[60vh] px-4 py-10 sm:px-6 sm:py-14"
      >
        {rateLimitedRetryAfter !== null
          ? renderStatusMessageCard({
              title: "Please wait a moment",
              body: `Too many requests were received from your connection. Please try again in about ${rateLimitedRetryAfter} seconds.`,
            })
          : !result || !result.ok
            ? renderStatusMessageCard({
                title: "We couldn\u2019t verify your RSVP link",
                body: "This personal RSVP management link could not be verified or may no longer be active. Please make sure you opened the complete link you saved when submitting your RSVP, or reach out directly to Majala & Florence or the event organizers if you need assistance.",
              })
            : (
              <RsvpManageClient
                token={token}
                initialRsvp={result.data.rsvp}
                initialIsClosed={result.data.isClosed}
                closureDeadlineIso={result.data.closureDeadlineIso}
                retentionDateIso={result.data.retentionDateIso}
              />
            )}
      </main>

      <ThankYouSection />
    </>
  );
}
