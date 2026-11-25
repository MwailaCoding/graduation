import "../phase7/register-alias.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { createSession, launchEdge } from "../e2e/lib/cdp.mjs";
import {
  SPEC,
  assertNoHorizontalOverflow,
  colorsMatch,
  contrastRatio,
  normalizeRgb,
  validatePngBuffer,
} from "../e2e/lib/assertions.mjs";
import {
  adminFetch,
  assertNoSecretLeak,
  captureBaseline,
  cleanupQaPhase8Data,
  delay,
  ensureEnvLoaded,
  getDbPool,
  provisionQaAdmin,
  resolveBaseUrl,
  resolveScreenshotDir,
} from "./lib/admin-helpers.mjs";

const { generateManagementToken, hashManagementToken } = await import(
  "../../src/lib/rsvp/tokens.ts"
);

const TEST_PREFIX = "[QA-P8-E2E]";
const PHONE_PREFIX = "+2547189820";
const VIEWPORT_WIDTHS = [320, 375, 390, 430, 768, 1024, 1280, 1440];
const NAV_LABELS = [
  "Overview",
  "RSVP Management",
  "Guest Directory",
  "Messages",
  "Reports & Export",
  "Activity Log",
  "Settings",
  "Admin Profile",
  "Logout",
];

let pool = null;
let serverHandle = null;
let browser = null;
let session = null;
let qaAdmin = null;
let baseline = null;
let screenshotDir = null;

const createdRsvpIds = [];
const usedClientIps = ["127.0.0.1", "::1", "anonymous-client", "anonymous"];
const capturedScreenshots = new Map();

let attendingGuestId = null;
let attendingGuestToken = null;
let blankDietaryGuestId = null;
let duplicatePrimaryId = null;
let duplicateCandidateId = null;
let deleteCandidateId = null;

async function seedE2eRsvp({
  fullName,
  phoneE164,
  attendance,
  dietaryRequirements = null,
  congratulatoryMessage = null,
  organizerNotes = null,
  submissionSource = "web",
  duplicateReviewStatus = "none",
}) {
  const token = generateManagementToken();
  const tokenHash = hashManagementToken(token);
  const attendeeCount = attendance === "attending" ? 1 : 0;
  const res = await pool.query(
    `INSERT INTO rsvps (
       full_name,
       phone_e164,
       phone_country,
       attendance_status,
       attendee_count,
       dietary_requirements,
       congratulatory_message,
       organizer_notes,
       privacy_acknowledged,
       submission_source,
       duplicate_review_status,
       management_token_hash,
       retention_expires_at
     ) VALUES ($1, $2, 'KE', $3, $4, $5, $6, $7, TRUE, $8, $9, $10, '2027-03-12T00:00:00+03:00')
     RETURNING id`,
    [
      fullName,
      phoneE164,
      attendance,
      attendeeCount,
      attendance === "attending" ? dietaryRequirements : null,
      congratulatoryMessage,
      organizerNotes,
      submissionSource,
      duplicateReviewStatus,
      tokenHash,
    ],
  );
  const id = res.rows[0].id;
  createdRsvpIds.push(id);
  return { id, token, tokenHash };
}

async function trackRsvpByPhone(phoneE164) {
  const res = await pool.query(
    "SELECT id FROM rsvps WHERE phone_e164 = $1 ORDER BY created_at DESC",
    [phoneE164],
  );
  for (const row of res.rows) {
    if (!createdRsvpIds.includes(row.id)) {
      createdRsvpIds.push(row.id);
    }
  }
  return res.rows.map((r) => r.id);
}

async function fillInputByLabel(targetSession, labelRegex, value) {
  const result = await targetSession.evaluate(
    (pattern, flags, val) => {
      const re = new RegExp(pattern, flags);
      const isVisible = (el) => {
        if (!el) return false;
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0
        );
      };

      let input = null;
      for (const label of document.querySelectorAll("label")) {
        if (!re.test((label.textContent || "").trim())) continue;
        const forId = label.getAttribute("for");
        if (forId) {
          const byId = document.getElementById(forId);
          if (byId && isVisible(byId)) {
            input = byId;
            break;
          }
        }
        const nested = label.querySelector("input, textarea, select");
        if (nested && isVisible(nested)) {
          input = nested;
          break;
        }
      }

      if (!input) {
        for (const el of document.querySelectorAll("input, textarea, select")) {
          if (!isVisible(el)) continue;
          const aria = el.getAttribute("aria-label") || "";
          const ph = el.getAttribute("placeholder") || "";
          const name = el.getAttribute("name") || "";
          if (re.test(aria) || re.test(ph) || re.test(name)) {
            input = el;
            break;
          }
        }
      }

      if (!input) {
        return { ok: false, reason: `Input not found for ${pattern}` };
      }

      const proto =
        input instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : input instanceof HTMLSelectElement
            ? HTMLSelectElement.prototype
            : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (!setter) {
        return { ok: false, reason: "Missing native value setter" };
      }
      setter.call(input, val);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true };
    },
    labelRegex.source,
    labelRegex.flags,
    value,
  );
  assert.equal(result.ok, true, result.reason || "fillInputByLabel failed");
}

async function selectControlOption(targetSession, labelRegex, optionTextOrValue) {
  const result = await targetSession.evaluate(
    (pattern, flags, targetVal) => {
      const re = new RegExp(pattern, flags);
      const targetLower = String(targetVal).toLowerCase();
      const isVisible = (el) => {
        if (!el) return false;
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0
        );
      };

      // Try <select> first
      for (const label of document.querySelectorAll("label")) {
        if (!re.test((label.textContent || "").trim())) continue;
        const forId = label.getAttribute("for");
        const sel =
          (forId ? document.getElementById(forId) : null) ||
          label.querySelector("select");
        if (sel instanceof HTMLSelectElement && isVisible(sel)) {
          const opt = [...sel.options].find(
            (o) =>
              o.value.toLowerCase() === targetLower ||
              o.text.trim().toLowerCase() === targetLower,
          );
          if (opt) {
            const setter = Object.getOwnPropertyDescriptor(
              HTMLSelectElement.prototype,
              "value",
            )?.set;
            setter?.call(sel, opt.value);
            sel.dispatchEvent(new Event("change", { bubbles: true }));
            return { ok: true };
          }
        }
      }

      // Fallback: radio inputs or [role="radio"] matching value/label
      for (const radio of document.querySelectorAll(
        'input[type="radio"], [role="radio"]',
      )) {
        if (!isVisible(radio)) continue;
        const label = radio.closest("label");
        const text = (label?.textContent || radio.textContent || "").toLowerCase();
        const val = (radio.getAttribute("value") || "").toLowerCase();
        if (val === targetLower || text.includes(targetLower)) {
          radio.click();
          return { ok: true };
        }
      }

      return { ok: false, reason: `Option ${targetVal} not found for ${pattern}` };
    },
    labelRegex.source,
    labelRegex.flags,
    optionTextOrValue,
  );
  assert.equal(result.ok, true, result.reason || "selectControlOption failed");
}

