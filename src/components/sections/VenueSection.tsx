import { ActionLinkButton } from "@/components/ui/ActionLinkButton";
import { SectionShell } from "@/components/ui/SectionShell";
import { VENUE_CONTENT } from "@/lib/invitation-data";

export function VenueSection() {
  return (
    <SectionShell
      id="venue"
      surface="ivory"
      textured
      spacing="none"
      ariaLabel="Venue and Directions"
      className="pb-3 md:pb-4"
    >
      <div className="flex items-center justify-center">
        <ActionLinkButton
          href={VENUE_CONTENT.directionsUrl}
          external
          variant="outline"
          size="md"
          className="focus-visible:outline-forest-green"
          ariaLabel={`Get Directions to ${VENUE_CONTENT.name} (opens in a new tab)`}
        >
          {VENUE_CONTENT.directionsLabel}
        </ActionLinkButton>
      </div>
    </SectionShell>
  );
}
