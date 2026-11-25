import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import {
  assertColorMatches,
  assertNoCountdown,
  assertNoHorizontalOverflow,
  auditFaceAndTextNonObstruction,
  auditForbiddenStylesAndAnimations,
  auditNetworkEvents,
  colorsMatch,
  findOpenRsvpNotice,
  getImagesAudit,
  getNavSummary,
  getPageSnapshot,
  SPEC,
} from "./lib/assertions.mjs";
import { createSession, launchEdge } from "./lib/cdp.mjs";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3000";

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function openFreshPage(session, viewport = SPEC.viewports.desktop) {
  await session.setViewport(viewport);
  await session.setCacheDisabled(false);
  session.clearEvents();
  await session.goto(BASE_URL, { waitFonts: true, waitImages: true });
}

describe("Tier 3 — Pairwise Cross-Feature & Cross-Viewport Suite (T3-01..T3-14, 14 Tests)", { concurrency: false }, () => {
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

  test("T3-01: Desktop Nav Links x Valid Anchor Targets & Clean Scroll", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    await session.evaluate(() => {
      window.__e2eSession = 1;
    });
    const nav = await getNavSummary(session);
    assert.ok(nav.found, "<header> not found");
    for (const label of SPEC.copy.navLinks) {
      const item = nav.links.find((l) => l.text === label);
      assert.ok(item?.found && item.visible, `Desktop nav item "${label}" not visible`);
    }
    for (const label of ["Home", "The Graduates", "Celebration Details", "Gallery"]) {
      const item = nav.links.find((l) => l.text === label);
      assert.ok(item.isHash && item.targetExists, `Invalid hash target for "${label}": ${item.href}`);
      await session.clickElement({ selector: "header a, header button", text: label, exact: true });
      await pause(300);
      const res = await session.evaluate((id) => {
        const el = document.getElementById(id);
        return {
          alive: window.__e2eSession,
          top: el ? el.getBoundingClientRect().top : null,
          innerHeight: window.innerHeight,
        };
      }, item.targetId);
      assert.equal(res.alive, 1, `Clicking "${label}" reloaded the page`);
      assert.ok(res.top !== null && Math.abs(res.top) < res.innerHeight);
    }
    await auditNetworkEvents(session, BASE_URL);
  });

  test("T3-02: Desktop Header RSVP x Section #rsvp / Modal Activation", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const nav = await getNavSummary(session);
    assert.ok(nav.links.find((l) => l.text === "RSVP")?.visible, "Desktop header RSVP link missing");
    await session.evaluate(() => {
      window.__e2eSession = 1;
    });
    await session.clickElement({ selector: "header a, header button", text: "RSVP", exact: true });
    await pause(350);
    const opened = await findOpenRsvpNotice(session);
    const rsvpInView = await session.evaluate((heading) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const sec = [...document.querySelectorAll("section")].find((s) => norm(s.innerText).includes(heading));
      if (!sec) return false;
      const r = sec.getBoundingClientRect();
      return r.top < window.innerHeight && r.bottom > 0;
    }, SPEC.copy.rsvpHeading);
    assert.ok(opened?.open || rsvpInView, "Header RSVP must open RSVP notice/modal or scroll #rsvp into view");
    assert.equal(await session.evaluate(() => window.__e2eSession), 1);
    await auditNetworkEvents(session, BASE_URL, { forbidMutations: true });
  });

  test("T3-03: Viewport x Header Deliberate Composition (Color & Controls)", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const deskNav = await getNavSummary(session);
    assert.ok(deskNav.found);
    assertColorMatches(deskNav.headerBg, SPEC.palette.forestGreen);
    for (const label of SPEC.copy.navLinks) {
      assert.ok(deskNav.links.find((l) => l.text === label)?.visible);
    }
    assert.ok(!deskNav.hamburger?.visible);

    await openFreshPage(session, SPEC.viewports.mobile);
    const mobNav = await getNavSummary(session);
    assert.ok(mobNav.found);
    assertColorMatches(mobNav.headerBg, SPEC.palette.warmIvory);
    assert.ok(mobNav.hamburger?.visible);
    assert.ok(mobNav.hamburger.rect.width >= 40 && mobNav.hamburger.rect.height >= 40);
    for (const label of ["The Graduates", "Celebration Details", "Gallery"]) {
      assert.ok(!mobNav.links.find((l) => l.text === label)?.visible);
    }
  });

  test("T3-04: Mobile Hamburger x Open/Close State Machine", async () => {
    await openFreshPage(session, SPEC.viewports.mobile);
    const initial = await getNavSummary(session);
    assert.equal(initial.hamburger?.ariaExpanded, "false");
    for (const label of ["The Graduates", "Celebration Details", "Gallery"]) {
      assert.ok(!initial.links.find((l) => l.text === label)?.visible);
    }

    await session.clickSelector("header button[aria-expanded]");
    await pause(150);
    const opened = await getNavSummary(session);
    assert.equal(opened.hamburger?.ariaExpanded, "true");
    for (const label of SPEC.copy.navLinks) {
      assert.ok(opened.links.find((l) => l.text === label)?.visible);
    }

    await session.clickSelector("header button[aria-expanded]");
    await pause(150);
    const closed = await getNavSummary(session);
    assert.equal(closed.hamburger?.ariaExpanded, "false");
    for (const label of ["The Graduates", "Celebration Details", "Gallery"]) {
      assert.ok(!closed.links.find((l) => l.text === label)?.visible);
    }
  });

  test("T3-05: Small Mobile (375x812) x Hamburger Escape Key Dismissal", async () => {
    await openFreshPage(session, SPEC.viewports.smallMobile);
    const init = await getNavSummary(session);
    assert.ok(init.hamburger?.visible && init.hamburger.rect.width >= 40 && init.hamburger.rect.height >= 40);

    await session.clickSelector("header button[aria-expanded]");
    await pause(150);
    assert.equal((await getNavSummary(session)).hamburger?.ariaExpanded, "true");

    await session.pressKey("Escape");
    await pause(150);
    const afterEsc = await getNavSummary(session);
    assert.equal(afterEsc.hamburger?.ariaExpanded, "false");
    for (const label of ["The Graduates", "Celebration Details", "Gallery"]) {
      assert.ok(!afterEsc.links.find((l) => l.text === label)?.visible);
    }
    await assertNoHorizontalOverflow(session, 375);
  });

  test("T3-06: Mobile Hamburger x Link Click Auto-Close & Navigation", async () => {
    await openFreshPage(session, SPEC.viewports.mobile);
    const init = await getNavSummary(session);
    assert.ok(init.hamburger?.visible, "Mobile hamburger button missing");
    await session.clickSelector("header button[aria-expanded]");
    await pause(150);

    const targetId = (await getNavSummary(session)).links.find((l) => l.text === "The Graduates")?.targetId;
    assert.ok(targetId, "Missing anchor target for The Graduates");

    await session.clickElement({
      selector: "header a, header button, nav a, nav button, [role='dialog'] a, [role='dialog'] button",
      text: "The Graduates",
      exact: true,
    });
    await pause(400);

    const after = await getNavSummary(session);
    assert.equal(after.hamburger?.ariaExpanded, "false");
    for (const label of ["The Graduates", "Celebration Details", "Gallery"]) {
      assert.ok(!after.links.find((l) => l.text === label)?.visible);
    }
    const targetTop = await session.evaluate((id) => {
      const el = document.getElementById(id);
      return el ? { top: el.getBoundingClientRect().top, h: window.innerHeight } : null;
    }, targetId);
    assert.ok(targetTop && Math.abs(targetTop.top) < targetTop.h);
  });

  test("T3-07: Viewport x Hero Deliberate Composition (2-Col vs Arch Stack)", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const desk = await session.evaluate((titleText) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const h1 = document.querySelector("h1");
      const sec = h1 ? h1.closest("section") || h1.closest("main") : null;
      const img = sec
        ? [...sec.querySelectorAll("img")].find((i) => {
            const r = i.getBoundingClientRect();
            return (i.getAttribute("alt") ?? "").trim().length >= 10 && r.width >= 200 && r.height >= 200;
          })
        : null;
      if (!h1 || !img || !norm(h1.innerText).includes(titleText)) return { found: false };
      return {
        found: true,
        copyRect: h1.getBoundingClientRect().toJSON(),
        imgRect: img.getBoundingClientRect().toJSON(),
        loaded: img.complete && img.naturalWidth > 0,
      };
    }, SPEC.copy.heroTitle);
    assert.ok(desk.found && desk.loaded);
    assert.ok(desk.copyRect.left < desk.imgRect.left && desk.copyRect.right <= desk.imgRect.left + 80);

    await openFreshPage(session, SPEC.viewports.mobile);
    const mob = await session.evaluate((titleText) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const h1 = document.querySelector("h1");
      const sec = h1 ? h1.closest("section") || h1.closest("main") : null;
      const p = sec
        ? [...sec.querySelectorAll("p")].find((el) => norm(el.innerText).includes("Join us as we celebrate"))
        : null;
      const img = sec
        ? [...sec.querySelectorAll("img")].find((i) => {
            const r = i.getBoundingClientRect();
            return (i.getAttribute("alt") ?? "").trim().length >= 10 && r.width >= 200 && r.height >= 200;
          })
        : null;
      if (!h1 || !p || !img || !norm(h1.innerText).includes(titleText)) return { found: false };
      const chain = [];
      let cur = img;
      for (let i = 0; i < 3 && cur && sec.contains(cur); i++) {
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
    }, SPEC.copy.heroTitle);
    assert.ok(mob.found);
    assert.ok(mob.copyBottom <= mob.imgTop + 24);
    assert.ok(
      mob.chain.some(
        (r) =>
          r.topLeft >= 40 &&
          r.topRight >= 40 &&
          r.bottomLeft < r.topLeft &&
          r.bottomRight < r.topRight,
      ),
    );
  });

  test("T3-08: Viewport x Meet the Graduates Composition & Identity Pairing", async () => {
    const inspectGraduates = async () =>
      session.evaluate((copy) => {
        const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
        const getCard = (name) => {
          const leaf = [...document.querySelectorAll("*")].filter((el) => norm(el.innerText) === name).pop();
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
                loaded: img.complete && img.naturalWidth > 0,
                cardRect: cur.getBoundingClientRect().toJSON(),
                imgRect: img.getBoundingClientRect().toJSON(),
                textRect: leaf.getBoundingClientRect().toJSON(),
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

    await openFreshPage(session, SPEC.viewports.desktop);
    const desk = await inspectGraduates();
    assert.ok(desk.majala && desk.florence);
    assert.ok(desk.majala.text.includes(SPEC.copy.majalaDegree));
    assert.ok(desk.florence.text.includes(SPEC.copy.florenceDegree));
    assert.ok(desk.majala.loaded && desk.florence.loaded);
    assert.notEqual(desk.majala.src, desk.florence.src);
    assert.ok(Math.abs(desk.majala.cardRect.top - desk.florence.cardRect.top) < 80);
    assert.ok(desk.majala.cardRect.left < desk.florence.cardRect.left);

    await openFreshPage(session, SPEC.viewports.mobile);
    const mob = await inspectGraduates();
    assert.ok(mob.majala && mob.florence);
    assert.ok(mob.majala.cardRect.bottom <= mob.florence.cardRect.top + 24);
    assert.ok(mob.majala.imgRect.left < mob.majala.textRect.left);
    assert.ok(mob.florence.imgRect.left < mob.florence.textRect.left);
  });

  test("T3-09: Viewport x Unified Celebration Details & Venue Banner", async () => {
    const inspectBanner = async () =>
      session.evaluate((copy) => {
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
        const cs = getComputedStyle(c);
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
        const innerBorders = [...c.querySelectorAll("*")]
          .map((el) => {
            const ecs = getComputedStyle(el);
            return {
              width: parseFloat(ecs.borderTopWidth) || 0,
              color: ecs.borderTopColor,
            };
          })
          .filter((b) => b.width >= 1);
        return {
          found: true,
          bg: cs.backgroundColor,
          maxBorderWidth: Math.max(...borderWidths),
          borderColors,
          innerBorders,
          d: d.getBoundingClientRect().toJSON(),
          t: t.getBoundingClientRect().toJSON(),
          v: v.getBoundingClientRect().toJSON(),
        };
      }, SPEC.copy);

    await openFreshPage(session, SPEC.viewports.desktop);
    const desk = await inspectBanner();
    assert.ok(desk.found);
    assertColorMatches(desk.bg, SPEC.palette.forestGreen);
    const hasBorder =
      (desk.maxBorderWidth >= 1 &&
        desk.borderColors.some((c) => colorsMatch(c, SPEC.palette.champagneGold, 15))) ||
      desk.innerBorders.some((b) => colorsMatch(b.color, SPEC.palette.champagneGold, 15));
    assert.ok(hasBorder, "Unified banner missing gold border");
    const tops = [desk.d.top, desk.t.top, desk.v.top];
    assert.ok(Math.max(...tops) - Math.min(...tops) < 60);
    assert.ok(desk.d.left < desk.t.left && desk.t.left < desk.v.left);

    await openFreshPage(session, SPEC.viewports.mobile);
    const mob = await inspectBanner();
    assert.ok(mob.found);
    assert.ok(mob.d.top < mob.t.top && mob.t.top < mob.v.top);
  });

  test("T3-10: Viewport x Gallery 5-Tile Grid vs Mobile Row & Zero Overflow", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const deskAudit = await getImagesAudit(session);
    const deskTiles = deskAudit.images.filter((i) => i.inGallery && i.alt.trim().length > 0);
    assert.equal(deskTiles.length, 5);
    assert.equal(new Set(deskTiles.map((t) => t.currentSrc || t.src)).size, 5);
    for (const t of deskTiles) {
      assert.ok(t.complete && t.naturalWidth > 0);
    }
    const deskTops = deskTiles.map((t) => t.rect.top);
    assert.ok(Math.max(...deskTops) - Math.min(...deskTops) <= 20);
    assert.ok(deskTiles[4].rect.right <= 1440);

    await openFreshPage(session, SPEC.viewports.mobile);
    await session.evaluate((heading) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const sec = [...document.querySelectorAll("section")].find((s) => norm(s.innerText).includes(heading));
      sec?.scrollIntoView({ block: "center" });
    }, SPEC.copy.galleryHeading);
    const mobAudit = await getImagesAudit(session);
    const mobTiles = mobAudit.images.filter((i) => i.inGallery && i.alt.trim().length > 0);
    assert.equal(mobTiles.length, 5);
    assert.ok(Math.abs(mobTiles[0].rect.top - mobTiles[1].rect.top) <= 24);
    assert.ok(Math.abs(mobTiles[1].rect.top - mobTiles[2].rect.top) <= 24);
    assert.ok(mobTiles[0].rect.left < mobTiles[1].rect.left && mobTiles[1].rect.left < mobTiles[2].rect.left);
    assert.ok(mobTiles[2].rect.right <= 390 + 24);
    await assertNoHorizontalOverflow(session, 390);
  });

  test("T3-11: RSVP Now -> x Open/Close Button x Network Zero-Mutation", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const snap = await getPageSnapshot(session);
    assert.ok(snap.bodyText.includes(SPEC.copy.rsvpCta), "RSVP Now → CTA missing");
    await session.evaluate(() => {
      window.__e2eNoReload = 1;
    });
    await session.clickElement({ selector: "button, a", text: SPEC.copy.rsvpCta, exact: true });
    await pause(150);
    const opened = await findOpenRsvpNotice(session);
    assert.ok(opened?.open && opened.closeButtonSelector);
    assert.equal(await session.evaluate(() => window.__e2eNoReload), 1);
    await auditNetworkEvents(session, BASE_URL, { forbidMutations: true });

    await session.clickSelector(opened.closeButtonSelector);
    await pause(150);
    assert.equal(await findOpenRsvpNotice(session), null);
  });

  test("T3-12: RSVP Now -> x Keyboard Enter/Escape & Focus Restoration", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    await session.evaluate((ctaText) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const cta = [...document.querySelectorAll("button, a")].find((el) => norm(el.innerText) === ctaText);
      cta?.scrollIntoView({ block: "center" });
      cta?.focus();
    }, SPEC.copy.rsvpCta);
    await session.pressKey("Enter");
    await pause(150);
    const opened = await findOpenRsvpNotice(session);
    assert.ok(opened?.open);
    if (opened.kind === "dialog") {
      assert.ok(opened.activeInsideDialog);
    }
    await session.pressKey("Escape");
    await pause(150);
    assert.equal(await findOpenRsvpNotice(session), null);
    if (opened.kind === "dialog") {
      const restored = await session.evaluate((ctaText) => {
        const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
        return norm(document.activeElement?.textContent || "") === ctaText;
      }, SPEC.copy.rsvpCta);
      assert.ok(restored);
    }
  });

  test("T3-13: Locked Palette x Typography x Forbidden-Patterns Pair", async () => {
    for (const vp of [SPEC.viewports.desktop, SPEC.viewports.mobile]) {
      await openFreshPage(session, vp);
      const snap = await getPageSnapshot(session);
      assert.ok(snap.hasHeader && snap.hasMain && snap.hasFooter);
      assertNoCountdown(snap.bodyText);

      const paletteFonts = await session.evaluate(() => {
        const bodyBg = getComputedStyle(document.body).backgroundColor;
        const footer = document.querySelector("footer");
        let footerBg = footer ? getComputedStyle(footer).backgroundColor : "";
        if (footer && (!footerBg || footerBg === "rgba(0, 0, 0, 0)" || footerBg === "transparent")) {
          const inner = [...footer.querySelectorAll("*")].find((el) => {
            const b = getComputedStyle(el).backgroundColor;
            return b && b !== "rgba(0, 0, 0, 0)" && b !== "transparent" && el.getBoundingClientRect().height >= 120;
          });
          footerBg = inner ? getComputedStyle(inner).backgroundColor : footerBg;
        }
        const h1 = document.querySelector("h1");
        const p = document.querySelector("main p");
        return {
          bodyBg,
          footerBg,
          h1Font: h1 ? getComputedStyle(h1).fontFamily : "",
          h1Style: h1 ? getComputedStyle(h1).fontStyle : "",
          bodyFont: p ? getComputedStyle(p).fontFamily : "",
        };
      });
      assertColorMatches(paletteFonts.bodyBg, SPEC.palette.warmIvory);
      assertColorMatches(paletteFonts.footerBg, SPEC.palette.forestGreen);
      assert.ok(/Playfair Display/i.test(paletteFonts.h1Font) && paletteFonts.h1Style === "italic");
      assert.ok(/Manrope/i.test(paletteFonts.bodyFont));

      const forbidden = await auditForbiddenStylesAndAnimations(session);
      assert.equal(forbidden.runningAnimations, 0);
      assert.deepEqual(forbidden.blurElements, []);
    }
  });

  test("T3-14: Botanical/Ornamental Elements x Text & Face Non-Obstruction", async () => {
    for (const vp of [SPEC.viewports.desktop, SPEC.viewports.mobile]) {
      await openFreshPage(session, vp);
      const snap = await getPageSnapshot(session);
      assert.ok(snap.hasHeader && snap.hasMain && snap.hasFooter && snap.h2Count >= 4);
      const imgs = await getImagesAudit(session);
      assert.ok(imgs.total >= 8);
      const res = await auditFaceAndTextNonObstruction(session);
      assert.ok(res.checkedTargets >= 10);
      assert.deepEqual(res.failures, [], `Non-obstruction failures at ${vp.width}: ${JSON.stringify(res.failures)}`);
    }
  });
});
