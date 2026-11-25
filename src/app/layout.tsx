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

export const metadata: Metadata = {
  title: "Majala & Florence — Graduation & Thanksgiving Celebration",
  description:
    "You are cordially invited to the Graduation & Thanksgiving Celebration of Majala Mwaila and Florence Achala Mwaila on Saturday, 12 December 2026 at Rainbow Ruiru Resort.",
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