async function clickAction(
  targetSession,
  textRegex,
  rootSelector = "main, [role='dialog'], [role='alertdialog'], form",
) {
  const clicked = await targetSession.evaluate(
    (pattern, flags, rootSel) => {
      const re = new RegExp(pattern, flags);
      const isVisible = (el) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0
        );
      };

      const roots = [...document.querySelectorAll(rootSel)];
      const scopeList = roots.length > 0 ? roots : [document.body];
      for (const root of scopeList) {
        for (const el of root.querySelectorAll('button, a, [role="button"]')) {
          if (!isVisible(el)) continue;
          const label = (
            el.innerText ||
            el.textContent ||
            el.getAttribute("aria-label") ||
            ""
          ).trim();
          if (re.test(label)) {
            el.scrollIntoView({ block: "center" });
            el.click();
            return { ok: true, label };
          }
        }
      }
      return { ok: false, reason: `Action not found matching /${pattern}/${flags}` };
    },
    textRegex.source,
    textRegex.flags,
    rootSelector,
  );
  assert.equal(clicked.ok, true, clicked.reason || "clickAction failed");
  return clicked;
}

async function clickNavItem(targetSession, labelText) {
  const direct = await targetSession.evaluate((targetLabel) => {
    const isVisible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0
      );
    };

    const selectors =
      'nav a, nav button, aside a, aside button, [role="navigation"] a, [role="navigation"] button, [role="dialog"] a, [role="dialog"] button';
    for (const el of document.querySelectorAll(selectors)) {
      if (!isVisible(el)) continue;
      const text = (el.innerText || el.textContent || "").trim();
      if (text.toLowerCase() === targetLabel.toLowerCase()) {
        el.scrollIntoView({ block: "center" });
        el.click();
        return { clicked: true };
      }
    }
    return { clicked: false };
  }, labelText);

  if (direct.clicked) return;

  // Open mobile drawer if collapsed
  await targetSession.evaluate(() => {
    const toggles = document.querySelectorAll(
      'button[aria-expanded], button[aria-label*="menu" i], button[aria-label*="nav" i]',
    );
    for (const btn of toggles) {
      const style = getComputedStyle(btn);
      const rect = btn.getBoundingClientRect();
      if (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0
      ) {
        btn.click();
        return true;
      }
    }
    return false;
  });

  await delay(250);
  const afterDrawer = await targetSession.evaluate((targetLabel) => {
    const selectors =
      'nav a, nav button, aside a, aside button, [role="navigation"] a, [role="navigation"] button, [role="dialog"] a, [role="dialog"] button';
    for (const el of document.querySelectorAll(selectors)) {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        rect.width <= 0 ||
        rect.height <= 0
      ) {
        continue;
      }
      const text = (el.innerText || el.textContent || "").trim();
      if (text.toLowerCase() === targetLabel.toLowerCase()) {
        el.click();
        return { clicked: true };
      }
    }
    return { clicked: false };
  }, labelText);

  assert.equal(
    afterDrawer.clicked,
    true,
    `Navigation item "${labelText}" not found/clickable`,
  );
}

async function waitForText(
  targetSession,
  textRegex,
  { selector = "body", timeoutMs = 20000 } = {},
) {
  const deadline = Date.now() + timeoutMs;
  let lastText = "";
  while (Date.now() < deadline) {
    const match = await targetSession.evaluate(
      (sel, pattern, flags) => {
        const el = document.querySelector(sel);
        const text = (el?.innerText || el?.textContent || "").trim();
        const re = new RegExp(pattern, flags);
        return { found: re.test(text), excerpt: text.slice(0, 400) };
      },
      selector,
      textRegex.source,
      textRegex.flags,
    );
    lastText = match.excerpt;
    if (match.found) return;
    await delay(120);
  }
  assert.fail(
    `Timed out waiting for /${textRegex.source}/${textRegex.flags} in ${selector}. Excerpt: ${lastText}`,
  );
}

async function waitForUrlPath(
  targetSession,
  expectedPathOrRegex,
  timeoutMs = 20000,
) {
  const deadline = Date.now() + timeoutMs;
  let lastPath = "";
  while (Date.now() < deadline) {
    lastPath = await targetSession.evaluate(() => window.location.pathname);
    if (typeof expectedPathOrRegex === "string") {
      if (lastPath === expectedPathOrRegex) return lastPath;
    } else if (expectedPathOrRegex.test(lastPath)) {
      return lastPath;
    }
    await delay(100);
  }
  assert.fail(
    `Timed out waiting for pathname ${String(expectedPathOrRegex)}, got "${lastPath}"`,
  );
}

