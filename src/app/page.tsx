import { CelebrationDetailsSection } from "@/components/sections/CelebrationDetailsSection";
import { GraduatesSection } from "@/components/sections/GraduatesSection";
import { HeroSection } from "@/components/sections/HeroSection";
import { RsvpSection } from "@/components/sections/RsvpSection";
import { SiteHeader } from "@/components/sections/SiteHeader";
import { ThankYouSection } from "@/components/sections/ThankYouSection";
import { VenueSection } from "@/components/sections/VenueSection";
import { isRsvpClosed } from "@/lib/event-config";
import { ensureRetentionEnforcedIfDue } from "@/lib/rsvp/retention";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const rsvpClosed = isRsvpClosed();
  await ensureRetentionEnforcedIfDue().catch((err) => {
    console.error(
      "[rsvp-retention] Opportunistic retention check error:",
      err instanceof Error ? err.name : "UnknownError",
    );
  });

  return (
    <>
      <SiteHeader />
      <main id="main-content">
        <HeroSection />
        <GraduatesSection />
        <CelebrationDetailsSection />
        <VenueSection />
        <RsvpSection isClosed={rsvpClosed} />
      </main>
      <ThankYouSection />
    </>
  );
}
