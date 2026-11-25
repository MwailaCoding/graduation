import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Single-application Next.js App Router foundation (SSR + Route Handlers enabled; no static export)
  serverExternalPackages: ["pg"],
  async headers() {
    return [
      {
        source: "/rsvp/manage/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, private",
          },
          {
            key: "Referrer-Policy",
            value: "no-referrer",
          },
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow",
          },
        ],
      },
      {
        source: "/api/rsvp/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, private",
          },
          {
            key: "Referrer-Policy",
            value: "no-referrer",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
