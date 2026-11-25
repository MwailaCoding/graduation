import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import {
  assertAllImagesLoaded,
  assertColorMatches,
  assertExactTextPresent,
  assertNoCountdown,
  assertNoHorizontalOverflow,
  auditForbiddenStylesAndAnimations,
  auditNetworkEvents,
  colorsMatch,
  contrastRatio,
  findOpenRsvpNotice,
  getImagesAudit,
  getNavSummary,
  getPageSnapshot,
  normalizeRgb,
  normalizeText,
  relativeLuminance,
  SPEC,
} from "./lib/assertions.mjs";
import { createSession, launchEdge } from "./lib/cdp.mjs";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3000";

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function openFreshPage(
  session,
  viewport = SPEC.viewports.desktop,
  { disableCache = false } = {},
) {
  await session.setViewport(viewport);
  await session.setCacheDisabled(disableCache);
  session.clearEvents();
  await session.goto(BASE_URL, { waitFonts: true, waitImages: true });
}

describe("Tier 2 — Boundary, Corner & Negative Regression Suite (F1–F9, 54 Tests)", { concurrency: false }, () => {
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

  // =========================================================================
  // F1: Navigation & Responsive Mobile Menu (6 Tests)
  // =========================================================================

  test("T2-F1-01: Desktop min breakpoint (1024px) & wide (1440px): hamburger hidden & inline nav visible", async () => {
    for (const vp of [SPEC.viewports.tabletDesktopMin, SPEC.viewports.desktop]) {
      await openFreshPage(session, vp);
      const nav = await getNavSummary(session);
      assert.ok(nav.found, `Expected <header> at ${vp.width}x${vp.height}`);
      assert.ok(nav.wordmark?.visible, `Wordmark missing at ${vp.width}x${vp.height}`);
      assertColorMatches(nav.headerBg, SPEC.palette.forestGreen, `<header> bg at ${vp.width}`);
      for (const label of SPEC.copy.navLinks) {
        const item = nav.links.find((l) => l.text === label);
        assert.ok(item?.found && item.visible, `Nav "${label}" must be visible at ${vp.width}`);
      }
      assert.ok(!nav.hamburger?.visible, `Hamburger must be hidden at ${vp.width}`);
    }
  });

  test("T2-F1-02: Narrow (375px) & standard (390px) mobile: hamburger >=40x40 & closed by default", async () => {
    for (const vp of [SPEC.viewports.smallMobile, SPEC.viewports.mobile]) {
      await openFreshPage(session, vp);
      const nav = await getNavSummary(session);
      assert.ok(nav.found, `Expected <header> at ${vp.width}`);
      assertColorMatches(nav.headerBg, SPEC.palette.warmIvory, `mobile <header> bg at ${vp.width}`);
      assert.ok(nav.hamburger?.visible, `Hamburger must be visible at ${vp.width}`);
      assert.ok(
        nav.hamburger.rect.width >= 40 && nav.hamburger.rect.height >= 40,
        `Hamburger size < 40x40 at ${vp.width}: ${JSON.stringify(nav.hamburger.rect)}`,
      );
      assert.equal(nav.hamburger.ariaExpanded, "false");
      for (const label of ["The Graduates", "Celebration Details", "Gallery"]) {
        const item = nav.links.find((l) => l.text === label);
        assert.ok(!item?.visible, `Drawer link "${label}" should be hidden initially at ${vp.width}`);
      }
    }
  });

  test("T2-F1-03: Repeated hamburger open/close toggle idempotency (4 cycles) at 375x812", async () => {
    await openFreshPage(session, SPEC.viewports.smallMobile);
    const init = await getNavSummary(session);
    assert.ok(init.hamburger?.visible, "Mobile hamburger button missing at 375x812");
    await session.evaluate(() => {
      window.__e2eSession = 1;
    });
    for (const expectedExpanded of ["true", "false", "true", "false"]) {
      await session.clickSelector("header button[aria-expanded]");
      await pause(120);
      const nav = await getNavSummary(session);
      assert.equal(nav.hamburger?.ariaExpanded, expectedExpanded);
      for (const label of SPEC.copy.navLinks) {
        const item = nav.links.find((l) => l.text === label);
        if (expectedExpanded === "true") {
          assert.ok(item?.visible, `Drawer link "${label}" missing on open cycle`);
        } else if (label !== "Home" && label !== "RSVP") {
          assert.ok(!item?.visible, `Drawer link "${label}" still visible on close cycle`);
        }
      }
    }
    const alive = await session.evaluate(() => window.__e2eSession);
    assert.equal(alive, 1);
    await auditNetworkEvents(session, BASE_URL);
  });

  test("T2-F1-04: Mobile hamburger keyboard Enter activation & Escape dismissal", async () => {
    await openFreshPage(session, SPEC.viewports.mobile);
    await session.evaluate(() => {
      document.querySelector("header button[aria-expanded]")?.focus();
    });
    await session.pressKey("Enter");
    await pause(150);
    const openNav = await getNavSummary(session);
    assert.equal(openNav.hamburger?.ariaExpanded, "true", "Enter must open mobile menu");
    for (const label of SPEC.copy.navLinks) {
      assert.ok(openNav.links.find((l) => l.text === label)?.visible, `Link "${label}" not visible`);
    }

    await session.pressKey("Escape");
    await pause(150);
    const closedNav = await getNavSummary(session);
    assert.equal(closedNav.hamburger?.ariaExpanded, "false", "Escape must close mobile menu");
    const focusInsideHiddenDrawer = await session.evaluate(() => {
      const ae = document.activeElement;
      if (!ae || ae === document.body) return false;
      const r = ae.getBoundingClientRect();
      return r.width === 0 || r.height === 0;
    });
    assert.equal(focusInsideHiddenDrawer, false, "Focus must not stay inside a hidden drawer");
  });

  test("T2-F1-05: Resize across breakpoint while menu open + reload reset resilience", async () => {
    await openFreshPage(session, SPEC.viewports.smallMobile);
    const init = await getNavSummary(session);
    assert.ok(init.hamburger?.visible, "Mobile hamburger button missing at 375x812");
    await session.clickSelector("header button[aria-expanded]");
    await pause(150);
    assert.equal((await getNavSummary(session)).hamburger?.ariaExpanded, "true");

    await session.setViewport(SPEC.viewports.desktop);
    await pause(150);
    const deskNav = await getNavSummary(session);
    for (const label of SPEC.copy.navLinks) {
      assert.ok(deskNav.links.find((l) => l.text === label)?.visible, `Desktop link "${label}" missing after resize`);
    }
    const h1Unobscured = await session.evaluate(() => {
      const h1 = document.querySelector("h1");
      if (!h1) return false;
      const r = h1.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return Boolean(top && (top === h1 || h1.contains(top)));
    });
    assert.ok(h1Unobscured, "Open mobile drawer obscured Hero h1 after resizing to desktop");
    await assertNoHorizontalOverflow(session, 1440);

    await session.setViewport(SPEC.viewports.smallMobile);
    await pause(150);
    await assertNoHorizontalOverflow(session, 375);

    await session.goto(BASE_URL, { waitFonts: true, waitImages: true });
    assert.equal((await getNavSummary(session)).hamburger?.ariaExpanded, "false");
  });

  test("T2-F1-06: Negative header overlap, clipping, and multi-line wrapping check", async () => {
    for (const vp of [
      SPEC.viewports.tabletDesktopMin,
      SPEC.viewports.desktop,
      SPEC.viewports.smallMobile,
    ]) {
      await openFreshPage(session, vp);
      const headerAudit = await session.evaluate(() => {
        const header = document.querySelector("header");
        if (!header) return { found: false };
        const hr = header.getBoundingClientRect();
        const visibleItems = [...header.querySelectorAll("a, button")]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            return r.width > 0 && r.height > 0 && cs.display !== "none" && cs.visibility !== "hidden";
          })
          .map((el) => ({
            text: (el.innerText || el.getAttribute("aria-label") || "").trim(),
            rect: el.getBoundingClientRect().toJSON(),
          }))
          .sort((a, b) => a.rect.left - b.rect.left);
        return {
          found: true,
          headerRect: hr.toJSON(),
          visibleItems,
        };
      });
      assert.ok(headerAudit.found, `Header missing at ${vp.width}`);
      assert.ok(
        headerAudit.headerRect.height <= 96,
        `Header too tall / wrapped onto multiple rows at ${vp.width}: height=${headerAudit.headerRect.height}`,
      );
      for (const item of headerAudit.visibleItems) {
        assert.ok(
          item.rect.left >= headerAudit.headerRect.left - 1 &&
            item.rect.right <= headerAudit.headerRect.right + 1 &&
            item.rect.top >= headerAudit.headerRect.top - 1 &&
            item.rect.bottom <= headerAudit.headerRect.bottom + 2,
          `Header control "${item.text}" clipped outside header bounds at ${vp.width}`,
        );
      }
      for (let i = 0; i < headerAudit.visibleItems.length - 1; i++) {
        const a = headerAudit.visibleItems[i];
        const b = headerAudit.visibleItems[i + 1];
        assert.ok(
          a.rect.right <= b.rect.left + 2,
          `Header controls overlap at ${vp.width}: "${a.text}" (${a.rect.right}) vs "${b.text}" (${b.rect.left})`,
        );
      }
    }
  });

  // =========================================================================
  // F2: Hero / Invitation Cover (6 Tests)
  // =========================================================================

  test("T2-F2-01: Negative literal quotation-mark check & verbatim Hero copy fidelity", async () => {
    for (const vp of [SPEC.viewports.desktop, SPEC.viewports.smallMobile]) {
      await openFreshPage(session, vp);
      const hero = await session.evaluate(() => {
        const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
        const h1 = document.querySelector("h1");
        const sec = h1 ? h1.closest("section") || h1.closest("main") : null;
        if (!sec || !h1) return { found: false };
        const p = [...sec.querySelectorAll("p")].find((el) =>
          norm(el.innerText).includes("Join us as we celebrate"),
        );
        return {
          found: true,
          secText: norm(sec.innerText),
          h1Text: norm(h1.innerText),
          pText: p ? p.innerText.trim() : "",
        };
      });
      assert.ok(hero.found, `Hero section incomplete at ${vp.width}`);
      assertExactTextPresent(hero.secText, SPEC.copy.heroEyebrow);
      assert.equal(hero.h1Text, SPEC.copy.heroTitle);
      assertExactTextPresent(hero.secText, SPEC.copy.heroSubEyebrow);
      assertExactTextPresent(hero.secText, SPEC.copy.graduatesShort);
      assert.equal(hero.pText, SPEC.copy.heroParagraph);
      assert.ok(!/^["'“”]|["'“”]$/.test(hero.pText), "Hero paragraph must not start or end with quote characters");
      assert.ok(!hero.pText.includes("growth, and grace"), "Hero paragraph must not insert Oxford comma after growth");
    }
  });

  test("T2-F2-02: Non-clipped viewport containment for Hero eyebrow, title, names & paragraph", async () => {
    for (const vp of [
      SPEC.viewports.desktop,
      SPEC.viewports.tabletDesktopMin,
      SPEC.viewports.smallMobile,
    ]) {
      await openFreshPage(session, vp);
      const check = await session.evaluate((copy) => {
        const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
        const h1 = document.querySelector("h1");
        const sec = h1 ? h1.closest("section") || h1.closest("main") : null;
        if (!sec || !h1) return { found: false };
        const needles = [
          copy.heroEyebrow,
          copy.heroTitle,
          copy.graduatesShort,
          "Join us as we celebrate",
        ];
        const items = needles.map((n) => {
          const el = [...sec.querySelectorAll("*")]
            .filter((node) => norm(node.innerText).includes(n))
            .sort(
              (a, b) =>
                a.getBoundingClientRect().width * a.getBoundingClientRect().height -
                b.getBoundingClientRect().width * b.getBoundingClientRect().height,
            )[0];
          if (!el) return { needle: n, found: false };
          return {
            needle: n,
            found: true,
            rect: el.getBoundingClientRect().toJSON(),
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight,
          };
        });
        return { found: true, items };
      }, SPEC.copy);
      assert.ok(check.found, `Hero missing at ${vp.width}`);
      for (const item of check.items) {
        assert.ok(item.found, `Hero text "${item.needle}" missing at ${vp.width}`);
        assert.ok(item.rect.width > 0 && item.rect.height > 0);
        assert.ok(
          item.rect.left >= -1 && item.rect.right <= vp.width + 1,
          `Hero "${item.needle}" overflows ${vp.width}: ${JSON.stringify(item.rect)}`,
        );
        assert.ok(
          item.scrollHeight <= item.clientHeight + 2,
          `Hero "${item.needle}" clipped vertically at ${vp.width}: scrollH=${item.scrollHeight}, clientH=${item.clientHeight}`,
        );
      }
    }
  });

  test("T2-F2-03: Hero portrait upper-face zone non-obscuration (elementsFromPoint)", async () => {
    for (const vp of [SPEC.viewports.desktop, SPEC.viewports.smallMobile]) {
      await openFreshPage(session, vp);
      const res = await session.evaluate(() => {
        const h1 = document.querySelector("h1");
        const heroSec = h1 ? h1.closest("section") || h1.closest("main") : null;
        const img = heroSec
          ? [...heroSec.querySelectorAll("img")].find((el) => {
              const r = el.getBoundingClientRect();
              return (el.getAttribute("alt") ?? "").trim().length > 0 && r.width >= 200 && r.height >= 200;
            })
          : null;
        if (!img || !img.complete || img.naturalWidth === 0) return { found: false };
        img.scrollIntoView({ block: "center" });
        const r = img.getBoundingClientRect();
        const failures = [];
        for (const fx of [0.35, 0.5, 0.65]) {
          const stack = document.elementsFromPoint(r.left + r.width * fx, r.top + r.height * 0.25);
          for (const el of stack) {
            if (el === img) break;
            const tag = el.tagName.toLowerCase();
            const cs = getComputedStyle(el);
            const isDecoImg = tag === "img" && (el.getAttribute("alt") ?? "").trim() === "";
            const isSvg = tag === "svg" || Boolean(el.closest("svg"));
            if (isDecoImg || isSvg || cs.pointerEvents !== "none") {
              failures.push(`Obscured at x=${fx} by <${tag}>`);
              break;
            }
          }
        }
        return { found: true, failures };
      });
      assert.ok(res.found, `Hero portrait missing/unloaded at ${vp.width}`);
      assert.deepEqual(res.failures, [], `Face obscuration at ${vp.width}: ${JSON.stringify(res.failures)}`);
    }
  });

  test("T2-F2-04: Mobile arch-top portrait geometry (borderTopRadius > borderBottomRadius)", async () => {
    for (const vp of [SPEC.viewports.smallMobile, SPEC.viewports.mobile]) {
      await openFreshPage(session, vp);
      const arch = await session.evaluate(() => {
        const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
        const h1 = document.querySelector("h1");
        const heroSec = h1 ? h1.closest("section") || h1.closest("main") : null;
        if (!heroSec || !h1) return { found: false };
        const p = [...heroSec.querySelectorAll("p")].find((el) =>
          norm(el.innerText).includes("Join us as we celebrate"),
        );
        const img = [...heroSec.querySelectorAll("img")].find((el) => {
          const r = el.getBoundingClientRect();
          return (el.getAttribute("alt") ?? "").trim().length > 0 && r.width >= 200 && r.height >= 200;
        });
        if (!p || !img) return { found: false };
        const chain = [];
        let cur = img;
        for (let i = 0; i < 3 && cur && heroSec.contains(cur); i++) {
          const cs = getComputedStyle(cur);
          chain.push({
            topLeft: parseFloat(cs.borderTopLeftRadius) || 0,
            topRight: parseFloat(cs.borderTopRightRadius) || 0,
            bottomLeft: parseFloat(cs.borderBottomLeftRadius) || 0,
            bottomRight: parseFloat(cs.borderBottomRightRadius) || 0,
          });
          cur = cur.parentElement;
        }
        return {
          found: true,
          copyBottom: Math.max(h1.getBoundingClientRect().bottom, p.getBoundingClientRect().bottom),
          imgTop: img.getBoundingClientRect().top,
          chain,
        };
      });
      assert.ok(arch.found, `Hero arch check failed to find elements at ${vp.width}`);
      assert.ok(arch.copyBottom <= arch.imgTop + 24, "Copy must sit above portrait on mobile");
      assert.ok(
        arch.chain.some(
          (r) =>
            r.topLeft >= 40 &&
            r.topRight >= 40 &&
            r.bottomLeft <= 16 &&
            r.bottomRight <= 16 &&
            r.topLeft > r.bottomLeft,
        ),
        `Expected arch-top rounding on mobile Hero portrait or wrapper at ${vp.width}: ${JSON.stringify(arch.chain)}`,
      );
    }
  });

  test("T2-F2-05: Intrinsic resolution, non-distorted aspect & non-hardcoded photo rule", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const img = await session.evaluate(() => {
      const h1 = document.querySelector("h1");
      const heroSec = h1 ? h1.closest("section") || h1.closest("main") : null;
      const el = heroSec
        ? [...heroSec.querySelectorAll("img")].find((i) => {
            const r = i.getBoundingClientRect();
            return (i.getAttribute("alt") ?? "").trim().length > 0 && r.width >= 200 && r.height >= 200;
          })
        : null;
      if (!el) return { found: false };
      const r = el.getBoundingClientRect();
      return {
        found: true,
        complete: el.complete,
        naturalWidth: el.naturalWidth,
        naturalHeight: el.naturalHeight,
        renderedWidth: r.width,
        renderedHeight: r.height,
        alt: (el.getAttribute("alt") ?? "").trim(),
        objectFit: getComputedStyle(el).objectFit,
      };
    });
    assert.ok(img.found, "Hero subject portrait missing");
    assert.ok(img.complete && img.naturalWidth >= 400 && img.naturalHeight >= 400);
    assert.ok(img.alt.length >= 10);
    const natAspect = img.naturalWidth / img.naturalHeight;
    const renAspect = img.renderedWidth / img.renderedHeight;
    const distortion = Math.max(natAspect / renAspect, renAspect / natAspect);
    assert.ok(
      img.objectFit === "cover" || distortion <= 1.6,
      `Hero portrait aspect distorted: objectFit=${img.objectFit}, distortion=${distortion}`,
    );
  });

  test("T2-F2-06: Zero horizontal overflow & Hero text non-obscuration at 375x812", async () => {
    await openFreshPage(session, SPEC.viewports.smallMobile);
    await assertNoHorizontalOverflow(session, 375);
    const res = await session.evaluate(() => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const h1 = document.querySelector("h1");
      const heroSec = h1 ? h1.closest("section") || h1.closest("main") : null;
      const p = heroSec
        ? [...heroSec.querySelectorAll("p")].find((el) =>
            norm(el.innerText).includes("Join us as we celebrate"),
          )
        : null;
      if (!h1 || !p) return { found: false };
      const checks = [h1, p].map((el) => {
        el.scrollIntoView({ block: "center" });
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return Boolean(top && (top === el || el.contains(top)));
      });
      return { found: true, allClear: checks.every(Boolean) };
    });
    assert.ok(res.found && res.allClear, "Hero h1 or paragraph obscured at 375x812");
  });

  // =========================================================================
  // F3: Meet the Graduates (6 Tests)
  // =========================================================================

  test("T2-F3-01: Twin identity non-swap & distinct loaded portraits >=200px", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const res = await session.evaluate((copy) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const getCard = (name) => {
        const nodes = [...document.querySelectorAll("*")].filter((el) => norm(el.innerText) === name);
        const leaf = nodes[nodes.length - 1];
        if (!leaf) return null;
        let cur = leaf.parentElement;
        while (cur && cur.tagName.toLowerCase() !== "section") {
          const imgs = [...cur.querySelectorAll("img")].filter(
            (i) => (i.getAttribute("alt") ?? "").trim().length > 0,
          );
          if (imgs.length === 1 && cur.querySelectorAll("p").length >= 1) {
            const img = imgs[0];
            return {
              text: norm(cur.innerText),
              src: img.currentSrc || img.getAttribute("src") || "",
              alt: img.getAttribute("alt") ?? "",
              complete: img.complete,
              naturalWidth: img.naturalWidth,
            };
          }
          cur = cur.parentElement;
        }
        return null;
      };
      return {
        majala: getCard(copy.majalaName),
        florence: getCard(copy.florenceName),
      };
    }, SPEC.copy);
    assert.ok(res.majala && res.florence, "Both graduate cards required");
    assert.ok(res.majala.text.includes(SPEC.copy.majalaDegree));
    assert.ok(!res.majala.text.includes("French and Sociology"));
    assert.ok(res.florence.text.includes(SPEC.copy.florenceDegree));
    assert.ok(!res.florence.text.includes("Education (Mathematics)"));
    assert.ok(res.majala.complete && res.majala.naturalWidth >= 200);
    assert.ok(res.florence.complete && res.florence.naturalWidth >= 200);
    assert.match(res.majala.alt, /majala/i);
    assert.match(res.florence.alt, /florence/i);
    assert.notEqual(res.majala.src, res.florence.src);
  });

  test("T2-F3-02: Notched frame & upper-face portrait non-obscuration", async () => {
    for (const vp of [SPEC.viewports.desktop, SPEC.viewports.smallMobile]) {
      await openFreshPage(session, vp);
      const check = await session.evaluate((copy) => {
        const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
        const sec = [...document.querySelectorAll("section")].find((s) =>
          norm(s.innerText).includes(copy.graduatesHeading),
        );
        if (!sec) return { found: false };
        const imgs = [...sec.querySelectorAll("img")].filter(
          (i) => (i.getAttribute("alt") ?? "").trim().length > 0,
        );
        if (imgs.length < 2) return { found: false };
        const failures = [];
        for (const img of imgs) {
          img.scrollIntoView({ block: "center" });
          const r = img.getBoundingClientRect();
          const stack = document.elementsFromPoint(r.left + r.width * 0.5, r.top + r.height * 0.25);
          for (const el of stack) {
            if (el === img) break;
            const tag = el.tagName.toLowerCase();
            const cs = getComputedStyle(el);
            const isDecoImg = tag === "img" && (el.getAttribute("alt") ?? "").trim() === "";
            const isSvg = tag === "svg" || Boolean(el.closest("svg"));
            if (isDecoImg || isSvg || cs.pointerEvents !== "none") {
              failures.push(`Portrait "${img.alt}" obscured by <${tag}>`);
              break;
            }
          }
        }
        return { found: true, failures };
      }, SPEC.copy);
      assert.ok(check.found, `Graduates portraits missing at ${vp.width}`);
      assert.deepEqual(check.failures, [], `Obscured portrait at ${vp.width}: ${JSON.stringify(check.failures)}`);
    }
  });

  test("T2-F3-03: Mobile thumbnail-left-of-text geometry & zero text truncation", async () => {
    for (const vp of [SPEC.viewports.smallMobile, SPEC.viewports.mobile]) {
      await openFreshPage(session, vp);
      const mob = await session.evaluate((copy) => {
        const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
        const inspect = (name) => {
          const nodes = [...document.querySelectorAll("*")].filter((el) => norm(el.innerText) === name);
          const leaf = nodes[nodes.length - 1];
          if (!leaf) return null;
          let cur = leaf.parentElement;
          while (cur && cur.tagName.toLowerCase() !== "section") {
            const imgs = [...cur.querySelectorAll("img")].filter(
              (i) => (i.getAttribute("alt") ?? "").trim().length > 0,
            );
            const p = cur.querySelector("p");
            if (imgs.length === 1 && p) {
              return {
                cardRect: cur.getBoundingClientRect().toJSON(),
                imgRect: imgs[0].getBoundingClientRect().toJSON(),
                textRect: leaf.getBoundingClientRect().toJSON(),
                nameOverflow: leaf.scrollWidth > leaf.clientWidth + 2,
                degOverflow: p.scrollWidth > p.clientWidth + 2,
              };
            }
            cur = cur.parentElement;
          }
          return null;
        };
        return {
          majala: inspect(copy.majalaName),
          florence: inspect(copy.florenceName),
          scrollWidth: document.documentElement.scrollWidth,
        };
      }, SPEC.copy);
      assert.ok(mob.majala && mob.florence, `Mobile graduate rows missing at ${vp.width}`);
      assert.ok(mob.scrollWidth <= vp.width);
      assert.ok(mob.majala.cardRect.bottom <= mob.florence.cardRect.top + 24);
      for (const [label, c] of [["Majala", mob.majala], ["Florence", mob.florence]]) {
        assert.ok(c.imgRect.right <= c.textRect.left + 8, `${label} thumb not left of text at ${vp.width}`);
        assert.ok(Math.abs(c.imgRect.top - c.textRect.top) < 80);
        assert.equal(c.nameOverflow, false, `${label} name truncated at ${vp.width}`);
        assert.equal(c.degOverflow, false, `${label} degree truncated at ${vp.width}`);
      }
    }
  });

  test("T2-F3-04: Desktop center emblem present vs mobile hidden/omitted", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const desk = await session.evaluate((copy) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const sec = [...document.querySelectorAll("section")].find((s) =>
        norm(s.innerText).includes(copy.graduatesHeading),
      );
      if (!sec) return { found: false };
      const findCard = (name) => {
        const leaf = [...sec.querySelectorAll("*")].filter((el) => norm(el.innerText) === name).pop();
        let cur = leaf?.parentElement;
        while (cur && cur !== sec) {
          if (cur.querySelectorAll("img[alt]:not([alt=''])").length === 1 && cur.querySelectorAll("p").length >= 1) {
            return cur.getBoundingClientRect();
          }
          cur = cur.parentElement;
        }
        return null;
      };
      const m = findCard(copy.majalaName);
      const f = findCard(copy.florenceName);
      if (!m || !f) return { found: false };
      const emblems = [...sec.querySelectorAll("svg, img[alt='']")].filter((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const cx = r.left + r.width / 2;
        return (
          cs.display !== "none" &&
          cs.visibility !== "hidden" &&
          r.width >= 24 &&
          r.height >= 24 &&
          cx > m.right - 20 &&
          cx < f.left + 20
        );
      });
      return { found: true, emblemCount: emblems.length };
    }, SPEC.copy);
    assert.ok(desk.found && desk.emblemCount >= 1, "Expected desktop center emblem between Majala and Florence cards");

    await openFreshPage(session, SPEC.viewports.smallMobile);
    const mob = await session.evaluate((copy) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const sec = [...document.querySelectorAll("section")].find((s) =>
        norm(s.innerText).includes(copy.graduatesHeading),
      );
      if (!sec) return { found: false };
      const findCard = (name) => {
        const leaf = [...sec.querySelectorAll("*")].filter((el) => norm(el.innerText) === name).pop();
        let cur = leaf?.parentElement;
        while (cur && cur !== sec) {
          if (cur.querySelectorAll("img[alt]:not([alt=''])").length === 1 && cur.querySelectorAll("p").length >= 1) {
            return cur.getBoundingClientRect();
          }
          cur = cur.parentElement;
        }
        return null;
      };
      const m = findCard(copy.majalaName);
      const f = findCard(copy.florenceName);
      if (!m || !f) return { found: false };
      const between = [...sec.querySelectorAll("svg, img[alt='']")].filter((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const cy = r.top + r.height / 2;
        return (
          cs.display !== "none" &&
          cs.visibility !== "hidden" &&
          r.width >= 24 &&
          r.height >= 24 &&
          cy > m.bottom - 4 &&
          cy < f.top + 4
        );
      });
      return { found: true, betweenCount: between.length };
    }, SPEC.copy);
    assert.ok(mob.found);
    assert.equal(mob.betweenCount, 0, "Center emblem should be omitted/hidden between mobile stacked graduate rows");
  });

  test("T2-F3-05: Desktop left-to-right card ordering & visible portrait frame border", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const res = await session.evaluate((copy) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const inspect = (name) => {
        const leaf = [...document.querySelectorAll("*")].filter((el) => norm(el.innerText) === name).pop();
        let cur = leaf?.parentElement;
        while (cur && cur.tagName.toLowerCase() !== "section") {
          const imgs = [...cur.querySelectorAll("img")].filter(
            (i) => (i.getAttribute("alt") ?? "").trim().length > 0,
          );
          if (imgs.length === 1 && cur.querySelectorAll("p").length >= 1) {
            const img = imgs[0];
            let hasFrame = false;
            let p = img;
            for (let i = 0; i < 4 && p && cur.contains(p); i++) {
              const cs = getComputedStyle(p);
              const bw = Math.max(
                parseFloat(cs.borderTopWidth) || 0,
                parseFloat(cs.borderLeftWidth) || 0,
                parseFloat(cs.outlineWidth) || 0,
              );
              const bg = cs.backgroundColor;
              const nonTransBg = bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent";
              if (bw >= 1 || nonTransBg || p.querySelector("svg")) {
                hasFrame = true;
              }
              p = p.parentElement;
            }
            return { rect: cur.getBoundingClientRect().toJSON(), hasFrame };
          }
          cur = cur.parentElement;
        }
        return null;
      };
      return {
        majala: inspect(copy.majalaName),
        florence: inspect(copy.florenceName),
      };
    }, SPEC.copy);
    assert.ok(res.majala && res.florence);
    assert.ok(res.majala.rect.right <= res.florence.rect.left + 8);
    assert.ok(Math.abs(res.majala.rect.top - res.florence.rect.top) < 80);
    assert.ok(res.majala.hasFrame && res.florence.hasFrame, "Both graduate portraits must show editorial frame");
  });

  test("T2-F3-06: Negative degree/name typography & punctuation regression check", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const snap = await getPageSnapshot(session);
    assertExactTextPresent(snap.bodyText, SPEC.copy.graduatesHeading);
    assertExactTextPresent(snap.bodyText, SPEC.copy.majalaName);
    assertExactTextPresent(snap.bodyText, SPEC.copy.majalaDegree);
    assertExactTextPresent(snap.bodyText, SPEC.copy.florenceName);
    assertExactTextPresent(snap.bodyText, SPEC.copy.florenceDegree);
    assert.ok(!normalizeText(snap.bodyText).includes("French & Sociology"));
    assert.ok(!normalizeText(snap.bodyText).includes("Bachelors Degree"));
  });

  // =========================================================================
  // F4: Celebration Details (6 Tests)
  // =========================================================================

  test("T2-F4-01: Exact UK date format & negative US month-first / numeric date check", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const snap = await getPageSnapshot(session);
    const text = normalizeText(snap.bodyText);
    assertExactTextPresent(text, SPEC.copy.celebrationDate);
    for (const bad of ["December 12, 2026", "Sat, 12 Dec 2026", "12/12/2026", "2026-12-12"]) {
      assert.ok(!text.includes(bad), `Forbidden date variant found: ${bad}`);
    }
  });

  test("T2-F4-02: Exact 12:00 PM format & negative lowercase/24-hour check", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const snap = await getPageSnapshot(session);
    const text = normalizeText(snap.bodyText);
    assertExactTextPresent(text, SPEC.copy.celebrationTime);
    for (const bad of ["12:00pm", "12:00 p.m.", "12:00 AM", "24:00", "12:00 hrs"]) {
      assert.ok(!text.includes(bad), `Forbidden time variant found: ${bad}`);
    }
  });

  test("T2-F4-03: Negative countdown/timer & static-non-ticking snapshot check", async () => {
    for (const vp of [SPEC.viewports.desktop, SPEC.viewports.smallMobile]) {
      await openFreshPage(session, vp);
      const first = await getPageSnapshot(session);
      assertExactTextPresent(first.bodyText, SPEC.copy.celebrationDate);
      assertExactTextPresent(first.bodyText, SPEC.copy.celebrationTime);
      assertNoCountdown(first.bodyText);

      await pause(1200);
      const second = await getPageSnapshot(session);
      assert.equal(normalizeText(second.bodyText), normalizeText(first.bodyText), "Page text changed over 1.2s (ticking clock detected)");
    }
  });

  test("T2-F4-04: Forest Green + Champagne Gold container contrast & border integrity", async () => {
    for (const vp of [SPEC.viewports.desktop, SPEC.viewports.smallMobile]) {
      await openFreshPage(session, vp);
      const info = await session.evaluate((dateCopy, timeCopy) => {
        const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
        const findSmallest = (needle) =>
          [...document.querySelectorAll("*")]
            .filter((el) => !["SCRIPT", "STYLE", "NOSCRIPT", "HEAD", "META", "TITLE"].includes(el.tagName) && norm(el.innerText).includes(needle))
            .sort(
              (a, b) =>
                a.getBoundingClientRect().width * a.getBoundingClientRect().height -
                b.getBoundingClientRect().width * b.getBoundingClientRect().height,
            )[0];
        const d = findSmallest(dateCopy);
        const t = findSmallest(timeCopy);
        if (!d || !t) return { found: false };
        let container = d;
        while (container && container !== document.body) {
          const bg = getComputedStyle(container).backgroundColor;
          if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent" && container.contains(t)) {
            break;
          }
          container = container.parentElement;
        }
        const cs = getComputedStyle(container);
        const borderWidths = [
          parseFloat(cs.borderTopWidth) || 0,
          parseFloat(cs.borderRightWidth) || 0,
          parseFloat(cs.borderBottomWidth) || 0,
          parseFloat(cs.borderLeftWidth) || 0,
          parseFloat(cs.outlineWidth) || 0,
        ];
        const borderColors = [
          cs.borderTopColor,
          cs.borderRightColor,
          cs.borderBottomColor,
          cs.borderLeftColor,
          cs.outlineColor,
        ];
        const innerBorders = [...container.querySelectorAll("*")]
          .map((el) => {
            const ecs = getComputedStyle(el);
            return {
              width: parseFloat(ecs.borderTopWidth) || 0,
              color: ecs.borderTopColor,
            };
          })
          .filter((b) => b.width >= 1);
        const svgs = [...container.querySelectorAll("svg, img")]
          .map((el) => el.getBoundingClientRect().toJSON())
          .filter((r) => r.width >= 14 && r.height >= 14);
        return {
          found: true,
          bg: cs.backgroundColor,
          dateColor: getComputedStyle(d).color,
          timeColor: getComputedStyle(t).color,
          maxBorderWidth: Math.max(...borderWidths),
          borderColors,
          innerBorders,
          iconCount: svgs.length,
        };
      }, SPEC.copy.celebrationDate, SPEC.copy.celebrationTime);
      assert.ok(info.found, `Details container missing at ${vp.width}`);
      assertColorMatches(info.bg, SPEC.palette.forestGreen);
      assert.ok(
        contrastRatio(info.dateColor, info.bg) >= 4.5 && contrastRatio(info.timeColor, info.bg) >= 4.5,
        `Contrast < 4.5:1 on details banner`,
      );
      const hasGoldBorder =
        (info.maxBorderWidth >= 1 &&
          info.borderColors.some((c) => colorsMatch(c, SPEC.palette.champagneGold, 15))) ||
        info.innerBorders.some((b) => colorsMatch(b.color, SPEC.palette.champagneGold, 15));
      assert.ok(hasGoldBorder, `Expected gold border on details container at ${vp.width}`);
      assert.ok(info.iconCount >= 2, `Expected >= 2 icons on details container at ${vp.width}`);
    }
  });

  test("T2-F4-05: Unified 3-column desktop pill vs mobile vertical stack boundary", async () => {
    for (const vp of [SPEC.viewports.tabletDesktopMin, SPEC.viewports.desktop]) {
      await openFreshPage(session, vp);
      const desk = await session.evaluate((copy) => {
        const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
        const findSmallest = (needle) =>
          [...document.querySelectorAll("*")]
            .filter((el) => !["SCRIPT", "STYLE", "NOSCRIPT", "HEAD", "META", "TITLE"].includes(el.tagName) && norm(el.innerText).includes(needle))
            .sort(
              (a, b) =>
                a.getBoundingClientRect().width * a.getBoundingClientRect().height -
                b.getBoundingClientRect().width * b.getBoundingClientRect().height,
            )[0];
        const d = findSmallest(copy.celebrationDate);
        const t = findSmallest(copy.celebrationTime);
        const v = findSmallest(copy.venueName);
        if (!d || !t || !v) return { found: false };
        let c = d;
        while (c && c !== document.body) {
          const bg = getComputedStyle(c).backgroundColor;
          if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent" && c.contains(t) && c.contains(v)) {
            break;
          }
          c = c.parentElement;
        }
        return {
          found: true,
          d: d.getBoundingClientRect().toJSON(),
          t: t.getBoundingClientRect().toJSON(),
          v: v.getBoundingClientRect().toJSON(),
          radius: parseFloat(getComputedStyle(c).borderTopLeftRadius) || 0,
        };
      }, SPEC.copy);
      assert.ok(desk.found, `Unified details+venue container missing at ${vp.width}`);
      const tops = [desk.d.top, desk.t.top, desk.v.top];
      assert.ok(Math.max(...tops) - Math.min(...tops) < 60);
      assert.ok(desk.d.left < desk.t.left && desk.t.left < desk.v.left);
      assert.ok(desk.radius >= 32, `Expected pill rounding >=32px on desktop container, got ${desk.radius}`);
    }

    await openFreshPage(session, SPEC.viewports.smallMobile);
    const mob = await session.evaluate((copy) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const findSmallest = (needle) =>
        [...document.querySelectorAll("*")]
          .filter((el) => !["SCRIPT", "STYLE", "NOSCRIPT", "HEAD", "META", "TITLE"].includes(el.tagName) && norm(el.innerText).includes(needle))
          .sort(
            (a, b) =>
              a.getBoundingClientRect().width * a.getBoundingClientRect().height -
              b.getBoundingClientRect().width * b.getBoundingClientRect().height,
          )[0];
      const d = findSmallest(copy.celebrationDate);
      const t = findSmallest(copy.celebrationTime);
      const v = findSmallest(copy.venueName);
      if (!d || !t || !v) return { found: false };
      return {
        found: true,
        d: d.getBoundingClientRect().toJSON(),
        t: t.getBoundingClientRect().toJSON(),
        v: v.getBoundingClientRect().toJSON(),
      };
    }, SPEC.copy);
    assert.ok(mob.found);
    assert.ok(mob.d.bottom <= mob.t.top + 16 && mob.t.bottom <= mob.v.top + 16);
  });

  test("T2-F4-06: Narrow mobile (375px) container containment & zero horizontal overflow", async () => {
    await openFreshPage(session, SPEC.viewports.smallMobile);
    await assertNoHorizontalOverflow(session, 375);
    const box = await session.evaluate((copy) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const findSmallest = (needle) =>
        [...document.querySelectorAll("*")]
          .filter((el) => !["SCRIPT", "STYLE", "NOSCRIPT", "HEAD", "META", "TITLE"].includes(el.tagName) && norm(el.innerText).includes(needle))
          .sort(
            (a, b) =>
              a.getBoundingClientRect().width * a.getBoundingClientRect().height -
              b.getBoundingClientRect().width * b.getBoundingClientRect().height,
          )[0];
      const d = findSmallest(copy.celebrationDate);
      const t = findSmallest(copy.celebrationTime);
      if (!d || !t) return { found: false };
      let c = d;
      while (c && c !== document.body) {
        const bg = getComputedStyle(c).backgroundColor;
        if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent" && c.contains(t)) break;
        c = c.parentElement;
      }
      return {
        found: true,
        rect: c.getBoundingClientRect().toJSON(),
        dClipped: d.scrollWidth > d.clientWidth + 2,
        tClipped: t.scrollWidth > t.clientWidth + 2,
      };
    }, SPEC.copy);
    assert.ok(box.found);
    assert.ok(box.rect.left >= 0 && box.rect.right <= 375);
    assert.equal(box.dClipped, false);
    assert.equal(box.tClipped, false);
  });

  // =========================================================================
  // F5: Venue & Directions (6 Tests)
  // =========================================================================

  test("T2-F5-01: Exact Google Maps URL destination & HTTPS protocol boundary", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const snap = await getPageSnapshot(session);
    assertExactTextPresent(snap.bodyText, SPEC.copy.venueName);
    const link = await session.evaluate(() => {
      const a = [...document.querySelectorAll("a")].find((el) =>
        (el.getAttribute("href") || "").includes("google.com/maps"),
      );
      return a ? { found: true, hrefAttr: a.getAttribute("href") || "", href: a.href } : { found: false };
    });
    assert.ok(link.found, "Google Maps directions link missing");
    assert.ok(!link.hrefAttr.startsWith("http://") && link.hrefAttr !== "#" && !link.hrefAttr.startsWith("javascript:"));
    const u = new URL(link.href);
    assert.equal(u.protocol, "https:");
    assert.ok(u.hostname === "www.google.com" || u.hostname === "maps.google.com");
    assert.ok(u.pathname.startsWith("/maps/dir"));
    assert.match(link.href, SPEC.mapsDestinationPattern);
    assert.match(link.href, /Ruiru/i);
  });

  test("T2-F5-02: Reverse-tabnabbing security guard (target='_blank' + rel contains noopener)", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const attrs = await session.evaluate(() => {
      const a = [...document.querySelectorAll("a")].find((el) =>
        (el.getAttribute("href") || "").includes("google.com/maps"),
      );
      return a ? { found: true, target: a.getAttribute("target"), rel: a.getAttribute("rel") || "" } : { found: false };
    });
    assert.ok(attrs.found);
    assert.equal(attrs.target, "_blank");
    assert.ok(attrs.rel.toLowerCase().split(/\s+/).includes("noopener"));
  });

  test("T2-F5-03: Non-empty visible link text, accessible name & >=4.5:1 contrast", async () => {
    for (const vp of [SPEC.viewports.desktop, SPEC.viewports.smallMobile]) {
      await openFreshPage(session, vp);
      const link = await session.evaluate(() => {
        const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
        const a = [...document.querySelectorAll("a")].find((el) =>
          (el.getAttribute("href") || "").includes("google.com/maps"),
        );
        if (!a) return { found: false };
        let bgBox = a;
        while (bgBox && bgBox !== document.body) {
          const bg = getComputedStyle(bgBox).backgroundColor;
          if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") break;
          bgBox = bgBox.parentElement;
        }
        return {
          found: true,
          text: norm(a.innerText),
          ariaLabel: norm(a.getAttribute("aria-label") || ""),
          rect: a.getBoundingClientRect().toJSON(),
          color: getComputedStyle(a).color,
          bg: getComputedStyle(bgBox).backgroundColor,
        };
      });
      assert.ok(link.found, `Maps link missing at ${vp.width}`);
      assert.ok(link.text.length > 0);
      assert.ok((link.ariaLabel || link.text).length >= 8);
      assert.ok(link.rect.width >= 40 && link.rect.height >= 20);
      assert.ok(contrastRatio(link.color, link.bg) >= 4.5, `Venue link contrast < 4.5:1`);
    }
  });

  test("T2-F5-04: Minimum mobile touch target (height>=24, width>=44) & non-overlap with Time", async () => {
    for (const vp of [SPEC.viewports.smallMobile, SPEC.viewports.mobile]) {
      await openFreshPage(session, vp);
      const touch = await session.evaluate((timeText) => {
        const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
        const a = [...document.querySelectorAll("a")].find((el) =>
          (el.getAttribute("href") || "").includes("google.com/maps"),
        );
        const t = [...document.querySelectorAll("*")]
          .filter((el) => !["SCRIPT", "STYLE", "NOSCRIPT", "HEAD", "META", "TITLE"].includes(el.tagName) && norm(el.innerText).includes(timeText))
          .sort(
            (a, b) =>
              a.getBoundingClientRect().width * a.getBoundingClientRect().height -
              b.getBoundingClientRect().width * b.getBoundingClientRect().height,
          )[0];
        if (!a || !t) return { found: false };
        a.scrollIntoView({ block: "center" });
        return {
          found: true,
          linkRect: a.getBoundingClientRect().toJSON(),
          timeRect: t.getBoundingClientRect().toJSON(),
        };
      }, SPEC.copy.celebrationTime);
      assert.ok(touch.found, `Venue link or Time missing at ${vp.width}`);
      assert.ok(
        touch.linkRect.height >= 24 && touch.linkRect.width >= 44,
        `Mobile Maps link touch target too small at ${vp.width}: ${JSON.stringify(touch.linkRect)}`,
      );
      assert.ok(
        touch.timeRect.bottom <= touch.linkRect.top + 4,
        `Venue link overlaps Time row at ${vp.width}`,
      );
    }
  });

  test("T2-F5-05: Hit-test unobstructed clickability & keyboard focusability", async () => {
    for (const vp of [SPEC.viewports.desktop, SPEC.viewports.smallMobile]) {
      await openFreshPage(session, vp);
      const hit = await session.evaluate(() => {
        const a = [...document.querySelectorAll("a")].find((el) =>
          (el.getAttribute("href") || "").includes("google.com/maps"),
        );
        if (!a) return { found: false };
        a.scrollIntoView({ block: "center" });
        const r = a.getBoundingClientRect();
        const topEl = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        a.focus();
        return {
          found: true,
          unobstructed: Boolean(topEl && (topEl === a || a.contains(topEl))),
          focused: document.activeElement === a,
        };
      });
      assert.ok(hit.found, `Maps link missing at ${vp.width}`);
      assert.ok(hit.unobstructed, `Maps link obscured at ${vp.width}`);
      assert.ok(hit.focused, `Maps link not keyboard focusable at ${vp.width}`);
    }
  });

  test("T2-F5-06: Safe click isolation (does not unload invitation tab or throw errors)", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    await session.evaluate(() => {
      window.__e2eSession = 1;
    });
    const beforeTargetsRes = await fetch(`${browser.cdpHttpBase}/json/list`);
    const beforeTargets = beforeTargetsRes.ok ? await beforeTargetsRes.json() : [];
    const beforeIds = new Set(beforeTargets.map((t) => t.id));

    const hasLink = await session.evaluate(() =>
      Boolean([...document.querySelectorAll("a")].find((el) => (el.getAttribute("href") || "").includes("google.com/maps"))),
    );
    assert.ok(hasLink, "Google Maps link missing");

    await session.clickElement({
      selector: "a",
      text: SPEC.copy.venueName,
      exact: false,
    });
    await pause(250);

    const alive = await session.evaluate(() => window.__e2eSession);
    assert.equal(alive, 1, "Clicking Maps link must not reload or unload invitation tab");
    await auditNetworkEvents(session, BASE_URL);

    // Close any newly spawned target tab cleanly
    const afterTargetsRes = await fetch(`${browser.cdpHttpBase}/json/list`);
    if (afterTargetsRes.ok) {
      const afterTargets = await afterTargetsRes.json();
      for (const t of afterTargets) {
        if (!beforeIds.has(t.id) && t.type === "page") {
          try {
            await browser.browserCdp.send("Target.closeTarget", { targetId: t.id });
          } catch {
            // ignore if already closed
          }
        }
      }
    }
  });

  // =========================================================================
  // F6: Gallery ("Our Journey in Pictures") (6 Tests)
  // =========================================================================

  test("T2-F6-01: Exact 5 distinct image URLs (zero duplicate photos inside Gallery)", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const audit = await getImagesAudit(session);
    const galleryImgs = audit.images.filter((i) => i.inGallery && i.alt.trim().length > 0);
    assert.equal(galleryImgs.length, 5);
    assert.equal(new Set(galleryImgs.map((i) => i.currentSrc || i.src)).size, 5);
    const uniqueAlts = new Set(galleryImgs.map((i) => i.alt.trim()));
    assert.equal(uniqueAlts.size, 5);
    for (const img of galleryImgs) {
      assert.ok(img.alt.trim().length >= 10);
    }
  });

  test("T2-F6-02: Negative text captions check inside gallery tiles", async () => {
    for (const vp of [SPEC.viewports.desktop, SPEC.viewports.smallMobile]) {
      await openFreshPage(session, vp);
      const check = await session.evaluate((heading) => {
        const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
        const sec = [...document.querySelectorAll("section")].find((s) =>
          norm(s.innerText).includes(heading),
        );
        if (!sec) return { found: false };
        const imgs = [...sec.querySelectorAll("img")].filter(
          (i) => (i.getAttribute("alt") ?? "").trim().length > 0,
        );
        const captions = imgs.map((img) => {
          let w = img.parentElement;
          while (w && w.parentElement && w.parentElement !== sec) {
            if (w.parentElement.querySelectorAll("img[alt]:not([alt=''])").length > 1) break;
            w = w.parentElement;
          }
          return w ? norm(w.innerText) : "";
        });
        return {
          found: true,
          count: imgs.length,
          figcaptions: sec.querySelectorAll("figcaption").length,
          captions,
        };
      }, SPEC.copy.galleryHeading);
      assert.ok(check.found && check.count === 5);
      assert.equal(check.figcaptions, 0);
      assert.ok(check.captions.every((c) => c === ""), `Unexpected gallery caption text: ${JSON.stringify(check.captions)}`);
    }
  });

  test("T2-F6-03: Post-scroll zero broken images (cache disabled)", async () => {
    for (const vp of [SPEC.viewports.desktop, SPEC.viewports.smallMobile]) {
      await openFreshPage(session, vp, { disableCache: true });
      await session.evaluate((heading) => {
        const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
        const sec = [...document.querySelectorAll("section")].find((s) =>
          norm(s.innerText).includes(heading),
        );
        sec?.scrollIntoView({ block: "center" });
        const scroller = [...(sec?.querySelectorAll("*") || [])].find(
          (el) => el.scrollWidth > el.clientWidth + 10,
        );
        if (scroller) scroller.scrollLeft = scroller.scrollWidth;
      }, SPEC.copy.galleryHeading);
      await pause(300);
      const audit = await getImagesAudit(session);
      const galleryImgs = audit.images.filter((i) => i.inGallery && i.alt.trim().length > 0);
      assert.equal(galleryImgs.length, 5);
      for (const img of galleryImgs) {
        assert.ok(
          img.complete &&
            img.rect.width >= 80 &&
            img.rect.height >= 80 &&
            img.naturalWidth >= Math.floor(img.rect.width) &&
            img.naturalHeight > 0,
          `Broken or undersized gallery image (${vp.width}x${vp.height}): src="${img.src}" complete=${img.complete} rect=${Math.round(img.rect.width)}x${Math.round(img.rect.height)} natural=${img.naturalWidth}x${img.naturalHeight}`,
        );
      }
      await auditNetworkEvents(session, BASE_URL);
    }
  });

  test("T2-F6-04: Zero object-fit distortion / upper-face obstruction across all 5 tiles", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const check = await session.evaluate((heading) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const sec = [...document.querySelectorAll("section")].find((s) =>
        norm(s.innerText).includes(heading),
      );
      if (!sec) return { found: false };
      sec.scrollIntoView({ block: "center" });
      const imgs = [...sec.querySelectorAll("img")].filter(
        (i) => (i.getAttribute("alt") ?? "").trim().length > 0,
      );
      const failures = [];
      for (const img of imgs) {
        img.scrollIntoView({ block: "center", inline: "center" });
        const r = img.getBoundingClientRect();
        const cs = getComputedStyle(img);
        const ratio = r.width / r.height;
        if (cs.objectFit !== "cover" && cs.objectFit !== "contain") {
          failures.push(`Invalid objectFit=${cs.objectFit} on "${img.alt}"`);
        }
        if (ratio < 0.6 || ratio > 1.8) {
          failures.push(`Extreme aspect ratio=${ratio.toFixed(2)} on "${img.alt}"`);
        }
        const stack = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height * 0.25);
        for (const el of stack) {
          if (el === img) break;
          const tag = el.tagName.toLowerCase();
          const ecs = getComputedStyle(el);
          const isDecoImg = tag === "img" && (el.getAttribute("alt") ?? "").trim() === "";
          const isSvg = tag === "svg" || Boolean(el.closest("svg"));
          if (isDecoImg || isSvg || ecs.pointerEvents !== "none") {
            failures.push(`Gallery "${img.alt}" obscured by <${tag}>`);
            break;
          }
        }
      }
      return { found: true, count: imgs.length, failures };
    }, SPEC.copy.galleryHeading);
    assert.ok(check.found && check.count === 5);
    assert.deepEqual(check.failures, []);
  });

  test("T2-F6-05: Desktop 5-tile single-row boundary containment (1024px & 1440px)", async () => {
    for (const vp of [SPEC.viewports.tabletDesktopMin, SPEC.viewports.desktop]) {
      await openFreshPage(session, vp);
      const rects = await session.evaluate((heading) => {
        const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
        const sec = [...document.querySelectorAll("section")].find((s) =>
          norm(s.innerText).includes(heading),
        );
        return sec
          ? [...sec.querySelectorAll("img")]
              .filter((i) => (i.getAttribute("alt") ?? "").trim().length > 0)
              .map((i) => i.getBoundingClientRect().toJSON())
          : [];
      }, SPEC.copy.galleryHeading);
      assert.equal(rects.length, 5);
      const tops = rects.map((r) => r.top);
      assert.ok(Math.max(...tops) - Math.min(...tops) <= 24);
      for (let i = 0; i < 4; i++) {
        assert.ok(rects[i].right <= rects[i + 1].left + 4);
      }
      assert.ok(rects[0].left >= 0 && rects[4].right <= vp.width + 1);
    }
  });

  test("T2-F6-06: Mobile horizontal row containment & zero page overflow (375px & 390px)", async () => {
    for (const vp of [SPEC.viewports.smallMobile, SPEC.viewports.mobile]) {
      await openFreshPage(session, vp);
      const res = await session.evaluate((heading) => {
        const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
        const sec = [...document.querySelectorAll("section")].find((s) =>
          norm(s.innerText).includes(heading),
        );
        if (!sec) return { found: false };
        sec.scrollIntoView({ block: "center" });
        const tiles = [...sec.querySelectorAll("img")]
          .filter((i) => (i.getAttribute("alt") ?? "").trim().length > 0)
          .map((i) => i.getBoundingClientRect().toJSON());
        return {
          found: true,
          tiles,
          scrollWidth: document.documentElement.scrollWidth,
        };
      }, SPEC.copy.galleryHeading);
      assert.ok(res.found && res.tiles.length === 5);
      assert.ok(res.scrollWidth <= vp.width, `Page overflowed ${vp.width}: scrollWidth=${res.scrollWidth}`);
      assert.ok(Math.abs(res.tiles[0].top - res.tiles[1].top) <= 24);
      assert.ok(Math.abs(res.tiles[1].top - res.tiles[2].top) <= 24);
      assert.ok(res.tiles[0].left < res.tiles[1].left && res.tiles[1].left < res.tiles[2].left);
      assert.ok(res.tiles[2].right <= vp.width + 24);
    }
  });

  // =========================================================================
  // F7: RSVP Entry Point (6 Tests)
  // =========================================================================

  test("T2-F7-01: Zero <form> backend submission & zero POST/PUT/PATCH/DELETE or /api/ calls", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const snap = await getPageSnapshot(session);
    assertExactTextPresent(snap.bodyText, SPEC.copy.rsvpHeading);
    assertExactTextPresent(snap.bodyText, SPEC.copy.rsvpCopy);
    assertExactTextPresent(snap.bodyText, SPEC.copy.rsvpCta);

    const hasActionForm = await session.evaluate(() => {
      window.__e2eMarker = 1;
      return [...document.querySelectorAll("form")].some((f) =>
        Boolean(f.getAttribute("action")),
      );
    });
    assert.equal(hasActionForm, false, "RSVP must not include a <form action=...>");

    await session.clickElement({ selector: "button, a", text: SPEC.copy.rsvpCta, exact: true });
    await pause(400);
    assert.equal(await session.evaluate(() => window.__e2eMarker), 1);
    await auditNetworkEvents(session, BASE_URL, { forbidMutations: true });
  });

  test("T2-F7-02: Repeated open -> close -> reopen idempotency & zero reload", async () => {
    for (const vp of [SPEC.viewports.desktop, SPEC.viewports.smallMobile]) {
      await openFreshPage(session, vp);
      const snap = await getPageSnapshot(session);
      assertExactTextPresent(snap.bodyText, SPEC.copy.rsvpCta, "RSVP section");
      await session.evaluate(() => {
        window.__e2eMarker = 1;
      });
      for (let cycle = 0; cycle < 2; cycle++) {
        await session.clickElement({ selector: "button, a", text: SPEC.copy.rsvpCta, exact: true });
        await pause(150);
        const opened = await findOpenRsvpNotice(session);
        assert.ok(opened?.open, `RSVP failed to open on cycle ${cycle + 1} at ${vp.width}`);
        assert.ok(opened.closeButtonSelector, "Missing close button on RSVP notice/modal");
        await session.clickSelector(opened.closeButtonSelector);
        await pause(150);
        assert.equal(await findOpenRsvpNotice(session), null, `RSVP failed to close on cycle ${cycle + 1}`);
      }
      assert.equal(await session.evaluate(() => window.__e2eMarker), 1);
      await auditNetworkEvents(session, BASE_URL, { forbidMutations: true });
    }
  });

  test("T2-F7-03: Keyboard Enter & Space activation + Escape dismissal & focus safety", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    for (const key of ["Enter", "Space"]) {
      await session.evaluate((ctaText) => {
        const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
        const cta = [...document.querySelectorAll("button, a")].find(
          (el) => norm(el.innerText) === ctaText,
        );
        cta?.scrollIntoView({ block: "center" });
        cta?.focus();
      }, SPEC.copy.rsvpCta);
      await session.pressKey(key);
      await pause(150);
      const opened = await findOpenRsvpNotice(session);
      assert.ok(opened?.open, `${key} failed to open RSVP modal/notice`);
      if (opened.kind === "dialog") {
        assert.ok(opened.activeInsideDialog, `Focus should move inside RSVP dialog on ${key}`);
      }
      await session.pressKey("Escape");
      await pause(150);
      assert.equal(await findOpenRsvpNotice(session), null, `Escape failed to close after ${key}`);
      if (opened.kind === "dialog") {
        const returnedToCta = await session.evaluate((ctaText) => {
          const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
          return norm(document.activeElement?.textContent || "") === ctaText;
        }, SPEC.copy.rsvpCta);
        assert.ok(returnedToCta, "Focus should return to RSVP Now → after closing dialog via Escape");
      }
    }
  });

  test("T2-F7-04: Flexible modal/notice non-empty content, contrast & zero blur", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const snap = await getPageSnapshot(session);
    assertExactTextPresent(snap.bodyText, SPEC.copy.rsvpCta, "RSVP section");
    await session.clickElement({ selector: "button, a", text: SPEC.copy.rsvpCta, exact: true });
    await pause(150);
    const opened = await findOpenRsvpNotice(session);
    assert.ok(opened?.open, "RSVP notice/dialog failed to open");
    assert.ok(opened.text.length >= 15);
    assert.ok(opened.rect.width >= 200 && opened.rect.height >= 40);
    assert.ok(!/blur\(/i.test(opened.backdropFilter || "none"), "RSVP modal/notice must not use backdrop-filter blur");
    if (normalizeRgb(opened.backgroundColor)?.a > 0) {
      assert.ok(
        contrastRatio(opened.color, opened.backgroundColor) >= 4.5,
        "RSVP notice/dialog text contrast < 4.5:1",
      );
    }
    assert.ok(!/credit card|payment|saved to database/i.test(opened.text));
  });

  test("T2-F7-05: Header RSVP anchor/trigger synchronization & zero reload", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const deskNav = await getNavSummary(session);
    assert.ok(deskNav.links.find((l) => l.text === "RSVP")?.visible, "Desktop header RSVP missing");
    await session.evaluate(() => {
      window.__e2eMarker = 1;
    });
    await session.clickElement({ selector: "header a, header button", text: "RSVP", exact: true });
    await pause(400);
    const deskOpened = await findOpenRsvpNotice(session);
    const deskRsvpInView = await session.evaluate((heading) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const sec = [...document.querySelectorAll("section")].find((s) => norm(s.innerText).includes(heading));
      if (!sec) return false;
      const r = sec.getBoundingClientRect();
      return r.top < window.innerHeight && r.bottom > 0;
    }, SPEC.copy.rsvpHeading);
    assert.ok(deskOpened?.open || deskRsvpInView, "Desktop header RSVP must open RSVP or scroll #rsvp into view");
    assert.equal(await session.evaluate(() => window.__e2eMarker), 1);
    await auditNetworkEvents(session, BASE_URL, { forbidMutations: true });

    await openFreshPage(session, SPEC.viewports.smallMobile);
    await session.evaluate(() => {
      window.__e2eMarker = 1;
    });
    await session.clickSelector("header button[aria-expanded]");
    await pause(150);
    await session.clickElement({
      selector: "header a, header button, nav a, nav button, [role='dialog'] a, [role='dialog'] button",
      text: "RSVP",
      exact: true,
    });
    await pause(400);
    const mobOpened = await findOpenRsvpNotice(session);
    const mobRsvpInView = await session.evaluate((heading) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const sec = [...document.querySelectorAll("section")].find((s) => norm(s.innerText).includes(heading));
      if (!sec) return false;
      const r = sec.getBoundingClientRect();
      return r.top < window.innerHeight && r.bottom > 0;
    }, SPEC.copy.rsvpHeading);
    assert.ok(mobOpened?.open || mobRsvpInView, "Mobile header RSVP must open RSVP or scroll #rsvp into view");
    assert.equal(await session.evaluate(() => window.__e2eMarker), 1);
  });

  test("T2-F7-06: Narrow mobile (375px) dialog/notice containment & close target >=32x32", async () => {
    await openFreshPage(session, SPEC.viewports.smallMobile);
    const snap = await getPageSnapshot(session);
    assertExactTextPresent(snap.bodyText, SPEC.copy.rsvpCta, "RSVP section");
    await session.clickElement({ selector: "button, a", text: SPEC.copy.rsvpCta, exact: true });
    await pause(150);
    const opened = await findOpenRsvpNotice(session);
    assert.ok(opened?.open, "RSVP failed to open at 375px");
    assert.ok(opened.rect.left >= 0 && opened.rect.right <= 375);
    await assertNoHorizontalOverflow(session, 375);
    assert.ok(opened.closeButtons.length >= 1, "Close button missing");
    const closeBtn = opened.closeButtons[0];
    assert.ok(
      closeBtn.rect.width >= 32 && closeBtn.rect.height >= 32,
      `RSVP close button too small: ${JSON.stringify(closeBtn.rect)}`,
    );
    const hitClear = await session.evaluate((sel) => {
      const btn = document.querySelector(sel);
      if (!btn) return false;
      btn.scrollIntoView({ block: "center" });
      const r = btn.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return Boolean(top && (top === btn || btn.contains(top)));
    }, closeBtn.selector);
    assert.ok(hitClear, "RSVP close button is obscured at 375px");
  });

  // =========================================================================
  // F8: Thank You / Closing Section (6 Tests)
  // =========================================================================

  test("T2-F8-01: Exact spaced em-dash \\u2014 & negative double-hyphen/en-dash check", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const footerText = await session.evaluate(() => {
      const f = document.querySelector("footer");
      return f ? (f.innerText || "").replace(/\s+/g, " ").trim() : "";
    });
    assert.ok(footerText.includes(SPEC.copy.thankYouHeading), "Footer Thank You missing");
    assert.ok(footerText.includes("with us \u2014 thank you"), "Expected spaced em-dash 'with us — thank you'");
    assert.ok(!/with us\s*(--|-|\u2013)\s*thank you/i.test(footerText), "Forbidden hyphen/en-dash substitution");
  });

  test("T2-F8-02: Exact Oxford-comma-free gratitude copy verification", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const footerText = await session.evaluate(() => {
      const f = document.querySelector("footer");
      return f ? (f.innerText || "").replace(/\s+/g, " ").trim() : "";
    });
    assertExactTextPresent(footerText, SPEC.copy.thankYouCopy, "footer");
    assert.ok(!footerText.includes("mentors, and"), "Forbidden Oxford comma after mentors");
    assert.ok(!footerText.includes("prayers, and"), "Forbidden Oxford comma after prayers");
  });

  test("T2-F8-03: Signature 'Majala & Florence' in <footer> & final-section order", async () => {
    for (const vp of [SPEC.viewports.desktop, SPEC.viewports.smallMobile]) {
      await openFreshPage(session, vp);
      const order = await session.evaluate((copy) => {
        const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
        const f = document.querySelector("footer");
        const rsvp = [...document.querySelectorAll("section")].find((s) =>
          norm(s.innerText).includes(copy.rsvpHeading),
        );
        if (!f || !rsvp) return { found: false };
        const ft = norm(f.innerText);
        return {
          found: true,
          hasHeading: ft.includes(copy.thankYouHeading),
          hasSig: ft.includes(copy.signature),
          footerTop: f.getBoundingClientRect().top,
          rsvpBottom: rsvp.getBoundingClientRect().bottom,
        };
      }, SPEC.copy);
      assert.ok(order.found && order.hasHeading && order.hasSig);
      assert.ok(order.footerTop >= order.rsvpBottom - 40, `Footer not positioned after RSVP at ${vp.width}`);
    }
  });

  test("T2-F8-04: Forest Green #193C2F vs #F7F3EA WCAG contrast verification", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const res = await session.evaluate((copy) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const f = document.querySelector("footer");
      if (!f) return { found: false };
      let bg = getComputedStyle(f).backgroundColor;
      if (!bg || bg === "rgba(0, 0, 0, 0)" || bg === "transparent") {
        const inner = [...f.querySelectorAll("*")].find((el) => {
          const b = getComputedStyle(el).backgroundColor;
          return b && b !== "rgba(0, 0, 0, 0)" && b !== "transparent" && el.getBoundingClientRect().height >= 120;
        });
        bg = inner ? getComputedStyle(inner).backgroundColor : bg;
      }
      const findColor = (needle) => {
        const el = [...f.querySelectorAll("*")]
          .filter((n) => norm(n.innerText).includes(needle))
          .sort(
            (a, b) =>
              a.getBoundingClientRect().width * a.getBoundingClientRect().height -
              b.getBoundingClientRect().width * b.getBoundingClientRect().height,
          )[0];
        return el ? getComputedStyle(el).color : null;
      };
      return {
        found: true,
        bg,
        hColor: findColor(copy.thankYouHeading),
        pColor: findColor("To our family"),
        sColor: findColor(copy.signature),
      };
    }, SPEC.copy);
    assert.ok(res.found);
    assertColorMatches(res.bg, SPEC.palette.forestGreen);
    for (const c of [res.hColor, res.pColor, res.sColor]) {
      assert.ok(c && relativeLuminance(c) >= 0.7 && contrastRatio(c, res.bg) >= 4.5, `Footer contrast failed for ${c} on ${res.bg}`);
    }
  });

  test("T2-F8-05: Bottom-corner decorative accent non-obscuration (elementsFromPoint)", async () => {
    for (const vp of [SPEC.viewports.desktop, SPEC.viewports.smallMobile]) {
      await openFreshPage(session, vp);
      const check = await session.evaluate((copy) => {
        const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
        const f = document.querySelector("footer");
        if (!f) return { found: false };
        const findSmallest = (needle) =>
          [...f.querySelectorAll("*")]
            .filter((n) => norm(n.innerText).includes(needle))
            .sort(
              (a, b) =>
                a.getBoundingClientRect().width * a.getBoundingClientRect().height -
                b.getBoundingClientRect().width * b.getBoundingClientRect().height,
            )[0];
        const els = [
          findSmallest(copy.thankYouHeading),
          findSmallest("To our family"),
          findSmallest(copy.signature),
        ];
        if (els.some((e) => !e)) return { found: false };
        const failures = [];
        for (const el of els) {
          el.scrollIntoView({ block: "center" });
          const r = el.getBoundingClientRect();
          for (const [fx, fy] of [[0.25, 0.5], [0.5, 0.5], [0.75, 0.5]]) {
            const top = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy);
            if (top && top !== el && !el.contains(top)) {
              failures.push(`Footer "${norm(el.innerText).slice(0, 20)}" obscured by <${top.tagName}>`);
              break;
            }
          }
        }
        return { found: true, failures };
      }, SPEC.copy);
      assert.ok(check.found, `Footer text missing at ${vp.width}`);
      assert.deepEqual(check.failures, []);
    }
  });

  test("T2-F8-06: Closing wave/gold trim width & zero mobile horizontal overflow", async () => {
    for (const vp of [SPEC.viewports.smallMobile, SPEC.viewports.desktop]) {
      await openFreshPage(session, vp);
      await assertNoHorizontalOverflow(session, vp.width);
      const f = await session.evaluate(() => {
        const footer = document.querySelector("footer");
        if (!footer) return { found: false };
        const goldTrimCandidates = [
          ...new Set(
            [footer, ...footer.querySelectorAll("*")]
              .map((el) => {
                const cs = getComputedStyle(el);
                return [
                  cs.borderTopColor,
                  cs.borderBottomColor,
                  cs.backgroundColor,
                  cs.color,
                  el.getAttribute("stroke") || "",
                  el.getAttribute("fill") || "",
                ];
              })
              .flat()
              .filter(Boolean),
          ),
        ];
        return {
          found: true,
          clientWidth: document.documentElement.clientWidth,
          rect: footer.getBoundingClientRect().toJSON(),
          goldTrimCandidates,
        };
      });
      assert.ok(f.found);
      assert.ok(
        f.rect.width >= f.clientWidth - 2 &&
          f.rect.left >= 0 &&
          f.rect.right <= f.clientWidth + 1,
        `Expected <footer> width (${f.rect.width}) to span clientWidth (${f.clientWidth}) without overflow`,
      );
      const hasGoldTrim = f.goldTrimCandidates.some((c) =>
        colorsMatch(c, SPEC.palette.champagneGold, 15),
      );
      assert.ok(hasGoldTrim, `Expected closing gold trim inside <footer> at ${vp.width}`);
    }
  });

  // =========================================================================
  // F9: Design System, A11y, Assets & Resilience (6 Tests)
  // =========================================================================

  test("T2-F9-01: Zero external network requests & self-hosted Playfair Display + Manrope active", async () => {
    await openFreshPage(session, SPEC.viewports.desktop, { disableCache: true });
    const snap = await getPageSnapshot(session);
    assert.ok(snap.hasHeader && snap.hasMain && snap.hasFooter && snap.h2Count >= 4);
    const scrollH = snap.scrollHeight;
    for (let y = 0; y <= scrollH; y += 600) {
      await session.scrollTo(y);
      await pause(60);
    }
    await auditNetworkEvents(session, BASE_URL, { allowExternalOrigins: [], forbidMutations: true });
    const fonts = await session.evaluate(async () => {
      await document.fonts.ready;
      const loaded = [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family);
      const h1 = document.querySelector("h1");
      const p = document.querySelector("main p");
      return {
        loaded,
        h1Font: h1 ? getComputedStyle(h1).fontFamily : "",
        bodyFont: p ? getComputedStyle(p).fontFamily : "",
      };
    });
    assert.ok(fonts.loaded.some((f) => /Playfair Display/i.test(f)));
    assert.ok(fonts.loaded.some((f) => /Manrope/i.test(f)));
    assert.ok(/Playfair Display/i.test(fonts.h1Font));
    assert.ok(/Manrope/i.test(fonts.bodyFont));
  });

  test("T2-F9-02: Zero CSS @keyframes, zero running animations & zero backdrop-filter blur", async () => {
    for (const vp of [SPEC.viewports.desktop, SPEC.viewports.smallMobile]) {
      await openFreshPage(session, vp);
      const snap = await getPageSnapshot(session);
      assert.ok(snap.hasFooter, "<footer> required");
      await assertAllImagesLoaded(session, { minCount: 7 });
      const styles = await auditForbiddenStylesAndAnimations(session);
      assert.equal(styles.runningAnimations, 0);
      assert.deepEqual(styles.keyframeRules, []);
      assert.deepEqual(styles.animationElements, []);
      assert.deepEqual(styles.blurElements, []);
    }
  });

  test("T2-F9-03: Palette guard: zero neon or unapproved dominant backgrounds", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const snap = await getPageSnapshot(session);
    assert.ok(snap.hasHeader && snap.hasMain && snap.hasFooter);
    assertExactTextPresent(snap.bodyText, SPEC.copy.rsvpHeading);

    const bgs = await session.evaluate(() =>
      [...document.querySelectorAll("body, header, main, section, footer, a, button")].map((el) => ({
        tag: el.tagName.toLowerCase(),
        bg: getComputedStyle(el).backgroundColor,
      })),
    );
    const locked = Object.values(SPEC.palette).map((h) => normalizeRgb(h));
    for (const item of bgs) {
      const c = normalizeRgb(item.bg);
      if (!c || c.a === 0) continue;
      const matchesLocked = locked.some(
        (l) => Math.abs(l.r - c.r) <= 18 && Math.abs(l.g - c.g) <= 18 && Math.abs(l.b - c.b) <= 18,
      );
      if (!matchesLocked) {
        const max = Math.max(c.r, c.g, c.b);
        const min = Math.min(c.r, c.g, c.b);
        const delta = max - min;
        const l = (max + min) / 510;
        const sat = delta === 0 ? 0 : delta / (255 * (1 - Math.abs(2 * l - 1)));
        assert.ok(
          !(sat > 0.65 && max > 200 && min < 80),
          `Neon/unapproved background detected on <${item.tag}>: ${item.bg}`,
        );
      }
    }
  });

  test("T2-F9-04: Semantic landmark uniqueness & strict heading hierarchy (zero skipped levels)", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const snap = await getPageSnapshot(session);
    assert.equal(snap.headerCount, 1);
    assert.equal(snap.mainCount, 1);
    assert.equal(snap.footerCount, 1);
    assert.equal(snap.h1Count, 1);
    assert.ok(snap.h2Count >= 4);
    assert.equal(snap.lang, "en");
    assert.ok(snap.title.trim().length > 0);
    assert.equal(snap.headings[0]?.level, 1, "First heading on page must be <h1>");
    for (let i = 1; i < snap.headings.length; i++) {
      assert.ok(
        snap.headings[i].level <= snap.headings[i - 1].level + 1,
        `Skipped heading level: h${snap.headings[i - 1].level} -> h${snap.headings[i].level}`,
      );
    }
  });

  test("T2-F9-05: Unknown hash fragment resilience (/#nonexistent-section)", async () => {
    for (const vp of [SPEC.viewports.desktop, SPEC.viewports.smallMobile]) {
      await session.goto("about:blank", { waitFonts: false });
      await session.setViewport(vp);
      await session.setCacheDisabled(false);
      session.clearEvents();
      await session.goto(`${BASE_URL}/#nonexistent-section`, {
        waitFonts: true,
        waitImages: true,
      });
      const snap = await getPageSnapshot(session);
      assertExactTextPresent(snap.bodyText, SPEC.copy.heroTitle);
      assertExactTextPresent(snap.bodyText, SPEC.copy.graduatesHeading);
      assertExactTextPresent(snap.bodyText, SPEC.copy.thankYouHeading);
      assert.ok(snap.hasFooter);
      await assertNoHorizontalOverflow(session, vp.width);
      await session.clickElement({ selector: "button, a", text: SPEC.copy.rsvpCta, exact: true });
      await pause(150);
      assert.ok((await findOpenRsvpNotice(session))?.open, "RSVP should still work after unknown hash");
      await auditNetworkEvents(session, BASE_URL);
    }
  });

  test("T2-F9-06: 404 unknown route handling & excluded checkerboard/broken asset negative check", async () => {
    const res = await fetch(`${BASE_URL}/nonexistent-e2e-route`);
    assert.equal(res.status, 404, `Expected HTTP 404 for unknown route, got ${res.status}`);

    await openFreshPage(session, SPEC.viewports.desktop);
    const audit = await assertAllImagesLoaded(session, { minCount: 7 });
    for (const img of audit.images) {
      assert.ok(
        !/elegant_magnolia_gold_corner_bottom_right/i.test(img.src),
        `Excluded checkerboard asset referenced: ${img.src}`,
      );
      assert.ok(img.alt === "" || img.alt.trim().length > 0);
    }
  });
});
