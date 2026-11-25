import "../phase7/register-alias.mjs";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  ADMIN_COOKIE_NAME,
  adminFetch,
  assertNoSecretLeak,
  captureBaseline,
  cleanupQaPhase8Data,
  ensureEnvLoaded,
  getDbPool,
  hashAdminPassword,
  loginAsAdmin,
  parseSessionCookie,
  provisionQaAdmin,
  resolveBaseUrl,
} from "./lib/admin-helpers.mjs";

const { generateManagementToken, hashManagementToken } = await import(
  "../../src/lib/rsvp/tokens.ts"
);

const TEST_PREFIX = "[QA-P8-SEC]";
const PHONE_PREFIX = "+2547189810";

let pool = null;
let serverHandle = null;
let qaAdmin = null;
let inactiveAdminId = null;
let baseline = null;

const createdRsvpIds = [];
const usedClientIps = [];

let seededAttendingId = null;
let seededDecliningId = null;
let seededBlankDietaryId = null;
let seededInjectionId = null;
let seededEqualsFormulaId = null;
let seededRawToken = null;
let seededTokenHash = null;

function makeClientIp(lastOctet) {
  const ip = `198.51.100.${lastOctet}`;
  if (!usedClientIps.includes(ip)) {
    usedClientIps.push(ip);
  }
  return ip;
}

async function seedRsvpRow({
  fullName,
  phoneE164,
  attendance,
  dietaryRequirements = null,
  congratulatoryMessage = null,
  organizerNotes = null,
  submissionSource = "web",
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
       management_token_hash,
       retention_expires_at
     ) VALUES ($1, $2, 'KE', $3, $4, $5, $6, $7, TRUE, $8, $9, '2027-03-12T00:00:00+03:00')
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
      tokenHash,
    ],
  );
  const id = res.rows[0].id;
  createdRsvpIds.push(id);
  return { id, token, tokenHash };
}

