"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { AuthenticatedAdmin } from "@/types/admin";

interface NavItem {
  label: string;
  href: string;
  matchExact?: boolean;
}

const NAV_ITEMS: readonly NavItem[] = [
  { label: "Overview", href: "/admin", matchExact: true },
  { label: "RSVP Management", href: "/admin/rsvps" },
  { label: "Guest Directory", href: "/admin/guests" },
  { label: "Messages", href: "/admin/messages" },
  { label: "Catering", href: "/admin/catering" },
  { label: "Reports & Export", href: "/admin/reports" },
  { label: "Activity Log", href: "/admin/activity" },
  { label: "Settings", href: "/admin/settings" },
  { label: "Admin Profile", href: "/admin/profile" },
];

function isNavActive(pathname: string, item: NavItem): boolean {
  if (item.matchExact) {
    return pathname === item.href;
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

interface AdminShellProps {
  admin: AuthenticatedAdmin;
  children: ReactNode;
}

export function AdminShell({ admin, children }: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerPath, setDrawerPath] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const drawerOpen = drawerPath === pathname;

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawerPath(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/admin/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    } finally {
      router.replace("/admin/login");
      router.refresh();
    }
  }

  function renderNavLinks() {
    return (
      <nav aria-label="Admin navigation" className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = isNavActive(pathname, item);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              onClick={() => setDrawerPath(null)}
              className={`flex min-h-[44px] items-center justify-between border-l-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-green ${
                active
                  ? "border-champagne-gold bg-forest-green text-warm-ivory"
                  : "border-transparent text-forest-green hover:bg-warm-sand/65"
              }`}
            >
              <span>{item.label}</span>
            </Link>
          );
        })}

        <div className="my-2 border-t border-warm-sand" />

        <button
          type="button"
          disabled={loggingOut}
          onClick={handleLogout}
          className="flex min-h-[44px] w-full items-center border-l-2 border-transparent px-3 py-2 text-left text-sm font-medium text-[#7A271A] transition-colors hover:bg-[#7A271A]/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-green disabled:opacity-60"
        >
          {loggingOut ? "Signing out..." : "Logout"}
        </button>
      </nav>
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-warm-ivory text-forest-green">
      <a
        href="#admin-main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:min-h-[44px] focus:bg-forest-green focus:px-4 focus:py-2 focus:text-sm focus:text-warm-ivory"
      >
        Skip to main content
      </a>

      <div className="flex min-h-screen">
        {/* Desktop Sidebar */}
        <aside className="admin-no-print hidden w-64 shrink-0 border-r border-warm-sand bg-[#FCFBF7] lg:flex lg:flex-col">
          <div className="border-b border-warm-sand px-5 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-olive">
              Private Administration
            </p>
            <p className="mt-1 font-serif text-lg font-semibold leading-snug text-forest-green">
              Majala &amp; Florence
            </p>
            <p className="mt-0.5 text-xs text-forest-green/75">
              12 December 2026 · Ruiru
            </p>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-4">
            {renderNavLinks()}
          </div>

          <div className="border-t border-warm-sand px-5 py-4">
            <p className="truncate text-xs font-semibold text-forest-green">
              {admin.displayName}
            </p>
            <p className="truncate text-xs text-forest-green/75">
              {admin.email}
            </p>
          </div>
        </aside>

        {/* Right Column: Top Header + Workspace */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="admin-no-print sticky top-0 z-30 flex min-h-[60px] items-center justify-between gap-3 border-b border-warm-sand bg-[#FCFBF7]/95 px-4 py-2 backdrop-blur-xs lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                aria-label="Open navigation menu"
                aria-expanded={drawerOpen}
                aria-controls="admin-mobile-drawer"
                onClick={() =>
                  setDrawerPath((prev) => (prev === pathname ? null : pathname))
                }
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center border border-forest-green/25 bg-warm-ivory text-forest-green hover:bg-warm-sand/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-green lg:hidden"
              >
                <svg
                  aria-hidden="true"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d={
                      drawerOpen
                        ? "M6 18L18 6M6 6l12 12"
                        : "M4 6h16M4 12h16M4 18h16"
                    }
                  />
                </svg>
              </button>

              <div className="min-w-0">
                <p className="truncate font-serif text-base font-semibold text-forest-green lg:hidden">
                  Majala &amp; Florence Admin
                </p>
                <p className="hidden text-xs font-medium uppercase tracking-[0.14em] text-forest-green/75 lg:block">
                  Graduation &amp; Thanksgiving RSVP Administration
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <Link
                href="/admin/rsvps/new"
                className="inline-flex min-h-[44px] items-center border border-forest-green bg-forest-green px-3 py-2 text-xs font-medium text-warm-ivory transition-colors hover:bg-forest-green/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-green sm:px-4 sm:text-sm"
              >
                + Add RSVP
              </Link>
              <Link
                href="/admin/profile"
                className="hidden min-h-[44px] items-center border border-warm-sand bg-warm-ivory px-3 py-2 text-xs font-medium text-forest-green hover:bg-warm-sand/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-green sm:inline-flex"
              >
                {admin.displayName}
              </Link>
            </div>
          </header>

          {/* Mobile Drawer */}
          {drawerOpen && (
            <div
              className="admin-no-print fixed inset-0 z-40 flex bg-forest-green/45 lg:hidden"
              role="presentation"
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  setDrawerPath(null);
                }
              }}
            >
              <div
                id="admin-mobile-drawer"
                role="dialog"
                aria-modal="true"
                aria-label="Admin navigation menu"
                className="flex h-full w-72 max-w-[85vw] flex-col border-r border-warm-sand bg-[#FCFBF7] shadow-lg"
              >
                <div className="flex items-center justify-between border-b border-warm-sand px-4 py-4">
                  <div className="min-w-0">
                    <p className="font-serif text-base font-semibold text-forest-green">
                      Majala &amp; Florence
                    </p>
                    <p className="truncate text-xs text-forest-green/75">
                      {admin.email}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Close navigation menu"
                    onClick={() => setDrawerPath(null)}
                    className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center border border-forest-green/20 text-forest-green hover:bg-warm-sand/60"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto px-3 py-4">
                  {renderNavLinks()}
                </div>
              </div>
            </div>
          )}

          {/* Main Workspace */}
          <main
            id="admin-main-content"
            className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8"
          >
            <div className="mx-auto w-full max-w-6xl min-w-0">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
