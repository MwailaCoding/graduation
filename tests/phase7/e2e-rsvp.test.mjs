import "./register-alias.mjs";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { createSession, launchEdge } from "../e2e/lib/cdp.mjs";
import { startNextServer } from "./server-helper.mjs";

const { pool } = await import("../../src/lib/db.ts");

const SCREENSHOT_DIR =
  "C:\\Users\\Ledisha\\.gemini\\antigravity\\brain\\a4cd7557-ec6e-4071-905c-c0f7bf583c6e\\screenshots";
const TEST_PREFIX = "[QA-P7-E2E]";
const VIEWPORT_WIDTHS = [320, 375, 390, 430, 768, 1024, 1280, 1440];

let server = null;
let closedServer = null;
let browser = null;
let session = null;

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRateLimitPepper() {
  const configured = process.env.RATE_LIMIT_PEPPER?.trim();
  return configured && configured.length > 0
    ? configured
    : "mwaila-rsvp-v1-bucket-salt";
}

function computeBucketKeysForClient(clientKey) {
  const pepper = getRateLimitPepper();
  return ["create", "manage_read", "manage_update", "manage_failed"].map(
    (scope) =>
      crypto
        .createHmac("sha256", pepper)
        .update(`${scope}:${clientKey}`, "utf8")
        .digest("hex"),
  );
}

function savePng(filename, buffer) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const filePath = path.join(SCREENSHOT_DIR, filename);
  // Check PNG signature
  assert.ok(buffer.length > 1000, `Screenshot ${filename} unexpectedly small`);
  assert.equal(buffer[0], 0x89);
  assert.equal(buffer[1], 0x50);
  assert.equal(buffer[2], 0x4e);
  assert.equal(buffer[3], 0x47);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

async function setInputValue(session, selector, value) {
  await session.evaluate(
    (sel, val) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error(`Input not found: ${sel}`);
      const proto =
        el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (!setter) throw new Error(`Missing native value setter for ${sel}`);
      setter.call(el, val);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    selector,
    value,
  );
}

async function setSelectValue(session, selector, value) {
  await session.evaluate(
    (sel, val) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error(`Select not found: ${sel}`);
      const setter = Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype,
        "value",
      )?.set;
      setter?.call(el, val);
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    selector,
    value,
  );
}

async function waitForCondition(session, fn, timeoutMs = 10000, intervalMs = 100) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await session.evaluate(fn);
    if (result) return result;
    await pause(intervalMs);
  }
  throw new Error(`Timed out waiting for condition (${timeoutMs}ms)`);
}

function parseRgb(cssColor) {
  const m = cssColor?.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!m) return null;
  return {
    r: Number(m[1]),
    g: Number(m[2]),
    b: Number(m[3]),
    a: m[4] !== undefined ? Number(m[4]) : 1,
  };
}

