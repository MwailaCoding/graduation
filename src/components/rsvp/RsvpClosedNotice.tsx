import { CLOSED_RSVP_COPY, EVENT_DETAILS } from "@/lib/event-config";

export interface RsvpClosedNoticeProps {
  headingId?: string;
  className?: string;
  framed?: boolean;
}

/**
 * Displays the authoritative post-deadline RSVP closure message.
 */
export function RsvpClosedNotice({
  headingId,
  className = "",
  framed = false,
}: RsvpClosedNoticeProps) {
  const containerClasses = framed
    ? `rounded-2xl border border-champagne-gold/75 bg-warm-sand/45 p-6 text-center text-forest-green sm:p-8 ${className}`
    : `text-center text-forest-green ${className}`;

  return (
    <div className={containerClasses.trim()}>
      <p className="font-sans text-[11px] font-semibold tracking-[0.16em] text-forest-green/80 uppercase">
        {EVENT_DETAILS.graduatesSummary} &middot; {EVENT_DETAILS.dateLabel}
      </p>
      <h2
        id={headingId}
        className="mt-2 font-serif text-[1.75rem] leading-tight tracking-tight text-forest-green italic sm:text-[2.125rem]"
      >
        {CLOSED_RSVP_COPY.heading}
      </h2>
      <p className="mx-auto mt-3 max-w-md font-sans text-sm leading-relaxed text-forest-green/90 sm:text-[0.9375rem]">
        {CLOSED_RSVP_COPY.body}
      </p>
      <p className="mx-auto mt-3 max-w-md font-sans text-xs leading-relaxed text-forest-green/80">
        {EVENT_DETAILS.timeLabel} &middot; {EVENT_DETAILS.venueName}
      </p>
    </div>
  );
}
