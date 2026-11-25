import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import {
  assertAllImagesLoaded,
  assertExactTextPresent,
  assertNoCountdown,
  assertNoHorizontalOverflow,
  auditNetworkEvents,
  findOpenRsvpNotice,
  getImagesAudit,
  getNavSummary,
  getPageSnapshot,
  normalizeText,
  SPEC,
  validatePngBuffer,
} from "./lib/assertions.mjs";
import { createSession, launchEdge } from "./lib/cdp.mjs";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3000";

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("Tier 4 — End-User Journeys & Visual Capture (J1–J6, 6 Journeys)", { concurrency: false }, () => {
  let browser;
  let session;

  before(async () => {
    browser = await launchEdge();
    session = await createSession(browser);
  });

  after(async () => {
    session?.close();
    await browser?.close();
  });

  test("J1: Desktop Guest Full Invitation Flow (1440x900)", async () => {
    await session.setViewport(SPEC.viewports.desktop);
    await session.setCacheDisabled(false);
    session.clearEvents();
    await session.goto(BASE_URL, { waitFonts: true, waitImages: true });

    const snap = await getPageSnapshot(session);
    assert.ok(snap.hasHeader && snap.hasMain && snap.hasFooter);
    assertNoCountdown(snap.bodyText);

    // Hero
    assertExactTextPresent(snap.bodyText, SPEC.copy.heroEyebrow, "Hero");
    assertExactTextPresent(snap.bodyText, SPEC.copy.heroTitle, "Hero");
    assertExactTextPresent(snap.bodyText, SPEC.copy.heroSubEyebrow, "Hero");
    assertExactTextPresent(snap.bodyText, SPEC.copy.graduatesShort, "Hero");
    assertExactTextPresent(snap.bodyText, SPEC.copy.heroParagraph, "Hero");
    const heroPara = await session.evaluate(() => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const p = [...document.querySelectorAll("p")].find((el) =>
        norm(el.innerText).includes("Join us as we celebrate"),
      );
      return p ? p.innerText.trim() : "";
    });
    assert.equal(heroPara, SPEC.copy.heroParagraph);

    // Navigate to Graduates
    await session.clickElement({ selector: "header a, header button", text: "The Graduates", exact: true });
    await pause(300);
    assertExactTextPresent(snap.bodyText, SPEC.copy.majalaName);
    assertExactTextPresent(snap.bodyText, SPEC.copy.majalaDegree);
    assertExactTextPresent(snap.bodyText, SPEC.copy.florenceName);
    assertExactTextPresent(snap.bodyText, SPEC.copy.florenceDegree);

    // Celebration Details & Venue Maps Link
    assertExactTextPresent(snap.bodyText, SPEC.copy.celebrationDate);
    assertExactTextPresent(snap.bodyText, SPEC.copy.celebrationTime);
    assertExactTextPresent(snap.bodyText, SPEC.copy.venueName);
    const mapsLink = await session.evaluate(() => {
      const a = [...document.querySelectorAll("a")].find((el) =>
        (el.getAttribute("href") || "").includes("google.com/maps"),
      );
      return a
        ? {
            found: true,
            href: a.href,
            target: a.getAttribute("target"),
            rel: a.getAttribute("rel") || "",
          }
        : { found: false };
    });
    assert.ok(mapsLink.found, "Google Maps directions link missing");
    assert.ok(mapsLink.href.startsWith(SPEC.mapsUrlPrefix));
    assert.match(mapsLink.href, SPEC.mapsDestinationPattern);
    assert.match(mapsLink.href, /Ruiru/i);
    assert.equal(mapsLink.target, "_blank");
    assert.ok(mapsLink.rel.toLowerCase().split(/\s+/).includes("noopener"));

    // Gallery
    assertExactTextPresent(snap.bodyText, SPEC.copy.galleryHeading);
    const imgAudit = await assertAllImagesLoaded(session, { minCount: 8 });
    const galleryImgs = imgAudit.images.filter((i) => i.inGallery && i.alt.trim().length > 0);
    assert.equal(galleryImgs.length, 5);
    assert.equal(new Set(galleryImgs.map((i) => i.currentSrc || i.src)).size, 5);

    // RSVP open & close
    await session.clickElement({ selector: "button, a", text: SPEC.copy.rsvpCta, exact: true });
    await pause(150);
    const opened = await findOpenRsvpNotice(session);
    assert.ok(opened?.open && opened.closeButtonSelector);
    await session.clickSelector(opened.closeButtonSelector);
    await pause(150);
    assert.equal(await findOpenRsvpNotice(session), null);

    // Thank You Footer
    const footerText = await session.evaluate(() => {
      const f = document.querySelector("footer");
      if (!f) return "";
      f.scrollIntoView({ block: "center" });
      return (f.innerText || "").replace(/\s+/g, " ").trim();
    });
    assertExactTextPresent(footerText, SPEC.copy.thankYouHeading, "footer");
    assertExactTextPresent(footerText, SPEC.copy.thankYouCopy, "footer");
    assertExactTextPresent(footerText, SPEC.copy.signature, "footer");

    await assertNoHorizontalOverflow(session, 1440);
    await auditNetworkEvents(session, BASE_URL, { forbidMutations: true });
  });

  test("J2: Mobile Guest Interactive Flow (390x844)", async () => {
    await session.setViewport(SPEC.viewports.mobile);
    await session.setCacheDisabled(false);
    session.clearEvents();
    await session.goto(BASE_URL, { waitFonts: true, waitImages: true });

    const nav0 = await getNavSummary(session);
    assert.ok(nav0.found && nav0.hamburger?.visible);
    assert.equal(nav0.hamburger.ariaExpanded, "false");

    // Open hamburger -> click The Graduates
    await session.clickSelector("header button[aria-expanded]");
    await pause(150);
    await session.clickElement({
      selector: "header a, header button, nav a, nav button, [role='dialog'] a, [role='dialog'] button",
      text: "The Graduates",
      exact: true,
    });
    await pause(400);
    assert.equal((await getNavSummary(session)).hamburger?.ariaExpanded, "false");

    // Verify Venue link
    const hasMaps = await session.evaluate(() =>
      Boolean([...document.querySelectorAll("a")].find((a) => (a.getAttribute("href") || "").includes("google.com/maps"))),
    );
    assert.ok(hasMaps, "Venue Google Maps link missing on mobile");

    // Scroll to Gallery & verify 3-visible row without page overflow
    await session.evaluate((heading) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const sec = [...document.querySelectorAll("section")].find((s) => norm(s.innerText).includes(heading));
      sec?.scrollIntoView({ block: "center" });
    }, SPEC.copy.galleryHeading);
    await pause(150);
    const imgAudit = await getImagesAudit(session);
    const tiles = imgAudit.images.filter((i) => i.inGallery && i.alt.trim().length > 0);
    assert.equal(tiles.length, 5);
    assert.ok(Math.abs(tiles[0].rect.top - tiles[2].rect.top) <= 24);
    assert.ok(tiles[2].rect.right <= 390 + 24);
    await assertNoHorizontalOverflow(session, 390);

    // Scroll to RSVP, open, dismiss with Escape
    await session.clickElement({ selector: "button, a", text: SPEC.copy.rsvpCta, exact: true });
    await pause(150);
    assert.ok((await findOpenRsvpNotice(session))?.open);
    await session.pressKey("Escape");
    await pause(150);
    assert.equal(await findOpenRsvpNotice(session), null);

    // Scroll to Thank You footer
    const footerText = await session.evaluate(() => {
      const f = document.querySelector("footer");
      f?.scrollIntoView({ block: "center" });
      return f ? (f.innerText || "").replace(/\s+/g, " ").trim() : "";
    });
    assertExactTextPresent(footerText, SPEC.copy.thankYouCopy, "mobile footer");
    await assertNoHorizontalOverflow(session, 390);
    await auditNetworkEvents(session, BASE_URL, { forbidMutations: true });
  });

  test("J3: Small Mobile Guest (375x812) Scroll & Layout Integrity", async () => {
    await session.setViewport(SPEC.viewports.smallMobile);
    await session.setCacheDisabled(false);
    session.clearEvents();
    await session.goto(BASE_URL, { waitFonts: true, waitImages: true });

    const nav = await getNavSummary(session);
    assert.ok(nav.found && nav.hamburger?.visible);
    await session.clickSelector("header button[aria-expanded]");
    await pause(120);
    assert.equal((await getNavSummary(session)).hamburger?.ariaExpanded, "true");
    await session.clickSelector("header button[aria-expanded]");
    await pause(120);
    assert.equal((await getNavSummary(session)).hamburger?.ariaExpanded, "false");

    const scrollH = await session.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y <= scrollH; y += 500) {
      await session.scrollTo(y);
      await pause(60);
      await assertNoHorizontalOverflow(session, 375);
    }

    const snap = await getPageSnapshot(session);
    for (const marker of [
      SPEC.copy.heroTitle,
      SPEC.copy.graduatesHeading,
      SPEC.copy.celebrationDate,
      SPEC.copy.venueName,
      SPEC.copy.galleryHeading,
      SPEC.copy.rsvpHeading,
      SPEC.copy.thankYouHeading,
    ]) {
      assertExactTextPresent(snap.bodyText, marker, "small mobile page");
    }
    await assertAllImagesLoaded(session, { minCount: 8 });
    await auditNetworkEvents(session, BASE_URL, { forbidMutations: true });
  });

  test("J4: Keyboard-Only Accessibility Guest Journey (1440x900 & 390x844)", async () => {
    await session.setViewport(SPEC.viewports.desktop);
    await session.setCacheDisabled(false);
    session.clearEvents();
    await session.goto(BASE_URL, { waitFonts: true, waitImages: true });

    const snap = await getPageSnapshot(session);
    assert.equal(snap.headerCount, 1);
    assert.equal(snap.mainCount, 1);
    assert.equal(snap.footerCount, 1);
    assert.equal(snap.h1Count, 1);
    for (let i = 1; i < snap.headings.length; i++) {
      assert.ok(snap.headings[i].level <= snap.headings[i - 1].level + 1);
    }

    const reached = { nav: false, maps: false, rsvp: false };
    for (let step = 0; step < 35; step++) {
      await session.tab();
      const info = await session.evaluate(() => {
        const ae = document.activeElement;
        if (!ae) return { tag: null, text: "", href: "", inHeader: false };
        return {
          tag: ae.tagName.toLowerCase(),
          text: (ae.innerText || ae.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim(),
          href: ae.getAttribute("href") || "",
          inHeader: Boolean(ae.closest("header")),
        };
      });
      if (info.inHeader && info.text === "The Graduates") reached.nav = true;
      if (info.href.includes("google.com/maps")) reached.maps = true;
      if (info.text === SPEC.copy.rsvpCta) {
        reached.rsvp = true;
        break;
      }
    }
    assert.ok(reached.nav, "Keyboard Tab did not reach header nav link");
    assert.ok(reached.maps, "Keyboard Tab did not reach Venue Google Maps link");
    assert.ok(reached.rsvp, "Keyboard Tab did not reach RSVP Now → CTA");

    await session.activateFocused("Enter");
    await pause(150);
    assert.ok((await findOpenRsvpNotice(session))?.open, "Enter on focused RSVP Now → failed to open");
    await session.pressKey("Escape");
    await pause(150);
    assert.equal(await findOpenRsvpNotice(session), null, "Escape failed to dismiss RSVP");

    // Mobile keyboard journey
    await session.setViewport(SPEC.viewports.mobile);
    await session.goto(BASE_URL, { waitFonts: true, waitImages: true });
    let reachedHamburger = false;
    for (let step = 0; step < 15; step++) {
      await session.tab();
      const isHamburger = await session.evaluate(() => {
        const ae = document.activeElement;
        return Boolean(ae && ae.closest("header") && ae.tagName.toLowerCase() === "button" && ae.hasAttribute("aria-expanded"));
      });
      if (isHamburger) {
        reachedHamburger = true;
        break;
      }
    }
    assert.ok(reachedHamburger, "Keyboard Tab did not reach mobile hamburger button");
    await session.activateFocused("Enter");
    await pause(150);
    const openNav = await getNavSummary(session);
    assert.equal(openNav.hamburger?.ariaExpanded, "true");
    assert.ok(openNav.links.find((l) => l.text === "The Graduates")?.visible);
    await session.pressKey("Escape");
    await pause(150);
    assert.equal((await getNavSummary(session)).hamburger?.ariaExpanded, "false");
  });

  test("J5: Asset Resilience, Self-Hosted Fonts & Zero-Backend Audit", async () => {
    await session.setViewport(SPEC.viewports.desktop);
    await session.setCacheDisabled(true);
    session.clearEvents();
    await session.goto(BASE_URL, { waitFonts: true, waitImages: true });

    const scrollH = await session.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y <= scrollH; y += 500) {
      await session.scrollTo(y);
      await pause(60);
    }

    const fonts = await session.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family);
    });
    assert.ok(fonts.some((f) => /Playfair Display/i.test(f)));
    assert.ok(fonts.some((f) => /Manrope/i.test(f)));

    await assertAllImagesLoaded(session, { minCount: 8 });
    await session.clickElement({ selector: "header a, header button", text: "The Graduates", exact: true });
    await pause(200);
    await session.clickElement({ selector: "button, a", text: SPEC.copy.rsvpCta, exact: true });
    await pause(200);

    await auditNetworkEvents(session, BASE_URL, {
      allowExternalOrigins: [],
      forbidMutations: true,
    });
  });

  test("J6: Headless Edge Visual Audit PNG Capture & Dimension Gate", async () => {
    const configuredDir = process.env.E2E_SCREENSHOT_DIR;
    const outDir = configuredDir
      ? (fs.mkdirSync(configuredDir, { recursive: true }), configuredDir)
      : fs.mkdtempSync(path.join(os.tmpdir(), "grad-e2e-shots-"));

    try {
      await session.setViewport(SPEC.viewports.desktop);
      await session.setCacheDisabled(false);
      session.clearEvents();
      await session.goto(BASE_URL, { waitFonts: true, waitImages: true });

      // Pre-capture 8-section DOM completeness gate (non-vacuous on placeholder or partial M1)
      const snap = await getPageSnapshot(session);
      assert.ok(snap.hasHeader && snap.hasMain && snap.hasFooter, "Full landmarks required before PNG capture");
      const normBody = normalizeText(snap.bodyText);
      for (const required of [
        SPEC.copy.heroTitle,
        SPEC.copy.graduatesHeading,
        SPEC.copy.celebrationDate,
        SPEC.copy.venueName,
        SPEC.copy.galleryHeading,
        SPEC.copy.rsvpHeading,
        SPEC.copy.thankYouHeading,
      ]) {
        assertExactTextPresent(normBody, required, "J6 8-section completeness gate");
      }
      await assertAllImagesLoaded(session, { minCount: 7 });

      const desktopVpPng = await session.screenshotPng({ fullPage: false });
      validatePngBuffer(desktopVpPng, { expectedWidth: 1440, exactHeight: 900 });
      fs.writeFileSync(path.join(outDir, "desktop-1440x900-viewport.png"), desktopVpPng);

      const desktopFullPng = await session.captureFullPagePng(1440);
      validatePngBuffer(desktopFullPng, { expectedWidth: 1440, minHeight: 1200 });
      fs.writeFileSync(path.join(outDir, "desktop-1440-fullpage.png"), desktopFullPng);

      await session.setViewport(SPEC.viewports.mobile);
      await session.goto(BASE_URL, { waitFonts: true, waitImages: true });

      const mobileVpPng = await session.screenshotPng({ fullPage: false });
      validatePngBuffer(mobileVpPng, { expectedWidth: 390, exactHeight: 844 });
      fs.writeFileSync(path.join(outDir, "mobile-390x844-viewport.png"), mobileVpPng);

      const mobileFullPng = await session.captureFullPagePng(390);
      validatePngBuffer(mobileFullPng, { expectedWidth: 390, minHeight: 1200 });
      fs.writeFileSync(path.join(outDir, "mobile-390-fullpage.png"), mobileFullPng);

      await auditNetworkEvents(session, BASE_URL, { forbidMutations: true });
    } finally {
      if (!configuredDir) {
        fs.rmSync(outDir, { recursive: true, force: true });
      }
    }
  });
});
