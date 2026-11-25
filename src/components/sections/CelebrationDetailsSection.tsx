import type { ReactNode } from "react";
import { EditorialFrame } from "@/components/ui/EditorialFrame";
import {
  CalendarIcon,
  ClockIcon,
  MapPinIcon,
  OliveSprigAccent,
} from "@/components/ui/EditorialMotifs";
import { SectionShell } from "@/components/ui/SectionShell";
import {
  CELEBRATION_DETAILS_CONTENT,
  VENUE_CONTENT,
} from "@/lib/invitation-data";

export interface CelebrationDetailsSectionProps {
  venueSlot?: ReactNode;
}

export function CelebrationDetailsSection({
  venueSlot,
}: CelebrationDetailsSectionProps = {}) {
  return (
    <SectionShell
      id="details"
      surface="ivory"
      textured
      spacing="none"
      ariaLabel="Celebration Details"
      className="pt-2 pb-3 md:pt-3 md:pb-4"
    >
      <div className="flex items-center justify-center gap-1.5 lg:gap-2.5">
        <OliveSprigAccent
          side="left"
          className="hidden h-9 w-12 shrink-0 md:block lg:h-14 lg:w-24"
        />

        <EditorialFrame
          variant="pill"
          className="w-full max-w-[1000px] flex-1"
          innerClassName="flex flex-col gap-1.5 px-5 py-3 md:grid md:grid-cols-3 md:items-stretch md:gap-0 md:divide-x md:divide-champagne-gold/65 md:px-2 md:py-3.5 lg:px-4"
        >
          <div className="flex min-h-[44px] items-center gap-3 md:justify-center md:gap-2 md:px-2 lg:gap-3.5 lg:px-4">
            <CalendarIcon className="h-5 w-5 shrink-0 lg:h-6 lg:w-6" />
            <p className="font-sans text-sm leading-snug text-warm-ivory sm:text-[0.9375rem] md:text-[0.8125rem] lg:text-[0.9375rem]">
              <span className="md:block">
                {CELEBRATION_DETAILS_CONTENT.dateLines[0]}{" "}
              </span>
              <span className="md:block md:whitespace-nowrap">
                {CELEBRATION_DETAILS_CONTENT.dateLines[1]}
              </span>
            </p>
          </div>

          <div className="flex min-h-[44px] items-center gap-3 md:justify-center md:gap-2 md:px-2 lg:gap-3.5 lg:px-4">
            <ClockIcon className="h-5 w-5 shrink-0 lg:h-6 lg:w-6" />
            <p className="font-sans text-sm leading-snug text-warm-ivory sm:text-[0.9375rem] md:text-[0.8125rem] lg:text-[0.9375rem]">
              {CELEBRATION_DETAILS_CONTENT.timeLabel}
            </p>
          </div>

          {venueSlot ?? (
            <div className="flex min-h-[44px] items-center gap-3 md:justify-center md:gap-2 md:px-2 lg:gap-3.5 lg:px-4">
              <MapPinIcon className="h-5 w-5 shrink-0 lg:h-6 lg:w-6" />
              <a
                href={VENUE_CONTENT.directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${VENUE_CONTENT.name} \u2014 open Google Maps directions in a new tab`}
                className="inline-flex min-h-[44px] items-center py-1 font-sans text-sm leading-snug text-warm-ivory underline decoration-champagne-gold/55 underline-offset-4 transition-colors hover:text-champagne-gold hover:decoration-champagne-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne-gold sm:text-[0.9375rem] md:whitespace-nowrap md:text-[0.8125rem] lg:text-[0.9375rem]"
              >
                {VENUE_CONTENT.name}
              </a>
            </div>
          )}
        </EditorialFrame>

        <OliveSprigAccent
          side="right"
          className="hidden h-9 w-12 shrink-0 md:block lg:h-14 lg:w-24"
        />
      </div>
    </SectionShell>
  );
}
