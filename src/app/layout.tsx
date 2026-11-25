import type { Metadata } from "next";
import { Manrope, Playfair_Display } from "next/font/google";
import "@/styles/globals.css";

const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-playfair-display",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

function getMetadataBase(): URL {
  const envUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined) ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ||
    "https://mwaila-graduation.primecloud.app";

  try {
    const normalized =
      envUrl.startsWith("http://") || envUrl.startsWith("https://")
        ? envUrl
        : `https://${envUrl}`;
    return new URL(normalized);
  } catch {
    return new URL("https://mwaila-graduation.primecloud.app");
  }
}

export const metadata: Metadata = {
  metadataBase: getMetadataBase(),
  title: {
    default: "Majala & Florence — Graduation & Thanksgiving Celebration",
    template: "%s | Majala & Florence",
  },
  description:
    "You are cordially invited to the Graduation & Thanksgiving Celebration of Majala Mwaila and Florence Achala Mwaila on Saturday, 12 December 2026 at Rainbow Ruiru Resort.",
  applicationName: "Mwaila Graduation Celebration",
  authors: [{ name: "Majala Mwaila" }, { name: "Florence Achala Mwaila" }],
  creator: "Mwaila Family",
  keywords: [
    "Graduation",
    "Thanksgiving",
    "Majala Mwaila",
    "Florence Achala Mwaila",
    "Rainbow Ruiru Resort",
    "Celebration",
    "RSVP",
  ],
  openGraph: {
    type: "website",
    locale: "en_KE",
    url: "/",
    siteName: "Majala & Florence Graduation & Thanksgiving",
    title: "Majala & Florence — Graduation & Thanksgiving Celebration",
    description:
      "You are cordially invited to celebrate the Graduation & Thanksgiving of Majala Mwaila and Florence Achala Mwaila on Saturday, 12 December 2026 at Rainbow Ruiru Resort. Tap to view details and RSVP.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Majala & Florence — Graduation & Thanksgiving Celebration",
    description:
      "You are cordially invited to celebrate the Graduation & Thanksgiving of Majala Mwaila and Florence Achala Mwaila on Saturday, 12 December 2026 at Rainbow Ruiru Resort. Tap to view details and RSVP.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${playfairDisplay.variable} ${manrope.variable}`}
    >
      <body className="min-h-screen bg-warm-ivory font-sans text-forest-green antialiased selection:bg-champagne-gold/30 selection:text-forest-green">
        {children}
      </body>
    </html>
  );
}
