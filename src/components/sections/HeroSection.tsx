import Image from "next/image";
import { HeroCrestEmblem } from "@/components/ui/EditorialMotifs";
import { DECORATIVE_ASSETS, HERO_CONTENT } from "@/lib/invitation-data";

export function HeroSection() {
  const { magnoliaBranch, eucalyptusSprig, magnoliaBloom } = DECORATIVE_ASSETS;

  return (
    <section
      id="home"
      aria-labelledby="hero-title"
      className="paper-texture relative scroll-mt-16 overflow-x-clip border-b border-champagne-gold/30"
    >
      {/* Corner botanicals (pointer-events-none, aria-hidden) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-3 -left-6 z-10 w-[130px] -scale-x-100 select-none md:-top-7 md:-left-16 md:w-[142px] md:rotate-[6deg] lg:-top-7 lg:-left-14 lg:w-[195px] xl:-top-7 xl:-left-14 xl:w-[210px]"
      >
        <Image
          src={magnoliaBranch.src}
          alt={magnoliaBranch.alt}
          width={magnoliaBranch.width}
          height={magnoliaBranch.height}
          loading="eager"
          aria-hidden="true"
          className="h-auto w-full"
        />
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-6 -left-14 z-10 hidden w-[132px] rotate-[6deg] opacity-90 select-none md:block lg:-bottom-6 lg:-left-14 lg:w-[175px] xl:-bottom-6 xl:-left-14 xl:w-[195px]"
      >
        <Image
          src={eucalyptusSprig.src}
          alt={eucalyptusSprig.alt}
          width={eucalyptusSprig.width}
          height={eucalyptusSprig.height}
          loading="eager"
          aria-hidden="true"
          className="h-auto w-full"
        />
      </div>

      {/* Single DOM tree: mobile vertical stack -> desktop 2-column split */}
      <div className="relative mx-auto flex max-w-[1440px] flex-col md:grid md:grid-cols-12 md:items-stretch">
        {/* Copy Column */}
        <div className="relative z-20 flex flex-col items-center justify-center px-5 pt-6 pb-5 text-center md:col-span-6 md:pt-9 md:pr-5 md:pb-14 md:pl-16 lg:py-10 lg:pr-8 lg:pl-20 xl:pl-24">
          <HeroCrestEmblem className="mb-2.5 h-auto w-[78px] md:mb-3 md:w-[90px] lg:w-[106px]" />

          <div className="mb-2 flex w-full max-w-[330px] items-center justify-center gap-2 md:mb-2.5 md:max-w-[304px] md:gap-2 lg:max-w-[380px] lg:gap-3">
            <span
              aria-hidden="true"
              className="h-px flex-1 max-w-5 bg-champagne-gold/80 md:max-w-5 lg:max-w-11"
            />
            <p className="font-sans text-[9px] font-medium tracking-[0.13em] whitespace-nowrap text-forest-green uppercase md:text-[9.5px] md:tracking-[0.13em] lg:text-[11px] lg:tracking-[0.16em]">
              {HERO_CONTENT.eyebrow}
            </p>
            <span
              aria-hidden="true"
              className="h-px flex-1 max-w-5 bg-champagne-gold/80 md:max-w-5 lg:max-w-11"
            />
          </div>

          <h1
            id="hero-title"
            className="mb-1.5 py-0.5 font-serif text-[32px] leading-[1.22] font-normal tracking-[-0.01em] text-forest-green italic sm:text-[36px] md:mb-2 md:text-[38px] lg:text-[46px] xl:text-[50px]"
          >
            {HERO_CONTENT.titleLines[0]}
            <br />
            {HERO_CONTENT.titleLines[1]}
            <br />
            {HERO_CONTENT.titleLines[2]}
          </h1>

          <p className="mb-1 font-sans text-[9.5px] font-medium tracking-[0.22em] text-forest-green uppercase md:mb-1.5 md:text-[10.5px] lg:text-[11px]">
            {HERO_CONTENT.subEyebrow}
          </p>

          <p className="mb-3 py-0.5 font-serif text-[29px] leading-[1.22] font-normal text-forest-green italic sm:text-[32px] md:mb-4 md:text-[34px] lg:mb-5 lg:text-[40px] xl:text-[44px]">
            {HERO_CONTENT.graduatesHeading}
          </p>

          <p className="max-w-[316px] font-sans text-[12.5px] leading-[1.6] text-forest-green md:max-w-[365px] md:text-[13px] lg:max-w-[385px] lg:text-[13.5px]">
            {HERO_CONTENT.invitationCopy}
          </p>
        </div>

        {/* Portrait Column (Mobile Arch Frame / Desktop Feathered Split) */}
        <div className="relative z-10 w-full px-4 pb-2 md:col-span-6 md:-ml-8 md:w-[calc(100%+2rem)] md:px-0 md:pb-0 lg:-ml-12 lg:w-[calc(100%+3rem)]">
          <div className="relative mx-auto aspect-[6/5] w-full max-w-[360px] overflow-hidden rounded-t-[180px] rounded-b-none md:aspect-auto md:h-[460px] md:max-w-none md:rounded-none md:[mask-image:linear-gradient(to_right,transparent_0%,rgba(0,0,0,0.45)_8%,#000_19%,#000_100%)] lg:h-[500px] xl:h-[530px]">
            <Image
              src={HERO_CONTENT.image.src}
              alt={HERO_CONTENT.image.alt}
              fill
              preload={true}
              sizes="(max-width: 767px) 92vw, 54vw"
              className="object-cover object-[50%_38%] md:object-[50%_44%]"
            />

            {/* Desktop left-edge ivory feathering (stops before 20% so Left Twin's face stays crisp) */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 z-10 hidden w-[22%] bg-[linear-gradient(90deg,#F7F3EA_0%,rgba(247,243,234,0.78)_35%,rgba(247,243,234,0.2)_72%,transparent_100%)] md:block"
            />

            {/* Desktop subtle bottom softening */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 z-10 hidden h-8 bg-gradient-to-t from-warm-ivory/45 to-transparent md:block"
            />

            {/* Mobile arch radial vignette & soft base fade */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(ellipse_88%_86%_at_50%_52%,transparent_66%,rgba(247,243,234,0.55)_86%,#F7F3EA_100%)] md:hidden"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-8 bg-gradient-to-t from-warm-ivory via-warm-ivory/40 to-transparent md:hidden"
            />
          </div>

          {/* Mobile arch lower-corner magnolias */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-2 left-1 z-20 w-[92px] -rotate-12 select-none md:hidden"
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
            className="pointer-events-none absolute right-1 -bottom-2 z-20 w-[96px] -scale-x-100 rotate-6 select-none md:hidden"
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

      {/* Desktop bottom-right signature magnolia */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-5 -bottom-5 z-20 hidden w-[165px] select-none md:block lg:-right-6 lg:-bottom-6 lg:w-[235px] xl:w-[260px]"
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
    </section>
  );
}
