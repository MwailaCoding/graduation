import "./register-alias.mjs";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, describe, it } from "node:test";
import { startNextServer } from "./server-helper.mjs";

const { pool } = await import("../../src/lib/db.ts");
const { generateManagementToken } = await import("../../src/lib/rsvp/tokens.ts");

const TEST_PREFIX = "[QA-P7-SEC]";
const trackedBucketKeys = [];
const usedIps = new Set();

let server = null;
let closedServer = null;
let createdManageToken = null;

function getRateLimitPepper() {
  const configured = process.env.RATE_LIMIT_PEPPER?.trim();
  return configured && configured.length > 0
    ? configured
    : "mwaila-rsvp-v1-bucket-salt";
}

function trackIpBuckets(ip) {
  usedIps.add(ip);
  const pepper = getRateLimitPepper();
  for (const scope of ["create", "manage_read", "manage_update", "manage_failed"]) {
    const bucketKey = crypto
      .createHmac("sha256", pepper)
      .update(`${scope}:${ip}`, "utf8")
      .digest("hex");
    if (!trackedBucketKeys.includes(bucketKey)) {
      trackedBucketKeys.push(bucketKey);
    }
  }
}

function makeTestIp(suffix) {
  const ip = `198.51.100.${suffix}`;
  trackIpBuckets(ip);
  return ip;
}

