import "./register-alias.mjs";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const {
  isRsvpClosed,
  isRetentionExpired,
  RSVP_CLOSURE_DEADLINE_ISO,
  RETENTION_ANONYMIZATION_DATE_ISO,
  RSVP_LIMITS,
} = await import("../../src/lib/event-config.ts");

const {
  normalizeAndValidateName,
  normalizeAndValidatePhone,
  validateAttendance,
  validateDietaryRequirements,
  validateCongratulatoryMessage,
  validateCreateRsvpInput,
  validateUpdateRsvpInput,
} = await import("../../src/lib/rsvp/validation.ts");

const {
  generateManagementToken,
  hashManagementToken,
  isValidTokenFormat,
  verifyTokenMatchesHash,
} = await import("../../src/lib/rsvp/tokens.ts");

describe("Phase 7 Unit Tests — Validation, Closure & Retention Boundaries, and Tokens", () => {
  describe("Name validation", () => {
    it("rejects empty, whitespace-only, 1-char, and symbol-only names", () => {
      assert.equal(normalizeAndValidateName("").valid, false);
      assert.equal(normalizeAndValidateName("   ").valid, false);
      assert.equal(normalizeAndValidateName(null).valid, false);
      assert.equal(normalizeAndValidateName("A").valid, false);
      assert.equal(normalizeAndValidateName("---!!!").valid, false);
      assert.equal(normalizeAndValidateName("123456").valid, false);
      assert.equal(normalizeAndValidateName("a".repeat(RSVP_LIMITS.nameMaxLength + 1)).valid, false);
    });

    it("accepts valid names with spaces, hyphens, apostrophes, and accents", () => {
      const simple = normalizeAndValidateName("  Grace   Wanjiku  Mwangi ");
      assert.equal(simple.valid, true);
      assert.equal(simple.value, "Grace Wanjiku Mwangi");

      const hyphenApostropheAccent = normalizeAndValidateName("Jean-Luc O'Connor-Njoroge Élodie");
      assert.equal(hyphenApostropheAccent.valid, true);
      assert.equal(hyphenApostropheAccent.value, "Jean-Luc O'Connor-Njoroge Élodie");

      const francophone = normalizeAndValidateName("Renée d'Artagnan-Mwaila");
      assert.equal(francophone.valid, true);
    });
  });

  describe("Phone validation", () => {
    it("rejects missing, letter-containing, and invalid phone numbers", () => {
      assert.equal(normalizeAndValidatePhone("", "KE").valid, false);
      assert.equal(normalizeAndValidatePhone("   ", "KE").valid, false);
      assert.equal(normalizeAndValidatePhone("0712abc678", "KE").valid, false);
      assert.equal(normalizeAndValidatePhone("12345", "KE").valid, false);
      assert.equal(normalizeAndValidatePhone("0712 345", "KE").valid, false);
    });

    it("accepts Kenyan 07... and 01... mobile numbers and normalizes to E.164", () => {
      const ke07 = normalizeAndValidatePhone("0712 345 678", "KE");
      assert.equal(ke07.valid, true);
      assert.equal(ke07.e164, "+254712345678");
      assert.equal(ke07.country, "KE");

      const ke01 = normalizeAndValidatePhone("0112 345 678", "KE");
      assert.equal(ke01.valid, true);
      assert.equal(ke01.e164, "+254112345678");
      assert.equal(ke01.country, "KE");

      const keIntl = normalizeAndValidatePhone("+254 722 111 222", "KE");
      assert.equal(keIntl.valid, true);
      assert.equal(keIntl.e164, "+254722111222");
    });

    it("accepts international UK, US, UG, and FR phone numbers", () => {
      const uk = normalizeAndValidatePhone("07400 123456", "GB");
      assert.equal(uk.valid, true);
      assert.equal(uk.e164, "+447400123456");
      assert.equal(uk.country, "GB");

      const us = normalizeAndValidatePhone("(415) 555-2671", "US");
      assert.equal(us.valid, true);
      assert.equal(us.e164, "+14155552671");
      assert.equal(us.country, "US");

      const ug = normalizeAndValidatePhone("0772 123456", "UG");
      assert.equal(ug.valid, true);
      assert.equal(ug.e164, "+256772123456");
      assert.equal(ug.country, "UG");

      const fr = normalizeAndValidatePhone("06 12 34 56 78", "FR");
      assert.equal(fr.valid, true);
      assert.equal(fr.e164, "+33612345678");
      assert.equal(fr.country, "FR");
    });
  });

  describe("Attendance, Dietary, Message, Privacy, and Honeypot validation", () => {
    it("rejects unselected or invalid attendance", () => {
      assert.equal(validateAttendance(undefined).valid, false);
      assert.equal(validateAttendance("").valid, false);
      assert.equal(validateAttendance("maybe").valid, false);
      assert.equal(validateAttendance("attending").valid, true);
      assert.equal(validateAttendance("declining").valid, true);
    });

    it("enforces dietary max length (250) when attending and clears dietary when declining", () => {
      const ok250 = validateDietaryRequirements("a".repeat(250), "attending");
      assert.equal(ok250.valid, true);
      assert.equal(ok250.value?.length, 250);

      const over250 = validateDietaryRequirements("a".repeat(251), "attending");
      assert.equal(over250.valid, false);

      const clearedOnDecline = validateDietaryRequirements("Vegetarian, no nuts", "declining");
      assert.equal(clearedOnDecline.valid, true);
      assert.equal(clearedOnDecline.value, null);

      const clearedEvenIfLongOnDecline = validateDietaryRequirements("x".repeat(300), "declining");
      assert.equal(clearedEvenIfLongOnDecline.valid, true);
      assert.equal(clearedEvenIfLongOnDecline.value, null);
    });

    it("enforces congratulatory message max length (500)", () => {
      const empty = validateCongratulatoryMessage("   ");
      assert.equal(empty.valid, true);
      assert.equal(empty.value, null);

      const ok500 = validateCongratulatoryMessage("b".repeat(500));
      assert.equal(ok500.valid, true);
      assert.equal(ok500.value?.length, 500);

      const over500 = validateCongratulatoryMessage("b".repeat(501));
      assert.equal(over500.valid, false);
    });

    it("requires privacyAcknowledged === true and validates full attending & declining payloads", () => {
      const missingPrivacy = validateCreateRsvpInput({
        fullName: "Grace Wanjiku",
        phoneCountry: "KE",
        phoneNumber: "0712345678",
        attendance: "attending",
        privacyAcknowledged: false,
      });
      assert.equal(missingPrivacy.valid, false);
      if (!missingPrivacy.valid) {
        assert.ok(missingPrivacy.fieldErrors.privacyAcknowledged);
      }

      const validAttending = validateCreateRsvpInput({
        fullName: "Grace Wanjiku",
        phoneCountry: "KE",
        phoneNumber: "0712345678",
        attendance: "attending",
        dietaryRequirements: "Gluten-free",
        congratulatoryMessage: "Congratulations Majala & Florence!",
        privacyAcknowledged: true,
        honeypot: "",
      });
      assert.equal(validAttending.valid, true);
      if (validAttending.valid) {
        assert.equal(validAttending.data.attendeeCount, 1);
        assert.equal(validAttending.data.dietaryRequirements, "Gluten-free");
        assert.equal(validAttending.data.phoneE164, "+254712345678");
      }

      const validDeclining = validateCreateRsvpInput({
        fullName: "Jean-Luc O'Connor",
        phoneCountry: "FR",
        phoneNumber: "06 12 34 56 78",
        attendance: "declining",
        dietaryRequirements: "Should be cleared",
        congratulatoryMessage: "Wishing you both the very best!",
        privacyAcknowledged: true,
        honeypot: "",
      });
      assert.equal(validDeclining.valid, true);
      if (validDeclining.valid) {
        assert.equal(validDeclining.data.attendeeCount, 0);
        assert.equal(validDeclining.data.dietaryRequirements, null);
        assert.equal(validDeclining.data.phoneE164, "+33612345678");
      }
    });

    it("detects non-empty honeypot submissions", () => {
      const bot = validateCreateRsvpInput({
        fullName: "Bot Guest",
        phoneCountry: "KE",
        phoneNumber: "0712345678",
        attendance: "attending",
        privacyAcknowledged: true,
        honeypot: "https://spam.example.com",
      });
      assert.equal(bot.valid, false);
      if (!bot.valid) {
        assert.equal(bot.honeypotTriggered, true);
        assert.deepEqual(bot.fieldErrors, {});
      }
    });

    it("validates update payload and clears dietary when switching to declining", () => {
      const updateDeclining = validateUpdateRsvpInput({
        fullName: "Grace Wanjiku",
        phoneCountry: "KE",
        phoneNumber: "0712345678",
        attendance: "declining",
        dietaryRequirements: "Vegan",
        congratulatoryMessage: "Updated blessings!",
      });
      assert.equal(updateDeclining.valid, true);
      if (updateDeclining.valid) {
        assert.equal(updateDeclining.data.attendeeCount, 0);
        assert.equal(updateDeclining.data.dietaryRequirements, null);
      }
    });
  });

  describe("Closure and Retention boundaries", () => {
    it("enforces exact RSVP closure boundary in Africa/Nairobi (EAT, UTC+3)", () => {
      assert.equal(RSVP_CLOSURE_DEADLINE_ISO, "2026-12-12T00:00:00+03:00");
      assert.equal(isRsvpClosed(new Date("2026-12-11T23:59:59+03:00")), false);
      assert.equal(isRsvpClosed(new Date("2026-12-12T00:00:00+03:00")), true);
      assert.equal(isRsvpClosed(new Date("2026-12-12T12:00:00+03:00")), true);
    });

    it("enforces exact 90-day retention boundary in Africa/Nairobi (EAT, UTC+3)", () => {
      assert.equal(RETENTION_ANONYMIZATION_DATE_ISO, "2027-03-12T00:00:00+03:00");
      const closureMs = new Date(RSVP_CLOSURE_DEADLINE_ISO).getTime();
      const retentionMs = new Date(RETENTION_ANONYMIZATION_DATE_ISO).getTime();
      assert.equal((retentionMs - closureMs) / (24 * 60 * 60 * 1000), 90);

      assert.equal(isRetentionExpired(new Date("2027-03-11T23:59:59+03:00")), false);
      assert.equal(isRetentionExpired(new Date("2027-03-12T00:00:00+03:00")), true);
    });
  });

  describe("Management tokens", () => {
    it("generates unique 43-char base64url tokens with 256-bit entropy and valid SHA-256 hashes", () => {
      const seen = new Set();
      for (let i = 0; i < 100; i++) {
        const token = generateManagementToken();
        assert.equal(token.length, 43);
        assert.equal(isValidTokenFormat(token), true);
        assert.equal(seen.has(token), false);
        seen.add(token);

        const hash = hashManagementToken(token);
        assert.match(hash, /^[0-9a-f]{64}$/);
        assert.equal(verifyTokenMatchesHash(token, hash), true);
      }
    });

    it("verifyTokenMatchesHash rejects mismatched, modified, or malformed tokens/hashes", () => {
      const token = generateManagementToken();
      const hash = hashManagementToken(token);

      // Modify 1 character
      const flippedChar = token[0] === "A" ? "B" : "A";
      const modifiedToken = flippedChar + token.slice(1);
      assert.equal(verifyTokenMatchesHash(modifiedToken, hash), false);

      // Different valid token
      const otherToken = generateManagementToken();
      assert.equal(verifyTokenMatchesHash(otherToken, hash), false);

      // Malformed token / malformed hash
      assert.equal(verifyTokenMatchesHash("short", hash), false);
      assert.equal(verifyTokenMatchesHash(token, "not-a-sha256-hash"), false);
      assert.equal(verifyTokenMatchesHash(token, hash.slice(0, 62) + "zz"), false);
      assert.equal(verifyTokenMatchesHash(token, hash.toUpperCase()), true);
    });
  });
});
