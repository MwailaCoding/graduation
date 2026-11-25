import "../phase7/register-alias.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { pathToFileURL } from "node:url";

const {
  EVENT_DETAILS,
  EVENT_TIMEZONE,
  RSVP_CLOSURE_DEADLINE_ISO,
  RETENTION_ANONYMIZATION_DATE_ISO,
  RETENTION_PERIOD_DAYS,
  BACKUP_RETENTION_DAYS,
  RSVP_LIMITS,
  isRsvpClosed,
  isRetentionExpired,
} = await import("../../src/lib/event-config.ts");

const {
  normalizeAndValidateName,
  normalizeAndValidatePhone,
  validateDietaryRequirements,
  validateCongratulatoryMessage,
  validateCreateRsvpInput,
  validateUpdateRsvpInput,
} = await import("../../src/lib/rsvp/validation.ts");

const {
  generateManagementToken,
  hashManagementToken,
  verifyTokenMatchesHash,
} = await import("../../src/lib/rsvp/tokens.ts");

const REQUIRE_IMPL = process.env.PHASE8_REQUIRE_IMPL === "1";

function adminModulePath(relPath) {
  return path.resolve(process.cwd(), "src", "lib", "admin", relPath);
}

async function loadOptionalAdminModule(t, relPath) {
  const fullPath = adminModulePath(relPath);
  if (!fs.existsSync(fullPath)) {
    if (REQUIRE_IMPL) {
      assert.fail(
        `PHASE8_REQUIRE_IMPL=1 requires src/lib/admin/${relPath} to exist`,
      );
    }
    t.skip(`src/lib/admin/${relPath} not yet implemented (M1-M4 concurrent)`);
    return null;
  }

  try {
    return await import(pathToFileURL(fullPath).href);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      err.code === "ERR_MODULE_NOT_FOUND" &&
      (msg.includes("'server-only'") || msg.includes("'next/headers'"))
    ) {
      t.skip(
        `src/lib/admin/${relPath} imports Next runtime-only module; verified via HTTP/DB integration suites`,
      );
      return null;
    }
    throw err;
  }
}

function pickFunction(mod, candidates, label) {
  for (const name of candidates) {
    if (typeof mod[name] === "function") {
      return mod[name];
    }
  }
  assert.fail(
    `Expected ${label} export (one of ${candidates.join(", ")}); found exports: ${Object.keys(mod).join(", ")}`,
  );
}

function tryPickFunction(mod, candidates) {
  for (const name of candidates) {
    if (typeof mod[name] === "function") {
      return mod[name];
    }
  }
  return null;
}