describe("Phase 7 Live HTTP API & Security Audit Tests", () => {
  before(async () => {
    server = await startNextServer();
  });

  after(async () => {
    if (closedServer) {
      await closedServer.stop();
    }
    if (server) {
      await server.stop();
    }
    await pool.query("DELETE FROM rsvps WHERE full_name LIKE $1", [
      `${TEST_PREFIX}%`,
    ]);
    await pool.query("DELETE FROM rsvps WHERE phone_e164 LIKE '+254712991%'");
    if (trackedBucketKeys.length > 0) {
      await pool.query(
        "DELETE FROM rsvp_rate_limits WHERE bucket_key = ANY($1::char(64)[])",
        [trackedBucketKeys],
      );
    }
    await pool.end();
  });

  it("safely handles SQL injection payloads without SQL errors or table compromise", async () => {
    const ip = makeTestIp(10);
    const sqliPayload = "'; DROP TABLE rsvps; --";
    const res = await fetch(`${server.baseUrl}/api/rsvp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": ip,
      },
      body: JSON.stringify({
        fullName: `${TEST_PREFIX} ${sqliPayload}`,
        phoneCountry: "KE",
        phoneNumber: "0712991001",
        attendance: "attending",
        dietaryRequirements: `" OR 1=1; --`,
        congratulatoryMessage: `Robert'); DROP TABLE rsvps;--`,
        privacyAcknowledged: true,
        honeypot: "",
      }),
    });

    assert.equal(res.status, 201);
    const json = await res.json();
    assert.equal(json.ok, true);
    assert.equal(json.rsvp.fullName, `${TEST_PREFIX} ${sqliPayload}`);

    // Verify table still exists and stores literal parameterized value
    const countRes = await pool.query(
      "SELECT full_name FROM rsvps WHERE phone_e164 = '+254712991001'",
    );
    assert.equal(countRes.rowCount, 1);
    assert.equal(countRes.rows[0].full_name, `${TEST_PREFIX} ${sqliPayload}`);
  });

  it("escapes XSS payloads in JSON and SSR HTML on /rsvp/manage/[token]", async () => {
    const ip = makeTestIp(11);
    const xssName = `${TEST_PREFIX} <script>alert(1)</script>`;
    const xssDietary = `<img src=x onerror=alert(1)>`;
    const xssMessage = `</script><script>alert('xss')</script>`;

    const createRes = await fetch(`${server.baseUrl}/api/rsvp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": ip,
      },
      body: JSON.stringify({
        fullName: xssName,
        phoneCountry: "KE",
        phoneNumber: "0712991002",
        attendance: "attending",
        dietaryRequirements: xssDietary,
        congratulatoryMessage: xssMessage,
        privacyAcknowledged: true,
        honeypot: "",
      }),
    });

    assert.equal(createRes.status, 201);
    const createdJson = await createRes.json();
    assert.equal(createdJson.ok, true);
    createdManageToken = createdJson.managementPath.replace(/^\/rsvp\/manage\//, "");

    // Verify API GET returns raw JSON string (Content-Type: application/json)
    const manageApiRes = await fetch(`${server.baseUrl}/api/rsvp/manage`, {
      headers: {
        Authorization: `Bearer ${createdManageToken}`,
        "x-forwarded-for": ip,
      },
    });
    assert.equal(manageApiRes.status, 200);
    assert.match(manageApiRes.headers.get("content-type") || "", /application\/json/);
    const manageJson = await manageApiRes.json();
    assert.equal(manageJson.rsvp.fullName, xssName);

    // Verify SSR HTML on /rsvp/manage/[token] has NO unescaped <script>alert or <img src=x onerror=alert
    const pageRes = await fetch(
      `${server.baseUrl}/rsvp/manage/${createdManageToken}`,
      {
        headers: { "x-forwarded-for": ip },
      },
    );
    assert.equal(pageRes.status, 200);
    const html = await pageRes.text();

    assert.equal(html.includes("<script>alert(1)</script>"), false);
    assert.equal(html.includes("<script>alert('xss')</script>"), false);
    assert.equal(html.includes("<img src=x onerror=alert(1)>"), false);
    assert.equal(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"), true);
    assert.match(html, /Hello,\s*(?:<!--\s*-->)?\s*\[QA-P7-SEC\] &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  });

  it("rejects invalid, random, and modified management tokens with 404 and safe SSR page without enumeration", async () => {
    const ip = makeTestIp(12);
    const randomToken = generateManagementToken();
    const modifiedToken =
      (createdManageToken[0] === "A" ? "B" : "A") + createdManageToken.slice(1);

    for (const badToken of ["bad-short", randomToken, modifiedToken]) {
      const apiRes = await fetch(`${server.baseUrl}/api/rsvp/manage`, {
        headers: {
          Authorization: `Bearer ${badToken}`,
          "x-forwarded-for": ip,
        },
      });
      assert.equal(apiRes.status, 404);
      const body = await apiRes.json();
      assert.equal(body.ok, false);
      assert.equal(body.code, "INVALID_TOKEN");
      assert.equal(JSON.stringify(body).includes(createdManageToken), false);
      assert.equal(JSON.stringify(body).includes(TEST_PREFIX), false);
    }

    const ssrRes = await fetch(`${server.baseUrl}/rsvp/manage/${randomToken}`, {
      headers: { "x-forwarded-for": ip },
    });
    assert.equal(ssrRes.status, 200);
    const html = await ssrRes.text();
    assert.match(html, /couldn.?t verify your RSVP link/i);
    assert.equal(html.includes(TEST_PREFIX), false);
    assert.equal(html.includes(createdManageToken), false);
  });

  it("rejects honeypot submission with 400 without inserting DB row", async () => {
    const ip = makeTestIp(13);
    const res = await fetch(`${server.baseUrl}/api/rsvp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": ip,
      },
      body: JSON.stringify({
        fullName: `${TEST_PREFIX} Honeypot Bot`,
        phoneCountry: "KE",
        phoneNumber: "0712991003",
        attendance: "attending",
        privacyAcknowledged: true,
        honeypot: "https://bot.spam.invalid",
      }),
    });

    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.ok, false);
    assert.equal(json.code, "VALIDATION_ERROR");

    const dbCheck = await pool.query(
      "SELECT 1 FROM rsvps WHERE phone_e164 = '+254712991003'",
    );
    assert.equal(dbCheck.rowCount, 0);
  });

  it("rejects oversized JSON payload (>16KB) with 413 PAYLOAD_TOO_LARGE", async () => {
    const ip = makeTestIp(14);
    const largePayload = JSON.stringify({
      fullName: `${TEST_PREFIX} Large Payload`,
      phoneCountry: "KE",
      phoneNumber: "0712991004",
      attendance: "attending",
      congratulatoryMessage: "A".repeat(17 * 1024),
      privacyAcknowledged: true,
    });

    const res = await fetch(`${server.baseUrl}/api/rsvp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": ip,
      },
      body: largePayload,
    });

    assert.equal(res.status, 413);
    const json = await res.json();
    assert.equal(json.ok, false);
    assert.equal(json.code, "PAYLOAD_TOO_LARGE");
  });

  it("enforces rate limiting (429 RATE_LIMITED + Retry-After) on POST /api/rsvp (>10) and failed GET /api/rsvp/manage (>10)", async () => {
    const createIp = makeTestIp(20);
    for (let i = 1; i <= 10; i++) {
      const r = await fetch(`${server.baseUrl}/api/rsvp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": createIp,
        },
        body: JSON.stringify({ invalid: true }),
      });
      assert.equal(r.status, 400);
    }

    const blockedCreate = await fetch(`${server.baseUrl}/api/rsvp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": createIp,
      },
      body: JSON.stringify({ invalid: true }),
    });
    assert.equal(blockedCreate.status, 429);
    const retryAfterCreate = Number(blockedCreate.headers.get("retry-after"));
    assert.ok(Number.isFinite(retryAfterCreate) && retryAfterCreate > 0);
    const blockedCreateJson = await blockedCreate.json();
    assert.equal(blockedCreateJson.code, "RATE_LIMITED");

    const manageIp = makeTestIp(21);
    for (let i = 1; i <= 10; i++) {
      const r = await fetch(`${server.baseUrl}/api/rsvp/manage`, {
        headers: {
          Authorization: `Bearer ${generateManagementToken()}`,
          "x-forwarded-for": manageIp,
        },
      });
      assert.equal(r.status, 404);
    }

    const blockedManage = await fetch(`${server.baseUrl}/api/rsvp/manage`, {
      headers: {
        Authorization: `Bearer ${generateManagementToken()}`,
        "x-forwarded-for": manageIp,
      },
    });
    assert.equal(blockedManage.status, 429);
    const retryAfterManage = Number(blockedManage.headers.get("retry-after"));
    assert.ok(Number.isFinite(retryAfterManage) && retryAfterManage > 0);
    const blockedManageJson = await blockedManage.json();
    assert.equal(blockedManageJson.code, "RATE_LIMITED");
  });

  it("sets strict privacy headers on /api/rsvp/* and /rsvp/manage/*", async () => {
    const ip = makeTestIp(22);

    const apiRes = await fetch(`${server.baseUrl}/api/rsvp`, {
      headers: { "x-forwarded-for": ip },
    });
    assert.equal(apiRes.headers.get("cache-control"), "no-store, private");
    assert.equal(apiRes.headers.get("referrer-policy"), "no-referrer");

    const manageApiRes = await fetch(`${server.baseUrl}/api/rsvp/manage`, {
      headers: {
        Authorization: `Bearer ${createdManageToken}`,
        "x-forwarded-for": ip,
      },
    });
    assert.equal(manageApiRes.headers.get("cache-control"), "no-store, private");
    assert.equal(manageApiRes.headers.get("referrer-policy"), "no-referrer");

    const managePageRes = await fetch(
      `${server.baseUrl}/rsvp/manage/${createdManageToken}`,
      { headers: { "x-forwarded-for": ip } },
    );
    assert.equal(managePageRes.headers.get("cache-control"), "no-store, private");
    assert.equal(managePageRes.headers.get("referrer-policy"), "no-referrer");
    assert.equal(managePageRes.headers.get("x-robots-tag"), "noindex, nofollow");
  });

  it("enforces RSVP closure across API and SSR pages when clock >= 2026-12-12T00:00:00+03:00", async () => {
    closedServer = await startNextServer({
      RSVP_SIMULATED_NOW_ISO: "2026-12-12T00:00:00+03:00",
    });
    const ip = makeTestIp(23);

    // 1. GET /api/rsvp
    const statusRes = await fetch(`${closedServer.baseUrl}/api/rsvp`, {
      headers: { "x-forwarded-for": ip },
    });
    assert.equal(statusRes.status, 200);
    const statusJson = await statusRes.json();
    assert.equal(statusJson.isClosed, true);

    // 2. POST /api/rsvp -> 403 RSVP_CLOSED
    const postRes = await fetch(`${closedServer.baseUrl}/api/rsvp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": ip,
      },
      body: JSON.stringify({
        fullName: `${TEST_PREFIX} Late Guest`,
        phoneCountry: "KE",
        phoneNumber: "0712991005",
        attendance: "attending",
        privacyAcknowledged: true,
      }),
    });
    assert.equal(postRes.status, 403);
    const postJson = await postRes.json();
    assert.equal(postJson.code, "RSVP_CLOSED");

    // 3. PATCH /api/rsvp/manage -> 403 RSVP_CLOSED
    const patchRes = await fetch(`${closedServer.baseUrl}/api/rsvp/manage`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${createdManageToken}`,
        "x-forwarded-for": ip,
      },
      body: JSON.stringify({
        fullName: `${TEST_PREFIX} Late Update`,
        phoneCountry: "KE",
        phoneNumber: "0712991002",
        attendance: "declining",
      }),
    });
    assert.equal(patchRes.status, 403);
    const patchJson = await patchRes.json();
    assert.equal(patchJson.code, "RSVP_CLOSED");

    // 4. Homepage HTML contains "RSVPs are now closed."
    const homeRes = await fetch(`${closedServer.baseUrl}/`, {
      headers: { "x-forwarded-for": ip },
    });
    assert.equal(homeRes.status, 200);
    const homeHtml = await homeRes.text();
    assert.equal(homeHtml.includes("RSVPs are now closed."), true);

    // 5. /rsvp/manage/<token> renders closed read-only view with no Save Changes button
    const managePageRes = await fetch(
      `${closedServer.baseUrl}/rsvp/manage/${createdManageToken}`,
      { headers: { "x-forwarded-for": ip } },
    );
    assert.equal(managePageRes.status, 200);
    const manageHtml = await managePageRes.text();
    assert.equal(manageHtml.includes("RSVPs are now closed."), true);
    assert.equal(manageHtml.includes("Your Recorded Response"), true);
    assert.equal(manageHtml.includes("Save Changes"), false);
  });
});