describe("Phase 8 Security, Auth, RBAC, Redaction & Injection API Tests", { concurrency: false }, () => {
  before(async () => {
    ensureEnvLoaded();
    const db = await getDbPool();
    pool = db.pool;
    const connected = await db.checkDatabaseConnection();
    assert.equal(connected, true, "PostgreSQL connection must be healthy");

    baseline = await captureBaseline(pool);
    qaAdmin = await provisionQaAdmin(pool, { label: "sec" });

    // Seed clean & adversarial [QA-P8-SEC] RSVP records in +2547189810xx block
    const r1 = await seedRsvpRow({
      fullName: `${TEST_PREFIX} Attending Guest`,
      phoneE164: `${PHONE_PREFIX}01`,
      attendance: "attending",
      dietaryRequirements: "Halal, no nuts",
      congratulatoryMessage: `${TEST_PREFIX} Blessed graduation!`,
      organizerNotes: `${TEST_PREFIX} VIP family`,
    });
    seededAttendingId = r1.id;
    seededRawToken = r1.token;
    seededTokenHash = r1.tokenHash;

    const r2 = await seedRsvpRow({
      fullName: `${TEST_PREFIX} Declining Guest`,
      phoneE164: `${PHONE_PREFIX}02`,
      attendance: "declining",
      congratulatoryMessage: `${TEST_PREFIX} Sending love from afar`,
      organizerNotes: `${TEST_PREFIX} Called`,
    });
    seededDecliningId = r2.id;

    const r3 = await seedRsvpRow({
      fullName: `${TEST_PREFIX} Blank Dietary Guest`,
      phoneE164: `${PHONE_PREFIX}03`,
      attendance: "attending",
      dietaryRequirements: null,
      congratulatoryMessage: null,
      organizerNotes: `${TEST_PREFIX} Blank dietary check`,
    });
    seededBlankDietaryId = r3.id;

    const r4 = await seedRsvpRow({
      fullName: `${TEST_PREFIX} Injection Guest`,
      phoneE164: `${PHONE_PREFIX}04`,
      attendance: "attending",
      dietaryRequirements: '+SUM(1,2), "quoted"\nline2 <img src=x onerror=alert(1)>',
      congratulatoryMessage: '\t@HYPERLINK("http://evil") <script>alert("xss")</script>',
      organizerNotes: `\r-1+1 ${TEST_PREFIX} notes`,
      submissionSource: "admin_manual",
    });
    seededInjectionId = r4.id;

    const r5 = await seedRsvpRow({
      fullName: `${TEST_PREFIX} Equals Formula Guest`,
      phoneE164: `${PHONE_PREFIX}05`,
      attendance: "attending",
      dietaryRequirements: "=CMD|'a'!A0",
      congratulatoryMessage: "@SUM(1,1)",
      organizerNotes: "-2+3",
      submissionSource: "admin_manual",
    });
    seededEqualsFormulaId = r5.id;

    serverHandle = await resolveBaseUrl();
  });

  after(async () => {
    try {
      if (serverHandle) {
        await serverHandle.stop();
      }
    } finally {
      if (pool) {
        if (inactiveAdminId) {
          await pool.query("DELETE FROM admin_sessions WHERE admin_user_id = $1", [
            inactiveAdminId,
          ]).catch(() => {});
          await pool.query("DELETE FROM admin_users WHERE id = $1", [
            inactiveAdminId,
          ]).catch(() => {});
        }
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
  });

  it("S1: rejects unauthenticated GET across all /admin/** pages with no-store, no-referrer, noindex and zero PII leak", async () => {
    const ip = makeClientIp(10);
    const adminPages = [
      "/admin",
      "/admin/rsvps",
      "/admin/rsvps/new",
      "/admin/rsvps/duplicates",
      "/admin/guests",
      `/admin/guests/${seededAttendingId}`,
      "/admin/messages",
      "/admin/catering",
      "/admin/reports",
      "/admin/activity",
      "/admin/settings",
      "/admin/profile",
    ];

    for (const pagePath of adminPages) {
      for (const cookie of [null, "forged.token.value"]) {
        const res = await adminFetch(serverHandle.baseUrl, pagePath, {
          method: "GET",
          cookie,
          clientIp: ip,
          redirect: "manual",
        });

        assert.ok(
          [302, 303, 307, 401].includes(res.status),
          `Expected 302/303/307/401 for unauthenticated GET ${pagePath}, got ${res.status}`,
        );
        if (res.status >= 300 && res.status < 400) {
          const location = res.headers.get("location") || "";
          assert.match(
            location,
            /\/admin\/login/,
            `Expected redirect to /admin/login for ${pagePath}, got ${location}`,
          );
        }

        const cacheControl = res.headers.get("cache-control") || "";
        const referrerPolicy = res.headers.get("referrer-policy") || "";
        const robotsTag = res.headers.get("x-robots-tag") || "";
        assert.match(cacheControl, /no-store/i, `Missing no-store on ${pagePath}`);
        assert.match(referrerPolicy, /no-referrer/i, `Missing no-referrer on ${pagePath}`);
        assert.match(robotsTag, /noindex/i, `Missing noindex on ${pagePath}`);

        const body = await res.text();
        assert.equal(body.includes(TEST_PREFIX), false, `PII leaked on ${pagePath}`);
        assert.equal(body.includes(qaAdmin.email), false, `Admin email leaked on ${pagePath}`);
        assert.equal(body.includes("Halal, no nuts"), false, `Dietary leaked on ${pagePath}`);
      }
    }

    // Login page itself must carry security & noindex headers
    const loginPageRes = await adminFetch(serverHandle.baseUrl, "/admin/login", {
      method: "GET",
      clientIp: ip,
      redirect: "manual",
    });
    assert.equal(loginPageRes.status, 200);
    assert.match(loginPageRes.headers.get("cache-control") || "", /no-store/i);
    assert.match(loginPageRes.headers.get("referrer-policy") || "", /no-referrer/i);
    assert.match(loginPageRes.headers.get("x-robots-tag") || "", /noindex/i);
  });

  it("S2: rejects unauthenticated GET/POST/PATCH/DELETE across all /api/admin/** routes (no cookie and forged cookie)", async () => {
    const ip = makeClientIp(11);
    const routes = [
      { method: "GET", path: "/api/admin/auth/session" },
      { method: "GET", path: "/api/admin/overview" },
      { method: "GET", path: "/api/admin/rsvps" },
      { method: "GET", path: `/api/admin/rsvps/${seededAttendingId}` },
      { method: "GET", path: "/api/admin/rsvps/duplicates" },
      { method: "GET", path: "/api/admin/messages" },
      { method: "GET", path: "/api/admin/catering" },
      { method: "GET", path: "/api/admin/reports?type=full_rsvp" },
      { method: "GET", path: "/api/admin/reports/export?type=full_rsvp" },
      { method: "GET", path: "/api/admin/audit-logs" },
      { method: "GET", path: "/api/admin/settings" },
      { method: "GET", path: "/api/admin/profile" },
      { method: "POST", path: "/api/admin/auth/logout", body: {} },
      { method: "POST", path: "/api/admin/rsvps", body: { fullName: "Unauth" } },
      { method: "POST", path: "/api/admin/rsvps/duplicates/resolve", body: {} },
      { method: "POST", path: "/api/admin/settings", body: {} },
      { method: "PATCH", path: `/api/admin/rsvps/${seededAttendingId}`, body: { fullName: "Unauth" } },
      { method: "PATCH", path: "/api/admin/settings", body: { rsvpAcceptingResponses: false } },
      { method: "PATCH", path: "/api/admin/profile", body: { displayName: "Unauth" } },
      { method: "DELETE", path: `/api/admin/rsvps/${seededAttendingId}`, body: { confirmDelete: true } },
    ];

    for (const route of routes) {
      for (const cookie of [null, "forged.session.token.12345"]) {
        const res = await adminFetch(serverHandle.baseUrl, route.path, {
          method: route.method,
          cookie,
          clientIp: ip,
          body: route.body,
        });

        assert.ok(
          res.status === 401 || res.status === 403,
          `Expected 401/403 for unauthenticated ${route.method} ${route.path}, got ${res.status}`,
        );
        assert.match(res.headers.get("cache-control") || "", /no-store/i);
        assert.match(res.headers.get("referrer-policy") || "", /no-referrer/i);

        const text = await res.text();
        assert.equal(text.includes(TEST_PREFIX), false, `PII leaked on ${route.method} ${route.path}`);
        assertNoSecretLeak(text, [seededRawToken, seededTokenHash], `${route.method} ${route.path}`);
        try {
          const json = JSON.parse(text);
          assert.equal(json.ok, false);
        } catch {
          // Non-JSON 401/403 is still guarded; no PII or secrets checked above.
        }
      }
    }
  });

  it("S3: exposes no public registration or bootstrap endpoint and leaves admin_users count unchanged", async () => {
    const ip = makeClientIp(12);
    const beforeCountRes = await pool.query("SELECT COUNT(*)::int AS cnt FROM admin_users");
    const beforeCount = beforeCountRes.rows[0].cnt;

    const candidateRoutes = [
      "/admin/register",
      "/admin/signup",
      "/admin/bootstrap",
      "/api/admin/register",
      "/api/admin/auth/register",
      "/api/admin/signup",
      "/api/admin/bootstrap",
      "/api/admin/users",
    ];

    for (const routePath of candidateRoutes) {
      for (const method of ["GET", "POST"]) {
        const res = await adminFetch(serverHandle.baseUrl, routePath, {
          method,
          clientIp: ip,
          body:
            method === "POST"
              ? {
                  email: "attacker-reg@example.test",
                  displayName: "Attacker",
                  password: "AttackerPassword!2026#",
                }
              : undefined,
        });
        assert.ok(
          [401, 403, 404, 405].includes(res.status),
          `Expected 404/401/403/405 for ${method} ${routePath}, got ${res.status}`,
        );
      }
    }

    const afterCountRes = await pool.query("SELECT COUNT(*)::int AS cnt FROM admin_users");
    assert.equal(afterCountRes.rows[0].cnt, beforeCount);
  });

  it("S4: enforces uniform login failure responses and strict HttpOnly/SameSite/Path/Secure cookie flags", async () => {
    const ip = makeClientIp(13);

    const wrongPw = await loginAsAdmin(serverHandle.baseUrl, {
      email: qaAdmin.email,
      password: "WrongPassword!2026#Bad",
      clientIp: ip,
    });
    assert.equal(wrongPw.res.status, 401);
    assert.equal(wrongPw.cookie, null);
    assert.equal(wrongPw.json?.ok, false);

    const unknownEmail = await loginAsAdmin(serverHandle.baseUrl, {
      email: "nonexistent-qa-p8@example.test",
      password: "WrongPassword!2026#Bad",
      clientIp: ip,
    });
    assert.equal(unknownEmail.res.status, 401);
    assert.equal(unknownEmail.cookie, null);
    assert.equal(unknownEmail.json?.ok, false);
    // Uniform message prevents email existence enumeration
    assert.equal(unknownEmail.json?.message, wrongPw.json?.message);

    const emptyBodyRes = await adminFetch(
      serverHandle.baseUrl,
      "/api/admin/auth/login",
      {
        method: "POST",
        clientIp: ip,
        referer: `${serverHandle.baseUrl}/admin/login`,
        body: {},
      },
    );
    assert.ok(
      emptyBodyRes.status === 400 || emptyBodyRes.status === 401,
      `Expected 400/401 for empty login body, got ${emptyBodyRes.status}`,
    );
    assert.equal(parseSessionCookie(emptyBodyRes), null);

    // Valid login
    const valid = await loginAsAdmin(serverHandle.baseUrl, {
      email: qaAdmin.email,
      password: qaAdmin.password,
      clientIp: ip,
    });
    assert.equal(valid.res.status, 200);
    assert.equal(valid.json?.ok, true);
    assert.equal(valid.json?.admin?.email, qaAdmin.email);
    assertNoSecretLeak(
      JSON.stringify(valid.json),
      [qaAdmin.password],
      "POST /api/admin/auth/login",
    );

    assert.ok(valid.cookie, `Expected ${ADMIN_COOKIE_NAME} Set-Cookie header`);
    assert.ok(valid.cookie.value.length >= 32, "Session cookie token must be high-entropy");
    assert.equal(valid.cookie.attributes.httpOnly, true, "Cookie must be HttpOnly");
    assert.ok(
      ["lax", "strict"].includes(String(valid.cookie.attributes.sameSite).toLowerCase()),
      `Expected SameSite=Lax/Strict, got ${valid.cookie.attributes.sameSite}`,
    );
    assert.equal(valid.cookie.attributes.path, "/", "Cookie Path must be /");
    assert.equal(
      valid.cookie.attributes.secure,
      true,
      "Production next start must mark admin session cookie Secure",
    );
  });

  it("S5: triggers 429 + Retry-After on login brute-force without blocking other IPs and cannot be bypassed with valid creds", async () => {
    const attackerIp = makeClientIp(77);
    const cleanIp = makeClientIp(78);

    let triggered429 = false;
    let retryAfterHeader = null;

    for (let attempt = 1; attempt <= 15; attempt += 1) {
      const res = await adminFetch(serverHandle.baseUrl, "/api/admin/auth/login", {
        method: "POST",
        clientIp: attackerIp,
        referer: `${serverHandle.baseUrl}/admin/login`,
        body: {
          email: qaAdmin.email,
          password: `WrongAttempt!2026#${attempt}`,
        },
      });
      if (res.status === 429) {
        triggered429 = true;
        retryAfterHeader = res.headers.get("retry-after");
        break;
      }
      assert.equal(res.status, 401);
    }

    assert.equal(triggered429, true, "Expected 429 rate limit after repeated failed logins");
    assert.ok(retryAfterHeader && Number(retryAfterHeader) >= 1, "Expected Retry-After >= 1");

    // Even valid credentials from the locked IP must receive 429
    const blockedValid = await loginAsAdmin(serverHandle.baseUrl, {
      email: qaAdmin.email,
      password: qaAdmin.password,
      clientIp: attackerIp,
    });
    assert.equal(blockedValid.res.status, 429);
    assert.equal(blockedValid.cookie, null);

    // Separate client IP must still succeed
    const otherIpLogin = await loginAsAdmin(serverHandle.baseUrl, {
      email: qaAdmin.email,
      password: qaAdmin.password,
      clientIp: cleanIp,
    });
    assert.equal(otherIpLogin.res.status, 200);
    assert.ok(otherIpLogin.cookie?.value);
  });

  it("S6: invalidates sessions on logout, DB expires_at, revoked_at, and inactive admin user", async () => {
    const ip = makeClientIp(14);

    // 1. Logout invalidation
    const login1 = await loginAsAdmin(serverHandle.baseUrl, {
      email: qaAdmin.email,
      password: qaAdmin.password,
      clientIp: ip,
    });
    assert.equal(login1.res.status, 200);
    const token1 = login1.cookie.value;

    const activeCheck = await adminFetch(serverHandle.baseUrl, "/api/admin/auth/session", {
      cookie: token1,
      clientIp: ip,
    });
    assert.equal(activeCheck.status, 200);

    const logoutRes = await adminFetch(serverHandle.baseUrl, "/api/admin/auth/logout", {
      method: "POST",
      cookie: token1,
      clientIp: ip,
      body: {},
    });
    assert.equal(logoutRes.status, 200);
    const clearedCookie = parseSessionCookie(logoutRes);
    assert.ok(clearedCookie, "Logout should emit clearing Set-Cookie");
    assert.ok(
      clearedCookie.value === "" || clearedCookie.attributes.maxAge === 0,
      "Logout cookie should clear value or set Max-Age=0",
    );

    const replaySession = await adminFetch(serverHandle.baseUrl, "/api/admin/auth/session", {
      cookie: token1,
      clientIp: ip,
    });
    assert.equal(replaySession.status, 401);

    const replayOverview = await adminFetch(serverHandle.baseUrl, "/api/admin/overview", {
      cookie: token1,
      clientIp: ip,
    });
    assert.equal(replayOverview.status, 401);

    // 2. DB session expiration
    const login2 = await loginAsAdmin(serverHandle.baseUrl, {
      email: qaAdmin.email,
      password: qaAdmin.password,
      clientIp: ip,
    });
    assert.equal(login2.res.status, 200);
    const token2 = login2.cookie.value;

    await pool.query(
      "UPDATE admin_sessions SET expires_at = NOW() - INTERVAL '5 minutes' WHERE admin_user_id = $1",
      [qaAdmin.id],
    );
    const expiredRes = await adminFetch(serverHandle.baseUrl, "/api/admin/overview", {
      cookie: token2,
      clientIp: ip,
    });
    assert.equal(expiredRes.status, 401);

    // 3. DB session revoked_at
    const login3 = await loginAsAdmin(serverHandle.baseUrl, {
      email: qaAdmin.email,
      password: qaAdmin.password,
      clientIp: ip,
    });
    assert.equal(login3.res.status, 200);
    const token3 = login3.cookie.value;

    await pool.query(
      "UPDATE admin_sessions SET revoked_at = NOW() WHERE admin_user_id = $1 AND revoked_at IS NULL",
      [qaAdmin.id],
    );
    const revokedRes = await adminFetch(serverHandle.baseUrl, "/api/admin/overview", {
      cookie: token3,
      clientIp: ip,
    });
    assert.equal(revokedRes.status, 401);

    // 4. Inactive admin user (is_active = FALSE)
    const inactiveEmail = `qa-inactive-${Date.now()}@example.test`;
    const inactivePass = "QaInactive!2026#Sec";
    const inactiveHash = await hashAdminPassword(inactivePass);
    const ins = await pool.query(
      `INSERT INTO admin_users (email, display_name, password_hash, role, is_active)
       VALUES ($1, $2, $3, 'admin', TRUE)
       RETURNING id`,
      [inactiveEmail, `${TEST_PREFIX} Inactive Admin`, inactiveHash],
    );
    inactiveAdminId = ins.rows[0].id;

    const login4 = await loginAsAdmin(serverHandle.baseUrl, {
      email: inactiveEmail,
      password: inactivePass,
      clientIp: ip,
    });
    assert.equal(login4.res.status, 200);
    const token4 = login4.cookie.value;

    await pool.query("UPDATE admin_users SET is_active = FALSE WHERE id = $1", [
      inactiveAdminId,
    ]);
    const inactiveRes = await adminFetch(serverHandle.baseUrl, "/api/admin/overview", {
      cookie: token4,
      clientIp: ip,
    });
    assert.equal(inactiveRes.status, 401);
  });

  it("S7: enforces same-origin / CSRF protection on state-changing /api/admin/** routes", async () => {
    const ip = makeClientIp(15);
    const login = await loginAsAdmin(serverHandle.baseUrl, {
      email: qaAdmin.email,
      password: qaAdmin.password,
      clientIp: ip,
    });
    assert.equal(login.res.status, 200);
    const cookie = login.cookie.value;

    const attackerOrigin = "https://attacker.example";
    const attackerReferer = "https://attacker.example/csrf.html";

    const crossOriginChecks = [
      {
        method: "POST",
        path: "/api/admin/rsvps",
        body: {
          fullName: `${TEST_PREFIX} CSRF Attempt`,
          phoneCountry: "KE",
          phoneNumber: "0718981040",
          attendance: "attending",
        },
      },
      {
        method: "PATCH",
        path: `/api/admin/rsvps/${seededAttendingId}`,
        body: {
          fullName: `${TEST_PREFIX} CSRF Mutated`,
          phoneNumber: "0718981001",
          phoneCountry: "KE",
          attendance: "attending",
        },
      },
      {
        method: "PATCH",
        path: "/api/admin/settings",
        body: { rsvpAcceptingResponses: false },
      },
      {
        method: "PATCH",
        path: "/api/admin/profile",
        body: { displayName: "Hacked Name" },
      },
      {
        method: "POST",
        path: "/api/admin/auth/logout",
        body: {},
      },
    ];

    for (const reqSpec of crossOriginChecks) {
      const res = await adminFetch(serverHandle.baseUrl, reqSpec.path, {
        method: reqSpec.method,
        cookie,
        clientIp: ip,
        origin: attackerOrigin,
        referer: attackerReferer,
        body: reqSpec.body,
      });
      assert.ok(
        res.status === 403 || res.status === 400,
        `Expected 403/400 on cross-origin ${reqSpec.method} ${reqSpec.path}, got ${res.status}`,
      );
    }

    // Session must remain intact after rejected cross-origin logout, and DB untouched
    const sessionStillValid = await adminFetch(
      serverHandle.baseUrl,
      "/api/admin/auth/session",
      { cookie, clientIp: ip },
    );
    assert.equal(sessionStillValid.status, 200);

    const rowCheck = await pool.query(
      "SELECT full_name FROM rsvps WHERE id = $1",
      [seededAttendingId],
    );
    assert.equal(rowCheck.rows[0].full_name, `${TEST_PREFIX} Attending Guest`);
  });

  it("S8: zero secret, token, hash, or private-PII leakage across admin APIs, SSR HTML, CSV exports, audit logs, and public routes", async () => {
    const ip = makeClientIp(16);
    const login = await loginAsAdmin(serverHandle.baseUrl, {
      email: qaAdmin.email,
      password: qaAdmin.password,
      clientIp: ip,
    });
    assert.equal(login.res.status, 200);
    const cookie = login.cookie.value;
    const extraSecrets = [
      seededRawToken,
      seededTokenHash,
      cookie,
      qaAdmin.password,
    ];

    const adminEndpoints = [
      "/api/admin/auth/session",
      "/api/admin/overview",
      "/api/admin/rsvps",
      `/api/admin/rsvps/${seededAttendingId}`,
      "/api/admin/rsvps/duplicates",
      "/api/admin/messages",
      "/api/admin/catering",
      "/api/admin/reports?type=full_rsvp",
      "/api/admin/audit-logs",
      "/api/admin/settings",
      "/api/admin/profile",
    ];

    for (const ep of adminEndpoints) {
      const res = await adminFetch(serverHandle.baseUrl, ep, {
        cookie,
        clientIp: ip,
      });
      assert.equal(res.status, 200, `Expected 200 for ${ep}, got ${res.status}`);
      const text = await res.text();
      assertNoSecretLeak(text, extraSecrets, `GET ${ep}`);
    }

    const adminPages = [
      "/admin",
      "/admin/rsvps",
      `/admin/guests/${seededAttendingId}`,
      "/admin/messages",
      "/admin/catering",
      "/admin/reports",
      "/admin/activity",
      "/admin/settings",
      "/admin/profile",
    ];

    for (const pgPath of adminPages) {
      const res = await adminFetch(serverHandle.baseUrl, pgPath, {
        cookie,
        clientIp: ip,
      });
      assert.equal(res.status, 200, `Expected 200 for ${pgPath}, got ${res.status}`);
      const html = await res.text();
      assertNoSecretLeak(html, extraSecrets, `SSR ${pgPath}`);
    }

    // Public routes must never expose private guest PII, dietary, messages, or /admin links
    const publicHomeRes = await adminFetch(serverHandle.baseUrl, "/", {
      clientIp: ip,
    });
    assert.equal(publicHomeRes.status, 200);
    const publicHtml = await publicHomeRes.text();
    assert.equal(publicHtml.includes(TEST_PREFIX), false);
    assert.equal(publicHtml.includes("Halal, no nuts"), false);
    assert.equal(publicHtml.includes("Blessed graduation!"), false);
    assert.equal(/href=["']\/admin/i.test(publicHtml), false);

    const publicRsvpRes = await adminFetch(serverHandle.baseUrl, "/api/rsvp", {
      clientIp: ip,
    });
    assert.equal(publicRsvpRes.status, 200);
    const publicRsvpText = await publicRsvpRes.text();
    assert.equal(publicRsvpText.includes(TEST_PREFIX), false);
    assert.equal(publicRsvpText.includes("Halal, no nuts"), false);
    assertNoSecretLeak(publicRsvpText, extraSecrets, "GET /api/rsvp");
  });

  it("S9: neutralizes CSV formula injection, emits UTF-8 BOM, enforces RFC 4180 escaping, respects filters, and supports all 6 report types", async () => {
    const ip = makeClientIp(17);
    const login = await loginAsAdmin(serverHandle.baseUrl, {
      email: qaAdmin.email,
      password: qaAdmin.password,
      clientIp: ip,
    });
    assert.equal(login.res.status, 200);
    const cookie = login.cookie.value;

    const fullRes = await adminFetch(
      serverHandle.baseUrl,
      "/api/admin/reports/export?type=full_rsvp",
      { cookie, clientIp: ip },
    );
    assert.equal(fullRes.status, 200);
    assert.match(fullRes.headers.get("content-type") || "", /text\/csv/i);
    const disposition = fullRes.headers.get("content-disposition") || "";
    assert.match(disposition, /attachment/i);
    assert.match(disposition, /filename=.*\.csv/i);
    assert.match(disposition, /\d{4}-\d{2}-\d{2}/);

    const fullBuf = Buffer.from(await fullRes.arrayBuffer());
    assert.deepEqual(
      [...fullBuf.subarray(0, 3)],
      [0xef, 0xbb, 0xbf],
      "CSV export wire bytes must start with UTF-8 BOM (EF BB BF)",
    );
    const fullCsv = new TextDecoder("utf-8", { ignoreBOM: true }).decode(fullBuf);
    assert.equal(fullCsv.charCodeAt(0), 0xfeff, "CSV export must start with UTF-8 BOM");
    assert.equal(fullCsv.indexOf("\uFEFF", 1), -1);
    assertNoSecretLeak(
      fullCsv,
      [seededRawToken, seededTokenHash, cookie, qaAdmin.password],
      "CSV full_rsvp",
    );

    // Formula triggers (=, +, -, @, \t, \r) must be neutralized with leading apostrophe
    assert.ok(seededEqualsFormulaId && seededBlankDietaryId && seededDecliningId);
    assert.equal(fullCsv.includes("'=CMD|'a'!A0"), true);
    assert.equal(fullCsv.includes("'+SUM(1,2)"), true);
    assert.equal(fullCsv.includes("'-2+3"), true);
    assert.equal(fullCsv.includes("'@SUM(1,1)"), true);
    assert.equal(fullCsv.includes("'\t@HYPERLINK"), true);
    assert.equal(fullCsv.includes("'\r-1+1"), true);
    assert.equal(fullCsv.includes(`'${PHONE_PREFIX}01`), true);
    // Double-quotes inside dietary field must be RFC-4180 doubled
    assert.equal(fullCsv.includes('""quoted""'), true);

    // Filter respect: attendance=attending excludes declining row
    const attendingOnlyRes = await adminFetch(
      serverHandle.baseUrl,
      "/api/admin/reports/export?type=full_rsvp&attendance=attending",
      { cookie, clientIp: ip },
    );
    assert.equal(attendingOnlyRes.status, 200);
    const attendingCsv = await attendingOnlyRes.text();
    assert.equal(attendingCsv.includes(`${TEST_PREFIX} Attending Guest`), true);
    assert.equal(attendingCsv.includes(`${TEST_PREFIX} Declining Guest`), false);

    // Catering export: excludes declining, marks blank dietary as "No dietary supplied"
    const cateringRes = await adminFetch(
      serverHandle.baseUrl,
      "/api/admin/reports/export?type=catering",
      { cookie, clientIp: ip },
    );
    assert.equal(cateringRes.status, 200);
    const cateringCsv = await cateringRes.text();
    assert.equal(cateringCsv.includes(`${TEST_PREFIX} Declining Guest`), false);
    assert.equal(cateringCsv.includes(`${TEST_PREFIX} Blank Dietary Guest`), true);
    assert.match(cateringCsv, /No dietary supplied/i);

    // All 6 report types must return valid BOM-prefixed CSV without secret leaks
    for (const reportType of [
      "full_rsvp",
      "attending",
      "declining",
      "catering",
      "messages",
      "event_summary",
    ]) {
      const res = await adminFetch(
        serverHandle.baseUrl,
        `/api/admin/reports/export?type=${reportType}`,
        { cookie, clientIp: ip },
      );
      assert.equal(res.status, 200, `Expected 200 for report type=${reportType}`);
      assert.match(res.headers.get("content-type") || "", /text\/csv/i);
      const buf = Buffer.from(await res.arrayBuffer());
      assert.deepEqual([...buf.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
      const csv = new TextDecoder("utf-8", { ignoreBOM: true }).decode(buf);
      assert.equal(csv.charCodeAt(0), 0xfeff);
      assert.ok(csv.trim().length > 10);
      assertNoSecretLeak(csv, [seededRawToken, seededTokenHash], `CSV ${reportType}`);
    }
  });

  it("S10: resists SQL injection across query params and escapes XSS payloads in admin SSR views", async () => {
    const ip = makeClientIp(18);
    const login = await loginAsAdmin(serverHandle.baseUrl, {
      email: qaAdmin.email,
      password: qaAdmin.password,
      clientIp: ip,
    });
    assert.equal(login.res.status, 200);
    const cookie = login.cookie.value;

    const sqliEndpoints = [
      "/api/admin/rsvps?q=%27%20OR%201%3D1--&sort=created_at%3BDROP%20TABLE%20rsvps--&order=DESC%3BSELECT%201&attendance=attending%27",
      "/api/admin/audit-logs?action=%27%20UNION%20SELECT%201--&q=%27%3BSELECT%20pg_sleep(0)--",
      "/api/admin/messages?q=%27%20OR%20%271%27%3D%271&sort=oldest%3B--",
      "/api/admin/catering?q=%27%20OR%201%3D1--&filter=all%27",
      "/api/admin/rsvps/not-a-valid-uuid",
    ];

    for (const ep of sqliEndpoints) {
      const res = await adminFetch(serverHandle.baseUrl, ep, {
        cookie,
        clientIp: ip,
      });
      assert.notEqual(res.status, 500, `SQLi probe triggered 500 on ${ep}`);
      const text = await res.text();
      assert.equal(
        /syntax error at or near|relation "rsvps"|invalid input syntax for type/i.test(text),
        false,
        `PostgreSQL error leaked on ${ep}`,
      );
    }

    // Seeded XSS payloads must be safely escaped in SSR HTML
    const ssrRoutes = [
      `/admin/guests/${seededInjectionId}`,
      "/admin/messages",
      "/admin/catering",
      "/admin/rsvps",
    ];
    for (const ssrPath of ssrRoutes) {
      const res = await adminFetch(serverHandle.baseUrl, ssrPath, {
        cookie,
        clientIp: ip,
      });
      assert.equal(res.status, 200, `Expected 200 on ${ssrPath}`);
      const html = await res.text();
      assert.equal(
        html.includes('<script>alert("xss")</script>'),
        false,
        `Unescaped <script> payload found in ${ssrPath}`,
      );
      assert.equal(
        html.includes("<img src=x onerror=alert(1)>"),
        false,
        `Unescaped <img onerror> payload found in ${ssrPath}`,
      );
    }
  });
});
