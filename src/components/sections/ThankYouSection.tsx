import Image from "next/image";
import { BotanicalDivider } from "@/components/ui/BotanicalDivider";
import { ClosingWaveTrim } from "@/components/ui/EditorialMotifs";
import { SectionShell } from "@/components/ui/SectionShell";
import { DECORATIVE_ASSETS, THANK_YOU_CONTENT } from "@/lib/invitation-data";

export function ThankYouSection() {
  const { magnoliaBloom } = DECORATIVE_ASSETS;

  return (
    <SectionShell
      as="footer"
      id="thank-you"
      surface="forest"
      spacing="none"
      maxWidth="full"
      ariaLabelledBy="thank-you-heading"
    >
      {/* Organic wave + champagne-gold ribbon transition from warm ivory to forest green */}
      <div className="paper-texture w-full">
        <ClosingWaveTrim className="block h-12 w-full sm:h-16 md:h-20" />
      </div>

      <div className="relative -mt-px bg-forest-green">
        <div className="relative mx-auto max-w-[1160px] px-5 pt-3 pb-16 sm:px-6 sm:pt-4 sm:pb-14 md:px-8 md:pb-14 lg:px-10">
          <div className="relative z-10 mx-auto max-w-2xl text-center text-warm-ivory">
            <h2
              id="thank-you-heading"
              className="font-serif text-[2rem] leading-tight tracking-tight text-warm-ivory italic sm:text-[2.375rem]"
            >
              {THANK_YOU_CONTENT.heading}
            </h2>

            <p className="mx-auto mt-3 max-w-2xl font-sans text-sm leading-relaxed text-warm-ivory/90 sm:text-[0.9375rem]">
              {THANK_YOU_CONTENT.copy}
            </p>

            <BotanicalDivider
              variant="signature-rule"
              label={THANK_YOU_CONTENT.signature}
              as="p"
              tone="light"
              className="mt-5 font-serif text-xl italic"
            />
          </div>

          {/* Bottom-right restrained botanical accent */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-1 bottom-1 w-20 opacity-95 select-none sm:right-3 sm:bottom-1.5 sm:w-24 md:right-4 md:bottom-2 md:w-28 lg:w-44"
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
        </div>
      </div>
    </SectionShell>
  );
}
