import "../phase7/register-alias.mjs";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import {
  assertNoSecretLeak,
  captureBaseline,
  cleanupQaPhase8Data,
  delay,
  ensureEnvLoaded,
  getDbPool,
  loginAsAdmin,
  provisionQaAdmin,
  resolveBaseUrl,
  tableExists,
  adminFetch,
} from "./lib/admin-helpers.mjs";

const { getRsvpByToken } = await import("../../src/lib/rsvp/service.ts");
const { hashManagementToken } = await import("../../src/lib/rsvp/tokens.ts");

const TEST_PREFIX = "[QA-P8-DB]";
const PHONE_PREFIX = "+2547189800";

let pool = null;
let serverHandle = null;
let qaAdmin = null;
let baseline = null;
let adminCookie = null;

const createdRsvpIds = [];
const usedClientIps = [];

let manualRsvpId = null;
let mergedArchivedWebToken = null;

function makeClientIp(lastOctet) {
  const ip = `198.51.100.${lastOctet}`;
  if (!usedClientIps.includes(ip)) {
    usedClientIps.push(ip);
  }
  return ip;
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

describe("Phase 8 Live PostgreSQL Single-Source-of-Truth Integration Tests", { concurrency: false }, () => {
  before(async () => {
    ensureEnvLoaded();
    const db = await getDbPool();
    pool = db.pool;
    const connected = await db.checkDatabaseConnection();
    assert.equal(connected, true, "PostgreSQL connection must be healthy");

    baseline = await captureBaseline(pool);
    qaAdmin = await provisionQaAdmin(pool, { label: "db" });
    serverHandle = await resolveBaseUrl();

    const ip = makeClientIp(20);
    const login = await loginAsAdmin(serverHandle.baseUrl, {
      email: qaAdmin.email,
      password: qaAdmin.password,
      clientIp: ip,
    });
    assert.equal(login.res.status, 200, "QA admin login must succeed in before()");
    adminCookie = login.cookie?.value;
    assert.ok(adminCookie, "Expected session cookie on login");
  });

  after(async () => {
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
  });

  it("D1: verifies 002_admin_dashboard.sql tables, columns, singleton event_settings, and Phase 7 CHECK constraints", async () => {
    for (const table of [
      "admin_users",
      "admin_sessions",
      "admin_audit_logs",
      "event_settings",
      "rsvps",
    ]) {
      assert.equal(await tableExists(pool, table), true, `Expected table ${table} to exist`);
    }

    const settingsRes = await pool.query("SELECT id FROM event_settings WHERE id = 1");
    assert.equal(settingsRes.rowCount, 1, "Expected singleton event_settings row id=1");

    const colsRes = await pool.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'rsvps'`,
    );
    const colNames = new Set(colsRes.rows.map((r) => r.column_name));
    for (const expectedCol of [
      "created_by_admin_id",
      "updated_by_admin_id",
      "duplicate_group_id",
      "merged_into_rsvp_id",
      "duplicate_reviewed_at",
      "duplicate_reviewed_by_admin_id",
      "duplicate_review_note",
    ]) {
      assert.equal(colNames.has(expectedCol), true, `Missing additive rsvps column ${expectedCol}`);
    }

    const validHash = hashManagementToken("qa-p8-d1-constraint-probe");

    // 1. Declining with attendee_count = 1 must fail 23514
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO rsvps (full_name, phone_e164, phone_country, attendance_status, attendee_count, privacy_acknowledged, management_token_hash, retention_expires_at)
           VALUES ($1, '+254718980048', 'KE', 'declining', 1, TRUE, $2, '2027-03-12T00:00:00+03:00')`,
          [`${TEST_PREFIX} Constraint 1`, validHash],
        ),
      (err) => err?.code === "23514",
    );

    // 2. Declining with non-null dietary must fail 23514
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO rsvps (full_name, phone_e164, phone_country, attendance_status, attendee_count, dietary_requirements, privacy_acknowledged, management_token_hash, retention_expires_at)
           VALUES ($1, '+254718980048', 'KE', 'declining', 0, 'Vegan', TRUE, $2, '2027-03-12T00:00:00+03:00')`,
          [`${TEST_PREFIX} Constraint 2`, validHash],
        ),
      (err) => err?.code === "23514",
    );

    // 3. privacy_acknowledged = FALSE must fail 23514
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO rsvps (full_name, phone_e164, phone_country, attendance_status, attendee_count, privacy_acknowledged, management_token_hash, retention_expires_at)
           VALUES ($1, '+254718980048', 'KE', 'attending', 1, FALSE, $2, '2027-03-12T00:00:00+03:00')`,
          [`${TEST_PREFIX} Constraint 3`, validHash],
        ),
      (err) => err?.code === "23514",
    );

    // 4. Active row with NULL management_token_hash must fail 23514
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO rsvps (full_name, phone_e164, phone_country, attendance_status, attendee_count, privacy_acknowledged, management_token_hash, retention_expires_at)
           VALUES ($1, '+254718980048', 'KE', 'attending', 1, TRUE, NULL, '2027-03-12T00:00:00+03:00')`,
          [`${TEST_PREFIX} Constraint 4`],
        ),
      (err) => err?.code === "23514",
    );
  });

  it("D2: single source of truth — public RSVP submissions increment Admin Overview KPIs and appear in /api/admin/rsvps", async () => {
    const ip = makeClientIp(21);
    const beforeRes = await adminFetch(serverHandle.baseUrl, "/api/admin/overview", {
      cookie: adminCookie,
      clientIp: ip,
    });
    assert.equal(beforeRes.status, 200);
    const beforeOverview = await beforeRes.json();

    // Submit 1 attending + 1 declining via public POST /api/rsvp
    const pub1Res = await adminFetch(serverHandle.baseUrl, "/api/rsvp", {
      method: "POST",
      clientIp: ip,
      body: {
        fullName: `${TEST_PREFIX} Web Attending`,
        phoneCountry: "KE",
        phoneNumber: "0718980001",
        attendance: "attending",
        dietaryRequirements: "Vegan",
        congratulatoryMessage: `${TEST_PREFIX} Joy`,
        privacyAcknowledged: true,
        honeypot: "",
      },
    });
    assert.equal(pub1Res.status, 201);
    await trackRsvpByPhone(`${PHONE_PREFIX}01`);

    const pub2Res = await adminFetch(serverHandle.baseUrl, "/api/rsvp", {
      method: "POST",
      clientIp: ip,
      body: {
        fullName: `${TEST_PREFIX} Web Declining`,
        phoneCountry: "KE",
        phoneNumber: "0718980002",
        attendance: "declining",
        dietaryRequirements: "",
        congratulatoryMessage: `${TEST_PREFIX} Best wishes`,
        privacyAcknowledged: true,
        honeypot: "",
      },
    });
    assert.equal(pub2Res.status, 201);
    await trackRsvpByPhone(`${PHONE_PREFIX}02`);

    const afterRes = await adminFetch(serverHandle.baseUrl, "/api/admin/overview", {
      cookie: adminCookie,
      clientIp: ip,
    });
    assert.equal(afterRes.status, 200);
    const afterOverview = await afterRes.json();

    assert.equal(afterOverview.totalResponses, beforeOverview.totalResponses + 2);
    assert.equal(afterOverview.attendingCount, beforeOverview.attendingCount + 1);
    assert.equal(afterOverview.decliningCount, beforeOverview.decliningCount + 1);
    assert.equal(afterOverview.withDietaryCount, beforeOverview.withDietaryCount + 1);
    assert.equal(afterOverview.withMessageCount, beforeOverview.withMessageCount + 2);

    const expectedRate =
      afterOverview.totalResponses > 0
        ? (afterOverview.attendingCount / afterOverview.totalResponses) * 100
        : 0;
    assert.ok(
      Math.abs(afterOverview.attendanceRatePct - expectedRate) <= 0.15,
      `Expected attendanceRatePct ~${expectedRate}, got ${afterOverview.attendanceRatePct}`,
    );

    const listRes = await adminFetch(
      serverHandle.baseUrl,
      `/api/admin/rsvps?q=${encodeURIComponent(TEST_PREFIX)}`,
      { cookie: adminCookie, clientIp: ip },
    );
    assert.equal(listRes.status, 200);
    const listJson = await listRes.json();
    const names = listJson.items.map((item) => item.fullName);
    assert.equal(names.includes(`${TEST_PREFIX} Web Attending`), true);
    assert.equal(names.includes(`${TEST_PREFIX} Web Declining`), true);
    for (const item of listJson.items) {
      if (item.fullName.startsWith(TEST_PREFIX)) {
        assert.equal(item.submissionSource, "web");
      }
    }
  });

  it("D3: creates manual RSVP with admin_manual source, E.164 normalization, internal token hash, and blank-dietary catering parity", async () => {
    const ip = makeClientIp(22);
    const beforeCateringRes = await adminFetch(
      serverHandle.baseUrl,
      "/api/admin/catering",
      { cookie: adminCookie, clientIp: ip },
    );
    assert.equal(beforeCateringRes.status, 200);
    const beforeCatering = await beforeCateringRes.json();

    const createRes = await adminFetch(serverHandle.baseUrl, "/api/admin/rsvps", {
      method: "POST",
      cookie: adminCookie,
      clientIp: ip,
      body: {
        fullName: `${TEST_PREFIX} Manual Guest`,
        phoneCountry: "KE",
        phoneNumber: "0718 980 003",
        attendance: "attending",
        dietaryRequirements: "",
        congratulatoryMessage: `${TEST_PREFIX} Congrats`,
        organizerNotes: `${TEST_PREFIX} Phone call`,
      },
    });
    assert.ok(
      createRes.status === 201 || createRes.status === 200,
      `Expected 201/200 for manual RSVP, got ${createRes.status}`,
    );
    const createText = await createRes.text();
    assertNoSecretLeak(createText, [], "POST /api/admin/rsvps");
    const createJson = JSON.parse(createText);
    assert.equal(createJson.ok, true);

    const ids = await trackRsvpByPhone(`${PHONE_PREFIX}03`);
    assert.equal(ids.length, 1);
    manualRsvpId = ids[0];

    const dbRes = await pool.query(
      `SELECT id, submission_source, phone_e164, created_by_admin_id, organizer_notes,
              dietary_requirements, management_token_hash
       FROM rsvps WHERE id = $1`,
      [manualRsvpId],
    );
    const row = dbRes.rows[0];
    assert.equal(row.submission_source, "admin_manual");
    assert.equal(row.phone_e164, `${PHONE_PREFIX}03`);
    assert.equal(row.created_by_admin_id, qaAdmin.id);
    assert.equal(row.organizer_notes, `${TEST_PREFIX} Phone call`);
    assert.equal(row.dietary_requirements, null);
    assert.match(row.management_token_hash, /^[0-9a-f]{64}$/i);

    const afterCateringRes = await adminFetch(
      serverHandle.baseUrl,
      "/api/admin/catering",
      { cookie: adminCookie, clientIp: ip },
    );
    assert.equal(afterCateringRes.status, 200);
    const afterCatering = await afterCateringRes.json();
    assert.equal(
      afterCatering.summary.attendingCount,
      beforeCatering.summary.attendingCount + 1,
    );
    assert.equal(
      afterCatering.summary.withDietaryCount,
      beforeCatering.summary.withDietaryCount,
    );
    assert.equal(
      afterCatering.summary.noDietarySuppliedCount,
      beforeCatering.summary.noDietarySuppliedCount + 1,
    );

    // Invalid manual RSVP payloads rejected 400
    const badPhoneRes = await adminFetch(serverHandle.baseUrl, "/api/admin/rsvps", {
      method: "POST",
      cookie: adminCookie,
      clientIp: ip,
      body: {
        fullName: `${TEST_PREFIX} Bad Phone`,
        phoneCountry: "KE",
        phoneNumber: "abc",
        attendance: "attending",
      },
    });
    assert.equal(badPhoneRes.status, 400);

    const longMsgRes = await adminFetch(serverHandle.baseUrl, "/api/admin/rsvps", {
      method: "POST",
      cookie: adminCookie,
      clientIp: ip,
      body: {
        fullName: `${TEST_PREFIX} Long Msg`,
        phoneCountry: "KE",
        phoneNumber: "0718980047",
        attendance: "attending",
        congratulatoryMessage: "x".repeat(501),
      },
    });
    assert.equal(longMsgRes.status, 400);

    // Declining manual RSVP clears dietaryRequirements to NULL
    const decRes = await adminFetch(serverHandle.baseUrl, "/api/admin/rsvps", {
      method: "POST",
      cookie: adminCookie,
      clientIp: ip,
      body: {
        fullName: `${TEST_PREFIX} Manual Declining`,
        phoneCountry: "KE",
        phoneNumber: "0718980006",
        attendance: "declining",
        dietaryRequirements: "Should be cleared",
      },
    });
    assert.ok(decRes.status === 201 || decRes.status === 200);
    const decIds = await trackRsvpByPhone(`${PHONE_PREFIX}06`);
    const decDb = await pool.query(
      "SELECT attendee_count, dietary_requirements FROM rsvps WHERE id = $1",
      [decIds[0]],
    );
    assert.equal(decDb.rows[0].attendee_count, 0);
    assert.equal(decDb.rows[0].dietary_requirements, null);
  });

  it("D4: admin edit preserves created_at exact ms, advances updated_at, and clears dietary on switch to declining", async () => {
    const ip = makeClientIp(23);
    assert.ok(manualRsvpId, "manualRsvpId must exist from D3");

    const beforeDb = await pool.query(
      "SELECT id, created_at, updated_at FROM rsvps WHERE id = $1",
      [manualRsvpId],
    );
    const beforeCreatedMs = new Date(beforeDb.rows[0].created_at).getTime();
    const beforeUpdatedMs = new Date(beforeDb.rows[0].updated_at).getTime();

    const beforeOverviewRes = await adminFetch(
      serverHandle.baseUrl,
      "/api/admin/overview",
      { cookie: adminCookie, clientIp: ip },
    );
    const beforeOverview = await beforeOverviewRes.json();

    await delay(30);

    const editRes = await adminFetch(
      serverHandle.baseUrl,
      `/api/admin/rsvps/${manualRsvpId}`,
      {
        method: "PATCH",
        cookie: adminCookie,
        clientIp: ip,
        body: {
          fullName: `${TEST_PREFIX} Manual Edited`,
          phoneCountry: "KE",
          phoneNumber: "0718980003",
          attendance: "declining",
          dietaryRequirements: "Should be cleared",
          congratulatoryMessage: `${TEST_PREFIX} Congrats`,
          organizerNotes: `${TEST_PREFIX} Updated note`,
        },
      },
    );
    assert.equal(editRes.status, 200);

    const afterDb = await pool.query(
      `SELECT id, created_at, updated_at, updated_by_admin_id, attendee_count,
              dietary_requirements, organizer_notes
       FROM rsvps WHERE id = $1`,
      [manualRsvpId],
    );
    const row = afterDb.rows[0];
    assert.equal(row.id, manualRsvpId);
    assert.equal(new Date(row.created_at).getTime(), beforeCreatedMs);
    assert.ok(new Date(row.updated_at).getTime() > beforeUpdatedMs);
    assert.equal(row.updated_by_admin_id, qaAdmin.id);
    assert.equal(row.attendee_count, 0);
    assert.equal(row.dietary_requirements, null);
    assert.equal(row.organizer_notes, `${TEST_PREFIX} Updated note`);

    const midOverviewRes = await adminFetch(
      serverHandle.baseUrl,
      "/api/admin/overview",
      { cookie: adminCookie, clientIp: ip },
    );
    const midOverview = await midOverviewRes.json();
    assert.equal(midOverview.attendingCount, beforeOverview.attendingCount - 1);
    assert.equal(midOverview.decliningCount, beforeOverview.decliningCount + 1);
    assert.equal(
      midOverview.noDietarySuppliedCount,
      beforeOverview.noDietarySuppliedCount - 1,
    );

    // Edit back to attending with dietary
    const editBackRes = await adminFetch(
      serverHandle.baseUrl,
      `/api/admin/rsvps/${manualRsvpId}`,
      {
        method: "PATCH",
        cookie: adminCookie,
        clientIp: ip,
        body: {
          fullName: `${TEST_PREFIX} Manual Edited`,
          phoneCountry: "KE",
          phoneNumber: "0718980003",
          attendance: "attending",
          dietaryRequirements: "Gluten-free",
          congratulatoryMessage: `${TEST_PREFIX} Congrats`,
          organizerNotes: `${TEST_PREFIX} Updated note`,
        },
      },
    );
    assert.equal(editBackRes.status, 200);

    const backDb = await pool.query(
      "SELECT attendee_count, dietary_requirements FROM rsvps WHERE id = $1",
      [manualRsvpId],
    );
    assert.equal(backDb.rows[0].attendee_count, 1);
    assert.equal(backDb.rows[0].dietary_requirements, "Gluten-free");
  });

  it("D5: resolves duplicates side-by-side (resolved_distinct keeps both active; merged_archived excludes archive & invalidates token)", async () => {
    const ip = makeClientIp(24);

    // Part A: Shared-phone resolved_distinct
    const rsvpARes = await adminFetch(serverHandle.baseUrl, "/api/rsvp", {
      method: "POST",
      clientIp: ip,
      body: {
        fullName: `${TEST_PREFIX} Spouse One`,
        phoneCountry: "KE",
        phoneNumber: "0718980004",
        attendance: "attending",
        dietaryRequirements: "",
        congratulatoryMessage: "",
        privacyAcknowledged: true,
        honeypot: "",
      },
    });
    assert.equal(rsvpARes.status, 201);
    const rsvpAIds = await trackRsvpByPhone(`${PHONE_PREFIX}04`);
    const rsvpAId = rsvpAIds[0];

    const rsvpBRes = await adminFetch(serverHandle.baseUrl, "/api/admin/rsvps", {
      method: "POST",
      cookie: adminCookie,
      clientIp: ip,
      body: {
        fullName: `${TEST_PREFIX} Spouse Two`,
        phoneCountry: "KE",
        phoneNumber: "0718980004",
        attendance: "attending",
        dietaryRequirements: "No dairy",
        sharedPhoneResolution: "flag_duplicate",
      },
    });
    assert.ok(rsvpBRes.status === 201 || rsvpBRes.status === 200);
    const all04Ids = await trackRsvpByPhone(`${PHONE_PREFIX}04`);
    assert.equal(all04Ids.length, 2);
    const rsvpBId = all04Ids.find((id) => id !== rsvpAId);

    const dupListRes = await adminFetch(
      serverHandle.baseUrl,
      "/api/admin/rsvps/duplicates",
      { cookie: adminCookie, clientIp: ip },
    );
    assert.equal(dupListRes.status, 200);
    const dupListJson = await dupListRes.json();
    const pairVisible = dupListJson.candidates?.some((group) =>
      group.records?.some((rec) => rec.id === rsvpAId || rec.id === rsvpBId),
    );
    assert.equal(pairVisible, true, "Expected flagged shared-phone pair in duplicate candidates");

    const beforeDistinctOverview = await (
      await adminFetch(serverHandle.baseUrl, "/api/admin/overview", {
        cookie: adminCookie,
        clientIp: ip,
      })
    ).json();

    const resolveDistinctRes = await adminFetch(
      serverHandle.baseUrl,
      "/api/admin/rsvps/duplicates/resolve",
      {
        method: "POST",
        cookie: adminCookie,
        clientIp: ip,
        body: {
          resolution: "resolved_distinct",
          primaryRsvpId: rsvpAId,
          targetRsvpIds: [rsvpBId],
          note: `${TEST_PREFIX} Shared household phone`,
        },
      },
    );
    assert.equal(resolveDistinctRes.status, 200);

    const distinctRows = await pool.query(
      `SELECT id, duplicate_review_status, is_anonymized
       FROM rsvps WHERE id = ANY($1::uuid[])`,
      [[rsvpAId, rsvpBId]],
    );
    assert.equal(distinctRows.rowCount, 2);
    for (const r of distinctRows.rows) {
      assert.equal(r.duplicate_review_status, "resolved_distinct");
      assert.equal(r.is_anonymized, false);
    }

    const afterDistinctOverview = await (
      await adminFetch(serverHandle.baseUrl, "/api/admin/overview", {
        cookie: adminCookie,
        clientIp: ip,
      })
    ).json();
    assert.equal(
      afterDistinctOverview.totalResponses,
      beforeDistinctOverview.totalResponses,
    );

    // Part B: True duplicate merged_archived (archive web entry C so we can verify its token is invalidated)
    const rsvpCRes = await adminFetch(serverHandle.baseUrl, "/api/rsvp", {
      method: "POST",
      clientIp: ip,
      body: {
        fullName: `${TEST_PREFIX} Duplicate Web Entry`,
        phoneCountry: "KE",
        phoneNumber: "0718980005",
        attendance: "attending",
        dietaryRequirements: "Vegetarian",
        privacyAcknowledged: true,
        honeypot: "",
      },
    });
    assert.equal(rsvpCRes.status, 201);
    const rsvpCJson = await rsvpCRes.json();
    mergedArchivedWebToken = rsvpCJson.managementPath.replace(/^\/rsvp\/manage\//, "");
    const rsvpCIds = await trackRsvpByPhone(`${PHONE_PREFIX}05`);
    const rsvpCId = rsvpCIds[0];

    const rsvpDRes = await adminFetch(serverHandle.baseUrl, "/api/admin/rsvps", {
      method: "POST",
      cookie: adminCookie,
      clientIp: ip,
      body: {
        fullName: `${TEST_PREFIX} Primary Merged Keep`,
        phoneCountry: "KE",
        phoneNumber: "0718980005",
        attendance: "attending",
        dietaryRequirements: "Vegetarian",
        sharedPhoneResolution: "flag_duplicate",
      },
    });
    assert.ok(rsvpDRes.status === 201 || rsvpDRes.status === 200);
    const all05Ids = await trackRsvpByPhone(`${PHONE_PREFIX}05`);
    assert.equal(all05Ids.length, 2);
    const rsvpDId = all05Ids.find((id) => id !== rsvpCId);

    const beforeMergeOverview = await (
      await adminFetch(serverHandle.baseUrl, "/api/admin/overview", {
        cookie: adminCookie,
        clientIp: ip,
      })
    ).json();

    const mergeRes = await adminFetch(
      serverHandle.baseUrl,
      "/api/admin/rsvps/duplicates/resolve",
      {
        method: "POST",
        cookie: adminCookie,
        clientIp: ip,
        body: {
          resolution: "merged_archived",
          primaryRsvpId: rsvpDId,
          targetRsvpIds: [rsvpCId],
          note: `${TEST_PREFIX} Duplicate submission merged`,
        },
      },
    );
    assert.equal(mergeRes.status, 200);

    const archivedRow = await pool.query(
      `SELECT duplicate_review_status, merged_into_rsvp_id, duplicate_reviewed_by_admin_id
       FROM rsvps WHERE id = $1`,
      [rsvpCId],
    );
    assert.equal(archivedRow.rows[0].duplicate_review_status, "merged_archived");
    assert.equal(archivedRow.rows[0].merged_into_rsvp_id, rsvpDId);
    assert.equal(archivedRow.rows[0].duplicate_reviewed_by_admin_id, qaAdmin.id);

    const afterMergeOverview = await (
      await adminFetch(serverHandle.baseUrl, "/api/admin/overview", {
        cookie: adminCookie,
        clientIp: ip,
      })
    ).json();
    assert.equal(
      afterMergeOverview.totalResponses,
      beforeMergeOverview.totalResponses - 1,
    );
    assert.equal(
      afterMergeOverview.attendingCount,
      beforeMergeOverview.attendingCount - 1,
    );

    const archivedTokenLookup = await getRsvpByToken(mergedArchivedWebToken);
    assert.equal(archivedTokenLookup.status, 404);
  });

  it("D6: enforces confirmation-guarded deletion and updates Overview totals immediately", async () => {
    const ip = makeClientIp(25);
    assert.ok(manualRsvpId, "manualRsvpId must exist");

    const beforeOverview = await (
      await adminFetch(serverHandle.baseUrl, "/api/admin/overview", {
        cookie: adminCookie,
        clientIp: ip,
      })
    ).json();

    // Unconfirmed delete must be rejected
    const unconfirmedRes = await adminFetch(
      serverHandle.baseUrl,
      `/api/admin/rsvps/${manualRsvpId}`,
      {
        method: "DELETE",
        cookie: adminCookie,
        clientIp: ip,
        body: {},
      },
    );
    assert.equal(unconfirmedRes.status, 400);

    const stillThere = await pool.query("SELECT 1 FROM rsvps WHERE id = $1", [
      manualRsvpId,
    ]);
    assert.equal(stillThere.rowCount, 1);

    // Confirmed delete removes record and decrements totals
    const confirmedRes = await adminFetch(
      serverHandle.baseUrl,
      `/api/admin/rsvps/${manualRsvpId}`,
      {
        method: "DELETE",
        cookie: adminCookie,
        clientIp: ip,
        body: { confirmDelete: true },
      },
    );
    assert.equal(confirmedRes.status, 200);

    const gone = await pool.query("SELECT 1 FROM rsvps WHERE id = $1", [
      manualRsvpId,
    ]);
    assert.equal(gone.rowCount, 0);

    const afterOverview = await (
      await adminFetch(serverHandle.baseUrl, "/api/admin/overview", {
        cookie: adminCookie,
        clientIp: ip,
      })
    ).json();
    assert.equal(afterOverview.totalResponses, beforeOverview.totalResponses - 1);
    assert.equal(afterOverview.attendingCount, beforeOverview.attendingCount - 1);
  });

  it("D7: records audit logs for all admin actions with zero secret/token/password leakage", async () => {
    const ip = makeClientIp(26);

    // Trigger failed login, CSV export, settings update, profile update, and logout
    await loginAsAdmin(serverHandle.baseUrl, {
      email: qaAdmin.email,
      password: "WrongAuditPassword!2026#",
      clientIp: makeClientIp(27),
    });

    const exportRes = await adminFetch(
      serverHandle.baseUrl,
      "/api/admin/reports/export?type=full_rsvp",
      { cookie: adminCookie, clientIp: ip },
    );
    assert.equal(exportRes.status, 200);

    const settingsPatchRes = await adminFetch(
      serverHandle.baseUrl,
      "/api/admin/settings",
      {
        method: "PATCH",
        cookie: adminCookie,
        clientIp: ip,
        body: { allowGuestSelfEditing: true },
      },
    );
    assert.equal(settingsPatchRes.status, 200);

    const profilePatchRes = await adminFetch(
      serverHandle.baseUrl,
      "/api/admin/profile",
      {
        method: "PATCH",
        cookie: adminCookie,
        clientIp: ip,
        body: { displayName: `${TEST_PREFIX} Updated Admin` },
      },
    );
    assert.equal(profilePatchRes.status, 200);

    const logoutRes = await adminFetch(
      serverHandle.baseUrl,
      "/api/admin/auth/logout",
      { method: "POST", cookie: adminCookie, clientIp: ip, body: {} },
    );
    assert.equal(logoutRes.status, 200);

    // Re-login to query /api/admin/audit-logs
    const relogin = await loginAsAdmin(serverHandle.baseUrl, {
      email: qaAdmin.email,
      password: qaAdmin.password,
      clientIp: ip,
    });
    assert.equal(relogin.res.status, 200);
    adminCookie = relogin.cookie.value;

    const dbAuditRes = await pool.query(
      `SELECT id, actor_admin_id, action, target_type, target_id, summary, metadata
       FROM admin_audit_logs
       WHERE id > $1
       ORDER BY id ASC`,
      [baseline.baselineMaxAuditId ?? 0],
    );
    const actions = new Set(dbAuditRes.rows.map((r) => r.action));

    for (const requiredAction of [
      "auth.login.success",
      "auth.login.failed",
      "auth.logout",
      "rsvp.manual_create",
      "rsvp.edit",
      "rsvp.duplicate_resolve",
      "rsvp.delete",
      "report.export_csv",
      "settings.update",
      "admin.profile_update",
    ]) {
      assert.equal(
        actions.has(requiredAction),
        true,
        `Missing expected audit action "${requiredAction}". Observed: ${[...actions].join(", ")}`,
      );
    }

    for (const row of dbAuditRes.rows) {
      assert.ok(row.summary && row.summary.length > 0);
      assertNoSecretLeak(
        `${row.summary} ${JSON.stringify(row.metadata)}`,
        [qaAdmin.password, adminCookie, mergedArchivedWebToken].filter(Boolean),
        `admin_audit_logs row ${row.id}`,
      );
    }

    const apiAuditRes = await adminFetch(
      serverHandle.baseUrl,
      "/api/admin/audit-logs?page=1&pageSize=50",
      { cookie: adminCookie, clientIp: ip },
    );
    assert.equal(apiAuditRes.status, 200);
    const apiAuditText = await apiAuditRes.text();
    assertNoSecretLeak(
      apiAuditText,
      [qaAdmin.password, adminCookie, mergedArchivedWebToken].filter(Boolean),
      "GET /api/admin/audit-logs",
    );
  });

  it("D8: settings closure toggle controls public /api/rsvp and anonymization clears duplicate_review_note & organizer_notes", async () => {
    const ip = makeClientIp(28);

    // 1. Pause public RSVPs via admin settings
    const closeRes = await adminFetch(serverHandle.baseUrl, "/api/admin/settings", {
      method: "PATCH",
      cookie: adminCookie,
      clientIp: ip,
      body: {
        rsvpAcceptingResponses: false,
        manualOverrideReason: `${TEST_PREFIX} Pause test`,
      },
    });
    assert.equal(closeRes.status, 200);

    const publicStatusClosed = await adminFetch(
      serverHandle.baseUrl,
      "/api/rsvp",
      { clientIp: ip },
    );
    assert.equal(publicStatusClosed.status, 200);
    const closedJson = await publicStatusClosed.json();
    assert.equal(closedJson.isClosed, true);

    const blockedSubmit = await adminFetch(serverHandle.baseUrl, "/api/rsvp", {
      method: "POST",
      clientIp: ip,
      body: {
        fullName: `${TEST_PREFIX} Blocked While Closed`,
        phoneCountry: "KE",
        phoneNumber: "0718980007",
        attendance: "attending",
        privacyAcknowledged: true,
        honeypot: "",
      },
    });
    assert.equal(blockedSubmit.status, 403);

    // Restore public RSVP acceptance
    const reopenRes = await adminFetch(serverHandle.baseUrl, "/api/admin/settings", {
      method: "PATCH",
      cookie: adminCookie,
      clientIp: ip,
      body: {
        rsvpAcceptingResponses: true,
        manualOverrideReason: null,
      },
    });
    assert.equal(reopenRes.status, 200);

    const openSubmit = await adminFetch(serverHandle.baseUrl, "/api/rsvp", {
      method: "POST",
      clientIp: ip,
      body: {
        fullName: `${TEST_PREFIX} Reopened Guest`,
        phoneCountry: "KE",
        phoneNumber: "0718980007",
        attendance: "attending",
        privacyAcknowledged: true,
        honeypot: "",
      },
    });
    assert.equal(openSubmit.status, 201);
    await trackRsvpByPhone(`${PHONE_PREFIX}07`);

    // 2. Anonymization clears duplicate_review_note and organizer_notes
    const anonTokenHash = hashManagementToken("qa-p8-d8-anonymize-token");
    const insAnon = await pool.query(
      `INSERT INTO rsvps (
         full_name, phone_e164, phone_country, attendance_status, attendee_count,
         dietary_requirements, congratulatory_message, organizer_notes,
         duplicate_review_note, privacy_acknowledged, management_token_hash, retention_expires_at
       ) VALUES ($1, $2, 'KE', 'attending', 1, 'No nuts', 'Congrats', $3, $4, TRUE, $5, '2027-03-12T00:00:00+03:00')
       RETURNING id`,
      [
        `${TEST_PREFIX} Retention Target`,
        `${PHONE_PREFIX}08`,
        `${TEST_PREFIX} Internal organizer note`,
        `${TEST_PREFIX} Sensitive review note`,
        anonTokenHash,
      ],
    );
    const anonId = insAnon.rows[0].id;
    createdRsvpIds.push(anonId);

    execFileSync(
      process.execPath,
      [
        path.resolve(process.cwd(), "database", "anonymize.mjs"),
        "--now=2027-03-12T00:00:00+03:00",
      ],
      { env: process.env, stdio: "pipe" },
    );

    const anonymizedRow = await pool.query(
      `SELECT is_anonymized, full_name, phone_e164, phone_country,
              dietary_requirements, congratulatory_message, management_token_hash,
              organizer_notes, duplicate_review_note, anonymized_at
       FROM rsvps WHERE id = $1`,
      [anonId],
    );
    const r = anonymizedRow.rows[0];
    assert.equal(r.is_anonymized, true);
    assert.equal(r.full_name, null);
    assert.equal(r.phone_e164, null);
    assert.equal(r.phone_country, null);
    assert.equal(r.dietary_requirements, null);
    assert.equal(r.congratulatory_message, null);
    assert.equal(r.management_token_hash, null);
    assert.equal(r.organizer_notes, null);
    assert.equal(r.duplicate_review_note, null);
    assert.ok(r.anonymized_at !== null);

    const runRes = await pool.query(
      "SELECT COUNT(*)::int AS cnt FROM rsvp_retention_runs WHERE id > $1",
      [baseline.baselineMaxRetentionRunId ?? 0],
    );
    assert.ok(runRes.rows[0].cnt >= 1);
  });
});
