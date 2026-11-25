/**
 * Authoritative Event, Closure, and Data Retention Configuration.
 *
 * Single source of truth for Majala & Achala's Graduation & Thanksgiving
 * Celebration. All closure and retention enforcement across frontend and
 * backend must derive from this module.
 */

export const EVENT_TIMEZONE = "Africa/Nairobi" as const;
export const EVENT_UTC_OFFSET = "+03:00" as const;

/**
 * Authoritative RSVP closure deadline:
 * Saturday, 12 December 2026 at 12:00 AM (00:00:00) Africa/Nairobi (EAT, UTC+3).
 */
export const RSVP_CLOSURE_DEADLINE_ISO = "2026-12-12T00:00:00+03:00" as const;
export const RSVP_CLOSURE_DEADLINE = new Date(RSVP_CLOSURE_DEADLINE_ISO);

/**
 * Authoritative personal-data retention deadline:
 * 90 days after the event date (12 December 2026 -> 12 March 2027 00:00:00 EAT).
 */
export const RETENTION_PERIOD_DAYS = 90 as const;
export const RETENTION_ANONYMIZATION_DATE_ISO =
  "2027-03-12T00:00:00+03:00" as const;
export const RETENTION_ANONYMIZATION_DATE = new Date(
  RETENTION_ANONYMIZATION_DATE_ISO,
);

/**
 * Documented database backup retention limit.
 */
export const BACKUP_RETENTION_DAYS = 14 as const;

export const EVENT_DETAILS = {
  graduates: [
    {
      name: "Majala Mwaila",
      degree: "Bachelor's Degree in Education (Mathematics)",
    },
    {
      name: "Achala Mwaila",
      degree: "Bachelor's Degree in French and Sociology",
    },
  ],
  graduatesSummary: "Majala & Achala",
  dateLabel: "Saturday, 12 December 2026",
  timeLabel: "12:00 PM",
  venueName: "Rainbow Ruiru Resort",
  timezone: EVENT_TIMEZONE,
  closureDeadlineLabel: "Saturday, 12 December 2026 at 12:00 AM (EAT)",
  retentionDateLabel: "12 March 2027",
} as const;

export const RSVP_LIMITS = {
  nameMinLength: 2,
  nameMaxLength: 120,
  dietaryMaxLength: 250,
  messageMaxLength: 500,
  maxJsonBodyBytes: 16 * 1024,
} as const;

export const PRIVACY_NOTICE_COPY = {
  checkboxLabel: "I have read and understood the privacy notice.",
  title: "Privacy & Data Notice",
  points: [
    "We collect only your full name, phone number, attendance response, optional dietary requirements (if attending), and optional congratulatory message.",
    "This information is collected solely to coordinate seating, hospitality, and catering for Majala & Achala's Graduation & Thanksgiving Celebration.",
    "Only the event organizers and authorized administrators can access submitted RSVP details; guest responses and attendee lists are never publicly displayed.",
    "You will receive a personal RSVP management link after submitting so you can review or update your response anytime before Saturday, 12 December 2026 at 12:00 AM (Africa/Nairobi).",
    "No email or SMS confirmations or reminders will be sent.",
    "All personal RSVP data is retained for 90 days after the celebration and will be irreversibly anonymized on 12 March 2027 (retaining only non-identifying attendance totals).",
  ],
} as const;

export const CLOSED_RSVP_COPY = {
  heading: "RSVPs are now closed.",
  body: "Thank you to everyone who responded and helped us prepare for this special day. We look forward to celebrating with you.",
} as const;

/**
 * Returns the authoritative current server time.
 *
 * Accepts an explicit override for deterministic unit tests, or reads the
 * server-only `RSVP_SIMULATED_NOW_ISO` environment variable when configured in
 * isolated verification runs. Client headers or query parameters are never
 * consulted.
 */
export function getAuthoritativeNow(overrideNow?: Date): Date {
  if (overrideNow instanceof Date && Number.isFinite(overrideNow.getTime())) {
    return overrideNow;
  }

  if (typeof window === "undefined") {
    const simulatedIso = process.env.RSVP_SIMULATED_NOW_ISO?.trim();
    if (simulatedIso) {
      const parsed = new Date(simulatedIso);
      if (Number.isFinite(parsed.getTime())) {
        return parsed;
      }
    }
  }

  return new Date();
}

export function isRsvpClosed(now: Date = getAuthoritativeNow()): boolean {
  return now.getTime() >= RSVP_CLOSURE_DEADLINE.getTime();
}

export function isRetentionExpired(now: Date = getAuthoritativeNow()): boolean {
  return now.getTime() >= RETENTION_ANONYMIZATION_DATE.getTime();
}
