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
  findOpenRsvpNotice,
  findSectionByText,
  getComputedStyleForText,
  getImagesAudit,
  getNavSummary,
  getPageSnapshot,
  normalizeRgb,
  SPEC,
} from "./lib/assertions.mjs";
import { createSession, launchEdge } from "./lib/cdp.mjs";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3000";

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function openFreshPage(session, viewport = SPEC.viewports.desktop) {
  await session.setViewport(viewport);
  session.clearEvents();
  await session.goto(BASE_URL, { waitFonts: true, waitImages: true });
}

describe("Tier 1 — Happy-Path Feature Suite (F1–F9, 49 Tests)", { concurrency: false }, () => {
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
  // F1: Section 1 — Navigation & Responsive Mobile Menu (6 Tests)
  // =========================================================================

  test("T1-F1-01: Desktop header #193C2F band & italic wordmark", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const nav = await getNavSummary(session);
    assert.ok(nav.found, "Expected <header> landmark to exist");
    assert.ok(
      nav.headerRect.width >= 1200 && nav.headerRect.height >= 40,
      `Unexpected desktop <header> dimensions: ${JSON.stringify(nav.headerRect)}`,
    );
    assertColorMatches(
      nav.headerBg,
      SPEC.palette.forestGreen,
      "desktop <header> backgroundColor",
    );
    assert.ok(nav.wordmark?.found && nav.wordmark.visible, "Header wordmark 'Majala & Florence' not visible");
    assert.ok(
      /Playfair Display/i.test(nav.wordmark.fontFamily),
      `Expected Playfair Display on wordmark, got: ${nav.wordmark.fontFamily}`,
    );
    assert.equal(
      nav.wordmark.fontStyle,
      "italic",
      `Expected italic wordmark, got fontStyle="${nav.wordmark.fontStyle}"`,
    );
  });

  test("T1-F1-02: Desktop nav links & RSVP CTA visible on single row", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const nav = await getNavSummary(session);
    assert.ok(nav.found, "Expected <header> landmark");
    for (const label of SPEC.copy.navLinks) {
      const item = nav.links.find((l) => l.text === label);
      assert.ok(item?.found && item.visible, `Desktop nav item "${label}" must be visible`);
    }
    const tops = nav.links.map((l) => l.rect.top);
    assert.ok(
      Math.max(...tops) - Math.min(...tops) <= 24,
      `Desktop nav items wrapped onto multiple rows: tops=${JSON.stringify(tops)}`,
    );
    const rsvp = nav.links.find((l) => l.text === "RSVP");
    assert.ok(
      !colorsMatch(rsvp.backgroundColor, SPEC.palette.forestGreen, 5) &&
        (colorsMatch(rsvp.backgroundColor, SPEC.palette.champagneGold, 15) ||
          colorsMatch(rsvp.borderColor, SPEC.palette.champagneGold, 15)),
      `Expected RSVP CTA gold styling distinct from #193C2F, got bg=${rsvp.backgroundColor} border=${rsvp.borderColor}`,
    );
    assert.ok(
      !nav.hamburger?.visible,
      "Desktop hamburger button must be hidden at 1440px",
    );
  });

  test("T1-F1-03: Desktop nav anchor targets & no-reload scroll", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    await session.evaluate(() => {
      window.__e2eAlive = 1;
    });
    const nav = await getNavSummary(session);
    assert.ok(nav.found, "Expected <header> landmark");

    for (const label of ["Home", "The Graduates", "Celebration Details", "Gallery"]) {
      const link = nav.links.find((l) => l.text === label);
      assert.ok(link?.found && link.visible, `Nav link "${label}" missing`);
      assert.ok(link.isHash, `Expected hash href on "${label}", got "${link.href}"`);
      assert.ok(link.targetExists, `Anchor target "${link.href}" for "${label}" does not exist in DOM`);
    }

    for (const label of ["The Graduates", "Gallery"]) {
      const link = nav.links.find((l) => l.text === label);
      await session.clickElement({
        selector: "header a, header button",
        text: label,
        exact: true,
      });
      await pause(350);
      const check = await session.evaluate((id) => {
        const target = document.getElementById(id);
        return {
          alive: window.__e2eAlive,
          top: target ? target.getBoundingClientRect().top : null,
          innerHeight: window.innerHeight,
        };
      }, link.targetId);
      assert.equal(check.alive, 1, `Clicking "${label}" caused a full page reload`);
      assert.ok(
        check.top !== null && Math.abs(check.top) < check.innerHeight,
        `Target #${link.targetId} did not scroll near viewport (top=${check.top})`,
      );
    }
    await assertNoHorizontalOverflow(session, 1440);
  });

  test("T1-F1-04: Mobile header #F7F3EA composition & closed hamburger default", async () => {
    await openFreshPage(session, SPEC.viewports.mobile);
    const nav = await getNavSummary(session);
    assert.ok(nav.found, "Expected <header> landmark on mobile");
    assertColorMatches(
      nav.headerBg,
      SPEC.palette.warmIvory,
      "mobile <header> backgroundColor",
    );
    assert.ok(nav.wordmark?.found && nav.wordmark.visible, "Mobile wordmark 'Majala & Florence' not visible");
    assert.ok(
      nav.hamburger?.found && nav.hamburger.visible,
      "Mobile hamburger button must be visible at 390x844",
    );
    assert.ok(
      nav.hamburger.rect.width >= 40 && nav.hamburger.rect.height >= 40,
      `Mobile hamburger touch target too small: ${JSON.stringify(nav.hamburger.rect)}`,
    );
    assert.equal(
      nav.hamburger.ariaExpanded,
      "false",
      "Mobile hamburger must default to aria-expanded='false'",
    );
    for (const label of ["The Graduates", "Celebration Details", "Gallery"]) {
      const link = nav.links.find((l) => l.text === label);
      assert.ok(!link?.visible, `Nav link "${label}" should be hidden when mobile menu is closed`);
    }
  });

  test("T1-F1-05: Mobile hamburger open/close toggle & full menu list", async () => {
    await openFreshPage(session, SPEC.viewports.mobile);
    const initNav = await getNavSummary(session);
    assert.ok(initNav.hamburger?.visible, "Mobile hamburger button must be visible");
    await session.clickSelector("header button[aria-expanded]");
    await pause(150);

    const openNav = await getNavSummary(session);
    assert.equal(openNav.hamburger?.ariaExpanded, "true", "Expected aria-expanded='true' after 1st click");
    for (const label of SPEC.copy.navLinks) {
      const item = openNav.links.find((l) => l.text === label);
      assert.ok(item?.found && item.visible, `Mobile drawer link "${label}" must be visible when open`);
      assert.ok(item.rect.right <= 390 + 1, `Drawer link "${label}" overflows 390px: right=${item.rect.right}`);
    }

    await session.clickSelector("header button[aria-expanded]");
    await pause(150);

    const closedNav = await getNavSummary(session);
    assert.equal(closedNav.hamburger?.ariaExpanded, "false", "Expected aria-expanded='false' after 2nd click");
    for (const label of ["The Graduates", "Celebration Details", "Gallery"]) {
      const item = closedNav.links.find((l) => l.text === label);
      assert.ok(!item?.visible, `Drawer link "${label}" should be hidden after closing`);
    }
  });

  test("T1-F1-06: Mobile hamburger link click auto-closes menu & scrolls", async () => {
    await openFreshPage(session, SPEC.viewports.mobile);
    const initNav = await getNavSummary(session);
    assert.ok(initNav.hamburger?.visible, "Mobile hamburger button must be visible");
    await session.clickSelector("header button[aria-expanded]");
    await pause(150);

    await session.clickElement({
      selector: "header a, header button, nav a, nav button, [role='dialog'] a, [role='dialog'] button",
      text: "Celebration Details",
      exact: true,
    });
    await pause(400);

    const navAfter = await getNavSummary(session);
    assert.equal(
      navAfter.hamburger?.ariaExpanded,
      "false",
      "Expected mobile drawer to auto-close after clicking a nav link",
    );
    for (const label of ["The Graduates", "Celebration Details", "Gallery"]) {
      const item = navAfter.links.find((l) => l.text === label);
      assert.ok(!item?.visible, `Drawer item "${label}" still visible after navigation`);
    }
    await assertNoHorizontalOverflow(session, 390);
    const detailsCheck = await session.evaluate((dateCopy) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const target = [...document.querySelectorAll("section, div")].find((el) =>
        norm(el.innerText).includes(dateCopy),
      );
      return target
        ? {
            found: true,
            top: target.getBoundingClientRect().top,
            innerHeight: window.innerHeight,
          }
        : { found: false };
    }, SPEC.copy.celebrationDate);
    assert.ok(detailsCheck.found, "Celebration Details section not found");
    assert.ok(
      detailsCheck.top < detailsCheck.innerHeight,
      `Celebration Details did not scroll into viewport (top=${detailsCheck.top})`,
    );
  });

  // =========================================================================
  // F2: Section 2 — Hero / Invitation Cover (6 Tests)
  // =========================================================================

  test("T1-F2-01: Hero verbatim eyebrows, h1 title & graduate heading", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const hero = await session.evaluate(() => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const h1 = document.querySelector("h1");
      if (!h1) return { found: false };
      const sec = h1.closest("section") || h1.closest("main");
      const h1Cs = getComputedStyle(h1);
      const gradHeading = [...(sec?.querySelectorAll("*") || [])]
        .filter((el) => norm(el.innerText) === "Majala & Florence")
        .sort(
          (a, b) =>
            a.getBoundingClientRect().width * a.getBoundingClientRect().height -
            b.getBoundingClientRect().width * b.getBoundingClientRect().height,
        )[0];
      return {
        found: true,
        sectionText: sec ? norm(sec.innerText) : "",
        h1Text: norm(h1.innerText),
        h1Font: h1Cs.fontFamily,
        h1Style: h1Cs.fontStyle,
        h1Rect: h1.getBoundingClientRect().toJSON(),
        gradFound: Boolean(gradHeading),
        gradFont: gradHeading ? getComputedStyle(gradHeading).fontFamily : "",
        gradStyle: gradHeading ? getComputedStyle(gradHeading).fontStyle : "",
      };
    });
    assert.ok(hero.found, "Hero <h1> not found");
    assert.equal(hero.h1Text, SPEC.copy.heroTitle);
    assert.ok(/Playfair Display/i.test(hero.h1Font), `Expected Playfair Display on h1, got ${hero.h1Font}`);
    assert.equal(hero.h1Style, "italic", `Expected italic h1, got ${hero.h1Style}`);
    assertExactTextPresent(hero.sectionText, SPEC.copy.heroEyebrow, "Hero section");
    assertExactTextPresent(hero.sectionText, SPEC.copy.heroSubEyebrow, "Hero section");
    assert.ok(hero.gradFound, "Hero heading 'Majala & Florence' not found");
    assert.ok(/Playfair Display/i.test(hero.gradFont), `Expected Playfair Display on Hero graduate heading, got ${hero.gradFont}`);
    assert.equal(hero.gradStyle, "italic", `Expected italic on Hero graduate heading, got ${hero.gradStyle}`);
  });

  test("T1-F2-02: Hero verbatim invitation paragraph without outer quotes", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const para = await getComputedStyleForText(session, "Join us as we celebrate", "p");
    assert.ok(para.found, "Hero invitation paragraph not found");
    assert.equal(
      para.rawText,
      SPEC.copy.heroParagraph,
      "Hero invitation paragraph does not match approved verbatim copy without outer quotes",
    );
    assert.ok(
      !/^["'“”]|["'“”]$/.test(para.rawText),
      `Hero paragraph must not have leading/trailing quote marks: ${para.rawText}`,
    );
    assert.ok(
      /Manrope/i.test(para.fontFamily),
      `Expected Manrope font on Hero paragraph, got ${para.fontFamily}`,
    );
  });

  test("T1-F2-03: Hero twins portrait loaded & accessible (filename-agnostic)", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const portrait = await session.evaluate(() => {
      const h1 = document.querySelector("h1");
      const heroSec = h1 ? h1.closest("section") || h1.closest("main") : null;
      if (!heroSec) return { found: false };
      const imgs = [...heroSec.querySelectorAll("img")]
        .map((img) => ({
          alt: (img.getAttribute("alt") ?? "").trim(),
          complete: img.complete,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          rect: img.getBoundingClientRect().toJSON(),
        }))
        .filter((i) => i.alt.length >= 10 && i.rect.width >= 200 && i.rect.height >= 200);
      return imgs.length > 0 ? { found: true, img: imgs[0] } : { found: false };
    });
    assert.ok(portrait.found, "Hero subject portrait <img> (>= 200x200 with descriptive alt) not found");
    assert.ok(
      portrait.img.complete && portrait.img.naturalWidth > 0 && portrait.img.naturalHeight > 0,
      `Hero portrait failed to load: ${JSON.stringify(portrait.img)}`,
    );
    assert.match(
      portrait.img.alt,
      /majala|florence|twins|graduates/i,
      `Hero portrait alt text should describe the graduates: "${portrait.img.alt}"`,
    );
  });

  test("T1-F2-04: Desktop Hero 2-column split composition", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const layout = await session.evaluate(() => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const h1 = document.querySelector("h1");
      const heroSec = h1 ? h1.closest("section") || h1.closest("main") : null;
      if (!heroSec || !h1) return { found: false };
      const p = [...heroSec.querySelectorAll("p")].find((el) =>
        norm(el.innerText).includes("Join us as we celebrate"),
      );
      const img = [...heroSec.querySelectorAll("img")].find((el) => {
        const r = el.getBoundingClientRect();
        return (el.getAttribute("alt") ?? "").trim().length >= 10 && r.width >= 200 && r.height >= 200;
      });
      if (!p || !img) return { found: false };
      const r1 = h1.getBoundingClientRect();
      const r2 = p.getBoundingClientRect();
      const copyRect = {
        left: Math.min(r1.left, r2.left),
        top: Math.min(r1.top, r2.top),
        right: Math.max(r1.right, r2.right),
        bottom: Math.max(r1.bottom, r2.bottom),
      };
      return { found: true, copyRect, imgRect: img.getBoundingClientRect().toJSON() };
    });
    assert.ok(layout.found, "Hero copy and portrait required for 2-column layout check");
    assert.ok(
      layout.copyRect.left < layout.imgRect.left,
      `Expected Hero copy left of portrait: copy=${layout.copyRect.left} img=${layout.imgRect.left}`,
    );
    assert.ok(
      layout.copyRect.right <= layout.imgRect.left + 80,
      `Expected 2-column Hero split: copy.right=${layout.copyRect.right} vs img.left=${layout.imgRect.left}`,
    );
    assert.ok(
      Math.min(layout.copyRect.bottom, layout.imgRect.bottom) >
        Math.max(layout.copyRect.top, layout.imgRect.top),
      "Desktop Hero copy and portrait should share vertical band overlap",
    );
    assert.ok(layout.imgRect.right <= 1440, `Hero portrait exceeds 1440px: right=${layout.imgRect.right}`);
  });

  test("T1-F2-05: Mobile Hero deliberate vertical stack & arch-top portrait", async () => {
    await openFreshPage(session, SPEC.viewports.mobile);
    const mobileHero = await session.evaluate(() => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const h1 = document.querySelector("h1");
      const heroSec = h1 ? h1.closest("section") || h1.closest("main") : null;
      if (!heroSec || !h1) return { found: false };
      const p = [...heroSec.querySelectorAll("p")].find((el) =>
        norm(el.innerText).includes("Join us as we celebrate"),
      );
      const img = [...heroSec.querySelectorAll("img")].find((el) => {
        const r = el.getBoundingClientRect();
        return (el.getAttribute("alt") ?? "").trim().length >= 10 && r.width >= 200 && r.height >= 200;
      });
      if (!p || !img) return { found: false };
      const r1 = h1.getBoundingClientRect();
      const r2 = p.getBoundingClientRect();
      const copyRect = {
        left: Math.min(r1.left, r2.left),
        top: Math.min(r1.top, r2.top),
        right: Math.max(r1.right, r2.right),
        bottom: Math.max(r1.bottom, r2.bottom),
      };
      const radiiChain = [];
      let cur = img;
      for (let i = 0; i < 3 && cur && heroSec.contains(cur); i++) {
        const cs = getComputedStyle(cur);
        radiiChain.push({
          topLeft: parseFloat(cs.borderTopLeftRadius) || 0,
          topRight: parseFloat(cs.borderTopRightRadius) || 0,
          bottomLeft: parseFloat(cs.borderBottomLeftRadius) || 0,
          bottomRight: parseFloat(cs.borderBottomRightRadius) || 0,
        });
        cur = cur.parentElement;
      }
      return {
        found: true,
        copyRect,
        imgRect: img.getBoundingClientRect().toJSON(),
        radiiChain,
      };
    });
    assert.ok(mobileHero.found, "Mobile Hero copy and portrait not found");
    assert.ok(
      mobileHero.copyRect.bottom <= mobileHero.imgRect.top + 24,
      `Expected mobile Hero text stacked above portrait: copy.bottom=${mobileHero.copyRect.bottom}, img.top=${mobileHero.imgRect.top}`,
    );
    assert.ok(
      mobileHero.imgRect.width >= 240 && mobileHero.imgRect.right <= 390,
      `Unexpected mobile Hero portrait bounds: ${JSON.stringify(mobileHero.imgRect)}`,
    );
    const hasArch = mobileHero.radiiChain.some(
      (r) =>
        r.topLeft >= 60 &&
        r.topRight >= 60 &&
        r.bottomLeft < r.topLeft &&
        r.bottomRight < r.topRight,
    );
    assert.ok(
      hasArch,
      `Expected arch-top portrait radius on mobile Hero: ${JSON.stringify(mobileHero.radiiChain)}`,
    );
  });

  test("T1-F2-06: Hero non-obscuring botanicals on text & upper portrait faces", async () => {
    for (const vp of [SPEC.viewports.desktop, SPEC.viewports.mobile]) {
      await openFreshPage(session, vp);
      const res = await session.evaluate(() => {
        const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
        const h1 = document.querySelector("h1");
        const heroSec = h1 ? h1.closest("section") || h1.closest("main") : null;
        if (!heroSec || !h1) return { ready: false };
        const p = [...heroSec.querySelectorAll("p")].find((el) =>
          norm(el.innerText).includes("Join us as we celebrate"),
        );
        const img = [...heroSec.querySelectorAll("img")].find((el) => {
          const r = el.getBoundingClientRect();
          return (el.getAttribute("alt") ?? "").trim().length >= 10 && r.width >= 200 && r.height >= 200;
        });
        if (!p || !img) return { ready: false };

        const failures = [];
        for (const [name, el] of [["h1", h1], ["p", p]]) {
          el.scrollIntoView({ block: "center" });
          const r = el.getBoundingClientRect();
          const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          if (!top || (top !== el && !el.contains(top))) {
            failures.push(`Hero ${name} center obscured by <${top?.tagName}>`);
          }
        }

        img.scrollIntoView({ block: "center" });
        const ir = img.getBoundingClientRect();
        for (const fx of [0.35, 0.5, 0.65]) {
          const stack = document.elementsFromPoint(
            ir.left + ir.width * fx,
            ir.top + ir.height * 0.28,
          );
          for (const el of stack) {
            if (el === img) break;
            const tag = el.tagName.toLowerCase();
            const cs = getComputedStyle(el);
            const isDecoImg = tag === "img" && (el.getAttribute("alt") ?? "").trim() === "";
            const isSvg = tag === "svg" || Boolean(el.closest("svg"));
            if (isDecoImg || isSvg || cs.pointerEvents !== "none") {
              failures.push(`Hero portrait upper-face (${fx}) covered by <${tag}>`);
              break;
            }
          }
        }
        return { ready: true, failures };
      });
      assert.ok(res.ready, `Hero elements incomplete at ${vp.width}x${vp.height}`);
      assert.deepEqual(res.failures, [], `Hero obscuration failures at ${vp.width}x${vp.height}: ${JSON.stringify(res.failures)}`);
    }
  });

  // =========================================================================
  // F3: Section 3 — Meet the Graduates (5 Tests)
  // =========================================================================

  test("T1-F3-01: Meet the Graduates heading, names & degrees verbatim", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const h2 = await getComputedStyleForText(session, SPEC.copy.graduatesHeading, "h2");
    assert.ok(h2.found, "Heading 'Meet the Graduates' not found");
    assert.ok(/Playfair Display/i.test(h2.fontFamily));
    assert.equal(h2.fontStyle, "italic");
    const sec = await findSectionByText(session, SPEC.copy.graduatesHeading, "section");
    assert.ok(sec.found, "Meet the Graduates <section> not found");
    assertExactTextPresent(sec.text, SPEC.copy.majalaName, "Meet the Graduates");
    assertExactTextPresent(sec.text, SPEC.copy.majalaDegree, "Meet the Graduates");
    assertExactTextPresent(sec.text, SPEC.copy.florenceName, "Meet the Graduates");
    assertExactTextPresent(sec.text, SPEC.copy.florenceDegree, "Meet the Graduates");
  });

  test("T1-F3-02: Strict graduate-to-degree pairing (no swap)", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const cards = await session.evaluate((copy) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const findCard = (name) => {
        const nameNodes = [...document.querySelectorAll("*")].filter(
          (el) => norm(el.innerText) === name,
        );
        const leaf = nameNodes[nameNodes.length - 1];
        if (!leaf) return null;
        let cur = leaf.parentElement;
        while (cur && cur.tagName.toLowerCase() !== "section") {
          const subjectImgs = [...cur.querySelectorAll("img")].filter(
            (img) => (img.getAttribute("alt") ?? "").trim().length > 0,
          );
          if (subjectImgs.length === 1 && cur.querySelectorAll("p").length >= 1) {
            return norm(cur.innerText);
          }
          cur = cur.parentElement;
        }
        return null;
      };
      return {
        majalaText: findCard(copy.majalaName),
        florenceText: findCard(copy.florenceName),
      };
    }, SPEC.copy);
    assert.ok(cards.majalaText, "Could not locate Majala Mwaila card");
    assert.ok(cards.florenceText, "Could not locate Florence Achala Mwaila card");
    assert.ok(cards.majalaText.includes(SPEC.copy.majalaDegree), "Majala card missing Education (Mathematics) degree");
    assert.ok(!cards.majalaText.includes("French and Sociology"), "Majala card swapped with Florence degree");
    assert.ok(cards.florenceText.includes(SPEC.copy.florenceDegree), "Florence card missing French and Sociology degree");
    assert.ok(!cards.florenceText.includes("Education (Mathematics)"), "Florence card swapped with Majala degree");
  });

  test("T1-F3-03: Distinct loaded graduate portraits with meaningful alt", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const portraits = await session.evaluate((copy) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const findImg = (name) => {
        const nameNodes = [...document.querySelectorAll("*")].filter(
          (el) => norm(el.innerText) === name,
        );
        const leaf = nameNodes[nameNodes.length - 1];
        if (!leaf) return null;
        let cur = leaf.parentElement;
        while (cur && cur.tagName.toLowerCase() !== "section") {
          const subjectImgs = [...cur.querySelectorAll("img")].filter(
            (img) => (img.getAttribute("alt") ?? "").trim().length > 0,
          );
          if (subjectImgs.length === 1) {
            const img = subjectImgs[0];
            return {
              src: img.currentSrc || img.getAttribute("src") || "",
              alt: img.getAttribute("alt") ?? "",
              complete: img.complete,
              naturalWidth: img.naturalWidth,
              naturalHeight: img.naturalHeight,
            };
          }
          cur = cur.parentElement;
        }
        return null;
      };
      return {
        majala: findImg(copy.majalaName),
        florence: findImg(copy.florenceName),
      };
    }, SPEC.copy);
    assert.ok(portraits.majala && portraits.florence, "Both graduate portraits must exist");
    assert.ok(portraits.majala.complete && portraits.majala.naturalWidth > 0, "Majala portrait broken");
    assert.ok(portraits.florence.complete && portraits.florence.naturalWidth > 0, "Florence portrait broken");
    assert.notEqual(portraits.majala.src, portraits.florence.src, "Graduate portraits must be distinct files");
    assert.match(portraits.majala.alt, /majala/i);
    assert.match(portraits.florence.alt, /florence/i);
  });

  test("T1-F3-04: Desktop side-by-side graduate cards composition", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const rects = await session.evaluate((copy) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const findCardRect = (name) => {
        const nameNodes = [...document.querySelectorAll("*")].filter(
          (el) => norm(el.innerText) === name,
        );
        const leaf = nameNodes[nameNodes.length - 1];
        if (!leaf) return null;
        let cur = leaf.parentElement;
        while (cur && cur.tagName.toLowerCase() !== "section") {
          const subjectImgs = [...cur.querySelectorAll("img")].filter(
            (img) => (img.getAttribute("alt") ?? "").trim().length > 0,
          );
          if (subjectImgs.length === 1 && cur.querySelectorAll("p").length >= 1) {
            return cur.getBoundingClientRect().toJSON();
          }
          cur = cur.parentElement;
        }
        return null;
      };
      return {
        majala: findCardRect(copy.majalaName),
        florence: findCardRect(copy.florenceName),
      };
    }, SPEC.copy);
    assert.ok(rects.majala && rects.florence, "Both graduate cards not found");
    assert.ok(
      Math.abs(rects.majala.top - rects.florence.top) <= 80,
      `Expected side-by-side graduate cards on desktop: majala.top=${rects.majala.top}, florence.top=${rects.florence.top}`,
    );
    assert.ok(
      rects.majala.right <= rects.florence.left + 200 && rects.majala.left < rects.florence.left,
      `Expected Majala card left of Florence card`,
    );
    assert.ok(rects.majala.left >= 0 && rects.florence.right <= 1440);
  });

  test("T1-F3-05: Mobile stacked vertical rows with left-aligned thumbnails", async () => {
    await openFreshPage(session, SPEC.viewports.mobile);
    const mobileCards = await session.evaluate((copy) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const inspectCard = (name) => {
        const nameNodes = [...document.querySelectorAll("*")].filter(
          (el) => norm(el.innerText) === name,
        );
        const leaf = nameNodes[nameNodes.length - 1];
        if (!leaf) return null;
        let cur = leaf.parentElement;
        while (cur && cur.tagName.toLowerCase() !== "section") {
          const subjectImgs = [...cur.querySelectorAll("img")].filter(
            (img) => (img.getAttribute("alt") ?? "").trim().length > 0,
          );
          if (subjectImgs.length === 1 && cur.querySelectorAll("p").length >= 1) {
            return {
              cardRect: cur.getBoundingClientRect().toJSON(),
              imgRect: subjectImgs[0].getBoundingClientRect().toJSON(),
              textRect: leaf.getBoundingClientRect().toJSON(),
            };
          }
          cur = cur.parentElement;
        }
        return null;
      };
      return {
        majala: inspectCard(copy.majalaName),
        florence: inspectCard(copy.florenceName),
      };
    }, SPEC.copy);
    assert.ok(mobileCards.majala && mobileCards.florence, "Mobile graduate cards not found");
    assert.ok(
      mobileCards.majala.cardRect.bottom <= mobileCards.florence.cardRect.top + 24,
      `Expected vertical stack on mobile: majala.bottom=${mobileCards.majala.cardRect.bottom}, florence.top=${mobileCards.florence.cardRect.top}`,
    );
    for (const [name, c] of [["Majala", mobileCards.majala], ["Florence", mobileCards.florence]]) {
      assert.ok(c.cardRect.right <= 390 + 1, `${name} card overflows 390px: right=${c.cardRect.right}`);
      assert.ok(
        c.imgRect.left < c.textRect.left && c.imgRect.right <= c.textRect.left + 16,
        `${name} thumbnail must sit left of text on mobile`,
      );
    }
  });

  // =========================================================================
  // F4: Section 4 — Celebration Details (5 Tests)
  // =========================================================================

  test("T1-F4-01: Verbatim celebration date & time", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const dateEl = await getComputedStyleForText(session, SPEC.copy.celebrationDate);
    const timeEl = await getComputedStyleForText(session, SPEC.copy.celebrationTime);
    assert.ok(dateEl.found, `Missing celebration date "${SPEC.copy.celebrationDate}"`);
    assert.ok(timeEl.found, `Missing celebration time "${SPEC.copy.celebrationTime}"`);
    assert.ok(/Manrope/i.test(dateEl.fontFamily), `Expected Manrope on date, got ${dateEl.fontFamily}`);
    assert.ok(/Manrope/i.test(timeEl.fontFamily), `Expected Manrope on time, got ${timeEl.fontFamily}`);
  });

  test("T1-F4-02: Forest Green (#193C2F) & Champagne Gold (#C4A46C) container", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const box = await session.evaluate((dateText) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const dateLeaf = [...document.querySelectorAll("*")]
        .filter((el) => !["SCRIPT", "STYLE", "NOSCRIPT", "HEAD", "META", "TITLE"].includes(el.tagName) && norm(el.innerText).includes(dateText))
        .sort(
          (a, b) =>
            a.getBoundingClientRect().width * a.getBoundingClientRect().height -
            b.getBoundingClientRect().width * b.getBoundingClientRect().height,
        )[0];
      if (!dateLeaf) return { found: false };
      let container = dateLeaf;
      while (container && container !== document.body) {
        const bg = getComputedStyle(container).backgroundColor;
        if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
          break;
        }
        container = container.parentElement;
      }
      if (!container || container === document.body) return { found: false };
      const cs = getComputedStyle(container);
      const borderColors = [
        cs.borderTopColor,
        cs.borderRightColor,
        cs.borderBottomColor,
        cs.borderLeftColor,
        cs.outlineColor,
      ];
      const borderWidths = [
        parseFloat(cs.borderTopWidth) || 0,
        parseFloat(cs.borderRightWidth) || 0,
        parseFloat(cs.borderBottomWidth) || 0,
        parseFloat(cs.borderLeftWidth) || 0,
        parseFloat(cs.outlineWidth) || 0,
      ];
      const descendantBorders = [...container.querySelectorAll("*")]
        .map((el) => {
          const ecs = getComputedStyle(el);
          return {
            color: ecs.borderTopColor,
            width: parseFloat(ecs.borderTopWidth) || 0,
          };
        })
        .filter((b) => b.width >= 1);
      return {
        found: true,
        bg: cs.backgroundColor,
        textColor: getComputedStyle(dateLeaf).color,
        borderColors,
        maxBorderWidth: Math.max(...borderWidths),
        descendantBorders,
      };
    }, SPEC.copy.celebrationDate);
    assert.ok(box.found, "Celebration Details colored container not found");
    assertColorMatches(box.bg, SPEC.palette.forestGreen, "Celebration Details container bg");
    const hasGoldBorder =
      (box.maxBorderWidth >= 1 &&
        box.borderColors.some((c) => colorsMatch(c, SPEC.palette.champagneGold, 12))) ||
      box.descendantBorders.some((b) => colorsMatch(b.color, SPEC.palette.champagneGold, 12));
    assert.ok(hasGoldBorder, "Expected Champagne Gold (#C4A46C) border on Celebration Details container");
    assert.ok(
      colorsMatch(box.textColor, SPEC.palette.warmIvory, 15) ||
        colorsMatch(box.textColor, SPEC.palette.warmSand, 15),
      `Expected Warm Ivory/Sand text on details container, got ${box.textColor}`,
    );
  });

  test("T1-F4-03: Calendar & clock vector icons visible without text overlap", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const icons = await session.evaluate((dateText, timeText) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const findSmallest = (needle) =>
        [...document.querySelectorAll("*")]
          .filter((el) => !["SCRIPT", "STYLE", "NOSCRIPT", "HEAD", "META", "TITLE"].includes(el.tagName) && norm(el.innerText).includes(needle))
          .sort(
            (a, b) =>
              a.getBoundingClientRect().width * a.getBoundingClientRect().height -
              b.getBoundingClientRect().width * b.getBoundingClientRect().height,
          )[0];
      const dateLeaf = findSmallest(dateText);
      const timeLeaf = findSmallest(timeText);
      if (!dateLeaf || !timeLeaf) return { found: false };
      let container = dateLeaf;
      while (container && !container.contains(timeLeaf)) {
        container = container.parentElement;
      }
      if (!container) return { found: false };
      const svgs = [...container.querySelectorAll("svg")]
        .map((s) => s.getBoundingClientRect().toJSON())
        .filter((r) => r.width >= 14 && r.height >= 14 && r.width <= 64 && r.height <= 64);
      const dRect = dateLeaf.getBoundingClientRect();
      const tRect = timeLeaf.getBoundingClientRect();
      const overlaps = svgs.some(
        (sr) =>
          (sr.left < dRect.right - 2 && sr.right > dRect.left + 2 && sr.top < dRect.bottom - 2 && sr.bottom > dRect.top + 2) ||
          (sr.left < tRect.right - 2 && sr.right > tRect.left + 2 && sr.top < tRect.bottom - 2 && sr.bottom > tRect.top + 2),
      );
      return { found: true, svgCount: svgs.length, overlaps };
    }, SPEC.copy.celebrationDate, SPEC.copy.celebrationTime);
    assert.ok(icons.found, "Details container not found");
    assert.ok(icons.svgCount >= 2, `Expected >= 2 vector icons (calendar + clock), found ${icons.svgCount}`);
    assert.equal(icons.overlaps, false, "Icons must not overlap celebration date/time text");
  });

  test("T1-F4-04: Desktop horizontal alignment inside details container", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const rects = await session.evaluate((dateText, timeText) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const findSmallest = (needle) =>
        [...document.querySelectorAll("*")]
          .filter((el) => !["SCRIPT", "STYLE", "NOSCRIPT", "HEAD", "META", "TITLE"].includes(el.tagName) && norm(el.innerText).includes(needle))
          .sort(
            (a, b) =>
              a.getBoundingClientRect().width * a.getBoundingClientRect().height -
              b.getBoundingClientRect().width * b.getBoundingClientRect().height,
          )[0];
      const d = findSmallest(dateText);
      const t = findSmallest(timeText);
      if (!d || !t) return { found: false };
      let container = d;
      while (container && container !== document.body) {
        const bg = getComputedStyle(container).backgroundColor;
        if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent" && container.contains(t)) {
          break;
        }
        container = container.parentElement;
      }
      return {
        found: true,
        dateRect: d.getBoundingClientRect().toJSON(),
        timeRect: t.getBoundingClientRect().toJSON(),
        containerRect: container.getBoundingClientRect().toJSON(),
      };
    }, SPEC.copy.celebrationDate, SPEC.copy.celebrationTime);
    assert.ok(rects.found, "Date/time details container not found");
    assert.ok(rects.dateRect.right <= rects.timeRect.left + 20, "Date must sit left of Time on desktop");
    const dCenterY = rects.dateRect.top + rects.dateRect.height / 2;
    const tCenterY = rects.timeRect.top + rects.timeRect.height / 2;
    assert.ok(Math.abs(dCenterY - tCenterY) <= 40, "Date and Time must align horizontally on desktop");
    assert.ok(rects.containerRect.left >= 0 && rects.containerRect.right <= 1440);
  });

  test("T1-F4-05: Mobile stacked card layout inside 390px viewport", async () => {
    await openFreshPage(session, SPEC.viewports.mobile);
    const mobile = await session.evaluate((dateText, timeText) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const findSmallest = (needle) =>
        [...document.querySelectorAll("*")]
          .filter((el) => !["SCRIPT", "STYLE", "NOSCRIPT", "HEAD", "META", "TITLE"].includes(el.tagName) && norm(el.innerText).includes(needle))
          .sort(
            (a, b) =>
              a.getBoundingClientRect().width * a.getBoundingClientRect().height -
              b.getBoundingClientRect().width * b.getBoundingClientRect().height,
          )[0];
      const d = findSmallest(dateText);
      const t = findSmallest(timeText);
      if (!d || !t) return { found: false };
      let container = d;
      while (container && container !== document.body) {
        const bg = getComputedStyle(container).backgroundColor;
        if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent" && container.contains(t)) {
          break;
        }
        container = container.parentElement;
      }
      return {
        found: true,
        dateRect: d.getBoundingClientRect().toJSON(),
        timeRect: t.getBoundingClientRect().toJSON(),
        dateFontSize: parseFloat(getComputedStyle(d).fontSize) || 0,
        containerRect: container.getBoundingClientRect().toJSON(),
      };
    }, SPEC.copy.celebrationDate, SPEC.copy.celebrationTime);
    assert.ok(mobile.found, "Mobile celebration details container not found");
    assert.ok(
      mobile.containerRect.left >= 0 && mobile.containerRect.right <= 390,
      `Mobile details container overflows 390px: ${JSON.stringify(mobile.containerRect)}`,
    );
    assert.ok(
      mobile.dateRect.bottom <= mobile.timeRect.top + 20,
      "Expected Date stacked above Time on mobile",
    );
    assert.ok(mobile.dateFontSize >= 13, `Mobile date font size too small: ${mobile.dateFontSize}`);
  });

  // =========================================================================
  // F5: Section 5 — Venue & Directions (5 Tests)
  // =========================================================================

  test("T1-F5-01: Verbatim venue name 'Rainbow Ruiru Resort' inside #193C2F band", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const venue = await session.evaluate((name) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const leaf = [...document.querySelectorAll("*")]
        .filter((el) => !["SCRIPT", "STYLE", "NOSCRIPT", "HEAD", "META", "TITLE"].includes(el.tagName) && norm(el.innerText).includes(name))
        .sort(
          (a, b) =>
            a.getBoundingClientRect().width * a.getBoundingClientRect().height -
            b.getBoundingClientRect().width * b.getBoundingClientRect().height,
        )[0];
      if (!leaf) return { found: false };
      let bgBox = leaf;
      while (bgBox && bgBox !== document.body) {
        const bg = getComputedStyle(bgBox).backgroundColor;
        if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") break;
        bgBox = bgBox.parentElement;
      }
      return {
        found: true,
        rect: leaf.getBoundingClientRect().toJSON(),
        color: getComputedStyle(leaf).color,
        containerBg: bgBox ? getComputedStyle(bgBox).backgroundColor : "",
      };
    }, SPEC.copy.venueName);
    assert.ok(venue.found, "Venue 'Rainbow Ruiru Resort' not found");
    assert.ok(venue.rect.width > 0 && venue.rect.height > 0);
    assertColorMatches(venue.containerBg, SPEC.palette.forestGreen, "Venue band bg");
    assert.ok(
      colorsMatch(venue.color, SPEC.palette.warmIvory, 18) ||
        colorsMatch(venue.color, SPEC.palette.warmSand, 18) ||
        colorsMatch(venue.color, SPEC.palette.champagneGold, 18),
      `Unexpected light text color on Venue: ${venue.color}`,
    );
  });

  test("T1-F5-02: Exact verified Google Maps directions URL", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const link = await session.evaluate((venueName) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const anchors = [...document.querySelectorAll("a")];
      const match =
        anchors.find((a) => norm(a.innerText).includes(venueName)) ||
        anchors.find((a) => (a.getAttribute("href") || "").includes("google.com/maps"));
      if (!match) return { found: false };
      return {
        found: true,
        hrefAttr: match.getAttribute("href") || "",
        hrefProp: match.href || "",
      };
    }, SPEC.copy.venueName);
    assert.ok(link.found, "Google Maps directions <a> link not found");
    assert.equal(link.hrefAttr, SPEC.mapsUrlExact);
    const parsed = new URL(link.hrefProp);
    assert.equal(parsed.origin, "https://www.google.com");
    assert.equal(parsed.pathname, "/maps/dir/");
    assert.equal(parsed.searchParams.get("api"), "1");
    assert.equal(parsed.searchParams.get("destination"), "Rainbow Ruiru Resort, Ruiru, Kenya");
  });

  test("T1-F5-03: External link target='_blank' & rel contains noopener", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const attrs = await session.evaluate(() => {
      const a = [...document.querySelectorAll("a")].find((el) =>
        (el.getAttribute("href") || "").includes("google.com/maps"),
      );
      if (!a) return { found: false };
      return {
        found: true,
        target: a.getAttribute("target") || "",
        rel: a.getAttribute("rel") || "",
      };
    });
    assert.ok(attrs.found, "Google Maps <a> link not found");
    assert.equal(attrs.target, "_blank");
    assert.ok(attrs.rel.toLowerCase().split(/\s+/).includes("noopener"), `Expected rel to include noopener, got "${attrs.rel}"`);
  });

  test("T1-F5-04: Venue link hit-testable, pointer cursor & keyboard focusable", async () => {
    for (const vp of [SPEC.viewports.desktop, SPEC.viewports.mobile]) {
      await openFreshPage(session, vp);
      const hit = await session.evaluate(() => {
        const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
        const a = [...document.querySelectorAll("a")].find((el) =>
          (el.getAttribute("href") || "").includes("google.com/maps"),
        );
        if (!a) return { found: false };
        a.scrollIntoView({ block: "center" });
        const rect = a.getBoundingClientRect();
        const cs = getComputedStyle(a);
        const topEl = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return {
          found: true,
          cursor: cs.cursor,
          tabIndex: a.tabIndex,
          rect: rect.toJSON(),
          text: norm(a.innerText || a.getAttribute("aria-label")),
          unobstructed: Boolean(topEl && (topEl === a || a.contains(topEl))),
        };
      });
      assert.ok(hit.found, `Google Maps link missing at ${vp.width}x${vp.height}`);
      assert.equal(hit.cursor, "pointer");
      assert.ok(hit.tabIndex >= 0);
      assert.ok(hit.rect.width >= 100 && hit.rect.height >= 20, `Venue link too small: ${JSON.stringify(hit.rect)}`);
      assert.ok(hit.text.includes(SPEC.copy.venueName), `Venue link accessible text missing resort name: "${hit.text}"`);
      assert.ok(hit.unobstructed, "Venue link hit target is obscured");
    }
  });

  test("T1-F5-05: Desktop 3rd-column vs mobile 3rd-row positioning", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const desk = await session.evaluate((timeText, venueText) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const findSmallest = (needle) =>
        [...document.querySelectorAll("*")]
          .filter((el) => !["SCRIPT", "STYLE", "NOSCRIPT", "HEAD", "META", "TITLE"].includes(el.tagName) && norm(el.innerText).includes(needle))
          .sort(
            (a, b) =>
              a.getBoundingClientRect().width * a.getBoundingClientRect().height -
              b.getBoundingClientRect().width * b.getBoundingClientRect().height,
          )[0];
      const t = findSmallest(timeText);
      const v = findSmallest(venueText);
      if (!t || !v) return { found: false };
      return {
        found: true,
        timeRect: t.getBoundingClientRect().toJSON(),
        venueRect: v.getBoundingClientRect().toJSON(),
      };
    }, SPEC.copy.celebrationTime, SPEC.copy.venueName);
    assert.ok(desk.found, "Time/Venue elements missing on desktop");
    assert.ok(desk.timeRect.right <= desk.venueRect.left + 20, "Venue must be 3rd column right of Time on desktop");

    await openFreshPage(session, SPEC.viewports.mobile);
    const mob = await session.evaluate((timeText, venueText) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const findSmallest = (needle) =>
        [...document.querySelectorAll("*")]
          .filter((el) => !["SCRIPT", "STYLE", "NOSCRIPT", "HEAD", "META", "TITLE"].includes(el.tagName) && norm(el.innerText).includes(needle))
          .sort(
            (a, b) =>
              a.getBoundingClientRect().width * a.getBoundingClientRect().height -
              b.getBoundingClientRect().width * b.getBoundingClientRect().height,
          )[0];
      const t = findSmallest(timeText);
      const v = findSmallest(venueText);
      if (!t || !v) return { found: false };
      return {
        found: true,
        timeRect: t.getBoundingClientRect().toJSON(),
        venueRect: v.getBoundingClientRect().toJSON(),
      };
    }, SPEC.copy.celebrationTime, SPEC.copy.venueName);
    assert.ok(mob.found, "Time/Venue elements missing on mobile");
    assert.ok(mob.timeRect.bottom <= mob.venueRect.top + 20, "Venue must stack below Time on mobile");
    assert.ok(mob.venueRect.right <= 390);
  });

  // =========================================================================
  // F6: Section 6 — Gallery ("Our Journey in Pictures") (5 Tests)
  // =========================================================================

  test("T1-F6-01: Gallery heading & 5 distinct tile images", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const h2 = await getComputedStyleForText(session, SPEC.copy.galleryHeading, "h2");
    assert.ok(h2.found, "Gallery heading 'Our Journey in Pictures' not found");
    assert.ok(/Playfair Display/i.test(h2.fontFamily));
    assert.equal(h2.fontStyle, "italic");

    const audit = await getImagesAudit(session);
    const tiles = audit.images.filter((img) => img.inGallery && img.alt.trim().length > 0);
    assert.equal(tiles.length, 5, `Expected 5 Gallery tile images, found ${tiles.length}`);
    const uniqueSrcs = new Set(tiles.map((t) => t.currentSrc || t.src));
    assert.equal(uniqueSrcs.size, 5, "Expected 5 distinct Gallery tile image sources");
  });

  test("T1-F6-02: All 5 gallery images loaded (naturalWidth > 0) & descriptive alt", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    await session.evaluate((heading) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const sec = [...document.querySelectorAll("section")].find((s) =>
        norm(s.innerText).includes(heading),
      );
      sec?.scrollIntoView({ block: "center" });
    }, SPEC.copy.galleryHeading);
    await pause(200);

    const audit = await getImagesAudit(session);
    const tiles = audit.images.filter((img) => img.inGallery && img.alt.trim().length > 0);
    assert.equal(tiles.length, 5, "Expected 5 Gallery tile images");
    for (const tile of tiles) {
      assert.ok(
        tile.complete && tile.naturalWidth > 0 && tile.naturalHeight > 0,
        `Gallery tile failed to load: ${tile.src}`,
      );
      assert.ok(tile.rect.width >= 60 && tile.rect.height >= 60, `Gallery tile too small: ${JSON.stringify(tile.rect)}`);
      assert.ok(tile.alt.trim().length >= 10, `Gallery alt text too short: "${tile.alt}"`);
      assert.ok(!/\.(jpg|jpeg|png|webp|svg)$/i.test(tile.alt.trim()), `Gallery alt should not be a raw filename: "${tile.alt}"`);
    }
  });

  test("T1-F6-03: 5 captionless rounded tiles", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const gallery = await session.evaluate((heading) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const sec = [...document.querySelectorAll("section")].find((s) =>
        norm(s.innerText).includes(heading),
      );
      if (!sec) return { found: false };
      const figs = sec.querySelectorAll("figcaption").length;
      const imgs = [...sec.querySelectorAll("img")].filter(
        (img) => (img.getAttribute("alt") ?? "").trim().length > 0,
      );
      const tiles = imgs.map((img) => {
        let wrapper = img.parentElement;
        while (wrapper && wrapper.parentElement && wrapper.parentElement !== sec) {
          if (wrapper.parentElement.querySelectorAll("img[alt]:not([alt=''])").length > 1) {
            break;
          }
          wrapper = wrapper.parentElement;
        }
        const imgR = parseFloat(getComputedStyle(img).borderTopLeftRadius) || 0;
        const wrapR = wrapper ? parseFloat(getComputedStyle(wrapper).borderTopLeftRadius) || 0 : 0;
        return {
          captionText: wrapper ? norm(wrapper.innerText) : "",
          radius: Math.max(imgR, wrapR),
        };
      });
      return { found: true, figs, tiles };
    }, SPEC.copy.galleryHeading);
    assert.ok(gallery.found && gallery.tiles.length === 5, "Expected 5 Gallery tiles");
    assert.equal(gallery.figs, 0, "Gallery tiles must not contain <figcaption>");
    for (const tile of gallery.tiles) {
      assert.equal(tile.captionText, "", `Gallery tile must be captionless, found "${tile.captionText}"`);
      assert.ok(tile.radius > 0, "Gallery tile must have rounded corners");
    }
  });

  test("T1-F6-04: Desktop 5-column single-row layout", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const rects = await session.evaluate((heading) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const sec = [...document.querySelectorAll("section")].find((s) =>
        norm(s.innerText).includes(heading),
      );
      if (!sec) return [];
      return [...sec.querySelectorAll("img")]
        .filter((img) => (img.getAttribute("alt") ?? "").trim().length > 0)
        .map((img) => img.getBoundingClientRect().toJSON());
    }, SPEC.copy.galleryHeading);
    assert.equal(rects.length, 5, "Expected 5 Gallery tile images on desktop");
    const tops = rects.map((r) => r.top);
    assert.ok(Math.max(...tops) - Math.min(...tops) <= 20, `Gallery tiles must align on 1 row: ${JSON.stringify(tops)}`);
    for (let i = 0; i < 4; i++) {
      assert.ok(rects[i].right <= rects[i + 1].left + 4, `Gallery tile ${i} overlaps or is out of order`);
    }
    assert.ok(rects[4].right <= 1440, `Last Gallery tile overflows 1440px: right=${rects[4].right}`);
  });

  test("T1-F6-05: Mobile 3-visible horizontal row without page overflow", async () => {
    await openFreshPage(session, SPEC.viewports.mobile);
    const mob = await session.evaluate((heading) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const sec = [...document.querySelectorAll("section")].find((s) =>
        norm(s.innerText).includes(heading),
      );
      if (!sec) return { found: false };
      sec.scrollIntoView({ block: "center" });
      const tiles = [...sec.querySelectorAll("img")]
        .filter((img) => (img.getAttribute("alt") ?? "").trim().length > 0)
        .map((img) => img.getBoundingClientRect().toJSON());
      return {
        found: true,
        scrollWidth: document.documentElement.scrollWidth,
        tiles,
      };
    }, SPEC.copy.galleryHeading);
    assert.ok(mob.found && mob.tiles.length === 5, "Expected 5 Gallery tiles on mobile");
    assert.ok(mob.scrollWidth <= 390, `Mobile page overflowed 390px: scrollWidth=${mob.scrollWidth}`);
    const tops = mob.tiles.map((r) => r.top);
    assert.ok(Math.max(...tops) - Math.min(...tops) <= 24, `Mobile Gallery tiles must sit on 1 horizontal row: ${JSON.stringify(tops)}`);
    assert.ok(
      mob.tiles[0].left >= 0 && mob.tiles[2].right <= 390 + 24,
      `Expected first 3 mobile Gallery tiles visible in 390px: tile0.left=${mob.tiles[0].left}, tile2.right=${mob.tiles[2].right}`,
    );
  });

  // =========================================================================
  // F7: Section 7 — RSVP Entry Point (6 Tests)
  // =========================================================================

  test("T1-F7-01: Verbatim RSVP heading, subcopy & RSVP Now -> CTA", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const h2 = await getComputedStyleForText(session, SPEC.copy.rsvpHeading, "h2");
    assert.ok(h2.found, "Heading 'Kindly RSVP' not found");
    assert.ok(/Playfair Display/i.test(h2.fontFamily));
    assert.equal(h2.fontStyle, "italic");

    const sub = await getComputedStyleForText(session, SPEC.copy.rsvpCopy, "p");
    assert.ok(sub.found, "RSVP subcopy not found");
    assert.equal(sub.rawText, SPEC.copy.rsvpCopy);
    assert.ok(/Manrope/i.test(sub.fontFamily));

    const cta = await getComputedStyleForText(session, SPEC.copy.rsvpCta, "button, a");
    assert.ok(cta.found, "Button/link 'RSVP Now →' not found");
    assertColorMatches(cta.backgroundColor, SPEC.palette.forestGreen, "RSVP CTA bg");
    assertColorMatches(cta.color, SPEC.palette.warmIvory, "RSVP CTA text");
  });

  test("T1-F7-02: Clicking RSVP Now -> opens placeholder modal or accessible notice", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const cta = await getComputedStyleForText(session, SPEC.copy.rsvpCta, "button, a");
    assert.ok(cta.found, "RSVP Now → CTA missing");
    const beforeOpen = await findOpenRsvpNotice(session);
    assert.equal(beforeOpen, null, "RSVP dialog/notice should be closed initially");

    await session.clickElement({
      selector: "button, a",
      text: SPEC.copy.rsvpCta,
      exact: true,
    });
    await pause(150);

    const opened = await findOpenRsvpNotice(session);
    assert.ok(opened?.open, "Expected modal [role='dialog'] or accessible on-page notice after clicking RSVP Now →");
    assert.ok(opened.text.length >= 20, `RSVP notice text too short: "${opened.text}"`);
    assert.ok(opened.rect.width > 0 && opened.rect.height > 0);
  });

  test("T1-F7-03: RSVP placeholder modal/notice dismissible via close button", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const cta = await getComputedStyleForText(session, SPEC.copy.rsvpCta, "button, a");
    assert.ok(cta.found, "RSVP Now → CTA missing");
    await session.clickElement({
      selector: "button, a",
      text: SPEC.copy.rsvpCta,
      exact: true,
    });
    await pause(150);

    const opened = await findOpenRsvpNotice(session);
    assert.ok(opened?.open, "RSVP modal/notice failed to open");
    assert.ok(opened.closeButtonSelector, "RSVP modal/notice must expose a visible close/dismiss button");

    await session.clickSelector(opened.closeButtonSelector);
    await pause(150);

    const afterClose = await findOpenRsvpNotice(session);
    assert.equal(afterClose, null, "RSVP modal/notice failed to close via dismiss button");
    const ctaStillThere = await getComputedStyleForText(session, SPEC.copy.rsvpCta, "button, a");
    assert.ok(ctaStillThere.found, "RSVP Now → CTA should remain accessible after dismissal");
  });

  test("T1-F7-04: RSVP CTA keyboard Enter open & Escape dismissal", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    await session.evaluate((ctaText) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const cta = [...document.querySelectorAll("button, a")].find(
        (el) => norm(el.innerText) === ctaText,
      );
      cta?.scrollIntoView({ block: "center" });
      cta?.focus();
    }, SPEC.copy.rsvpCta);
    await session.pressKey("Enter");
    await pause(150);

    const opened = await findOpenRsvpNotice(session);
    assert.ok(opened?.open, "Pressing Enter on RSVP Now → must open modal/notice");

    await session.pressKey("Escape");
    await pause(150);

    const closed = await findOpenRsvpNotice(session);
    assert.equal(closed, null, "Pressing Escape must dismiss RSVP modal/notice");
    const activeTag = await session.evaluate(() =>
      document.activeElement ? document.activeElement.tagName.toLowerCase() : null,
    );
    assert.ok(activeTag !== null, "Active focus element should remain valid after Escape");
  });

  test("T1-F7-05: Zero backend POST / network mutation & zero reload", async () => {
    for (const vp of [SPEC.viewports.desktop, SPEC.viewports.mobile]) {
      await openFreshPage(session, vp);
      const cta = await getComputedStyleForText(session, SPEC.copy.rsvpCta, "button, a");
      assert.ok(cta.found, `RSVP Now → CTA missing at ${vp.width}`);
      await session.evaluate(() => {
        window.__e2eNoSubmit = 1;
      });
      await session.clickElement({
        selector: "button, a",
        text: SPEC.copy.rsvpCta,
        exact: true,
      });
      await pause(200);
      const opened = await findOpenRsvpNotice(session);
      assert.ok(opened?.open, `RSVP failed to open at ${vp.width}x${vp.height}`);
      if (opened.closeButtonSelector) {
        await session.clickSelector(opened.closeButtonSelector);
        await pause(150);
      }
      const noSubmit = await session.evaluate(() => window.__e2eNoSubmit);
      assert.equal(noSubmit, 1, "RSVP interaction triggered an unexpected page reload");
      await auditNetworkEvents(session, BASE_URL, { forbidMutations: true });
    }
  });

  test("T1-F7-06: Mobile RSVP layout & contained notice/modal", async () => {
    await openFreshPage(session, SPEC.viewports.mobile);
    const cta = await getComputedStyleForText(session, SPEC.copy.rsvpCta, "button, a");
    assert.ok(cta.found, "RSVP Now → missing on mobile");
    assert.ok(cta.rect.height >= 40, `Mobile RSVP CTA height too small: ${cta.rect.height}`);
    assert.ok(cta.rect.right <= 390, `Mobile RSVP CTA overflows 390px: ${cta.rect.right}`);

    await session.clickElement({
      selector: "button, a",
      text: SPEC.copy.rsvpCta,
      exact: true,
    });
    await pause(150);

    const opened = await findOpenRsvpNotice(session);
    assert.ok(opened?.open, "RSVP modal/notice failed to open on mobile");
    assert.ok(
      opened.rect.left >= 0 && opened.rect.right <= 390,
      `Mobile RSVP modal/notice overflows 390px: ${JSON.stringify(opened.rect)}`,
    );
    await assertNoHorizontalOverflow(session, 390);
    if (opened.closeButtonSelector) {
      await session.clickSelector(opened.closeButtonSelector);
      await pause(150);
    }
    assert.equal(await findOpenRsvpNotice(session), null, "Mobile RSVP failed to dismiss cleanly");
  });

  // =========================================================================
  // F8: Section 8 — Thank You / Closing Section (5 Tests)
  // =========================================================================

  test("T1-F8-01: Closing <footer> landmark & #193C2F Forest Green band", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const footer = await session.evaluate(() => {
      const f = document.querySelector("footer");
      if (!f) return { found: false };
      const r = f.getBoundingClientRect().toJSON();
      const cs = getComputedStyle(f);
      const innerColored = [...f.querySelectorAll("*")]
        .map((el) => ({
          bg: getComputedStyle(el).backgroundColor,
          rect: el.getBoundingClientRect().toJSON(),
        }))
        .find((item) => item.bg && item.bg !== "rgba(0, 0, 0, 0)" && item.bg !== "transparent" && item.rect.width >= 1200);
      return {
        found: true,
        rect: r,
        bg: cs.backgroundColor,
        innerBg: innerColored?.bg || null,
        color: cs.color,
      };
    });
    assert.ok(footer.found, "Expected closing <footer> landmark");
    assert.ok(
      footer.rect.width >= 1200 && footer.rect.height >= 150,
      `Unexpected <footer> dimensions: ${JSON.stringify(footer.rect)}`,
    );
    assert.ok(
      colorsMatch(footer.bg, SPEC.palette.forestGreen, 4) ||
        colorsMatch(footer.innerBg, SPEC.palette.forestGreen, 4),
      `Expected #193C2F Forest Green closing band, got footerBg=${footer.bg}, innerBg=${footer.innerBg}`,
    );
  });

  test("T1-F8-02: Verbatim Thank You heading & em-dash gratitude paragraph", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const res = await session.evaluate(() => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const f = document.querySelector("footer");
      if (!f) return { found: false };
      const h = [...f.querySelectorAll("h1, h2, h3")].find(
        (el) => norm(el.innerText) === "Thank You",
      );
      const p = [...f.querySelectorAll("p")].find((el) =>
        norm(el.innerText).includes("To our family"),
      );
      return {
        found: true,
        headingFound: Boolean(h),
        headingFont: h ? getComputedStyle(h).fontFamily : "",
        headingStyle: h ? getComputedStyle(h).fontStyle : "",
        paraText: p ? norm(p.innerText) : "",
      };
    });
    assert.ok(res.found && res.headingFound, "Thank You heading missing inside <footer>");
    assert.ok(/Playfair Display/i.test(res.headingFont));
    assert.equal(res.headingStyle, "italic");
    assert.equal(res.paraText, SPEC.copy.thankYouCopy);
  });

  test("T1-F8-03: Closing signature Majala & Florence & gold accent", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const sig = await session.evaluate(() => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const f = document.querySelector("footer");
      if (!f) return { found: false };
      const p = [...f.querySelectorAll("p")].find((el) =>
        norm(el.innerText).includes("To our family"),
      );
      const s = [...f.querySelectorAll("*")]
        .filter((el) => norm(el.innerText) === "Majala & Florence")
        .sort(
          (a, b) =>
            a.getBoundingClientRect().width * a.getBoundingClientRect().height -
            b.getBoundingClientRect().width * b.getBoundingClientRect().height,
        )[0];
      if (!p || !s) return { found: false };
      const goldMarkers = [...f.querySelectorAll("*")].map((el) => {
        const cs = getComputedStyle(el);
        return [
          cs.backgroundColor,
          cs.borderTopColor,
          cs.borderBottomColor,
          cs.color,
          el.getAttribute("stroke") || "",
          el.getAttribute("fill") || "",
        ];
      }).flat();
      return {
        found: true,
        copyRect: p.getBoundingClientRect().toJSON(),
        sigRect: s.getBoundingClientRect().toJSON(),
        sigFont: getComputedStyle(s).fontFamily,
        sigStyle: getComputedStyle(s).fontStyle,
        goldMarkers,
      };
    });
    assert.ok(sig.found, "Footer signature or gratitude paragraph missing");
    assert.ok(sig.sigRect.top >= sig.copyRect.bottom - 4, "Signature must appear below gratitude paragraph");
    assert.ok(/Playfair Display/i.test(sig.sigFont));
    assert.equal(sig.sigStyle, "italic");
    assert.ok(
      sig.goldMarkers.some((c) => colorsMatch(c, SPEC.palette.champagneGold, 15)),
      "Expected Champagne Gold (#C4A46C) accent inside <footer>",
    );
  });

  test("T1-F8-04: Non-obscuring footer botanical ornament", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const res = await session.evaluate((copy) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const f = document.querySelector("footer");
      if (!f) return { ready: false };
      f.scrollIntoView({ block: "center" });
      const findExactOrIncludes = (needle, exact) =>
        [...f.querySelectorAll("*")]
          .filter((el) =>
            exact ? norm(el.innerText) === needle : norm(el.innerText).includes(needle),
          )
          .sort(
            (a, b) =>
              a.getBoundingClientRect().width * a.getBoundingClientRect().height -
              b.getBoundingClientRect().width * b.getBoundingClientRect().height,
          )[0];
      const h = findExactOrIncludes(copy.thankYouHeading, true);
      const p = findExactOrIncludes("To our family", false);
      const s = findExactOrIncludes(copy.signature, true);
      if (!h || !p || !s) return { ready: false };
      const failures = [];
      for (const [label, el] of [["Thank You", h], ["Paragraph", p], ["Signature", s]]) {
        el.scrollIntoView({ block: "center" });
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (!top || (top !== el && !el.contains(top))) {
          failures.push(`${label} obscured by <${top?.tagName}>`);
        }
      }
      return { ready: true, failures };
    }, SPEC.copy);
    assert.ok(res.ready, "Footer text elements not found");
    assert.deepEqual(res.failures, [], `Footer text obscured: ${JSON.stringify(res.failures)}`);
  });

  test("T1-F8-05: Mobile closing band responsive wrapping & zero overflow", async () => {
    await openFreshPage(session, SPEC.viewports.mobile);
    const mob = await session.evaluate(() => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const f = document.querySelector("footer");
      if (!f) return { found: false };
      f.scrollIntoView({ block: "center" });
      const p = [...f.querySelectorAll("p")].find((el) =>
        norm(el.innerText).includes("To our family"),
      );
      return {
        found: true,
        rect: f.getBoundingClientRect().toJSON(),
        text: norm(f.innerText),
        pFontSize: p ? parseFloat(getComputedStyle(p).fontSize) : 0,
        scrollWidth: document.documentElement.scrollWidth,
      };
    });
    assert.ok(mob.found, "Mobile <footer> missing");
    assert.ok(mob.rect.width >= 370 && mob.rect.right <= 390 + 1);
    assertExactTextPresent(mob.text, SPEC.copy.thankYouHeading, "mobile footer");
    assertExactTextPresent(mob.text, SPEC.copy.thankYouCopy, "mobile footer");
    assertExactTextPresent(mob.text, SPEC.copy.signature, "mobile footer");
    assert.ok(mob.pFontSize >= 13, `Footer paragraph fontSize too small: ${mob.pFontSize}`);
    assert.ok(mob.scrollWidth <= 390, `Mobile horizontal overflow in footer: ${mob.scrollWidth}`);
  });

  // =========================================================================
  // F9: Design System, Forbidden Patterns, Assets & Accessibility (6 Tests)
  // =========================================================================

  test("T1-F9-01: Locked 6-color palette active (non-vacuous surface + gold check)", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const paletteAudit = await session.evaluate(() => {
      const bodyCs = getComputedStyle(document.body);
      const colors = [];
      for (const el of [...document.querySelectorAll("header, main, footer, section, a, button, div, h1, h2, p")]) {
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        colors.push({
          tag: el.tagName.toLowerCase(),
          bg: cs.backgroundColor,
          color: cs.color,
          borderTop: cs.borderTopColor,
          borderBottom: cs.borderBottomColor,
        });
      }
      return {
        bodyBg: bodyCs.backgroundColor,
        bodyColor: bodyCs.color,
        entries: colors,
      };
    });
    assertColorMatches(paletteAudit.bodyBg, SPEC.palette.warmIvory, "body backgroundColor");
    assertColorMatches(paletteAudit.bodyColor, SPEC.palette.forestGreen, "body text color");

    const greenSurfaces = paletteAudit.entries.filter((e) =>
      colorsMatch(e.bg, SPEC.palette.forestGreen, 6),
    );
    assert.ok(
      greenSurfaces.length >= 2,
      `Expected >= 2 #193C2F structural surfaces, found ${greenSurfaces.length}`,
    );

    const goldAccents = paletteAudit.entries.filter(
      (e) =>
        colorsMatch(e.bg, SPEC.palette.champagneGold, 15) ||
        colorsMatch(e.color, SPEC.palette.champagneGold, 15) ||
        colorsMatch(e.borderTop, SPEC.palette.champagneGold, 15) ||
        colorsMatch(e.borderBottom, SPEC.palette.champagneGold, 15),
    );
    assert.ok(goldAccents.length >= 1, "Expected >= 1 #C4A46C Champagne Gold element");

    const lockedRgbs = Object.values(SPEC.palette).map((hex) => normalizeRgb(hex));
    for (const entry of paletteAudit.entries) {
      const c = normalizeRgb(entry.bg);
      if (!c || c.a === 0) continue;
      const chroma = Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
      const matchesLocked = lockedRgbs.some(
        (l) =>
          Math.abs(l.r - c.r) <= 20 &&
          Math.abs(l.g - c.g) <= 20 &&
          Math.abs(l.b - c.b) <= 20,
      );
      if (!matchesLocked) {
        assert.ok(
          chroma <= 120,
          `Neon/high-chroma background detected on <${entry.tag}>: ${entry.bg}`,
        );
      }
    }
  });

  test("T1-F9-02: Playfair Display (normal + italic) & Manrope loaded & applied", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const fontInfo = await session.evaluate(async () => {
      await document.fonts.ready;
      const loadedFaces = [...document.fonts]
        .filter((f) => f.status === "loaded")
        .map((f) => ({ family: f.family, style: f.style, weight: f.weight }));
      const h1 = document.querySelector("h1");
      const h2s = [...document.querySelectorAll("h2")].map((h) => ({
        text: h.innerText.trim(),
        fontFamily: getComputedStyle(h).fontFamily,
        fontStyle: getComputedStyle(h).fontStyle,
      }));
      const bodyP = document.querySelector("main p");
      return {
        loadedFaces,
        h1Font: h1 ? getComputedStyle(h1).fontFamily : "",
        h1Style: h1 ? getComputedStyle(h1).fontStyle : "",
        h2s,
        bodyFont: bodyP ? getComputedStyle(bodyP).fontFamily : "",
      };
    });
    assert.ok(
      fontInfo.loadedFaces.some((f) => /Playfair Display/i.test(f.family) && f.style === "italic"),
      `Playfair Display italic not loaded: ${JSON.stringify(fontInfo.loadedFaces)}`,
    );
    assert.ok(
      fontInfo.loadedFaces.some((f) => /Manrope/i.test(f.family)),
      `Manrope not loaded: ${JSON.stringify(fontInfo.loadedFaces)}`,
    );
    assert.ok(/Playfair Display/i.test(fontInfo.h1Font) && fontInfo.h1Style === "italic");
    assert.ok(fontInfo.h2s.length >= 4, `Expected >= 4 <h2> headings, got ${fontInfo.h2s.length}`);
    for (const h2 of fontInfo.h2s) {
      assert.ok(/Playfair Display/i.test(h2.fontFamily), `Expected Playfair Display on "${h2.text}", got ${h2.fontFamily}`);
    }
    assert.ok(/Manrope/i.test(fontInfo.bodyFont), `Expected Manrope on body copy, got ${fontInfo.bodyFont}`);
  });

  test("T1-F9-03: Semantic landmarks & strict heading hierarchy (h1 -> h2)", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    const snap = await getPageSnapshot(session);
    assert.equal(snap.headerCount, 1, `Expected 1 <header>, got ${snap.headerCount}`);
    assert.equal(snap.mainCount, 1, `Expected 1 <main>, got ${snap.mainCount}`);
    assert.equal(snap.footerCount, 1, `Expected 1 <footer>, got ${snap.footerCount}`);
    assert.equal(snap.h1Count, 1, `Expected 1 <h1>, got ${snap.h1Count}`);
    assert.equal(snap.headings.find((h) => h.level === 1)?.text, SPEC.copy.heroTitle);
    assert.ok(snap.h2Count >= 4, `Expected >= 4 <h2> sections, got ${snap.h2Count}`);
    let prev = 0;
    for (const h of snap.headings) {
      if (prev > 0) {
        assert.ok(h.level <= prev + 1, `Skipped heading level from h${prev} to h${h.level} ("${h.text}")`);
      }
      prev = h.level;
    }
  });

  test("T1-F9-04: Zero broken images & meaningful alt on all subject images", async () => {
    await openFreshPage(session, SPEC.viewports.desktop);
    await session.scrollTo(2000);
    await pause(200);
    await session.scrollTo(0);
    const audit = await assertAllImagesLoaded(session, { minCount: 8 });
    const subjects = audit.images.filter((i) => i.rect.width >= 80 && i.rect.height >= 80 && !i.isDecorative);
    assert.ok(subjects.length >= 8, `Expected >= 8 subject images >=80x80, found ${subjects.length}`);
    for (const img of subjects) {
      assert.ok(img.alt.trim().length >= 10, `Subject image alt too short: "${img.alt}" (${img.src})`);
      assert.ok(!/\.(jpg|jpeg|png|webp|svg)$/i.test(img.alt.trim()), `Subject image alt is a raw filename: "${img.alt}"`);
    }
  });

  test("T1-F9-05: Zero animations, zero backdrop-blur, zero countdowns (non-vacuous)", async () => {
    for (const vp of [SPEC.viewports.desktop, SPEC.viewports.mobile]) {
      await openFreshPage(session, vp);
      const snap = await getPageSnapshot(session);
      assert.ok(snap.hasHeader && snap.hasMain && snap.hasFooter, "Full landmarks required");
      assertExactTextPresent(snap.bodyText, SPEC.copy.heroTitle);
      assertExactTextPresent(snap.bodyText, SPEC.copy.thankYouHeading);
      assertNoCountdown(snap.bodyText);

      const styles = await auditForbiddenStylesAndAnimations(session);
      assert.equal(styles.runningAnimations, 0, "Expected 0 running animations");
      assert.deepEqual(styles.animationElements, [], "Expected 0 CSS animation-name elements");
      assert.deepEqual(styles.blurElements, [], "Expected 0 backdrop-filter blur elements");
    }
  });

  test("T1-F9-06: Clean runtime: zero console errors, zero page exceptions, zero failed assets", async () => {
    for (const vp of [SPEC.viewports.desktop, SPEC.viewports.mobile]) {
      await openFreshPage(session, vp);
      const scrollH = await session.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y <= scrollH; y += 600) {
        await session.scrollTo(y);
        await pause(80);
      }
      const audit = await assertAllImagesLoaded(session, { minCount: 8 });
      assert.ok(audit.total >= 8);
      const events = await auditNetworkEvents(session, BASE_URL, { forbidMutations: true });
      assert.ok(events.responses.length >= 5, `Expected >= 5 network responses, got ${events.responses.length}`);
    }
  });
});
