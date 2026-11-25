export interface NavLink {
  readonly label: string;
  readonly href: string;
}

export interface ImageAsset {
  readonly src: string;
  readonly alt: string;
  readonly width: number;
  readonly height: number;
  readonly objectPosition?: string;
}

export interface SiteHeaderContent {
  readonly brandName: string;
  readonly brandHref: string;
  readonly links: readonly NavLink[];
  readonly rsvpCta: NavLink;
}

export interface HeroContent {
  readonly eyebrow: string;
  readonly titleLines: readonly [string, string, string];
  readonly subEyebrow: string;
  readonly graduatesHeading: string;
  readonly invitationCopy: string;
  readonly image: ImageAsset;
}

export interface GraduateImageAsset extends ImageAsset {
  readonly objectPosition: string;
}

export interface GraduateProfile {
  readonly id: "majala" | "florence" | "achala";
  readonly name: string;
  readonly displayLines: readonly [string, string];
  readonly degree: string;
  readonly image: GraduateImageAsset;
}

export interface GraduatesSectionContent {
  readonly heading: string;
  readonly graduates: readonly [GraduateProfile, GraduateProfile];
}

export interface CelebrationDetailsContent {
  readonly dateLabel: string;
  readonly dateLines: readonly [string, string];
  readonly timeLabel: string;
}

export interface VenueContent {
  readonly name: string;
  readonly directionsUrl: string;
  readonly directionsLabel: string;
  readonly directionsAriaLabel: string;
}

export interface RsvpContent {
  readonly heading: string;
  readonly copy: string;
  readonly ctaLabel: string;
  readonly noticeTitle: string;
  readonly noticeBody: string;
  readonly noticeCloseLabel: string;
}

export interface ThankYouContent {
  readonly heading: string;
  readonly copy: string;
  readonly signature: string;
}

export interface DecorativeAssets {
  readonly magnoliaBloom: ImageAsset;
  readonly magnoliaBranch: ImageAsset;
  readonly eucalyptusSprig: ImageAsset;
  readonly magnoliaBouquet: ImageAsset;
  readonly capMagnolia: ImageAsset;
  readonly magnoliaDivider: ImageAsset;
}

export interface InvitationData {
  readonly header: SiteHeaderContent;
  readonly hero: HeroContent;
  readonly graduatesSection: GraduatesSectionContent;
  readonly celebrationDetails: CelebrationDetailsContent;
  readonly venue: VenueContent;
  readonly rsvp: RsvpContent;
  readonly thankYou: ThankYouContent;
  readonly decorative: DecorativeAssets;
}