describe("Phase 8 Pure Unit & Contract Tests", () => {
  describe("Phase 7 Baseline Invariants Relevant to Phase 8", () => {
    it("retains authoritative event, closure, and retention constants", () => {
      assert.equal(EVENT_TIMEZONE, "Africa/Nairobi");
      assert.equal(RSVP_CLOSURE_DEADLINE_ISO, "2026-12-12T00:00:00+03:00");
      assert.equal(RETENTION_PERIOD_DAYS, 90);
      assert.equal(BACKUP_RETENTION_DAYS, 14);
      assert.equal(RETENTION_ANONYMIZATION_DATE_ISO, "2027-03-12T00:00:00+03:00");
      assert.equal(EVENT_DETAILS.graduates[0].name, "Majala Mwaila");
      assert.match(EVENT_DETAILS.graduates[1].name, /^(Florence\s+)?Achala Mwaila$/);
      assert.equal(EVENT_DETAILS.venueName, "Rainbow Ruiru Resort");
      assert.equal(isRsvpClosed(new Date("2026-12-11T23:59:59+03:00")), false);
      assert.equal(isRsvpClosed(new Date("2026-12-12T00:00:00+03:00")), true);
      assert.equal(isRetentionExpired(new Date("2027-03-12T00:00:00+03:00")), true);
    });

    it("enforces shared validation rules including attending-only dietary clearing and tab/CR survival", () => {
      assert.equal(RSVP_LIMITS.nameMinLength, 2);
      assert.equal(RSVP_LIMITS.nameMaxLength, 120);
      assert.equal(RSVP_LIMITS.dietaryMaxLength, 250);
      assert.equal(RSVP_LIMITS.messageMaxLength, 500);

      assert.equal(normalizeAndValidateName("A").valid, false);
      assert.equal(normalizeAndValidateName("a".repeat(121)).valid, false);
      assert.equal(normalizeAndValidatePhone("0712 345 678", "KE").e164, "+254712345678");
      assert.equal(validateDietaryRequirements("Vegan", "declining").value, null);
      assert.equal(validateCongratulatoryMessage("  \t=SUM(1,2)\r-1  ").valid, true);

      // Confirm tab/CR inside congratulatory message survives sanitization, making CSV formula defense critical.
      const created = validateCreateRsvpInput({
        fullName: "Grace Wanjiku",
        phoneCountry: "KE",
        phoneNumber: "0712345678",
        attendance: "attending",
        dietaryRequirements: "No nuts",
        congratulatoryMessage: "Hello\t=1+1\rWorld",
        privacyAcknowledged: true,
      });
      assert.equal(created.valid, true);
      if (created.valid) {
        assert.match(created.data.congratulatoryMessage || "", /\t=1\+1\r/);
      }

      const updated = validateUpdateRsvpInput({
        fullName: "Grace Wanjiku",
        phoneCountry: "KE",
        phoneNumber: "0712345678",
        attendance: "declining",
        dietaryRequirements: "Halal",
        congratulatoryMessage: "",
      });
      assert.equal(updated.valid, true);
      if (updated.valid) {
        assert.equal(updated.data.attendeeCount, 0);
        assert.equal(updated.data.dietaryRequirements, null);
      }

      const token = generateManagementToken();
      const hash = hashManagementToken(token);
      assert.notEqual(token, hash);
      assert.equal(verifyTokenMatchesHash(token, hash), true);
    });
  });

  describe("U1–U3: CSV RFC 4180 Escaping, UTF-8 BOM & Formula-Injection Neutralization", () => {
    it("U1: escapes commas, double quotes, CRLF/LF, empty/null, and preserves Unicode", async (t) => {
      const csvMod = await loadOptionalAdminModule(t, "csv.ts");
      if (!csvMod) return;

      const escapeCell = pickFunction(
        csvMod,
        ["escapeCsvCell", "formatCsvCell", "sanitizeCsvCell", "csvEscapeCell"],
        "CSV cell escaper",
      );

      assert.equal(escapeCell("Grace Wanjiku"), "Grace Wanjiku");
      assert.equal(escapeCell("Halal, no nuts"), '"Halal, no nuts"');
      assert.equal(
        escapeCell('She said "Congrats!"'),
        '"She said ""Congrats!"""',
      );
      assert.equal(escapeCell("Line 1\nLine 2"), '"Line 1\nLine 2"');
      assert.equal(escapeCell("Line 1\r\nLine 2"), '"Line 1\r\nLine 2"');
      assert.equal(escapeCell(""), "");
      assert.equal(escapeCell(null), "");
      assert.equal(escapeCell(undefined), "");
      assert.equal(
        escapeCell("Élodie Renée — Félicitations 🎓"),
        "Élodie Renée — Félicitations 🎓",
      );
    });

    it("U2: prepends UTF-8 BOM (\\uFEFF -> EF BB BF) exactly once", async (t) => {
      const csvMod = await loadOptionalAdminModule(t, "csv.ts");
      if (!csvMod) return;

      const buildCsv = pickFunction(
        csvMod,
        ["buildCsv", "toCsv", "serializeCsv", "formatCsv", "generateCsv"],
        "CSV serializer",
      );

      const csvWithRows = buildCsv(
        ["Full Name", "Attendance"],
        [
          ["Majala Guest", "attending"],
          ["Florence Guest", "declining"],
        ],
      );
      assert.equal(csvWithRows.charCodeAt(0), 0xfeff);
      const bytes = Buffer.from(csvWithRows, "utf8");
      assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
      // BOM must appear only at index 0
      assert.equal(csvWithRows.indexOf("\uFEFF", 1), -1);

      const emptyRowCsv = buildCsv(["Full Name", "Attendance"], []);
      assert.equal(emptyRowCsv.charCodeAt(0), 0xfeff);
      assert.equal(emptyRowCsv.indexOf("\uFEFF", 1), -1);
      assert.match(emptyRowCsv, /Full Name,Attendance/);
    });

    it("U3: neutralizes spreadsheet formula injection triggers (=, +, -, @, \\t, \\r) including leading whitespace and quotes", async (t) => {
      const csvMod = await loadOptionalAdminModule(t, "csv.ts");
      if (!csvMod) return;

      const escapeCell = pickFunction(
        csvMod,
        ["escapeCsvCell", "formatCsvCell", "sanitizeCsvCell", "csvEscapeCell"],
        "CSV cell escaper",
      );

      const dangerousDirect = [
        "=SUM(A1:A2)",
        "+cmd|'/C calc'!A0",
        "-2+3",
        "@SUM(1+1)",
        "\t=1+1",
        "\r=1+1",
        "+254712345678",
      ];

      for (const input of dangerousDirect) {
        const out = escapeCell(input);
        const unwrapped =
          out.startsWith('"') && out.endsWith('"')
            ? out.slice(1, -1).replaceAll('""', '"')
            : out;
        assert.ok(
          unwrapped.startsWith("'"),
          `Expected formula-neutralized leading apostrophe for ${JSON.stringify(input)}, got ${JSON.stringify(out)}`,
        );
      }

      // E.164 phone must retain all digits after apostrophe prefix
      const phoneOut = escapeCell("+254712345678");
      assert.ok(phoneOut.includes("'+254712345678"));

      // Leading whitespace before formula trigger must also be neutralized
      for (const spaced of ["  =1+1", " \t+cmd", "  -5", " @import"]) {
        const out = escapeCell(spaced);
        const unwrapped =
          out.startsWith('"') && out.endsWith('"')
            ? out.slice(1, -1).replaceAll('""', '"')
            : out;
        assert.ok(
          unwrapped.startsWith("'"),
          `Expected leading-whitespace formula neutralization for ${JSON.stringify(spaced)}, got ${JSON.stringify(out)}`,
        );
      }

      // Formula + comma must quote outside the apostrophe: "'=1+1,2" -> "\"'=1+1,2\""
      const commaFormula = escapeCell("=1+1,2");
      // Exact RFC 4180 + neutralization assertion: outer quotes wrapping apostrophe-prefixed cell
      assert.equal(commaFormula, "\"'=1+1,2\"");

      // Safe strings must NOT get a spurious apostrophe
      assert.equal(escapeCell("Vegetarian"), "Vegetarian");
      assert.equal(escapeCell("12 Dec 2026"), "12 Dec 2026");
      assert.equal(escapeCell("Jean-Luc"), "Jean-Luc");
    });
  });

  describe("U4: Overview Attendance % Zero-Division Safety", () => {
    it("U4: calculates finite attendance rate without NaN/Infinity on zero totals", async (t) => {
      const overviewMod = await loadOptionalAdminModule(t, "overview.ts");
      if (!overviewMod) return;

      const calcRate = tryPickFunction(overviewMod, [
        "calculateAttendanceRatePct",
        "computeAttendanceRatePct",
        "calculateAttendanceRate",
        "computeAttendanceRate",
      ]);

      if (!calcRate) {
        t.skip(
          `src/lib/admin/overview.ts does not export a standalone pure rate helper (verified via /api/admin/overview DB integration); exports: ${Object.keys(overviewMod).join(", ")}`,
        );
        return;
      }

      const zero = calcRate(0, 0);
      assert.equal(Number.isFinite(zero), true);
      assert.equal(zero, 0);

      assert.equal(calcRate(0, 5), 0);
      assert.equal(calcRate(5, 5), 100);
      assert.equal(calcRate(3, 4), 75);

      const third = calcRate(1, 3);
      assert.equal(Number.isFinite(third), true);
      assert.ok(third >= 33 && third <= 34);

      const negativeSafe = calcRate(-1, 0);
      assert.equal(Number.isFinite(negativeSafe), true);
      assert.ok(negativeSafe >= 0);
    });
  });

  describe("U5: Dietary 'No dietary supplied' vs Explicit String Distinction", () => {
    it("U5: distinguishes blank/null dietary from explicit 'None'/'No restrictions' and excludes declining", async (t) => {
      const cateringMod = await loadOptionalAdminModule(t, "catering.ts");
      if (!cateringMod) return;

      const summarizeCatering = tryPickFunction(cateringMod, [
        "summarizeCateringRows",
        "buildCateringSummary",
        "classifyDietaryRows",
        "computeCateringSummary",
      ]);

      const formatDietary = tryPickFunction(cateringMod, [
        "formatDietaryStatus",
        "normalizeDietaryDisplay",
        "getDietaryDisplayLabel",
      ]);

      if (!summarizeCatering && !formatDietary) {
        t.skip(
          `src/lib/admin/catering.ts exports DB-bound helpers only (verified via /api/admin/catering & db-integration); exports: ${Object.keys(cateringMod).join(", ")}`,
        );
        return;
      }

      if (formatDietary) {
        assert.match(String(formatDietary(null)), /no dietary supplied/i);
        assert.match(String(formatDietary("")), /no dietary supplied/i);
        assert.match(String(formatDietary("   ")), /no dietary supplied/i);
        assert.equal(formatDietary("None"), "None");
        assert.equal(formatDietary("No restrictions"), "No restrictions");
        assert.equal(formatDietary("Halal, nut-free"), "Halal, nut-free");
      }

      if (summarizeCatering) {
        const summary = summarizeCatering([
          { attendance_status: "attending", dietary_requirements: null },
          { attendance_status: "attending", dietary_requirements: "   " },
          { attendance_status: "attending", dietary_requirements: "None" },
          {
            attendance_status: "attending",
            dietary_requirements: "No restrictions",
          },
          {
            attendance_status: "attending",
            dietary_requirements: "Halal, nut-free",
          },
          { attendance_status: "declining", dietary_requirements: null },
        ]);

        assert.equal(summary.attendingCount, 5);
        assert.equal(summary.withDietaryCount, 3);
        assert.equal(summary.noDietarySuppliedCount, 2);
      }
    });
  });

  describe("U6: Admin Password Strength & scrypt Hash Format", () => {
    it("U6: enforces scrypt$<salt>$<hash> format, random salts, constant-time verify, and strength validation", async (t) => {
      const pwMod = await loadOptionalAdminModule(t, "password.ts");
      if (!pwMod) return;

      const hashPassword = pickFunction(
        pwMod,
        ["hashPassword", "hashAdminPassword", "createPasswordHash"],
        "password hasher",
      );
      const verifyPassword = pickFunction(
        pwMod,
        ["verifyPassword", "verifyAdminPassword", "checkPassword"],
        "password verifier",
      );

      const samplePassword = "MwailaAdmin!2026#Unit";
      const hash1 = await hashPassword(samplePassword);
      const hash2 = await hashPassword(samplePassword);

      assert.equal(typeof hash1, "string");
      assert.equal(typeof hash2, "string");
      assert.notEqual(hash1, hash2, "Identical passwords must use unique random salts");

      const parts = hash1.split("$");
      assert.equal(parts.length, 3, `Expected scrypt$<salt>$<hash>, got ${hash1}`);
      assert.equal(parts[0], "scrypt");
      assert.ok(parts[1].length >= 16);
      assert.ok(parts[2].length >= 32);

      assert.equal(await verifyPassword(samplePassword, hash1), true);
      assert.equal(await verifyPassword("WrongPassword!2026", hash1), false);
      assert.equal(await verifyPassword("", hash1), false);
      assert.equal(await verifyPassword(samplePassword, ""), false);
      assert.equal(await verifyPassword(samplePassword, "plain"), false);
      assert.equal(await verifyPassword(samplePassword, "scrypt$onlytwo"), false);
      assert.equal(await verifyPassword(samplePassword, "bcrypt$abc$def"), false);
      assert.equal(await verifyPassword(samplePassword, "scrypt$salt$00"), false);

      const validateStrength = tryPickFunction(pwMod, [
        "validatePasswordStrength",
        "validateNewPassword",
        "checkPasswordStrength",
      ]);
      if (validateStrength) {
        assert.equal(validateStrength("").valid, false);
        assert.equal(validateStrength("            ").valid, false);
        assert.equal(validateStrength("short1!").valid, false);
        assert.equal(validateStrength(samplePassword).valid, true);
      }
    });
  });

  describe("U7: Sort & Filter Allowlist Safety", () => {
    it("U7: allows valid sort/filter enums and rejects/sanitizes SQL injection attempts", async (t) => {
      const rsvpsMod = await loadOptionalAdminModule(t, "rsvps.ts");
      if (!rsvpsMod) return;

      const normalizeQuery = tryPickFunction(rsvpsMod, [
        "normalizeRsvpQueryParams",
        "parseRsvpFilters",
        "resolveRsvpSort",
        "normalizeRsvpFilters",
      ]);

      if (!normalizeQuery) {
        t.skip(
          `src/lib/admin/rsvps.ts does not export a standalone pure filter/sort parser (verified via /api/admin/rsvps SQLi checks); exports: ${Object.keys(rsvpsMod).join(", ")}`,
        );
        return;
      }

      const safe = normalizeQuery({
        attendance: "attending",
        source: "admin_manual",
        duplicateStatus: "flagged",
        sort: "full_name",
        order: "asc",
        page: "2",
        pageSize: "25",
      });
      assert.equal(safe.attendance, "attending");

      const injected = normalizeQuery({
        attendance: "attending' OR 1=1--",
        source: "web; DROP TABLE rsvps--",
        duplicateStatus: "none UNION SELECT",
        sort: "management_token_hash; DROP TABLE rsvps--",
        order: "DESC; SELECT 1",
        page: "-9",
        pageSize: "99999",
      });

      const serialized = JSON.stringify(injected);
      assert.equal(serialized.includes("DROP TABLE"), false);
      assert.equal(serialized.includes("management_token_hash"), false);
      assert.equal(serialized.includes("UNION SELECT"), false);
    });
  });
});
