import type { CountryCode } from "libphonenumber-js";

export type AttendanceStatus = "attending" | "declining";

export type RsvpErrorCode =
  | "VALIDATION_ERROR"
  | "RSVP_CLOSED"
  | "POSSIBLE_DUPLICATE_PHONE"
  | "DUPLICATE_REQUEST"
  | "RATE_LIMITED"
  | "INVALID_TOKEN"
  | "PAYLOAD_TOO_LARGE"
  | "INTERNAL_ERROR";

export type RsvpFieldErrors = Partial<
  Record<
    | "fullName"
    | "phoneNumber"
    | "phoneCountry"
    | "attendance"
    | "dietaryRequirements"
    | "congratulatoryMessage"
    | "privacyAcknowledged",
    string
  >
>;

export interface RsvpSubmissionInput {
  fullName: string;
  phoneNumber: string;
  phoneCountry: CountryCode;
  attendance: AttendanceStatus;
  dietaryRequirements?: string;
  congratulatoryMessage?: string;
  privacyAcknowledged: boolean;
  honeypot?: string;
  idempotencyKey?: string;
}

export interface RsvpUpdateInput {
  fullName: string;
  phoneNumber: string;
  phoneCountry: CountryCode;
  attendance: AttendanceStatus;
  dietaryRequirements?: string;
  congratulatoryMessage?: string;
}

export interface RsvpGuestSummary {
  fullName: string;
  phoneE164: string;
  phoneCountry: CountryCode;
  attendance: AttendanceStatus;
  attendeeCount: number;
  dietaryRequirements: string | null;
  congratulatoryMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRsvpSuccessResponse {
  ok: true;
  rsvp: RsvpGuestSummary;
  managementPath: string;
  closureDeadlineIso: string;
}

export interface ManageRsvpSuccessResponse {
  ok: true;
  rsvp: RsvpGuestSummary;
  isClosed: boolean;
  closureDeadlineIso: string;
  retentionDateIso: string;
}

export interface UpdateRsvpSuccessResponse {
  ok: true;
  rsvp: RsvpGuestSummary;
  isClosed: boolean;
  closureDeadlineIso: string;
}

export interface RsvpStatusResponse {
  ok: true;
  isClosed: boolean;
  closureDeadlineIso: string;
  retentionDateIso: string;
}

export interface RsvpErrorResponse {
  ok: false;
  code: RsvpErrorCode;
  message: string;
  fieldErrors?: RsvpFieldErrors;
  retryAfterSeconds?: number;
}
