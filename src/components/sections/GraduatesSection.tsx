import Image from "next/image";
import { BotanicalDivider } from "@/components/ui/BotanicalDivider";
import { EditorialFrame } from "@/components/ui/EditorialFrame";
import {
  GraduatesCenterEmblem,
  OliveSprigAccent,
} from "@/components/ui/EditorialMotifs";
import { SectionShell } from "@/components/ui/SectionShell";
import { GRADUATES_SECTION_CONTENT } from "@/lib/invitation-data";
import type { GraduateProfile } from "@/types/invitation";

function GraduateCard({ graduate }: { graduate: GraduateProfile }) {
  return (
    <article className="flex items-center gap-3.5 sm:gap-5 md:gap-3.5 lg:gap-4 xl:gap-5">
      <EditorialFrame
        variant="notched"
        className="h-[90px] w-[104px] shrink-0 sm:h-[104px] sm:w-[120px] md:h-[112px] md:w-[126px] lg:h-[144px] lg:w-[166px] xl:h-[168px] xl:w-[196px]"
      >
        <Image
          src={graduate.image.src}
          alt={graduate.image.alt}
          width={graduate.image.width}
          height={graduate.image.height}
          loading="eager"
          decoding="sync"
          sizes="(min-width: 1280px) 240px, (min-width: 768px) 192px, 144px"
          className="h-full w-full object-cover"
          style={{ objectPosition: graduate.image.objectPosition }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 shadow-[inset_0_0_16px_rgba(232,222,208,0.55)]"
        />
      </EditorialFrame>

      <div className="min-w-0 text-left">
        <h3 className="font-serif text-[1.1875rem] leading-snug tracking-tight italic text-forest-green sm:text-2xl md:text-[1.375rem] md:leading-[1.16] lg:text-[1.625rem] xl:text-[1.875rem]">
          <span className="md:block">{graduate.displayLines[0]} </span>
          <span className="md:block">{graduate.displayLines[1]}</span>
        </h3>
        <div
          aria-hidden="true"
          className="my-1.5 h-px w-12 bg-champagne-gold/75 md:my-2 md:w-14"
        />
        <p className="max-w-[235px] font-sans text-xs leading-[1.45] text-forest-green/85 sm:max-w-none sm:text-sm md:max-w-[175px] md:text-[0.8125rem] lg:max-w-[195px] lg:text-[0.875rem] xl:max-w-[215px] xl:text-[0.9375rem]">
          {graduate.degree}
        </p>
      </div>
    </article>
  );
}

export function GraduatesSection() {
  const [majala, florence] = GRADUATES_SECTION_CONTENT.graduates;

  return (
    <SectionShell
      id="graduates"
      surface="ivory"
      textured
      maxWidth="full"
      spacing="none"
      ariaLabelledBy="graduates-heading"
      className="pt-8 pb-4 md:pt-11 md:pb-5"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[60%] left-2 z-0 hidden w-20 -translate-y-1/2 -rotate-[52deg] opacity-85 select-none xl:block 2xl:left-8 2xl:w-24"
      >
        <OliveSprigAccent side="left" className="h-auto w-full" />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[60%] right-2 z-0 hidden w-20 -translate-y-1/2 rotate-[52deg] opacity-85 select-none xl:block 2xl:right-8 2xl:w-24"
      >
        <OliveSprigAccent side="right" className="h-auto w-full" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[1160px] px-5 sm:px-6 md:px-8 lg:px-10">
        <BotanicalDivider
          variant="heading-rule"
          label={GRADUATES_SECTION_CONTENT.heading}
          as="h2"
          headingId="graduates-heading"
        />

        <div className="mt-6 flex flex-col gap-4 sm:gap-5 md:mt-7 md:grid md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center md:gap-3 lg:gap-5 xl:gap-6">
          <div className="md:justify-self-end">
            <GraduateCard graduate={majala} />
          </div>

          <div className="hidden md:flex md:items-center md:justify-center">
            <GraduatesCenterEmblem className="h-[72px] w-[104px] lg:h-[96px] lg:w-[138px] xl:h-[112px] xl:w-[160px]" />
          </div>

          <div className="md:justify-self-start">
            <GraduateCard graduate={florence} />
          </div>
        </div>
      </div>
    </SectionShell>
  );
}
