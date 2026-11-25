"use client";

import { useEffect, useRef, useState } from "react";
import { BrandCrestIcon } from "@/components/ui/EditorialMotifs";
import { SITE_HEADER_CONTENT } from "@/lib/invitation-data";

export function SiteHeader() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 768px)");

    const handleViewportChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setIsMenuOpen(false);
      }
    };

    mediaQuery.addEventListener("change", handleViewportChange);

    return () => {
      mediaQuery.removeEventListener("change", handleViewportChange);
    };
  }, []);

  useEffect(() => {
    if (!isMenuOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (
        headerRef.current &&
        event.target instanceof Node &&
        !headerRef.current.contains(event.target)
      ) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isMenuOpen]);

  const closeMenu = () => setIsMenuOpen(false);

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-40 w-full border-b border-champagne-gold/45 bg-warm-ivory md:bg-forest-green"
    >
      <div className="mx-auto flex h-14 max-w-[1160px] items-center justify-between px-5 md:h-16 md:px-7 lg:px-10">
        <a
          href={SITE_HEADER_CONTENT.brandHref}
          onClick={closeMenu}
          className="flex shrink-0 items-center gap-2.5 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-champagne-gold"
        >
          <BrandCrestIcon tone="responsive" className="h-6 w-9 shrink-0" />
          <span className="font-serif text-[17px] leading-none italic whitespace-nowrap text-forest-green md:text-[18px] md:text-warm-ivory lg:text-[20px]">
            {SITE_HEADER_CONTENT.brandName}
          </span>
        </a>

        {/* Desktop navigation (>= 768px) */}
        <nav
          aria-label="Primary navigation"
          className="hidden items-center md:flex md:gap-4 lg:gap-7"
        >
          {SITE_HEADER_CONTENT.links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-sm font-sans text-[13px] font-normal whitespace-nowrap text-warm-ivory transition-colors duration-150 hover:text-champagne-gold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-champagne-gold lg:text-[14px]"
            >
              {link.label}
            </a>
          ))}

          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new CustomEvent("open-rsvp-modal"));
            }}
            className="ml-1 inline-flex min-h-[34px] cursor-pointer items-center justify-center rounded-full border border-[#DFC793]/70 bg-champagne-gold bg-gradient-to-b from-[#D9C08B] to-champagne-gold px-6 py-1.5 font-sans text-[12.5px] font-semibold tracking-[0.06em] whitespace-nowrap text-forest-green uppercase transition-colors duration-150 hover:from-[#E2CA98] hover:to-[#CCA96F] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warm-ivory lg:ml-2 lg:px-7 lg:text-[13px]"
          >
            {SITE_HEADER_CONTENT.rsvpCta.label}
          </button>
        </nav>

        {/* Mobile hamburger toggle (< 768px) */}
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setIsMenuOpen((prev) => !prev)}
          aria-expanded={isMenuOpen}
          aria-controls="mobile-nav-drawer"
          aria-label={isMenuOpen ? "Close navigation menu" : "Open navigation menu"}
          className="-mr-2 flex h-11 w-11 items-center justify-center rounded text-forest-green focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-green md:hidden"
        >
          {isMenuOpen ? (
            <svg
              aria-hidden="true"
              focusable="false"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
              className="h-5 w-5"
            >
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          ) : (
            <svg
              aria-hidden="true"
              focusable="false"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
              className="h-5 w-5"
            >
              <line x1="3" y1="7" x2="21" y2="7" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="17" x2="21" y2="17" />
            </svg>
          )}
        </button>
      </div>

      {/* Instant zero-animation mobile drawer (< 768px) */}
      {isMenuOpen ? (
        <nav
          id="mobile-nav-drawer"
          aria-label="Mobile navigation"
          className="absolute inset-x-0 top-full z-40 flex flex-col border-t border-warm-sand border-b border-b-champagne-gold bg-warm-ivory px-6 py-4 md:hidden"
        >
          {SITE_HEADER_CONTENT.links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={closeMenu}
              className="flex min-h-[44px] items-center border-b border-warm-sand/80 font-sans text-[15px] text-forest-green hover:text-muted-olive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-green"
            >
              {link.label}
            </a>
          ))}

          <button
            type="button"
            onClick={() => {
              closeMenu();
              window.dispatchEvent(new CustomEvent("open-rsvp-modal"));
            }}
            className="mt-3 flex min-h-[44px] w-full cursor-pointer items-center justify-center rounded-full border border-[#DFC793]/70 bg-gradient-to-b from-[#D9C08B] to-champagne-gold font-sans text-[13px] font-semibold tracking-[0.08em] text-forest-green uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-green"
          >
            {SITE_HEADER_CONTENT.rsvpCta.label}
          </button>
        </nav>
      ) : null}
    </header>
  );
}