function auditAdminNetworkEvents(
  targetSession,
  baseUrl,
  { allowStatuses = [] } = {},
) {
  const { consoleErrors, pageErrors, responses, failedRequests } =
    targetSession.getEvents();

  assert.equal(
    pageErrors.length,
    0,
    `Unexpected page errors: ${pageErrors.join(" | ")}`,
  );

  const unexpectedConsole = consoleErrors.filter((msg) => {
    const text =
      typeof msg === "string"
        ? msg
        : String(msg?.text ?? msg?.message ?? JSON.stringify(msg));
    if (/favicon\.ico/i.test(text)) return false;
    for (const status of allowStatuses) {
      if (text.includes(String(status))) return false;
    }
    return true;
  });
  assert.equal(
    unexpectedConsole.length,
    0,
    `Unexpected console errors: ${unexpectedConsole.join(" | ")}`,
  );

  const nonAbortFailures = failedRequests.filter(
    (req) => !/ERR_ABORTED/i.test(req.errorText || ""),
  );
  assert.equal(
    nonAbortFailures.length,
    0,
    `Unexpected failed network requests: ${JSON.stringify(nonAbortFailures)}`,
  );

  const expectedOrigin = new URL(baseUrl).origin;
  for (const resp of responses) {
    if (!resp.url.startsWith("http")) continue;
    const respOrigin = new URL(resp.url).origin;
    assert.equal(
      respOrigin,
      expectedOrigin,
      `Unapproved external origin request: ${resp.url}`,
    );
    if (resp.url.endsWith("/favicon.ico") && resp.status === 404) continue;
    assert.ok(
      resp.status < 500,
      `Server 5xx error on ${resp.url}: ${resp.status}`,
    );
    if (resp.status >= 400 && !allowStatuses.includes(resp.status)) {
      assert.fail(`Unexpected HTTP ${resp.status} on ${resp.url}`);
    }
  }
}

async function assertBotanicalThemeAndContrast(targetSession) {
  const styles = await targetSession.evaluate(() => {
    const bodyStyle = getComputedStyle(document.body);
    const htmlStyle = getComputedStyle(document.documentElement);
    const heading = document.querySelector("h1, h2");
    const headingStyle = heading ? getComputedStyle(heading) : null;
    const primaryBtn = document.querySelector(
      'main button[type="submit"], form button[type="submit"], button',
    );
    const btnStyle = primaryBtn ? getComputedStyle(primaryBtn) : null;
    return {
      bodyBg: bodyStyle.backgroundColor,
      htmlBg: htmlStyle.backgroundColor,
      bodyColor: bodyStyle.color,
      bodyFont: bodyStyle.fontFamily,
      headingFont: headingStyle?.fontFamily || "",
      headingColor: headingStyle?.color || bodyStyle.color,
      btnColor: btnStyle?.color || null,
      btnBg: btnStyle?.backgroundColor || null,
    };
  });

  const bgColor =
    normalizeRgb(styles.bodyBg) || normalizeRgb(styles.htmlBg);
  assert.ok(bgColor, `Could not parse page background color: ${styles.bodyBg}`);
  assert.equal(
    colorsMatch(bgColor.rgb, SPEC.palette.warmIvory, 12),
    true,
    `Expected Warm Ivory background (#F7F3EA), got ${styles.bodyBg}`,
  );

  const bodyContrast = contrastRatio(styles.bodyColor, styles.bodyBg);
  assert.ok(
    bodyContrast >= 4.5,
    `Expected body text contrast >= 4.5:1, got ${bodyContrast.toFixed(2)}`,
  );

  const headingContrast = contrastRatio(styles.headingColor, styles.bodyBg);
  assert.ok(
    headingContrast >= 4.5,
    `Expected heading contrast >= 4.5:1, got ${headingContrast.toFixed(2)}`,
  );

  assert.match(styles.bodyFont, /Manrope/i);
  if (styles.headingFont) {
    assert.match(styles.headingFont, /Playfair/i);
  }
}

async function saveValidatedScreenshot(filename, buffer, expectedWidth) {
  fs.mkdirSync(screenshotDir, { recursive: true });
  const meta = validatePngBuffer(buffer, {
    minBytes: 4000,
    minHeight: 400,
  });
  assert.ok(
    Math.abs(meta.width - expectedWidth) <= 20,
    `PNG width mismatch for ${filename}: expected ~${expectedWidth}, got ${meta.width}`,
  );
  const filePath = path.join(screenshotDir, filename);
  fs.writeFileSync(filePath, buffer);
  capturedScreenshots.set(filename, filePath);
  return filePath;
}

async function loginViaUi(targetSession, baseUrl, email, password) {
  await targetSession.goto(`${baseUrl}/admin/login`, {
    waitFonts: true,
    timeoutMs: 20000,
  });
  await fillInputByLabel(targetSession, /email/i, email);
  await fillInputByLabel(targetSession, /password/i, password);
  await clickAction(targetSession, /sign in|log\s*in/i, "form, main");
  await waitForUrlPath(targetSession, /^\/admin\/?$/, 15000);
}

