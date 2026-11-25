import type {
  CelebrationDetailsContent,
  DecorativeAssets,
  GraduateProfile,
  GraduatesSectionContent,
  HeroContent,
  InvitationData,
  NavLink,
  RsvpContent,
  SiteHeaderContent,
  ThankYouContent,
  VenueContent,
} from "@/types/invitation";

/**
 * 1-line swappable Hero photograph path.
 * Interim fallback uses `twins_botanical_bench_portrait.jpeg` staged as `/assets/photos/twins/twins-hero-bench.jpg`.
 * If the client supplies the armchair twins JPEG, stage it to `/assets/photos/twins/twins-armchair.jpg` and update this single line.
 */
export const HERO_PHOTO_SRC =
  "/assets/photos/twins/twins-hero-bench.jpg" as const;

export const RAINBOW_RUIRU_MAPS_DIRECTIONS_URL =
  "https://www.google.com/maps/dir/?api=1&destination=Rainbow+Ruiru+Resort%2C+Ruiru%2C+Kenya" as const;

export const NAV_LINKS: readonly NavLink[] = [
  { label: "Home", href: "#home" },
  { label: "The Graduates", href: "#graduates" },
  { label: "Celebration Details", href: "#details" },
] as const;

export const SITE_HEADER_CONTENT: SiteHeaderContent = {
  brandName: "Majala & Florence",
  brandHref: "#home",
  links: NAV_LINKS,
  rsvpCta: { label: "RSVP", href: "#rsvp" },
} as const;

export const HERO_CONTENT: HeroContent = {
  eyebrow: "YOU ARE CORDIALLY INVITED TO THE",
  titleLines: ["Graduation &", "Thanksgiving", "Celebration"],
  subEyebrow: "OF",
  graduatesHeading: "Majala & Florence",
  invitationCopy:
    "Join us as we celebrate our graduation, give thanks for God's faithfulness, and mark the completion of five years of learning, growth and grace.",
  image: {
    src: HERO_PHOTO_SRC,
    alt: "Majala and Florence Mwaila seated together in matching patterned ivory and forest-green attire against a soft olive botanical backdrop",
    width: 853,
    height: 1280,
    objectPosition: "50% 44%",
  },
} as const;

export const GRADUATES: readonly [GraduateProfile, GraduateProfile] = [
  {
    id: "majala",
    name: "Majala Mwaila",
    displayLines: ["Majala", "Mwaila"],
    degree: "Bachelor's Degree in Education (Mathematics)",
    image: {
      src: "/assets/photos/majala/majala-portrait.jpg",
      alt: "Majala Mwaila seated on a wooden studio stool wearing a terracotta blazer and white dress",
      width: 912,
      height: 1368,
      objectPosition: "50% 18%",
    },
  },
  {
    id: "florence",
    name: "Florence Achala Mwaila",
    displayLines: ["Florence", "Achala Mwaila"],
    degree: "Bachelor's Degree in French and Sociology",
    image: {
      src: "/assets/photos/florence/florence-portrait.jpg",
      alt: "Florence Achala Mwaila smiling in a terracotta blazer and white dress with gold botanical earrings",
      width: 1280,
      height: 1236,
      objectPosition: "50% 14%",
    },
  },
] as const;

export const GRADUATES_SECTION_CONTENT: GraduatesSectionContent = {
  heading: "Meet the Graduates",
  graduates: GRADUATES,
} as const;

export const CELEBRATION_DETAILS_CONTENT: CelebrationDetailsContent = {
  dateLabel: "Saturday, 12 December 2026",
  dateLines: ["Saturday,", "12 December 2026"],
  timeLabel: "12:00 PM",
} as const;

export const VENUE_CONTENT: VenueContent = {
  name: "Rainbow Ruiru Resort",
  directionsUrl: RAINBOW_RUIRU_MAPS_DIRECTIONS_URL,
  directionsLabel: "Get Directions \u2197",
  directionsAriaLabel:
    "Get Google Maps directions to Rainbow Ruiru Resort (opens in a new tab)",
} as const;

export const RSVP_CONTENT: RsvpContent = {
  heading: "Kindly RSVP",
  copy: "Please confirm your attendance so we can plan and celebrate with you.",
  ctaLabel: "RSVP Now \u2192",
  noticeTitle: "RSVP Opening Soon",
  noticeBody:
    "Online RSVP confirmation for Majala & Florence's Graduation & Thanksgiving Celebration on Saturday, 12 December 2026 at Rainbow Ruiru Resort will open shortly. Thank you for celebrating with us!",
  noticeCloseLabel: "Close",
} as const;

export const THANK_YOU_CONTENT: ThankYouContent = {
  heading: "Thank You",
  copy: "Thank you for being part of our journey. Every prayer, encouragement, sacrifice and expression of love has helped make this day possible. As we celebrate this milestone, we carry with us the people who walked with us, believed in us and reminded us that we were never alone. This celebration is as much yours as it is ours.",
  signature: "Majala & Florence",
} as const;

export const DECORATIVE_ASSETS: DecorativeAssets = {
  magnoliaBloom: {
    src: "/assets/botanical/magnolia-bloom.webp",
    alt: "",
    width: 800,
    height: 533,
  },
  magnoliaBranch: {
    src: "/assets/botanical/magnolia-branch.webp",
    alt: "",
    width: 800,
    height: 533,
  },
  eucalyptusSprig: {
    src: "/assets/botanical/eucalyptus-sprig.webp",
    alt: "",
    width: 800,
    height: 400,
  },
  magnoliaBouquet: {
    src: "/assets/botanical/magnolia-bouquet.webp",
    alt: "",
    width: 900,
    height: 450,
  },
  capMagnolia: {
    src: "/assets/graduation/cap-magnolia.webp",
    alt: "",
    width: 800,
    height: 533,
  },
  magnoliaDivider: {
    src: "/assets/decorative/magnolia-divider.webp",
    alt: "",
    width: 1000,
    height: 333,
  },
} as const;

export const INVITATION_DATA: InvitationData = {
  header: SITE_HEADER_CONTENT,
  hero: HERO_CONTENT,
  graduatesSection: GRADUATES_SECTION_CONTENT,
  celebrationDetails: CELEBRATION_DETAILS_CONTENT,
  venue: VENUE_CONTENT,
  rsvp: RSVP_CONTENT,
  thankYou: THANK_YOU_CONTENT,
  decorative: DECORATIVE_ASSETS,
} as const;
