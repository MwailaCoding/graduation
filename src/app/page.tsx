import { CelebrationDetailsSection } from "@/components/sections/CelebrationDetailsSection";
import { GraduatesSection } from "@/components/sections/GraduatesSection";
import { HeroSection } from "@/components/sections/HeroSection";
import { RsvpSection } from "@/components/sections/RsvpSection";
import { SiteHeader } from "@/components/sections/SiteHeader";
import { ThankYouSection } from "@/components/sections/ThankYouSection";
import { VenueSection } from "@/components/sections/VenueSection";
import { getEffectiveRsvpPolicy } from "@/lib/admin/settings";
import { ensureRetentionEnforcedIfDue } from "@/lib/rsvp/retention";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const policy = await getEffectiveRsvpPolicy();
  const rsvpClosed = !policy.isAcceptingNewRsvps;
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
