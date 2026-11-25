import "./register-alias.mjs";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import { after, before, describe, it } from "node:test";

const { pool, checkDatabaseConnection } = await import("../../src/lib/db.ts");
const { createRsvp, getRsvpByToken, updateRsvpByToken } = await import(
  "../../src/lib/rsvp/service.ts"
);
const { anonymizeExpiredRsvps } = await import("../../src/lib/rsvp/retention.ts");
const { hashManagementToken } = await import("../../src/lib/rsvp/tokens.ts");

const TEST_PREFIX = "[QA-P7-DB]";
const createdIds = [];
let initialMaxRetentionRunId = 0;

function extractToken(managementPath) {
  return managementPath.replace(/^\/rsvp\/manage\//, "");
}

async function trackRowByPhone(phoneE164) {
  const res = await pool.query(
    "SELECT id FROM rsvps WHERE phone_e164 = $1 ORDER BY created_at DESC",
    [phoneE164],
  );
  for (const row of res.rows) {
    if (!createdIds.includes(row.id)) {
      createdIds.push(row.id);
    }
  }
}

describe("Phase 7 PostgreSQL Integration & Retention Tests", () => {
  before(async () => {
    const connected = await checkDatabaseConnection();
    assert.equal(connected, true);

    const maxRunRes = await pool.query(
      "SELECT COALESCE(MAX(id), 0)::bigint AS max_id FROM rsvp_retention_runs",
    );
    initialMaxRetentionRunId = Number(maxRunRes.rows[0]?.max_id ?? 0);
  });

  after(async () => {
    if (createdIds.length > 0) {
      await pool.query("DELETE FROM rsvps WHERE id = ANY($1::uuid[])", [
        createdIds,
      ]);
    }
    await pool.query("DELETE FROM rsvps WHERE full_name LIKE $1", [
      `${TEST_PREFIX}%`,
    ]);
    await pool.query("DELETE FROM rsvps WHERE phone_e164 LIKE '+2547129900%'");
    await pool.query("DELETE FROM rsvp_retention_runs WHERE id > $1", [
      initialMaxRetentionRunId,
    ]);
    await pool.end();
  });

  it("persists attending (count=1) and declining (count=0) RSVPs with hashed management tokens", async () => {
    const attendingRes = await createRsvp({
      fullName: `${TEST_PREFIX} Attending Guest`,
      phoneCountry: "KE",
      phoneNumber: "0712990001",
      attendance: "attending",
      dietaryRequirements: "Vegetarian",
      congratulatoryMessage: "Congratulations Majala & Florence!",
      privacyAcknowledged: true,
    });

    assert.equal(attendingRes.status, 201);
    assert.equal(attendingRes.body.ok, true);
    if (!attendingRes.body.ok) return;

    await trackRowByPhone("+254712990001");
    assert.equal(attendingRes.body.rsvp.attendeeCount, 1);
    assert.equal(attendingRes.body.rsvp.attendance, "attending");
    assert.equal(attendingRes.body.rsvp.dietaryRequirements, "Vegetarian");

    const rawToken = extractToken(attendingRes.body.managementPath);
    const expectedHash = hashManagementToken(rawToken);

    const dbRowRes = await pool.query(
      "SELECT id, attendee_count, management_token_hash, privacy_acknowledged, is_anonymized FROM rsvps WHERE phone_e164 = $1",
      ["+254712990001"],
    );
    assert.equal(dbRowRes.rowCount, 1);
    const dbRow = dbRowRes.rows[0];
    assert.equal(dbRow.attendee_count, 1);
    assert.equal(dbRow.management_token_hash, expectedHash);
    assert.notEqual(dbRow.management_token_hash, rawToken);
    assert.equal(dbRow.privacy_acknowledged, true);
    assert.equal(dbRow.is_anonymized, false);

    const decliningRes = await createRsvp({
      fullName: `${TEST_PREFIX} Declining Guest`,
      phoneCountry: "KE",
      phoneNumber: "0712990002",
      attendance: "declining",
      dietaryRequirements: "Should be stripped",
      congratulatoryMessage: "Sending love!",
      privacyAcknowledged: true,
    });

    assert.equal(decliningRes.status, 201);
    assert.equal(decliningRes.body.ok, true);
    if (!decliningRes.body.ok) return;

    await trackRowByPhone("+254712990002");
    assert.equal(decliningRes.body.rsvp.attendeeCount, 0);
    assert.equal(decliningRes.body.rsvp.dietaryRequirements, null);

    const decliningDbRes = await pool.query(
      "SELECT attendee_count, dietary_requirements FROM rsvps WHERE phone_e164 = $1",
      ["+254712990002"],
    );
    assert.equal(decliningDbRes.rows[0].attendee_count, 0);
    assert.equal(decliningDbRes.rows[0].dietary_requirements, null);
  });

  it("enforces PostgreSQL CHECK constraints on attendee_count, dietary, phone_e164, and privacy_acknowledged", async () => {
    const tokenHash = hashManagementToken("a".repeat(43));

    // 1. attendee_count = 2 rejected
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO rsvps (full_name, phone_e164, phone_country, attendance_status, attendee_count, management_token_hash, privacy_acknowledged, retention_expires_at)
           VALUES ($1, '+254712990090', 'KE', 'attending', 2, $2, TRUE, '2027-03-12T00:00:00+03:00')`,
          [`${TEST_PREFIX} BadCount`, tokenHash],
        ),
      (err) => err?.code === "23514",
    );

    // 2. dietary when declining rejected
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO rsvps (full_name, phone_e164, phone_country, attendance_status, attendee_count, dietary_requirements, management_token_hash, privacy_acknowledged, retention_expires_at)
           VALUES ($1, '+254712990091', 'KE', 'declining', 0, 'Vegan', $2, TRUE, '2027-03-12T00:00:00+03:00')`,
          [`${TEST_PREFIX} BadDietary`, tokenHash],
        ),
      (err) => err?.code === "23514",
    );

    // 3. empty/invalid phone rejected
    for (const badPhone of ["", "0712990092", "invalid"]) {
      await assert.rejects(
        () =>
          pool.query(
            `INSERT INTO rsvps (full_name, phone_e164, phone_country, attendance_status, attendee_count, management_token_hash, privacy_acknowledged, retention_expires_at)
             VALUES ($1, $2, 'KE', 'attending', 1, $3, TRUE, '2027-03-12T00:00:00+03:00')`,
            [`${TEST_PREFIX} BadPhone`, badPhone, tokenHash],
          ),
        (err) => err?.code === "23514",
      );
    }

    // 4. privacy_acknowledged = FALSE rejected
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO rsvps (full_name, phone_e164, phone_country, attendance_status, attendee_count, management_token_hash, privacy_acknowledged, retention_expires_at)
           VALUES ($1, '+254712990093', 'KE', 'attending', 1, $2, FALSE, '2027-03-12T00:00:00+03:00')`,
          [`${TEST_PREFIX} BadPrivacy`, tokenHash],
        ),
      (err) => err?.code === "23514",
    );
  });

  it("enforces duplicate phone (409 POSSIBLE_DUPLICATE_PHONE, zero disclosure) and supports resolved_distinct", async () => {
    const dupRes = await createRsvp({
      fullName: `${TEST_PREFIX} Another Person`,
      phoneCountry: "KE",
      phoneNumber: "0712990001",
      attendance: "attending",
      privacyAcknowledged: true,
    });

    assert.equal(dupRes.status, 409);
    assert.equal(dupRes.body.ok, false);
    if (!dupRes.body.ok) {
      assert.equal(dupRes.body.code, "POSSIBLE_DUPLICATE_PHONE");
      // Must NOT disclose existing guest's name or details
      assert.equal(dupRes.body.message.includes("Attending Guest"), false);
      assert.equal(dupRes.body.message.includes(TEST_PREFIX), false);
    }

    // Mark original row as resolved_distinct, then allow shared phone
    await pool.query(
      "UPDATE rsvps SET duplicate_review_status = 'resolved_distinct' WHERE phone_e164 = $1",
      ["+254712990001"],
    );

    const sharedRes = await createRsvp({
      fullName: `${TEST_PREFIX} Shared Phone Spouse`,
      phoneCountry: "KE",
      phoneNumber: "0712990001",
      attendance: "attending",
      privacyAcknowledged: true,
    });
    assert.equal(sharedRes.status, 201);
    assert.equal(sharedRes.body.ok, true);
    await trackRowByPhone("+254712990001");
  });

  it("enforces idempotency_key uniqueness (409 DUPLICATE_REQUEST)", async () => {
    const idempotencyKey = crypto.randomUUID();
    const first = await createRsvp({
      fullName: `${TEST_PREFIX} Idempotent Guest`,
      phoneCountry: "KE",
      phoneNumber: "0712990003",
      attendance: "attending",
      privacyAcknowledged: true,
      idempotencyKey,
    });
    assert.equal(first.status, 201);
    await trackRowByPhone("+254712990003");

    const retry = await createRsvp({
      fullName: `${TEST_PREFIX} Idempotent Guest`,
      phoneCountry: "KE",
      phoneNumber: "0712990004",
      attendance: "attending",
      privacyAcknowledged: true,
      idempotencyKey,
    });
    assert.equal(retry.status, 409);
    assert.equal(retry.body.ok, false);
    if (!retry.body.ok) {
      assert.equal(retry.body.code, "DUPLICATE_REQUEST");
    }
  });

  it("supports getRsvpByToken and updateRsvpByToken transitions, clears dietary on decline, and preserves id/created_at while advancing updated_at", async () => {
    const created = await createRsvp({
      fullName: `${TEST_PREFIX} Mutable Guest`,
      phoneCountry: "KE",
      phoneNumber: "0712990005",
      attendance: "attending",
      dietaryRequirements: "Halal, no shellfish",
      congratulatoryMessage: "Initial note",
      privacyAcknowledged: true,
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.ok, true);
    if (!created.body.ok) return;

    await trackRowByPhone("+254712990005");
    const token = extractToken(created.body.managementPath);

    const beforeDb = (
      await pool.query(
        "SELECT id, created_at, updated_at FROM rsvps WHERE phone_e164 = $1",
        ["+254712990005"],
      )
    ).rows[0];

    const fetched = await getRsvpByToken(token);
    assert.equal(fetched.ok, true);
    if (fetched.ok) {
      assert.equal(fetched.data.rsvp.fullName, `${TEST_PREFIX} Mutable Guest`);
      assert.equal(fetched.data.rsvp.dietaryRequirements, "Halal, no shellfish");
    }

    // Wait slightly so PostgreSQL NOW() advances updated_at cleanly
    await new Promise((r) => setTimeout(r, 25));

    // Attending -> Declining (clears dietary in DB)
    const toDeclining = await updateRsvpByToken(token, {
      fullName: `${TEST_PREFIX} Mutable Guest Updated`,
      phoneCountry: "KE",
      phoneNumber: "0712990006",
      attendance: "declining",
      dietaryRequirements: "Should be ignored and cleared",
      congratulatoryMessage: "Updated declining message",
    });
    assert.equal(toDeclining.status, 200);
    assert.equal(toDeclining.body.ok, true);
    if (toDeclining.body.ok) {
      assert.equal(toDeclining.body.rsvp.attendance, "declining");
      assert.equal(toDeclining.body.rsvp.attendeeCount, 0);
      assert.equal(toDeclining.body.rsvp.dietaryRequirements, null);
      assert.equal(toDeclining.body.rsvp.phoneE164, "+254712990006");
    }

    const afterDeclineDb = (
      await pool.query(
        "SELECT id, full_name, phone_e164, attendee_count, dietary_requirements, created_at, updated_at FROM rsvps WHERE id = $1",
        [beforeDb.id],
      )
    ).rows[0];
    assert.equal(afterDeclineDb.id, beforeDb.id);
    assert.equal(afterDeclineDb.full_name, `${TEST_PREFIX} Mutable Guest Updated`);
    assert.equal(afterDeclineDb.phone_e164, "+254712990006");
    assert.equal(afterDeclineDb.attendee_count, 0);
    assert.equal(afterDeclineDb.dietary_requirements, null);
    assert.equal(
      new Date(afterDeclineDb.created_at).getTime(),
      new Date(beforeDb.created_at).getTime(),
    );
    assert.ok(
      new Date(afterDeclineDb.updated_at).getTime() >
        new Date(beforeDb.updated_at).getTime(),
    );

    // Declining -> Attending
    const toAttending = await updateRsvpByToken(token, {
      fullName: `${TEST_PREFIX} Mutable Guest Reattending`,
      phoneCountry: "KE",
      phoneNumber: "0712990006",
      attendance: "attending",
      dietaryRequirements: "Nut-free",
      congratulatoryMessage: "Coming after all!",
    });
    assert.equal(toAttending.status, 200);
    assert.equal(toAttending.body.ok, true);
    if (toAttending.body.ok) {
      assert.equal(toAttending.body.rsvp.attendance, "attending");
      assert.equal(toAttending.body.rsvp.attendeeCount, 1);
      assert.equal(toAttending.body.rsvp.dietaryRequirements, "Nut-free");
    }
  });

  it("enforces 90-day retention, irreversibly anonymizes expired rows, logs retention run, invalidates token, and handles restore safeguard", async () => {
    const created = await createRsvp({
      fullName: `${TEST_PREFIX} Retention Guest`,
      phoneCountry: "KE",
      phoneNumber: "0712990010",
      attendance: "attending",
      dietaryRequirements: "Dairy-free",
      congratulatoryMessage: "Blessings!",
      privacyAcknowledged: true,
      idempotencyKey: crypto.randomUUID(),
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.ok, true);
    if (!created.body.ok) return;

    await trackRowByPhone("+254712990010");
    const token = extractToken(created.body.managementPath);

    const rowId = (
      await pool.query("SELECT id FROM rsvps WHERE phone_e164 = $1", [
        "+254712990010",
      ])
    ).rows[0].id;

    // Add organizer_notes to confirm anonymization nulls it too
    await pool.query(
      "UPDATE rsvps SET organizer_notes = 'VIP table 1' WHERE id = $1",
      [rowId],
    );

    // 1. Before 2027-03-12 -> records retained
    const beforeExpiry = await anonymizeExpiredRsvps({
      now: new Date("2027-03-11T23:59:59+03:00"),
      targetIds: [rowId],
    });
    assert.equal(beforeExpiry.status, "success");
    assert.equal(beforeExpiry.anonymizedCount, 0);

    const stillActive = (
      await pool.query("SELECT is_anonymized, full_name FROM rsvps WHERE id = $1", [
        rowId,
      ])
    ).rows[0];
    assert.equal(stillActive.is_anonymized, false);
    assert.equal(stillActive.full_name, `${TEST_PREFIX} Retention Guest`);

    // 2. At 2027-03-12T00:00:00+03:00 -> irreversibly anonymized (scoped strictly to rowId)
    const atExpiry = await anonymizeExpiredRsvps({
      now: new Date("2027-03-12T00:00:00+03:00"),
      targetIds: [rowId],
    });
    assert.equal(atExpiry.status, "success");
    assert.equal(atExpiry.anonymizedCount, 1);

    const anonymizedRow = (
      await pool.query(
        `SELECT full_name, phone_e164, phone_country, dietary_requirements,
                congratulatory_message, management_token_hash, idempotency_key,
                organizer_notes, is_anonymized, anonymized_at,
                attendance_status, attendee_count
         FROM rsvps WHERE id = $1`,
        [rowId],
      )
    ).rows[0];

    assert.equal(anonymizedRow.full_name, null);
    assert.equal(anonymizedRow.phone_e164, null);
    assert.equal(anonymizedRow.phone_country, null);
    assert.equal(anonymizedRow.dietary_requirements, null);
    assert.equal(anonymizedRow.congratulatory_message, null);
    assert.equal(anonymizedRow.management_token_hash, null);
    assert.equal(anonymizedRow.idempotency_key, null);
    assert.equal(anonymizedRow.organizer_notes, null);
    assert.equal(anonymizedRow.is_anonymized, true);
    assert.ok(anonymizedRow.anonymized_at !== null);
    // Non-identifying attendance totals preserved
    assert.equal(anonymizedRow.attendance_status, "attending");
    assert.equal(anonymizedRow.attendee_count, 1);

    // Retention run recorded
    const runRes = await pool.query(
      "SELECT status, records_anonymized FROM rsvp_retention_runs WHERE id > $1 ORDER BY id DESC LIMIT 1",
      [initialMaxRetentionRunId],
    );
    assert.equal(runRes.rowCount, 1);
    assert.equal(runRes.rows[0].status, "success");
    assert.equal(runRes.rows[0].records_anonymized, atExpiry.anonymizedCount);

    // Old management token invalidated
    const invalidatedLookup = await getRsvpByToken(token);
    assert.equal(invalidatedLookup.ok, false);
    if (!invalidatedLookup.ok) {
      assert.equal(invalidatedLookup.status, 404);
      assert.equal(invalidatedLookup.error.code, "INVALID_TOKEN");
    }

    // 3. Restore safeguard: simulate backup restore of expired non-anonymized row, re-run database/anonymize.mjs
    const restoredTokenHash = hashManagementToken("b".repeat(43));
    const restoredInsert = await pool.query(
      `INSERT INTO rsvps (
         full_name, phone_e164, phone_country, attendance_status, attendee_count,
         management_token_hash, privacy_acknowledged, retention_expires_at, is_anonymized
       ) VALUES (
         $1, '+254712990011', 'KE', 'attending', 1,
         $2, TRUE, '2027-03-12T00:00:00+03:00', FALSE
       ) RETURNING id`,
      [`${TEST_PREFIX} Restored Expired Row`, restoredTokenHash],
    );
    const restoredId = restoredInsert.rows[0].id;
    createdIds.push(restoredId);

    const scriptPath = path.resolve(process.cwd(), "database", "anonymize.mjs");
    const cliOutput = execFileSync(
      process.execPath,
      [
        "--env-file=.env.local",
        scriptPath,
        "--now=2027-03-12T00:00:00+03:00",
      ],
      { encoding: "utf8" },
    );
    assert.match(cliOutput, /Completed successfully/);
    assert.match(cliOutput, /records_anonymized=1/);

    const reAnonymized = (
      await pool.query(
        "SELECT is_anonymized, full_name, phone_e164, management_token_hash FROM rsvps WHERE id = $1",
        [restoredId],
      )
    ).rows[0];
    assert.equal(reAnonymized.is_anonymized, true);
    assert.equal(reAnonymized.full_name, null);
    assert.equal(reAnonymized.phone_e164, null);
    assert.equal(reAnonymized.management_token_hash, null);
  });
});