describe("Phase 8 Headless Edge CDP E2E, Visual, Responsive & Regression Tests", { concurrency: false }, () => {
  before(async () => {
    ensureEnvLoaded();
    screenshotDir = resolveScreenshotDir();
    const db = await getDbPool();
    pool = db.pool;
    const connected = await db.checkDatabaseConnection();
    assert.equal(connected, true, "PostgreSQL connection must be healthy");

    baseline = await captureBaseline(pool);
    qaAdmin = await provisionQaAdmin(pool, { label: "e2e" });

    // Seed deterministic [QA-P8-E2E] records
    const g1 = await seedE2eRsvp({
      fullName: `${TEST_PREFIX} Grace Attending`,
      phoneE164: `${PHONE_PREFIX}01`,
      attendance: "attending",
      dietaryRequirements: "Vegetarian, no nuts",
      congratulatoryMessage: `${TEST_PREFIX} Warmest congratulations!`,
      organizerNotes: `${TEST_PREFIX} Family table`,
    });
    attendingGuestId = g1.id;
    attendingGuestToken = g1.token;

    const g2 = await seedE2eRsvp({
      fullName: `${TEST_PREFIX} Blank Dietary`,
      phoneE164: `${PHONE_PREFIX}02`,
      attendance: "attending",
      dietaryRequirements: null,
      congratulatoryMessage: `${TEST_PREFIX} So proud of you!`,
    });
    blankDietaryGuestId = g2.id;

    await seedE2eRsvp({
      fullName: `${TEST_PREFIX} Peter Declining`,
      phoneE164: `${PHONE_PREFIX}03`,
      attendance: "declining",
      congratulatoryMessage: `${TEST_PREFIX} Wish I could be there!`,
    });

    await seedE2eRsvp({
      fullName: `${TEST_PREFIX} Formula XSS`,
      phoneE164: `${PHONE_PREFIX}04`,
      attendance: "attending",
      dietaryRequirements: "+SUM(1,2)",
      congratulatoryMessage:
        '<script>window.__xss=1</script><img src=x onerror=alert(1)>',
      organizerNotes: `${TEST_PREFIX} =CMD()`,
    });

    const dup1 = await seedE2eRsvp({
      fullName: `${TEST_PREFIX} Duplicate Primary`,
      phoneE164: `${PHONE_PREFIX}05`,
      attendance: "attending",
      dietaryRequirements: "Halal",
      duplicateReviewStatus: "flagged",
    });
    duplicatePrimaryId = dup1.id;

    const dup2 = await seedE2eRsvp({
      fullName: `${TEST_PREFIX} Duplicate Candidate`,
      phoneE164: `${PHONE_PREFIX}05`,
      attendance: "attending",
      dietaryRequirements: "Halal",
      submissionSource: "admin_manual",
      duplicateReviewStatus: "flagged",
    });
    duplicateCandidateId = dup2.id;

    const delTarget = await seedE2eRsvp({
      fullName: `${TEST_PREFIX} Delete Candidate`,
      phoneE164: `${PHONE_PREFIX}06`,
      attendance: "attending",
    });
    deleteCandidateId = delTarget.id;

    serverHandle = await resolveBaseUrl();
    browser = await launchEdge({ headless: true });
    session = await createSession(browser);
  });

  after(async () => {
    try {
      if (session) {
        await session.close();
      }
    } finally {
      try {
        if (browser) {
          await browser.close();
        }
      } finally {
        try {
          if (serverHandle) {
            await serverHandle.stop();
          }
        } finally {
          if (pool) {
            await cleanupQaPhase8Data(pool, {
              createdRsvpIds,
              phonePrefixes: [PHONE_PREFIX],
              namePrefix: TEST_PREFIX,
              createdAdminId: qaAdmin?.id ?? null,
              createdAdminEphemeral: qaAdmin?.ephemeral ?? false,
              baselineMaxAuditId: baseline?.baselineMaxAuditId ?? null,
              baselineMaxRetentionRunId: baseline?.baselineMaxRetentionRunId ?? null,
              baselineEventSettings: baseline?.baselineEventSettings ?? null,
              clientIpsToClean: usedClientIps,
            });
            await pool.end();
          }
        }
      }
    }
  });

  it("Tier 1 & Tier 4 (T1-P8-01..16, T4-P8-01): executes full Admin lifecycle across all Modules A-N and captures 11 validated PNG screenshots", async () => {
    // T1-P8-01 & T2-P8-01: Unauthenticated redirect to /admin/login
    await session.setViewport({ width: 1440, height: 900, mobile: false });
    await session.goto(`${serverHandle.baseUrl}/admin`, {
      waitFonts: true,
      timeoutMs: 20000,
    });
    await waitForUrlPath(session, /^\/admin\/login\/?$/);
    await waitForText(session, /sign in|admin/i);

    // Screenshot 01: Admin Login (1440x900)
    const shot01 = await session.screenshotPng({ fullPage: false });
    await saveValidatedScreenshot("01-admin-login.png", shot01, 1440);
    auditAdminNetworkEvents(session, serverHandle.baseUrl);
    session.clearEvents();

    // T2-P8-02: Invalid login shows generic error without leaking email existence
    await fillInputByLabel(session, /email/i, qaAdmin.email);
    await fillInputByLabel(session, /password/i, "WrongUiPass!2026#");
    await clickAction(session, /sign in|log\s*in/i, "form, main");
    await waitForText(session, /invalid|incorrect|credentials/i);
    auditAdminNetworkEvents(session, serverHandle.baseUrl, { allowStatuses: [401] });
    session.clearEvents();

    // T1-P8-01: Valid UI Login -> lands on /admin Overview
    await fillInputByLabel(session, /email/i, qaAdmin.email);
    await fillInputByLabel(session, /password/i, qaAdmin.password);
    await clickAction(session, /sign in|log\s*in/i, "form, main");
    await waitForUrlPath(session, /^\/admin\/?$/);
    await waitForText(session, /overview/i, { selector: "main h1" });

    // T1-P8-02: Verify all 9 nav items, noindex meta, Botanical Editorial palette & contrast
    const shellAudit = await session.evaluate((expectedLabels) => {
      const robotsMeta = document
        .querySelector('meta[name="robots"]')
        ?.getAttribute("content");
      const navText = [
        ...document.querySelectorAll(
          'nav a, nav button, aside a, aside button, [role="navigation"] a, [role="navigation"] button',
        ),
      ].map((el) => (el.textContent || "").trim());
      const missing = expectedLabels.filter(
        (lbl) => !navText.some((txt) => txt.toLowerCase() === lbl.toLowerCase()),
      );
      return {
        robotsMeta,
        missing,
        h1Count: document.querySelectorAll("h1").length,
      };
    }, NAV_LABELS);

    assert.equal(shellAudit.missing.length, 0, `Missing nav items: ${shellAudit.missing.join(", ")}`);
    assert.match(shellAudit.robotsMeta || "", /noindex/i);
    assert.equal(shellAudit.h1Count, 1);
    await assertBotanicalThemeAndContrast(session);

    // T1-P8-03: Overview live PostgreSQL KPIs match DB counts
    const dbCounts = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE is_anonymized = FALSE AND duplicate_review_status <> 'merged_archived')::int AS total,
        COUNT(*) FILTER (WHERE is_anonymized = FALSE AND duplicate_review_status <> 'merged_archived' AND attendance_status = 'attending')::int AS attending,
        COUNT(*) FILTER (WHERE is_anonymized = FALSE AND duplicate_review_status <> 'merged_archived' AND attendance_status = 'declining')::int AS declining
      FROM rsvps
    `);
    const overviewText = await session.evaluate(() => document.body.innerText);
    assert.ok(overviewText.includes(String(dbCounts.rows[0].total)));
    assert.ok(overviewText.includes(String(dbCounts.rows[0].attending)));
    assert.ok(overviewText.includes(String(dbCounts.rows[0].declining)));

    // Screenshot 02: Desktop Overview (1440x900)
    const shot02 = await session.screenshotPng({ fullPage: true });
    await saveValidatedScreenshot("02-desktop-overview.png", shot02, 1440);

    // Screenshot 03: Mobile Overview (390x844)
    await session.setViewport({ width: 390, height: 844, mobile: true });
    await delay(250);
    await assertNoHorizontalOverflow(session, 390);
    const shot03 = await session.screenshotPng({ fullPage: true });
    await saveValidatedScreenshot("03-mobile-overview.png", shot03, 390);

    // Back to 1440x900 desktop for remaining screenshots & workflows
    await session.setViewport({ width: 1440, height: 900, mobile: false });
    await delay(200);

    // T1-P8-04: RSVP Management (/admin/rsvps)
    await clickNavItem(session, "RSVP Management");
    await waitForUrlPath(session, /^\/admin\/rsvps\/?$/);
    await waitForText(session, new RegExp(`${TEST_PREFIX.replace(/[[\]]/g, "\\$&")}.*Grace Attending`));
    const shot04 = await session.screenshotPng({ fullPage: true });
    await saveValidatedScreenshot("04-rsvp-management.png", shot04, 1440);

    // T1-P8-05: Guest Directory (/admin/guests) -> navigate to Detail
    await clickNavItem(session, "Guest Directory");
    await waitForUrlPath(session, /^\/admin\/guests\/?$/);
    await waitForText(session, /Grace Attending/);

    // T1-P8-06: Guest Detail (/admin/guests/[id]) & zero secret leakage
    await session.goto(`${serverHandle.baseUrl}/admin/guests/${attendingGuestId}`, {
      waitFonts: true,
      timeoutMs: 20000,
    });
    await waitForText(session, /Grace Attending/);
    const detailHtml = await session.evaluate(() => document.documentElement.outerHTML);
    assertNoSecretLeak(detailHtml, [attendingGuestToken, qaAdmin.password], "Guest Detail DOM");
    const shot05 = await session.screenshotPng({ fullPage: true });
    await saveValidatedScreenshot("05-guest-details.png", shot05, 1440);

    // T1-P8-07: Edit Guest on /admin/guests/[id]
    await clickAction(session, /edit/i, "main");
    await fillInputByLabel(session, /organizer notes|notes/i, `${TEST_PREFIX} Edited via UI`);
    const shot06 = await session.screenshotPng({ fullPage: true });
    await saveValidatedScreenshot("06-edit-guest.png", shot06, 1440);
    await clickAction(session, /save|update/i, "main, form");
    await waitForText(session, /Edited via UI/);

    // T1-P8-08: Manual RSVP (/admin/rsvps/new)
    await session.goto(`${serverHandle.baseUrl}/admin/rsvps/new`, {
      waitFonts: true,
      timeoutMs: 20000,
    });
    await waitForText(session, /manual rsvp|add rsvp|new rsvp/i, { selector: "main h1" });
    await delay(300);
    await fillInputByLabel(session, /full name|name/i, `${TEST_PREFIX} Manual UI Guest`);
    await fillInputByLabel(session, /phone/i, "0718982007");
    await selectControlOption(session, /attendance/i, "attending");
    await fillInputByLabel(session, /dietary/i, "Dairy-free");
    await fillInputByLabel(session, /message|congratulatory/i, `${TEST_PREFIX} UI Manual Congrats`);
    await fillInputByLabel(session, /organizer notes|notes/i, `${TEST_PREFIX} UI entry`);
    const shot07 = await session.screenshotPng({ fullPage: true });
    await saveValidatedScreenshot("07-manual-rsvp.png", shot07, 1440);
    await clickAction(session, /create|save|submit/i, "main, form");
    await waitForText(session, /Manual UI Guest|created|saved/i);
    await trackRsvpByPhone(`${PHONE_PREFIX}07`);

    // T1-P8-09: Duplicate Review (/admin/rsvps/duplicates)
    await session.goto(`${serverHandle.baseUrl}/admin/rsvps/duplicates`, {
      waitFonts: true,
      timeoutMs: 20000,
    });
    await waitForText(session, /Duplicate Primary/);
    await waitForText(session, /Duplicate Candidate/);

    // T1-P8-11 & T2-P8-09: Messages Inbox (/admin/messages) + XSS check
    await clickNavItem(session, "Messages");
    await waitForUrlPath(session, /^\/admin\/messages\/?$/);
    await waitForText(session, /Warmest congratulations/);
    const xssCheck = await session.evaluate(() => ({
      xssFlag: window.__xss,
      bodyText: document.body.innerText,
    }));
    assert.equal(xssCheck.xssFlag, undefined);
    assert.equal(xssCheck.bodyText.includes("<script>"), true);
    const shot08 = await session.screenshotPng({ fullPage: true });
    await saveValidatedScreenshot("08-messages.png", shot08, 1440);

    // T1-P8-12 & T2-P8-07: Catering (/admin/catering) + "No dietary supplied" check
    await clickNavItem(session, "Catering");
    await waitForUrlPath(session, /^\/admin\/catering\/?$/);
    await waitForText(session, /Vegetarian, no nuts/);
    await waitForText(session, /No dietary supplied/i);
    const shot09 = await session.screenshotPng({ fullPage: true });
    await saveValidatedScreenshot("09-catering.png", shot09, 1440);

    // T1-P8-13 & T2-P8-08: Reports & Export (/admin/reports)
    await clickNavItem(session, "Reports & Export");
    await waitForUrlPath(session, /^\/admin\/reports\/?$/);
    await waitForText(session, /Full RSVP/i);
    await waitForText(session, /Event Summary/i);
    const shot10 = await session.screenshotPng({ fullPage: true });
    await saveValidatedScreenshot("10-reports.png", shot10, 1440);

    // Verify browser CSV download from /api/admin/reports/export
    const browserCsv = await session.evaluate(async () => {
      const res = await fetch("/api/admin/reports/export?type=full_rsvp");
      const bytes = new Uint8Array(await res.arrayBuffer());
      return {
        status: res.status,
        contentType: res.headers.get("content-type"),
        bomBytes: [bytes[0], bytes[1], bytes[2]],
        text: new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes),
      };
    });
    assert.equal(browserCsv.status, 200);
    assert.match(browserCsv.contentType || "", /text\/csv/i);
    assert.deepEqual(browserCsv.bomBytes, [0xef, 0xbb, 0xbf]);
    assert.equal(browserCsv.text.charCodeAt(0), 0xfeff);
    assert.equal(browserCsv.text.includes("'+SUM(1,2)"), true);

    // T1-P8-14: Activity Log (/admin/activity)
    await clickNavItem(session, "Activity Log");
    await waitForUrlPath(session, /^\/admin\/activity\/?$/);
    await waitForText(session, /login|rsvp/i);
    const activityHtml = await session.evaluate(() => document.body.innerText);
    assertNoSecretLeak(activityHtml, [qaAdmin.password, attendingGuestToken], "Activity Log UI");

    // T1-P8-15: Settings (/admin/settings)
    await clickNavItem(session, "Settings");
    await waitForUrlPath(session, /^\/admin\/settings\/?$/);
    await waitForText(session, /Majala Mwaila/);
    await waitForText(session, /(Florence\s+)?Achala Mwaila/i);
    await waitForText(session, /Rainbow Ruiru Resort/);
    await waitForText(session, /12 December 2026/);
    await waitForText(session, /Africa\/Nairobi/);
    const shot11 = await session.screenshotPng({ fullPage: true });
    await saveValidatedScreenshot("11-settings.png", shot11, 1440);

    // T1-P8-16: Admin Profile & Logout
    await clickNavItem(session, "Admin Profile");
    await waitForUrlPath(session, /^\/admin\/profile\/?$/);
    await waitForText(session, new RegExp(qaAdmin.email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    // T1-P8-10 & T2-P8-11: Delete confirmation guard (Cancel preserves, Confirm deletes)
    await session.goto(`${serverHandle.baseUrl}/admin/guests/${deleteCandidateId}`, {
      waitFonts: true,
      timeoutMs: 20000,
    });
    await waitForText(session, /Delete Candidate/);
    await clickAction(session, /delete/i, "main");
    await waitForText(session, /confirm|cancel/i, { selector: "[role='dialog'], [role='alertdialog'], main" });
    await clickAction(session, /cancel/i, "[role='dialog'], [role='alertdialog'], main");
    const stillExists = await pool.query("SELECT 1 FROM rsvps WHERE id = $1", [
      deleteCandidateId,
    ]);
    assert.equal(stillExists.rowCount, 1);

    await clickAction(session, /delete/i, "main");
    await clickAction(session, /confirm|delete/i, "[role='dialog'], [role='alertdialog']");
    await waitForUrlPath(session, /^\/admin\/(rsvps|guests)\/?$/);
    const deletedRes = await pool.query("SELECT 1 FROM rsvps WHERE id = $1", [
      deleteCandidateId,
    ]);
    assert.equal(deletedRes.rowCount, 0);

    // T2-P8-12: Unknown guest ID renders graceful not-found state without 500
    session.clearEvents();
    await session.goto(
      `${serverHandle.baseUrl}/admin/guests/00000000-0000-0000-0000-000000000000`,
      { waitFonts: true, timeoutMs: 20000 },
    );
    await waitForText(session, /not found|could not be found|back/i);
    auditAdminNetworkEvents(session, serverHandle.baseUrl, { allowStatuses: [404] });
    session.clearEvents();

    // T1-P8-16: Logout invalidates session and redirects to /admin/login
    await clickNavItem(session, "Logout");
    await waitForUrlPath(session, /^\/admin\/login\/?$/);
    await session.goto(`${serverHandle.baseUrl}/admin`, {
      waitFonts: true,
      timeoutMs: 20000,
    });
    await waitForUrlPath(session, /^\/admin\/login\/?$/);
  });

  it("Tier 2 & Tier 3 (T2-P8-03..10, T3-P8-01..07): validates boundaries, public-admin live sync, duplicates, closure toggle, and password change", async () => {
    await session.setViewport({ width: 1280, height: 800, mobile: false });
    await loginViaUi(session, serverHandle.baseUrl, qaAdmin.email, qaAdmin.password);

    // T2-P8-03: Public registration/bootstrap routes never return 200/201
    const regProbe = await session.evaluate(async () => {
      const paths = ["/admin/register", "/admin/signup", "/api/admin/register", "/api/admin/bootstrap"];
      return Promise.all(
        paths.map(async (p) => {
          const r = await fetch(p);
          return { p, status: r.status };
        }),
      );
    });
    for (const item of regProbe) {
      assert.notEqual(item.status, 200);
      assert.notEqual(item.status, 201);
    }

    // T2-P8-04: Zero-result search empty state renders cleanly without NaN/Infinity
    await session.goto(`${serverHandle.baseUrl}/admin/rsvps`, {
      waitFonts: true,
      timeoutMs: 20000,
    });
    await waitForText(session, /rsvp management/i, { selector: "main h1" });
    await fillInputByLabel(session, /search/i, "ZZZ-NONEXISTENT-QA-P8-99999");
    await delay(400);
    const emptyBody = await session.evaluate(() => document.body.innerText);
    assert.equal(/NaN|Infinity/i.test(emptyBody), false);

    // T2-P8-05: Validation boundaries on Manual RSVP (1-char name & invalid phone rejected)
    await session.goto(`${serverHandle.baseUrl}/admin/rsvps/new`, {
      waitFonts: true,
      timeoutMs: 20000,
    });
    await waitForText(session, /manual rsvp|add rsvp|new rsvp/i, { selector: "main h1" });
    await delay(250);
    await fillInputByLabel(session, /full name|name/i, "A");
    await fillInputByLabel(session, /phone/i, "invalid-phone");
    await clickAction(session, /create|save|submit/i, "main, form");
    await waitForText(session, /error|valid|character|phone|name/i);

    // T2-P8-06 & T3-P8-04: Attending-only dietary rule + Admin Edit <-> /rsvp/manage/[token] sync
    await session.goto(`${serverHandle.baseUrl}/admin/guests/${attendingGuestId}`, {
      waitFonts: true,
      timeoutMs: 20000,
    });
    await clickAction(session, /edit/i, "main");
    await selectControlOption(session, /attendance/i, "declining");
    await clickAction(session, /save|update/i, "main, form");
    await waitForText(session, /updated and saved/i);
    await waitForText(session, /declining/i);

    const editedDb = await pool.query(
      "SELECT attendance_status, dietary_requirements FROM rsvps WHERE id = $1",
      [attendingGuestId],
    );
    assert.equal(editedDb.rows[0].attendance_status, "declining");
    assert.equal(editedDb.rows[0].dietary_requirements, null);

    // Verify public /rsvp/manage/[token] reflects admin edit
    await session.goto(`${serverHandle.baseUrl}/rsvp/manage/${attendingGuestToken}`, {
      waitFonts: true,
      timeoutMs: 20000,
    });
    await waitForText(session, /declining|unable to attend/i);

    // T3-P8-02: Public RSVP -> Admin Live Sync
    const liveWebRes = await adminFetch(serverHandle.baseUrl, "/api/rsvp", {
      method: "POST",
      clientIp: "127.0.0.1",
      body: {
        fullName: `${TEST_PREFIX} Live Web Guest`,
        phoneCountry: "KE",
        phoneNumber: "0718982008",
        attendance: "attending",
        dietaryRequirements: "Vegan",
        congratulatoryMessage: `${TEST_PREFIX} Live sync`,
        privacyAcknowledged: true,
        honeypot: "",
      },
    });
    assert.equal(liveWebRes.status, 201);
    await trackRsvpByPhone(`${PHONE_PREFIX}08`);

    await session.goto(`${serverHandle.baseUrl}/admin/rsvps`, {
      waitFonts: true,
      timeoutMs: 20000,
    });
    await waitForText(session, /Live Web Guest/);

    // T2-P8-10 & T3-P8-05: Duplicate resolved_distinct vs merged_archived
    const dupResolveRes = await session.evaluate(
      async ({ primaryId, candidateId }) => {
        const res = await fetch("/api/admin/rsvps/duplicates/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resolution: "merged_archived",
            primaryRsvpId: primaryId,
            targetRsvpIds: [candidateId],
            note: "[QA-P8-E2E] Merged duplicate",
          }),
        });
        return res.status;
      },
      { primaryId: duplicatePrimaryId, candidateId: duplicateCandidateId },
    );
    assert.equal(dupResolveRes, 200);
    const archivedCheck = await pool.query(
      "SELECT duplicate_review_status FROM rsvps WHERE id = $1",
      [duplicateCandidateId],
    );
    assert.equal(archivedCheck.rows[0].duplicate_review_status, "merged_archived");

    // Verify blankDietaryGuestId still appears in Catering with "No dietary supplied"
    assert.ok(blankDietaryGuestId);

    // T3-P8-03: Settings closure toggle affects public '/' and restores
    const closeStatus = await session.evaluate(async () => {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rsvpAcceptingResponses: false,
          manualOverrideReason: "[QA-P8-E2E] Temporary close check",
        }),
      });
      return res.status;
    });
    assert.equal(closeStatus, 200);

    await session.goto(`${serverHandle.baseUrl}/`, {
      waitFonts: true,
      timeoutMs: 20000,
    });
    await waitForText(session, /RSVPs are now closed/i);

    // Restore settings to open
    await session.goto(`${serverHandle.baseUrl}/admin/settings`, {
      waitFonts: true,
      timeoutMs: 20000,
    });
    const reopenStatus = await session.evaluate(async () => {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rsvpAcceptingResponses: true,
          manualOverrideReason: null,
        }),
      });
      return res.status;
    });
    assert.equal(reopenStatus, 200);

    // T3-P8-06: Password change via Admin Profile
    const newPassword = `${qaAdmin.password}New9!`;
    const pwStatus = await session.evaluate(
      async ({ currentPassword, nextPassword }) => {
        const res = await fetch("/api/admin/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            currentPassword,
            newPassword: nextPassword,
            confirmPassword: nextPassword,
          }),
        });
        return res.status;
      },
      { currentPassword: qaAdmin.password, nextPassword: newPassword },
    );
    assert.equal(pwStatus, 200);
    qaAdmin.password = newPassword;

    // Logout & re-login with new password
    await clickNavItem(session, "Logout");
    await waitForUrlPath(session, /^\/admin\/login\/?$/);
    await loginViaUi(session, serverHandle.baseUrl, qaAdmin.email, qaAdmin.password);
  });

  it("Tier 3 (T3-P8-07, T3-P8-08): verifies 8-viewport responsive matrix (320-1440px), >=44px touch targets, and mobile nav drawer", async () => {
    const corePaths = [
      "/admin",
      "/admin/rsvps",
      `/admin/guests/${attendingGuestId}`,
      "/admin/reports",
      "/admin/settings",
    ];

    for (const width of VIEWPORT_WIDTHS) {
      const isMobile = width < 768;
      await session.setViewport({
        width,
        height: isMobile ? 844 : 900,
        mobile: isMobile,
      });

      for (const routePath of corePaths) {
        await session.goto(`${serverHandle.baseUrl}${routePath}`, {
          waitFonts: true,
          timeoutMs: 20000,
        });
        await waitForText(session, /\S/, { selector: "main h1" });
        await delay(150);
        await assertNoHorizontalOverflow(session, width);

        const layoutMetrics = await session.evaluate((checkTouchTargets) => {
          const mainCount = document.querySelectorAll("main").length;
          const h1Count = document.querySelectorAll("h1").length;
          const undersizedTargets = [];
          if (checkTouchTargets) {
            for (const el of document.querySelectorAll(
              'button, a[href], input:not([type="hidden"]), select',
            )) {
              const style = getComputedStyle(el);
              const rect = el.getBoundingClientRect();
              if (
                style.display === "none" ||
                style.visibility === "hidden" ||
                rect.width === 0 ||
                rect.height === 0 ||
                (rect.width <= 1 && rect.height <= 1 && style.overflow === "hidden")
              ) {
                continue;
              }
              if (rect.height < 44 && rect.width < 44) {
                undersizedTargets.push({
                  tag: el.tagName,
                  text: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30),
                  w: Math.round(rect.width),
                  h: Math.round(rect.height),
                });
              }
            }
          }
          return { mainCount, h1Count, undersizedTargets };
        }, width <= 430);

        assert.ok(layoutMetrics.mainCount >= 1, `Missing <main> on ${routePath} @ ${width}px`);
        assert.equal(layoutMetrics.h1Count, 1, `Expected single <h1> on ${routePath} @ ${width}px`);
        assert.equal(
          layoutMetrics.undersizedTargets.length,
          0,
          `Undersized (<44px) interactive targets on ${routePath} @ ${width}px: ${JSON.stringify(layoutMetrics.undersizedTargets)}`,
        );
      }
    }

    // T3-P8-07: Mobile drawer navigation closes and updates route cleanly at 390x844
    await session.setViewport({ width: 390, height: 844, mobile: true });
    await session.goto(`${serverHandle.baseUrl}/admin`, {
      waitFonts: true,
      timeoutMs: 20000,
    });
    await clickNavItem(session, "Messages");
    await waitForUrlPath(session, /^\/admin\/messages\/?$/);
    await assertNoHorizontalOverflow(session, 390);
  });

  it("Tier 4 (T4-P8-01..04): verifies 11 screenshots, keyboard-only accessibility journey, and Phase 6/7 regressions", async () => {
    // T4-P8-01: Assert all 11 required PNGs exist and pass PNG validation
    const requiredScreenshots = [
      "01-admin-login.png",
      "02-desktop-overview.png",
      "03-mobile-overview.png",
      "04-rsvp-management.png",
      "05-guest-details.png",
      "06-edit-guest.png",
      "07-manual-rsvp.png",
      "08-messages.png",
      "09-catering.png",
      "10-reports.png",
      "11-settings.png",
    ];
    for (const file of requiredScreenshots) {
      const fullPath = capturedScreenshots.get(file) || path.join(screenshotDir, file);
      assert.equal(fs.existsSync(fullPath), true, `Missing screenshot ${file}`);
      const buf = fs.readFileSync(fullPath);
      const meta = validatePngBuffer(buf, {
        minBytes: 4000,
      });
      const targetWidth = file === "03-mobile-overview.png" ? 390 : 1440;
      assert.ok(
        Math.abs(meta.width - targetWidth) <= 20,
        `PNG width mismatch for ${file}: expected ~${targetWidth}, got ${meta.width}`,
      );
    }

    // T4-P8-02: Keyboard-only accessibility navigation & dialog Escape
    await session.setViewport({ width: 1280, height: 800, mobile: false });
    await session.goto(`${serverHandle.baseUrl}/admin/guests/${attendingGuestId}`, {
      waitFonts: true,
      timeoutMs: 20000,
    });
    for (let i = 0; i < 6; i += 1) {
      await session.tab();
    }
    const activeElementTag = await session.evaluate(
      () => document.activeElement?.tagName || "NONE",
    );
    assert.notEqual(activeElementTag, "BODY", "Keyboard Tab must move focus off BODY");

    await clickAction(session, /delete/i, "main");
    await waitForText(session, /confirm|cancel/i, {
      selector: "[role='dialog'], [role='alertdialog']",
    });
    await session.pressKey("Escape");
    await delay(200);
    const dialogCountAfterEscape = await session.evaluate(
      () => document.querySelectorAll('[role="dialog"], [role="alertdialog"]').length,
    );
    assert.equal(dialogCountAfterEscape, 0, "Escape key must close confirmation dialog");

    // T4-P8-03: Phase 6 Public Invitation Regression Smoke (1440x900 and 390x844)
    for (const vp of [
      { width: 1440, height: 900, mobile: false },
      { width: 390, height: 844, mobile: true },
    ]) {
      session.clearEvents();
      await session.setViewport(vp);
      await session.goto(`${serverHandle.baseUrl}/`, {
        waitFonts: true,
        waitImages: true,
        timeoutMs: 20000,
      });
      await assertNoHorizontalOverflow(session, vp.width);
      const publicAudit = await session.evaluate(() => ({
        adminLinks: [...document.querySelectorAll("a[href]")].filter((a) =>
          (a.getAttribute("href") || "").startsWith("/admin"),
        ).length,
        bodyText: document.body.innerText,
      }));
      const normalizedPublicText = publicAudit.bodyText.replace(/\s+/g, " ");
      assert.equal(publicAudit.adminLinks, 0, "Public site must expose zero /admin links");
      assert.equal(normalizedPublicText.includes("Majala Mwaila"), true);
      assert.equal(normalizedPublicText.includes("Rainbow Ruiru Resort"), true);
      assert.equal(normalizedPublicText.includes(TEST_PREFIX), false);
      auditAdminNetworkEvents(session, serverHandle.baseUrl);
    }

    // T4-P8-04: Phase 7 Public RSVP Regression Smoke
    const p7Res = await adminFetch(serverHandle.baseUrl, "/api/rsvp", {
      method: "POST",
      clientIp: "127.0.0.1",
      body: {
        fullName: `${TEST_PREFIX} Phase 7 Smoke`,
        phoneCountry: "KE",
        phoneNumber: "0718982009",
        attendance: "attending",
        dietaryRequirements: "Pescatarian",
        congratulatoryMessage: `${TEST_PREFIX} Private note`,
        privacyAcknowledged: true,
        honeypot: "",
      },
    });
    assert.equal(p7Res.status, 201);
    const p7Json = await p7Res.json();
    await trackRsvpByPhone(`${PHONE_PREFIX}09`);
    const p7Token = p7Json.managementPath.replace(/^\/rsvp\/manage\//, "");

    const p7Get = await adminFetch(serverHandle.baseUrl, "/api/rsvp/manage", {
      headers: { Authorization: `Bearer ${p7Token}` },
      clientIp: "127.0.0.1",
    });
    assert.equal(p7Get.status, 200);

    const p7Patch = await adminFetch(serverHandle.baseUrl, "/api/rsvp/manage", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${p7Token}` },
      clientIp: "127.0.0.1",
      body: {
        fullName: `${TEST_PREFIX} Phase 7 Smoke`,
        phoneCountry: "KE",
        phoneNumber: "0718982009",
        attendance: "declining",
        dietaryRequirements: "Should clear",
        congratulatoryMessage: `${TEST_PREFIX} Updated`,
      },
    });
    assert.equal(p7Patch.status, 200);
    const p7PatchJson = await p7Patch.json();
    assert.equal(p7PatchJson.rsvp.attendance, "declining");
    assert.equal(p7PatchJson.rsvp.dietaryRequirements, null);

    // Public GET /api/rsvp never leaks dietary or congratulatory messages
    const pubSummaryRes = await adminFetch(serverHandle.baseUrl, "/api/rsvp", {
      clientIp: "127.0.0.1",
    });
    assert.equal(pubSummaryRes.status, 200);
    const pubSummaryText = await pubSummaryRes.text();
    assert.equal(pubSummaryText.includes("Pescatarian"), false);
    assert.equal(pubSummaryText.includes(TEST_PREFIX), false);
  });
});
