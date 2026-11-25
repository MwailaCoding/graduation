import "../phase7/register-alias.mjs";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { startNextServer } from "../phase7/server-helper.mjs";

const { pool } = await import("../../src/lib/db.ts");
const {
  validatePasswordStrength,
  hashPassword,
  verifyPassword,
  verifyDummyPasswordTiming,
} = await import("../../src/lib/admin/password.ts");
const {
  sanitizeAuditText,
  redactAuditMetadata,
  hashAuditClientKey,
} = await import("../../src/lib/admin/audit.ts");
const { getEffectiveRsvpPolicy } = await import("../../src/lib/admin/settings.ts");

function extractSessionCookie(res) {
  const setCookies =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [];
  const raw = setCookies.find((entry) =>
    entry.startsWith("mwaila_admin_session="),
  );
  if (!raw) {
    return null;
  }
  const valuePart = raw.split(";")[0];
  return { raw, cookieHeader: valuePart };
}

function runBootstrapCli(args) {
  const scriptPath = path.resolve(process.cwd(), "database", "bootstrap-admin.mjs");
  try {
    const stdout = execFileSync(process.execPath, [scriptPath, ...args], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { exitCode: 0, stdout, stderr: "" };
  } catch (err) {
    return {
      exitCode: typeof err?.status === "number" ? err.status : 1,
      stdout: typeof err?.stdout === "string" ? err.stdout : "",
      stderr: typeof err?.stderr === "string" ? err.stderr : "",
    };
  }
}

describe("Phase 8 M1 Foundation — Auth, Audit, Settings, Policy & Security API", () => {
  const testRunId = crypto.randomBytes(4).toString("hex");
  const pwEntropy = crypto.randomBytes(4).toString("hex");
  const testAdminEmail = `m1-test-${testRunId}@example.com`;
  const testAdminName = `M1 Test Admin ${testRunId}`;
  const initialStrongPassword = `GradCeremony!2026#${pwEntropy}`;
  const rotatedStrongPassword = `GradRotated!9988#${pwEntropy}`;
  const testRsvpPhone = `0712${String(Math.floor(100000 + Math.random() * 899999)).slice(0, 6)}`;
  const testClientIpBrute = `198.51.100.${10 + (Number.parseInt(testRunId.slice(0, 2), 16) % 200)}`;
  const testClientIpFlow = `203.0.113.${10 + (Number.parseInt(testRunId.slice(2, 4), 16) % 200)}`;

  let createdAdminId = null;
  let createdRsvpPhoneE164 = null;
  let server = null;

  before(async () => {
    // Ensure a clean event_settings baseline before tests
    await pool.query(`
      UPDATE event_settings
      SET
        rsvp_accepting_responses = TRUE,
        allow_guest_self_editing = TRUE,
        closure_deadline_at = '2026-12-12T00:00:00+03:00'::timestamptz,
        manual_override_reason = NULL,
        updated_by_admin_id = NULL,
        updated_at = NOW()
      WHERE id = 1
    `);
  });

  after(async () => {
    if (server) {
      await server.stop();
      server = null;
    }

    // Restore event_settings baseline
    await pool.query(`
      UPDATE event_settings
      SET
        rsvp_accepting_responses = TRUE,
        allow_guest_self_editing = TRUE,
        closure_deadline_at = '2026-12-12T00:00:00+03:00'::timestamptz,
        manual_override_reason = NULL,
        updated_by_admin_id = NULL,
        updated_at = NOW()
      WHERE id = 1
    `).catch(() => {});

    if (createdRsvpPhoneE164) {
      await pool
        .query("DELETE FROM rsvps WHERE phone_e164 = $1", [createdRsvpPhoneE164])
        .catch(() => {});
    }

    await pool
      .query(
        "DELETE FROM admin_audit_logs WHERE actor_identifier = $1 OR actor_admin_id = $2",
        [testAdminEmail, createdAdminId],
      )
      .catch(() => {});

    if (createdAdminId) {
      await pool
        .query("DELETE FROM admin_users WHERE id = $1::uuid", [createdAdminId])
        .catch(() => {});
    } else {
      await pool
        .query("DELETE FROM admin_users WHERE email = $1", [testAdminEmail])
        .catch(() => {});
    }

    await pool
      .query("DELETE FROM rsvp_rate_limits WHERE scope IN ('admin_login', 'admin_login_failed', 'create', 'manage_read', 'manage_update', 'manage_failed')")
      .catch(() => {});

    await pool.end().catch(() => {});
  });

  describe("1. Password hashing & policy (src/lib/admin/password.ts)", () => {
    it("enforces strong password requirements and rejects weak or context-derived passwords", () => {
      assert.equal(validatePasswordStrength("Short1!").valid, false);
      assert.equal(validatePasswordStrength("alllowercase123!").valid, false);
      assert.equal(validatePasswordStrength("ALLUPPERCASE123!").valid, false);
      assert.equal(validatePasswordStrength("NoDigitsHere!!").valid, false);
      assert.equal(validatePasswordStrength("NoSpecialChars123").valid, false);
      assert.equal(validatePasswordStrength(" LeadingSpace123!").valid, false);
      assert.equal(validatePasswordStrength("password123!").valid, false);
      assert.equal(
        validatePasswordStrength(`MyPass_${testAdminEmail}`, {
          email: testAdminEmail,
        }).valid,
        false,
      );
      assert.equal(
        validatePasswordStrength("StrongPass!Mwaila1", {
          displayName: "Mwaila Organizer",
        }).valid,
        false,
      );

      assert.equal(
        validatePasswordStrength(initialStrongPassword, {
          email: testAdminEmail,
          displayName: testAdminName,
        }).valid,
        true,
      );
    });

    it("hashes with scrypt$<salt>$<hash> and verifies in constant time", async () => {
      const hash = await hashPassword(initialStrongPassword);
      assert.match(hash, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);

      assert.equal(await verifyPassword(initialStrongPassword, hash), true);
      assert.equal(await verifyPassword(`${initialStrongPassword}x`, hash), false);
      assert.equal(await verifyPassword("", hash), false);
      assert.equal(await verifyPassword(initialStrongPassword, "invalid-hash"), false);

      await verifyDummyPasswordTiming(initialStrongPassword);
    });
  });

  describe("2. Audit redaction helpers (src/lib/admin/audit.ts)", () => {
    it("redacts secrets, tokens, hashes, DB URLs, and PII keys", () => {
      const sanitized = sanitizeAuditText(
        "Bearer secretToken123 /rsvp/manage/abcDEF1234567890_ghijKM scrypt$0011$2233 postgresql://user:pass@localhost:5432/db",
      );
      assert.equal(sanitized.includes("secretToken123"), false);
      assert.equal(sanitized.includes("abcDEF1234567890"), false);
      assert.equal(sanitized.includes("user:pass"), false);
      assert.ok(sanitized.includes("[REDACTED]"));
      assert.ok(sanitized.includes("[REDACTED_HASH]"));
      assert.ok(sanitized.includes("[REDACTED_DB_URL]"));

      const metadata = redactAuditMetadata({
        password: "SuperSecretPassword1!",
        newPassword: "AnotherSecretPassword1!",
        sessionToken: "raw-token-value",
        authorization: "Bearer xyz",
        phoneE164: "+254712345678",
        dietaryRequirements: "No nuts",
        congratulatoryMessage: "Congrats!",
        rawIp: "192.0.2.1",
        safeField: "ok",
      });

      assert.equal(metadata.password, "[REDACTED]");
      assert.equal(metadata.newPassword, "[REDACTED]");
      assert.equal(metadata.sessionToken, "[REDACTED]");
      assert.equal(metadata.authorization, "[REDACTED]");
      assert.equal(metadata.phoneE164, "[REDACTED]");
      assert.equal(metadata.dietaryRequirements, "[REDACTED]");
      assert.equal(metadata.congratulatoryMessage, "[REDACTED]");
      assert.equal(metadata.rawIp, "[REDACTED]");
      assert.equal(metadata.safeField, "ok");

      const ipHash = hashAuditClientKey("192.0.2.1");
      assert.match(ipHash ?? "", /^[0-9a-f]{64}$/);
      assert.equal(hashAuditClientKey(""), null);
    });
  });

  describe("3. Non-public CLI bootstrapper (database/bootstrap-admin.mjs)", () => {
    it("rejects weak passwords, creates admin + audit row once, and prevents duplicates", async () => {
      const weakRes = runBootstrapCli([
        `--email=${testAdminEmail}`,
        "--password=Weak",
        `--name=${testAdminName}`,
      ]);
      assert.equal(weakRes.exitCode, 1);

      const createRes = runBootstrapCli([
        `--email=${testAdminEmail}`,
        `--password=${initialStrongPassword}`,
        `--name=${testAdminName}`,
      ]);
      assert.equal(createRes.exitCode, 0, createRes.stderr);
      assert.equal(createRes.stdout.includes(initialStrongPassword), false);

      const userRows = await pool.query(
        "SELECT id, email, display_name, role, is_active FROM admin_users WHERE email = $1",
        [testAdminEmail],
      );
      assert.equal(userRows.rowCount, 1);
      createdAdminId = userRows.rows[0].id;
      assert.equal(userRows.rows[0].role, "admin");
      assert.equal(userRows.rows[0].is_active, true);

      const auditRows = await pool.query(
        "SELECT action, target_type, target_id, summary FROM admin_audit_logs WHERE actor_admin_id = $1 AND action = 'admin.bootstrap'",
        [createdAdminId],
      );
      assert.equal(auditRows.rowCount, 1);

      // Re-running with same email must skip without creating duplicates or failing
      const dupRes = runBootstrapCli([
        `--email=${testAdminEmail}`,
        `--password=${rotatedStrongPassword}`,
        `--name=${testAdminName}`,
      ]);
      assert.equal(dupRes.exitCode, 0, dupRes.stderr);
      assert.match(dupRes.stdout, /already exists/i);

      const countRows = await pool.query(
        "SELECT COUNT(*)::int AS cnt FROM admin_users WHERE email = $1",
        [testAdminEmail],
      );
      assert.equal(countRows.rows[0].cnt, 1);
    });
  });

  describe("4. Effective RSVP Policy (src/lib/admin/settings.ts)", () => {
    it("respects deadline boundary, manual pause, and self-editing toggles", async () => {
      const openPolicy = await getEffectiveRsvpPolicy({
        now: new Date("2026-12-11T23:59:59+03:00"),
      });
      assert.equal(openPolicy.isClosed, false);
      assert.equal(openPolicy.isDeadlinePassed, false);
      assert.equal(openPolicy.isAcceptingNewRsvps, true);
      assert.equal(openPolicy.isSelfEditingAllowed, true);
      assert.equal(openPolicy.closedReason, null);

      const closedAtDeadline = await getEffectiveRsvpPolicy({
        now: new Date("2026-12-12T00:00:00+03:00"),
      });
      assert.equal(closedAtDeadline.isClosed, true);
      assert.equal(closedAtDeadline.isDeadlinePassed, true);
      assert.equal(closedAtDeadline.isAcceptingNewRsvps, false);
      assert.equal(closedAtDeadline.isSelfEditingAllowed, false);
      assert.equal(closedAtDeadline.closedReason, "deadline_passed");
    });
  });

  describe("5. Live next start HTTP Security, Auth, CSRF, Profile, Audit & Settings API", () => {
    let sessionACookie = null;
    let sessionBCookie = null;
    let guestManagePath = null;

    before(async () => {
      server = await startNextServer();
    });

    it("redirects unauthenticated /admin and rejects unauthenticated /api/admin/* with strict security headers", async () => {
      const pageRes = await fetch(`${server.baseUrl}/admin`, {
        redirect: "manual",
      });
      assert.equal(pageRes.status, 307);
      assert.match(pageRes.headers.get("location") ?? "", /\/admin\/login$/);
      assert.match(pageRes.headers.get("cache-control") ?? "", /no-store/i);
      assert.equal(pageRes.headers.get("referrer-policy"), "no-referrer");
      assert.equal(pageRes.headers.get("x-robots-tag"), "noindex, nofollow");

      for (const endpoint of [
        "/api/admin/auth/session",
        "/api/admin/profile",
        "/api/admin/audit-logs",
        "/api/admin/settings",
      ]) {
        const res = await fetch(`${server.baseUrl}${endpoint}`);
        assert.equal(res.status, 401, `Expected 401 on ${endpoint}`);
        assert.match(res.headers.get("cache-control") ?? "", /no-store/i);
        assert.equal(res.headers.get("referrer-policy"), "no-referrer");
        assert.equal(res.headers.get("x-robots-tag"), "noindex, nofollow");
        const json = await res.json();
        assert.equal(json.ok, false);
        assert.equal(json.code, "UNAUTHENTICATED");
      }

      const unauthLogout = await fetch(`${server.baseUrl}/api/admin/auth/logout`, {
        method: "POST",
        headers: { Origin: server.baseUrl },
      });
      assert.equal(unauthLogout.status, 401);
    });

    it("enforces login rate limiting after repeated failed attempts", async () => {
      let lastRes = null;
      for (let i = 0; i < 6; i += 1) {
        lastRes = await fetch(`${server.baseUrl}/api/admin/auth/login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: server.baseUrl,
            "X-Forwarded-For": testClientIpBrute,
          },
          body: JSON.stringify({
            email: testAdminEmail,
            password: `WrongPassword!${i}`,
          }),
        });
        if (i < 5) {
          assert.equal(lastRes.status, 401);
        }
      }

      assert.equal(lastRes.status, 429);
      assert.ok(lastRes.headers.get("retry-after"));
      const body = await lastRes.json();
      assert.equal(body.code, "RATE_LIMITED");
    });

    it("sets Secure/HttpOnly/SameSite=Lax cookie on login and blocks CSRF cross-origin mutations", async () => {
      const loginA = await fetch(`${server.baseUrl}/api/admin/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: server.baseUrl,
          "X-Forwarded-For": testClientIpFlow,
        },
        body: JSON.stringify({
          email: testAdminEmail,
          password: initialStrongPassword,
        }),
      });
      assert.equal(loginA.status, 200);
      const cookieA = extractSessionCookie(loginA);
      assert.ok(cookieA);
      assert.match(cookieA.raw, /HttpOnly/i);
      assert.match(cookieA.raw, /SameSite=Lax/i);
      assert.match(cookieA.raw, /Path=\//i);
      assert.match(cookieA.raw, /Secure/i);
      sessionACookie = cookieA.cookieHeader;

      const loginAData = await loginA.json();
      assert.equal(loginAData.ok, true);
      assert.equal(loginAData.admin.email, testAdminEmail);
      assert.equal(loginAData.admin.passwordHash, undefined);

      // Second concurrent login -> Session B
      const loginB = await fetch(`${server.baseUrl}/api/admin/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: server.baseUrl,
          "X-Forwarded-For": testClientIpFlow,
        },
        body: JSON.stringify({
          email: testAdminEmail,
          password: initialStrongPassword,
        }),
      });
      assert.equal(loginB.status, 200);
      const cookieB = extractSessionCookie(loginB);
      assert.ok(cookieB);
      sessionBCookie = cookieB.cookieHeader;

      // Cross-origin Origin rejected with 403 CSRF_REJECTED
      const csrfRes = await fetch(`${server.baseUrl}/api/admin/profile`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: sessionACookie,
          Origin: "https://evil.example",
        },
        body: JSON.stringify({ displayName: "Hijacked" }),
      });
      assert.equal(csrfRes.status, 403);
      const csrfJson = await csrfRes.json();
      assert.equal(csrfJson.code, "CSRF_REJECTED");

      // Sec-Fetch-Site: cross-site rejected even without Origin
      const fetchSiteRes = await fetch(`${server.baseUrl}/api/admin/auth/logout`, {
        method: "POST",
        headers: {
          Cookie: sessionACookie,
          "Sec-Fetch-Site": "cross-site",
        },
      });
      assert.equal(fetchSiteRes.status, 403);
    });

    it("updates profile & password, revokes other sessions, and logs audit events without secrets", async () => {
      const sessRes = await fetch(`${server.baseUrl}/api/admin/auth/session`, {
        headers: { Cookie: sessionACookie },
      });
      assert.equal(sessRes.status, 200);
      const sessJson = await sessRes.json();
      assert.equal(sessJson.ok, true);
      assert.equal(sessJson.admin.email, testAdminEmail);

      const patchProfile = await fetch(`${server.baseUrl}/api/admin/profile`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: sessionACookie,
          Origin: server.baseUrl,
        },
        body: JSON.stringify({
          displayName: "Updated Organizer Name",
          currentPassword: initialStrongPassword,
          newPassword: rotatedStrongPassword,
          confirmPassword: rotatedStrongPassword,
        }),
      });
      assert.equal(patchProfile.status, 200);
      const patchJson = await patchProfile.json();
      assert.equal(patchJson.ok, true);
      assert.equal(patchJson.admin.displayName, "Updated Organizer Name");
      assert.equal(patchJson.otherSessionsRevoked, 1);

      // Session B must now be revoked (401)
      const revokedSessionB = await fetch(
        `${server.baseUrl}/api/admin/auth/session`,
        { headers: { Cookie: sessionBCookie } },
      );
      assert.equal(revokedSessionB.status, 401);

      // Session A must remain active
      const activeSessionA = await fetch(
        `${server.baseUrl}/api/admin/auth/session`,
        { headers: { Cookie: sessionACookie } },
      );
      assert.equal(activeSessionA.status, 200);

      // Audit logs endpoint returns paginated items + availableActions without secret leakage
      const auditRes = await fetch(
        `${server.baseUrl}/api/admin/audit-logs?page=1&pageSize=25`,
        { headers: { Cookie: sessionACookie } },
      );
      assert.equal(auditRes.status, 200);
      const auditJson = await auditRes.json();
      assert.equal(auditJson.ok, true);
      assert.ok(Array.isArray(auditJson.items));
      assert.ok(Array.isArray(auditJson.availableActions));
      assert.ok(auditJson.items.some((item) => item.action === "admin.password_change"));

      const serializedAudit = JSON.stringify(auditJson);
      assert.equal(serializedAudit.includes(initialStrongPassword), false);
      assert.equal(serializedAudit.includes(rotatedStrongPassword), false);
      assert.equal(serializedAudit.includes("scrypt$"), false);
    });

    it("governs public /api/rsvp and /api/rsvp/manage via /api/admin/settings toggles", async () => {
      // 1. Read admin settings & confirm locked event details and zero secret leakage
      const getSettings = await fetch(`${server.baseUrl}/api/admin/settings`, {
        headers: { Cookie: sessionACookie },
      });
      assert.equal(getSettings.status, 200);
      const settingsJson = await getSettings.json();
      assert.equal(settingsJson.ok, true);
      assert.equal(
        settingsJson.eventDetails.graduates[1].name,
        "Florence Achala Mwaila",
      );
      assert.equal(
        settingsJson.eventDetails.graduates[1].degree,
        "Bachelor's Degree in French and Sociology",
      );
      assert.equal(settingsJson.systemHealth.dbConnected, true);
      assert.equal(JSON.stringify(settingsJson).includes("postgresql://"), false);

      // 2. Create a guest RSVP while open
      const createGuest = await fetch(`${server.baseUrl}/api/rsvp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": testClientIpFlow,
        },
        body: JSON.stringify({
          fullName: "M1 Policy Test Guest",
          phoneCountry: "KE",
          phoneNumber: testRsvpPhone,
          attendance: "attending",
          dietaryRequirements: "Vegetarian",
          congratulatoryMessage: "Congratulations!",
          privacyAcknowledged: true,
        }),
      });
      assert.equal(createGuest.status, 201);
      const guestCreated = await createGuest.json();
      createdRsvpPhoneE164 = guestCreated.rsvp.phoneE164;
      guestManagePath = guestCreated.managementPath;
      const guestToken = guestManagePath.split("/").pop();

      // 3. Pause new RSVPs while keeping self-editing enabled
      const pauseRes = await fetch(`${server.baseUrl}/api/admin/settings`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: sessionACookie,
          Origin: server.baseUrl,
        },
        body: JSON.stringify({
          rsvpAcceptingResponses: false,
          allowGuestSelfEditing: true,
          manualOverrideReason: "Testing manual pause",
        }),
      });
      assert.equal(pauseRes.status, 200);
      const pauseJson = await pauseRes.json();
      assert.equal(pauseJson.effectivePolicy.isClosed, true);
      assert.equal(pauseJson.effectivePolicy.isAcceptingNewRsvps, false);
      assert.equal(pauseJson.effectivePolicy.isSelfEditingAllowed, true);

      const publicStatusPaused = await fetch(`${server.baseUrl}/api/rsvp`);
      const publicStatusPausedJson = await publicStatusPaused.json();
      assert.equal(publicStatusPausedJson.isClosed, true);

      const blockedNewRsvp = await fetch(`${server.baseUrl}/api/rsvp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": testClientIpFlow,
        },
        body: JSON.stringify({
          fullName: "Blocked Guest",
          phoneCountry: "KE",
          phoneNumber: "0799887766",
          attendance: "attending",
          privacyAcknowledged: true,
        }),
      });
      assert.equal(blockedNewRsvp.status, 403);

      // Guest self-editing must still succeed while allowGuestSelfEditing === true
      const editAllowed = await fetch(`${server.baseUrl}/api/rsvp/manage`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${guestToken}`,
          "X-Forwarded-For": testClientIpFlow,
        },
        body: JSON.stringify({
          fullName: "M1 Policy Test Guest Updated",
          phoneCountry: "KE",
          phoneNumber: testRsvpPhone,
          attendance: "attending",
          dietaryRequirements: "Vegan",
        }),
      });
      assert.equal(editAllowed.status, 200);

      // 4. Re-open new RSVPs, disable guest self-editing
      const disableSelfEdit = await fetch(`${server.baseUrl}/api/admin/settings`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: sessionACookie,
          Origin: server.baseUrl,
        },
        body: JSON.stringify({
          rsvpAcceptingResponses: true,
          allowGuestSelfEditing: false,
          manualOverrideReason: null,
        }),
      });
      assert.equal(disableSelfEdit.status, 200);

      const manageReadBlocked = await fetch(`${server.baseUrl}/api/rsvp/manage`, {
        headers: {
          Authorization: `Bearer ${guestToken}`,
          "X-Forwarded-For": testClientIpFlow,
        },
      });
      assert.equal(manageReadBlocked.status, 200);
      const manageReadJson = await manageReadBlocked.json();
      assert.equal(manageReadJson.isClosed, true);

      const manageEditBlocked = await fetch(`${server.baseUrl}/api/rsvp/manage`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${guestToken}`,
          "X-Forwarded-For": testClientIpFlow,
        },
        body: JSON.stringify({
          fullName: "Blocked Edit",
          phoneCountry: "KE",
          phoneNumber: testRsvpPhone,
          attendance: "declining",
        }),
      });
      assert.equal(manageEditBlocked.status, 403);

      // 5. Restore settings to open
      const restoreRes = await fetch(`${server.baseUrl}/api/admin/settings`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: sessionACookie,
          Origin: server.baseUrl,
        },
        body: JSON.stringify({
          rsvpAcceptingResponses: true,
          allowGuestSelfEditing: true,
          manualOverrideReason: null,
        }),
      });
      assert.equal(restoreRes.status, 200);
    });

    it("revokes session and clears cookie on POST /api/admin/auth/logout (no body required)", async () => {
      const logoutRes = await fetch(`${server.baseUrl}/api/admin/auth/logout`, {
        method: "POST",
        headers: {
          Cookie: sessionACookie,
          Origin: server.baseUrl,
        },
      });
      assert.equal(logoutRes.status, 200);
      const clearedCookie = extractSessionCookie(logoutRes);
      assert.ok(clearedCookie);
      assert.match(clearedCookie.raw, /Max-Age=0/i);

      const postLogoutSession = await fetch(
        `${server.baseUrl}/api/admin/auth/session`,
        {
          headers: { Cookie: sessionACookie },
        },
      );
      assert.equal(postLogoutSession.status, 401);
    });
  });
});