function relativeLuminance({ r, g, b }) {
  const toLinear = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastRatio(fg, bg) {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("Phase 7 Headless Edge CDP E2E, Accessibility, Responsive & Screenshots", { concurrency: false }, () => {
  let attendingManagePath = null;

  before(async () => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    server = await startNextServer();
    browser = await launchEdge({ headless: true });
    session = await createSession(browser);

    try {
      await browser.browserCdp.send("Browser.grantPermissions", {
        permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
        origin: server.baseUrl,
      });
    } catch {
      // fallback copy path still tested if permission grant differs
    }
  });

  after(async () => {
    session?.close();
    await browser?.close();
    if (closedServer) {
      await closedServer.stop();
    }
    if (server) {
      await server.stop();
    }
    await pool.query("DELETE FROM rsvps WHERE full_name LIKE $1", [
      `${TEST_PREFIX}%`,
    ]);
    await pool.query("DELETE FROM rsvps WHERE phone_e164 LIKE '+254712992%'");
    const keys = [
      ...computeBucketKeysForClient("anonymous-client"),
      ...computeBucketKeysForClient("127.0.0.1"),
      ...computeBucketKeysForClient("::1"),
    ];
    await pool.query(
      "DELETE FROM rsvp_rate_limits WHERE bucket_key = ANY($1::char(64)[])",
      [keys],
    );
    await pool.end();
  });

  it("captures desktop and mobile RSVP section screenshots", async () => {
    // Desktop 1440x900
    await session.setViewport({ width: 1440, height: 900 });
    await session.goto(server.baseUrl, { waitFonts: true, waitImages: true });
    await session.evaluate(() => {
      document.querySelector("#rsvp")?.scrollIntoView({ block: "center" });
    });
    await pause(250);
    savePng("rsvp-section-desktop.png", await session.screenshotPng());

    // Mobile 390x844
    await session.setViewport({ width: 390, height: 844, mobile: true });
    await session.goto(server.baseUrl, { waitFonts: true, waitImages: true });
    await session.evaluate(() => {
      document.querySelector("#rsvp")?.scrollIntoView({ block: "center" });
    });
    await pause(250);
    savePng("rsvp-section-mobile.png", await session.screenshotPng());
  });

  it("validates form fields, counters, privacy checkbox, submits Attending RSVP, copies link, updates via management page, and persists across reload", async () => {
    await session.setViewport({ width: 1280, height: 900 });
    session.clearEvents();
    await session.goto(server.baseUrl, { waitFonts: true, waitImages: true });

    // Open RSVP modal
    await session.clickElement({
      selector: "#rsvp button",
      text: "RSVP Now",
      exact: false,
    });
    await pause(150);

    // 1. Submit empty form -> validation errors shown, no POST fired
    await session.clickElement({
      selector: "#rsvp-notice-dialog button[type='submit']",
      text: "Submit RSVP",
      exact: true,
    });
    await pause(150);

    const emptyErrors = await session.evaluate(() => {
      const dialog = document.querySelector("#rsvp-notice-dialog");
      return dialog ? dialog.innerText : "";
    });
    assert.match(emptyErrors, /Please enter your full name\./);
    assert.match(emptyErrors, /Please enter your phone number\./);
    assert.match(
      emptyErrors,
      /Please select whether you will be attending or declining\./,
    );
    assert.match(
      emptyErrors,
      /Please confirm that you have read and understood the privacy notice\./,
    );

    const postAttemptsOnEmpty = session
      .getEvents()
      .requests.filter((r) => r.method === "POST" && r.url.includes("/api/rsvp"));
    assert.equal(postAttemptsOnEmpty.length, 0);

    // 2. Fill name, phone, select Attending -> check dietary (250) & message (500) counters
    await setInputValue(
      session,
      "#rsvp-modal-full-name",
      `${TEST_PREFIX} Grace Wanjiku`,
    );
    await setSelectValue(session, "#rsvp-modal-phone-country", "KE");
    await setInputValue(session, "#rsvp-modal-phone-number", "0712992001");

    await session.clickElement({
      selector: '#rsvp-notice-dialog [role="radio"]',
      text: "Attending",
      exact: false,
    });
    await pause(150);

    await setInputValue(session, "#rsvp-modal-dietary", "Vegetarian");
    await setInputValue(session, "#rsvp-modal-message", "So proud!");
    await pause(100);

    const counterAudit = await session.evaluate(() => {
      const dialog = document.querySelector("#rsvp-notice-dialog");
      const text = dialog?.innerText || "";
      const dietaryMax = document
        .querySelector("#rsvp-modal-dietary")
        ?.getAttribute("maxlength");
      const messageMax = document
        .querySelector("#rsvp-modal-message")
        ?.getAttribute("maxlength");
      return { text, dietaryMax, messageMax };
    });
    assert.equal(counterAudit.dietaryMax, "250");
    assert.equal(counterAudit.messageMax, "500");
    assert.match(counterAudit.text, /10 \/ 250/);
    assert.match(counterAudit.text, /240 remaining/);
    assert.match(counterAudit.text, /9 \/ 500/);
    assert.match(counterAudit.text, /491 remaining/);

    // 3. Privacy checkbox still unchecked -> submit blocked with privacy error
    await session.clickElement({
      selector: "#rsvp-notice-dialog button[type='submit']",
      text: "Submit RSVP",
      exact: true,
    });
    await pause(150);
    const privacyBlockedText = await session.evaluate(
      () => document.querySelector("#rsvp-notice-dialog")?.innerText || "",
    );
    assert.match(
      privacyBlockedText,
      /Please confirm that you have read and understood the privacy notice\./,
    );

    // Capture Attending form screenshot (with privacy checked)
    await session.clickSelector("#rsvp-modal-privacy");
    await pause(100);
    await session.evaluate(() => {
      document.querySelector("#rsvp-notice-dialog")?.scrollTo(0, 0);
    });
    savePng("rsvp-form-attending.png", await session.screenshotPng());

    // 4. Observe loading/disabled state during submit, then confirmation screen
    await session.evaluate(() => {
      window.__submitStates = [];
      const btn = document.querySelector(
        '#rsvp-notice-dialog button[type="submit"]',
      );
      if (btn) {
        const obs = new MutationObserver(() => {
          window.__submitStates.push({
            disabled: btn.disabled,
            text: (btn.textContent || "").trim(),
          });
        });
        obs.observe(btn, {
          attributes: true,
          attributeFilter: ["disabled"],
          childList: true,
          characterData: true,
          subtree: true,
        });
      }
    });

    await session.clickElement({
      selector: "#rsvp-notice-dialog button[type='submit']",
      text: "Submit RSVP",
      exact: true,
    });

    await waitForCondition(session, () =>
      (document.querySelector("#rsvp-notice-dialog")?.innerText || "").includes(
        "Your response has been received.",
      ),
    );

    const loadingAndConfirm = await session.evaluate(() => {
      const dialog = document.querySelector("#rsvp-notice-dialog");
      const link = dialog?.querySelector('a[href^="/rsvp/manage/"]');
      return {
        states: window.__submitStates || [],
        text: dialog?.innerText || "",
        manageHref: link?.getAttribute("href") || "",
      };
    });

    assert.ok(
      loadingAndConfirm.states.some(
        (s) => s.disabled === true && s.text === "Sending RSVP...",
      ),
      `Expected loading/disabled state during submit, observed: ${JSON.stringify(loadingAndConfirm.states)}`,
    );
    assert.match(loadingAndConfirm.text, /We look forward to celebrating with you!/);
    assert.match(loadingAndConfirm.manageHref, /^\/rsvp\/manage\/[A-Za-z0-9_-]{43}$/);
    attendingManagePath = loadingAndConfirm.manageHref;

    // Click Copy Link and verify feedback
    await session.clickElement({
      selector: "#rsvp-notice-dialog button",
      text: "Copy Link",
      exact: true,
    });
    await waitForCondition(session, () =>
      (document.querySelector("#rsvp-notice-dialog")?.innerText || "").includes(
        "Management link copied",
      ),
    );
    savePng("rsvp-confirmation.png", await session.screenshotPng());

    // 5. Open /rsvp/manage/<token>
    const token = attendingManagePath.replace(/^\/rsvp\/manage\//, "");
    const manageUrl = `${server.baseUrl}${attendingManagePath}`;
    await session.goto(manageUrl, { waitFonts: true, waitImages: true });

    const manageAudit = await session.evaluate((rawToken) => {
      const text = document.body.innerText || "";
      const lsKeys = Object.keys(window.localStorage);
      const ssKeys = Object.keys(window.sessionStorage);
      const lsValues = lsKeys.map((k) => window.localStorage.getItem(k) || "");
      const ssValues = ssKeys.map((k) => window.sessionStorage.getItem(k) || "");
      return {
        text,
        containsRawTokenInText: text.includes(rawToken),
        hasTokenInStorage: [...lsKeys, ...lsValues, ...ssKeys, ...ssValues].some(
          (v) => v.includes(rawToken) || /rsvp.*token/i.test(v),
        ),
        hasDietaryField: Boolean(document.querySelector("#rsvp-manage-dietary")),
      };
    }, token);

    assert.match(manageAudit.text, /Hello, \[QA-P7-E2E\] Grace Wanjiku/);
    assert.match(manageAudit.text, /Currently: Attending/i);
    assert.equal(manageAudit.containsRawTokenInText, false);
    assert.equal(manageAudit.hasTokenInStorage, false);
    assert.equal(manageAudit.hasDietaryField, true);

    savePng("rsvp-management.png", await session.screenshotPng());

    // 6. Switch Attending -> Declining (verify dietary hides & clears) -> Save Changes -> reload persistence
    await session.clickElement({
      selector: '#main-content [role="radio"]',
      text: "Declining",
      exact: false,
    });
    await pause(150);

    const dietaryHidden = await session.evaluate(
      () => document.querySelector("#rsvp-manage-dietary") === null,
    );
    assert.equal(dietaryHidden, true);

    // Switch back to Attending momentarily to verify dietary was cleared, then back to Declining
    await session.clickElement({
      selector: '#main-content [role="radio"]',
      text: "Attending",
      exact: false,
    });
    await pause(100);
    const clearedVal = await session.evaluate(
      () => document.querySelector("#rsvp-manage-dietary")?.value ?? "missing",
    );
    assert.equal(clearedVal, "");

    await session.clickElement({
      selector: '#main-content [role="radio"]',
      text: "Declining",
      exact: false,
    });
    await pause(100);

    await session.clickElement({
      selector: "#main-content button[type='submit']",
      text: "Save Changes",
      exact: true,
    });

    await waitForCondition(session, () =>
      (document.body.innerText || "").includes("Your RSVP has been updated."),
    );

    // Reload and verify persistence
    await session.goto(manageUrl, { waitFonts: true, waitImages: true });
    const reloadedText = await session.evaluate(() => document.body.innerText || "");
    assert.match(reloadedText, /Currently: Declining/i);
    assert.equal(
      await session.evaluate(
        () => document.querySelector("#rsvp-manage-dietary") === null,
      ),
      true,
    );

    const events = session.getEvents();
    assert.deepEqual(events.consoleErrors, []);
    assert.deepEqual(events.pageErrors, []);
  });

  it("submits Declining RSVP, captures declining form screenshot, and verifies duplicate phone preserves inputs with generic error", async () => {
    await session.setViewport({ width: 1280, height: 900 });
    await session.goto(server.baseUrl, { waitFonts: true, waitImages: true });

    await session.clickElement({
      selector: "#rsvp button",
      text: "RSVP Now",
      exact: false,
    });
    await pause(150);

    await setInputValue(
      session,
      "#rsvp-modal-full-name",
      `${TEST_PREFIX} Samuel Otieno`,
    );
    await setInputValue(session, "#rsvp-modal-phone-number", "0712992002");
    await session.clickElement({
      selector: '#rsvp-notice-dialog [role="radio"]',
      text: "Declining",
      exact: false,
    });
    await pause(150);

    const dietaryMissing = await session.evaluate(
      () => document.querySelector("#rsvp-modal-dietary") === null,
    );
    assert.equal(dietaryMissing, true);

    await setInputValue(
      session,
      "#rsvp-modal-message",
      "Sending warm congratulations from afar!",
    );
    await session.clickSelector("#rsvp-modal-privacy");
    await pause(100);
    await session.evaluate(() => {
      document.querySelector("#rsvp-notice-dialog")?.scrollTo(0, 0);
    });
    savePng("rsvp-form-declining.png", await session.screenshotPng());

    await session.clickElement({
      selector: "#rsvp-notice-dialog button[type='submit']",
      text: "Submit RSVP",
      exact: true,
    });

    await waitForCondition(session, () =>
      (document.querySelector("#rsvp-notice-dialog")?.innerText || "").includes(
        "Thank you for being part of this special milestone and for sending your love.",
      ),
    );

    // Return to invitation
    await session.clickElement({
      selector: "#rsvp-notice-dialog button",
      text: "Return to Invitation",
      exact: true,
    });
    await pause(150);

    // Duplicate phone submission -> generic error without disclosing Grace Wanjiku, inputs preserved
    await session.clickElement({
      selector: "#rsvp button",
      text: "RSVP Now",
      exact: false,
    });
    await pause(150);

    await setInputValue(
      session,
      "#rsvp-modal-full-name",
      `${TEST_PREFIX} Duplicate Attempt`,
    );
    await setInputValue(session, "#rsvp-modal-phone-number", "0712992001");
    await session.clickElement({
      selector: '#rsvp-notice-dialog [role="radio"]',
      text: "Attending",
      exact: false,
    });
    await setInputValue(
      session,
      "#rsvp-modal-message",
      "Keep this message intact",
    );
    await session.clickSelector("#rsvp-modal-privacy");
    await pause(100);

    await session.clickElement({
      selector: "#rsvp-notice-dialog button[type='submit']",
      text: "Submit RSVP",
      exact: true,
    });

    await waitForCondition(session, () =>
      (document.querySelector("#rsvp-notice-dialog")?.innerText || "").includes(
        "An RSVP with this phone number already exists.",
      ),
    );

    const dupAudit = await session.evaluate(() => ({
      text: document.querySelector("#rsvp-notice-dialog")?.innerText || "",
      fullName: document.querySelector("#rsvp-modal-full-name")?.value || "",
      phoneNumber: document.querySelector("#rsvp-modal-phone-number")?.value || "",
      message: document.querySelector("#rsvp-modal-message")?.value || "",
    }));

    assert.equal(dupAudit.text.includes("Grace Wanjiku"), false);
    assert.equal(dupAudit.fullName, `${TEST_PREFIX} Duplicate Attempt`);
    assert.equal(dupAudit.phoneNumber, "0712992001");
    assert.equal(dupAudit.message, "Keep this message intact");
  });

  it("passes accessibility checks: keyboard radio arrows, Escape + focus return, honeypot, >=44px targets, and contrast", async () => {
    await session.setViewport({ width: 1280, height: 900 });
    await session.goto(server.baseUrl, { waitFonts: true, waitImages: true });

    await session.clickElement({
      selector: "#rsvp button",
      text: "RSVP Now",
      exact: false,
    });
    await pause(150);

    // Honeypot attributes
    const honeypotAudit = await session.evaluate(() => {
      const hp = document.querySelector("#rsvp-modal-website");
      const wrapper = hp?.closest("[aria-hidden]");
      return {
        exists: Boolean(hp),
        tabIndex: hp?.tabIndex,
        ariaHidden: wrapper?.getAttribute("aria-hidden"),
      };
    });
    assert.equal(honeypotAudit.exists, true);
    assert.equal(honeypotAudit.tabIndex, -1);
    assert.equal(honeypotAudit.ariaHidden, "true");

    // Keyboard radio group arrow navigation
    await session.evaluate(() => {
      const firstRadio = document.querySelector('#rsvp-notice-dialog [role="radio"]');
      firstRadio?.focus();
    });
    await session.pressKey("ArrowRight");
    await pause(100);
    const afterRight = await session.evaluate(() => {
      const radios = [...document.querySelectorAll('#rsvp-notice-dialog [role="radio"]')];
      return {
        checked: radios.map((r) => r.getAttribute("aria-checked")),
        focusedText: document.activeElement?.textContent || "",
      };
    });
    assert.deepEqual(afterRight.checked, ["false", "true"]);
    assert.match(afterRight.focusedText, /Declining/);

    await session.pressKey("ArrowLeft");
    await pause(100);
    const afterLeft = await session.evaluate(() => {
      const radios = [...document.querySelectorAll('#rsvp-notice-dialog [role="radio"]')];
      return {
        checked: radios.map((r) => r.getAttribute("aria-checked")),
        focusedText: document.activeElement?.textContent || "",
      };
    });
    assert.deepEqual(afterLeft.checked, ["true", "false"]);
    assert.match(afterLeft.focusedText, /Attending/);

    // Touch target >= 44px audit on modal interactive controls (excluding hidden honeypot & checkbox label wrapper handles 44px)
    const targetAudit = await session.evaluate(() => {
      const dialog = document.querySelector("#rsvp-notice-dialog");
      const controls = [
        ...dialog.querySelectorAll(
          "button, input:not([tabindex='-1']):not([type='checkbox']), select, textarea, a",
        ),
      ];
      const small = controls
        .map((el) => {
          const r = el.getBoundingClientRect();
          return {
            tag: el.tagName,
            id: el.id,
            text: (el.textContent || "").trim().slice(0, 30),
            width: Math.round(r.width),
            height: Math.round(r.height),
          };
        })
        .filter((c) => c.height < 44);
      const privacyLabelHeight = Math.round(
        dialog
          .querySelector('label[for="rsvp-modal-privacy"]')
          ?.getBoundingClientRect().height || 0,
      );
      return { small, privacyLabelHeight };
    });
    assert.deepEqual(targetAudit.small, []);
    assert.ok(targetAudit.privacyLabelHeight >= 44);

    // Contrast audit on modal key elements
    const colorSamples = await session.evaluate(() => {
      const dialog = document.querySelector("#rsvp-notice-dialog");
      const dialogBg = getComputedStyle(dialog).backgroundColor;
      const title = document.querySelector("#rsvp-dialog-title");
      const submitBtn = dialog.querySelector('button[type="submit"]');
      const label = dialog.querySelector('label[for="rsvp-modal-full-name"]');
      return {
        dialogBg,
        titleFg: getComputedStyle(title).color,
        labelFg: getComputedStyle(label).color,
        submitFg: getComputedStyle(submitBtn).color,
        submitBg: getComputedStyle(submitBtn).backgroundColor,
      };
    });

    const titleContrast = contrastRatio(
      parseRgb(colorSamples.titleFg),
      parseRgb(colorSamples.dialogBg),
    );
    const labelContrast = contrastRatio(
      parseRgb(colorSamples.labelFg),
      parseRgb(colorSamples.dialogBg),
    );
    const submitContrast = contrastRatio(
      parseRgb(colorSamples.submitFg),
      parseRgb(colorSamples.submitBg),
    );
    assert.ok(titleContrast >= 4.5, `Title contrast too low: ${titleContrast}`);
    assert.ok(labelContrast >= 4.5, `Label contrast too low: ${labelContrast}`);
    assert.ok(submitContrast >= 4.5, `Submit button contrast too low: ${submitContrast}`);

    // Escape closes modal and returns focus to RSVP Now trigger
    await session.pressKey("Escape");
    await pause(150);
    const closedFocusAudit = await session.evaluate(() => ({
      dialogStillOpen: Boolean(document.querySelector("#rsvp-notice-dialog")),
      activeText: (document.activeElement?.textContent || "").trim(),
    }));
    assert.equal(closedFocusAudit.dialogStillOpen, false);
    assert.match(closedFocusAudit.activeText, /RSVP Now/);
  });

  it("passes responsive layout checks (zero horizontal overflow & controls fit viewport) across all 8 widths on modal and /rsvp/manage/[token]", async () => {
    assert.ok(attendingManagePath, "Management path from earlier E2E journey required");

    // 1. Open RSVP modal across all 8 widths
    await session.setViewport({ width: 1280, height: 900 });
    await session.goto(server.baseUrl, { waitFonts: true, waitImages: true });
    await session.clickElement({
      selector: "#rsvp button",
      text: "RSVP Now",
      exact: false,
    });
    await pause(150);

    for (const width of VIEWPORT_WIDTHS) {
      await session.setViewport({
        width,
        height: 844,
        mobile: width < 768,
      });
      await pause(100);
      const metrics = await session.evaluate(() => {
        const doc = document.documentElement;
        const dialog = document.querySelector("#rsvp-notice-dialog");
        const dr = dialog?.getBoundingClientRect();
        const controls = [
          ...dialog.querySelectorAll(
            "button, input:not([tabindex='-1']), select, textarea",
          ),
        ];
        const overflowingControls = controls
          .map((el) => {
            const r = el.getBoundingClientRect();
            return {
              id: el.id || el.tagName,
              left: r.left,
              right: r.right,
              vw: window.innerWidth,
            };
          })
          .filter((c) => c.left < -1 || c.right > c.vw + 1);

        return {
          scrollWidth: doc.scrollWidth,
          clientWidth: doc.clientWidth,
          dialogFits: dr ? dr.left >= -1 && dr.right <= window.innerWidth + 1 : false,
          overflowingControls,
        };
      });

      assert.ok(
        metrics.scrollWidth <= metrics.clientWidth,
        `Horizontal overflow on RSVP modal at ${width}px: ${metrics.scrollWidth} > ${metrics.clientWidth}`,
      );
      assert.equal(metrics.dialogFits, true, `Dialog overflows at ${width}px`);
      assert.deepEqual(
        metrics.overflowingControls,
        [],
        `Controls overflow at ${width}px`,
      );
    }

    // 2. Management page across all 8 widths
    await session.goto(`${server.baseUrl}${attendingManagePath}`, {
      waitFonts: true,
      waitImages: true,
    });
    for (const width of VIEWPORT_WIDTHS) {
      await session.setViewport({
        width,
        height: 844,
        mobile: width < 768,
      });
      await pause(100);
      const metrics = await session.evaluate(() => {
        const doc = document.documentElement;
        const controls = [
          ...document.querySelectorAll(
            "#main-content button, #main-content input, #main-content select, #main-content textarea, #main-content a",
          ),
        ];
        const overflowingControls = controls
          .map((el) => {
            const r = el.getBoundingClientRect();
            return {
              id: el.id || el.tagName,
              left: r.left,
              right: r.right,
              vw: window.innerWidth,
            };
          })
          .filter((c) => c.left < -1 || c.right > c.vw + 1);
        return {
          scrollWidth: doc.scrollWidth,
          clientWidth: doc.clientWidth,
          overflowingControls,
        };
      });

      assert.ok(
        metrics.scrollWidth <= metrics.clientWidth,
        `Horizontal overflow on manage page at ${width}px: ${metrics.scrollWidth} > ${metrics.clientWidth}`,
      );
      assert.deepEqual(
        metrics.overflowingControls,
        [],
        `Manage controls overflow at ${width}px`,
      );
    }
  });

  it("captures closed-state screenshot against closed-clock server", async () => {
    closedServer = await startNextServer({
      RSVP_SIMULATED_NOW_ISO: "2026-12-12T00:00:00+03:00",
    });

    await session.setViewport({ width: 1280, height: 900 });
    await session.goto(closedServer.baseUrl, { waitFonts: true, waitImages: true });
    await session.evaluate(() => {
      document.querySelector("#rsvp")?.scrollIntoView({ block: "center" });
    });
    await pause(250);

    const closedText = await session.evaluate(
      () => document.querySelector("#rsvp")?.innerText || "",
    );
    assert.match(closedText, /RSVPs are now closed\./);
    savePng("rsvp-closed.png", await session.screenshotPng());
  });
});
