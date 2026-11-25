import type { CountryCode } from "libphonenumber-js";
import type { AnonymizeExpiredResult, RetentionSummary } from "@/lib/rsvp/retention";
import type { AttendanceStatus } from "@/types/rsvp";

export type AdminRole = "admin";

export type AdminErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "INVALID_CREDENTIALS"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "CSRF_REJECTED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PAYLOAD_TOO_LARGE"
  | "INTERNAL_ERROR";

export type AdminFieldErrors = Partial<Record<string, string>>;

export interface AdminErrorResponse {
  ok: false;
  code: AdminErrorCode;
  message: string;
  fieldErrors?: AdminFieldErrors;
  retryAfterSeconds?: number;
}

export interface AuthenticatedAdmin {
  adminId: string;
  sessionId: string;
  email: string;
  displayName: string;
  role: AdminRole;
  lastLoginAt: string | null;
  passwordUpdatedAt: string;
  sessionExpiresAt: string;
}

export interface AdminLoginInput {
  email: string;
  password: string;
}

export interface AdminSessionResponse {
  ok: true;
  admin: AuthenticatedAdmin;
}

export interface AdminProfileUpdateInput {
  displayName?: string;
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
}

export interface AdminProfileUpdateResponse {
  ok: true;
  admin: AuthenticatedAdmin;
  otherSessionsRevoked: number;
}

export type AdminAuditAction =
  | "admin.bootstrap"
  | "auth.login.success"
  | "auth.login.failed"
  | "auth.logout"
  | "admin.profile_update"
  | "admin.password_change"
  | "rsvp.manual_create"
  | "rsvp.edit"
  | "rsvp.delete"
  | "rsvp.duplicate_resolve"
  | "report.export_csv"
  | "settings.update"
  | "retention.run";

export type AdminAuditTargetType =
  | "admin_user"
  | "admin_session"
  | "rsvp"
  | "event_settings"
  | "report"
  | "retention";

export interface AdminAuditLogEntry {
  id: number;
  actorAdminId: string | null;
  actorIdentifier: string | null;
  action: AdminAuditAction | (string & {});
  targetType: string | null;
  targetId: string | null;
  summary: string;
  metadata: Record<string, unknown>;
  ipHash: string | null;
  createdAt: string;
}

export interface AdminAuditLogListResponse {
  ok: true;
  items: AdminAuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  availableActions: string[];
}

export interface AdminEventGraduate {
  name: string;
  degree: string;
}

export interface LockedEventDetails {
  graduates: AdminEventGraduate[];
  graduatesSummary: string;
  dateLabel: string;
  timeLabel: string;
  venueName: string;
  timezone: string;
  utcOffset: string;
  timezoneLabel: string;
  closureDeadlineLabel: string;
  retentionDateLabel: string;
  retentionPeriodDays: number;
  backupRetentionDays: number;
}

export interface EventSettingsState {
  rsvpAcceptingResponses: boolean;
  allowGuestSelfEditing: boolean;
  closureDeadlineIso: string;
  manualOverrideReason: string | null;
  updatedByAdminId: string | null;
  updatedAt: string;
}

export type PolicyClosedReason =
  | "deadline_passed"
  | "manual_pause"
  | "self_editing_disabled"
  | null;

export interface EffectiveRsvpPolicy {
  isClosed: boolean;
  isAcceptingResponses: boolean;
  allowGuestSelfEditing: boolean;
  isManualClosed: boolean;
  isDeadlinePassed: boolean;
  isAcceptingNewRsvps: boolean;
  isSelfEditingAllowed: boolean;
  closedReason: PolicyClosedReason;
  closureDeadlineIso: string;
  manualOverrideReason: string | null;
  updatedAt: string | null;
}

export interface AdminSystemHealth {
  dbConnected: boolean;
  appVersion: string;
  nodeEnv: string;
  serverTimeIso: string;
  eventTimezone: string;
}

export interface AdminSettingsResponse {
  ok: true;
  eventDetails: LockedEventDetails;
  settings: EventSettingsState;
  effectivePolicy: EffectiveRsvpPolicy;
  retentionSummary: RetentionSummary;
  systemHealth: AdminSystemHealth;
  retentionRunResult?: AnonymizeExpiredResult;
}

export interface AdminSettingsUpdateInput {
  rsvpAcceptingResponses?: boolean;
  allowGuestSelfEditing?: boolean;
  closureDeadlineIso?: string;
  manualOverrideReason?: string | null;
  action?: "run_retention";
}

export type RsvpSubmissionSource = "web" | "admin_manual";

export type DuplicateReviewStatus =
  | "none"
  | "flagged"
  | "resolved_distinct"
  | "merged_archived";

export interface AdminRsvpRecord {
  id: string;
  fullName: string;
  phoneE164: string;
  phoneCountry: CountryCode;
  attendance: AttendanceStatus;
  attendeeCount: number;
  dietaryRequirements: string | null;
  congratulatoryMessage: string | null;
  submissionSource: RsvpSubmissionSource;
  duplicateReviewStatus: DuplicateReviewStatus;
  organizerNotes: string | null;
  createdByAdminId: string | null;
  updatedByAdminId: string | null;
  duplicateGroupId: string | null;
  mergedIntoRsvpId: string | null;
  duplicateReviewedAt: string | null;
  duplicateReviewedByAdminId: string | null;
  duplicateReviewNote: string | null;
  retentionExpiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminRsvpListCounts {
  total: number;
  attending: number;
  declining: number;
  withDietary: number;
  withMessage: number;
  flaggedDuplicates: number;
}

export interface AdminRsvpListResponse {
  ok: true;
  items: AdminRsvpRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  counts: AdminRsvpListCounts;
}

export interface AdminManualRsvpInput {
  fullName: string;
  phoneNumber: string;
  phoneCountry: CountryCode;
  attendance: AttendanceStatus;
  dietaryRequirements?: string;
  congratulatoryMessage?: string;
  organizerNotes?: string;
  sharedPhoneResolution?: "none" | "flag_duplicate" | "resolved_distinct";
}

export interface AdminUpdateRsvpInput {
  fullName: string;
  phoneNumber: string;
  phoneCountry: CountryCode;
  attendance: AttendanceStatus;
  dietaryRequirements?: string;
  congratulatoryMessage?: string;
  organizerNotes?: string | null;
}

export interface DuplicateCandidateGroup {
  groupKey: string;
  matchReason: "same_phone" | "similar_name";
  records: AdminRsvpRecord[];
}

export interface AdminDuplicatesResponse {
  ok: true;
  candidates: DuplicateCandidateGroup[];
  totalCandidates: number;
}

export interface AdminResolveDuplicateInput {
  resolution: "resolved_distinct" | "merged_archived" | "flag";
  primaryRsvpId: string;
  targetRsvpIds: string[];
  note?: string;
}

export interface OverviewDailySeriesPoint {
  date: string;
  total: number;
  attending: number;
  declining: number;
}

export interface OverviewSourceBreakdown {
  web: number;
  adminManual: number;
}

export interface AdminOverviewResponse {
  ok: true;
  totalResponses: number;
  attendingCount: number;
  decliningCount: number;
  attendanceRatePct: number;
  withDietaryCount: number;
  noDietarySuppliedCount: number;
  withMessageCount: number;
  flaggedDuplicatesCount: number;
  anonymizedCount: number;
  recentRsvps: AdminRsvpRecord[];
  dailySubmissionsSeries: OverviewDailySeriesPoint[];
  sourceBreakdown: OverviewSourceBreakdown;
  rsvpPolicy: EffectiveRsvpPolicy;
  retentionSummary: RetentionSummary;
}

export interface AdminMessageItem {
  id: string;
  fullName: string;
  attendance: AttendanceStatus;
  congratulatoryMessage: string;
  submissionSource: RsvpSubmissionSource;
  createdAt: string;
  updatedAt: string;
}

export interface AdminMessagesResponse {
  ok: true;
  items: AdminMessageItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AdminCateringSummary {
  attendingCount: number;
  withDietaryCount: number;
  noDietarySuppliedCount: number;
}

export interface AdminCateringResponse {
  ok: true;
  summary: AdminCateringSummary;
  items: AdminRsvpRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export type AdminReportType =
  | "full_rsvp"
  | "attending"
  | "declining"
  | "catering"
  | "messages"
  | "event_summary";

export interface AdminReportColumn {
  key: string;
  label: string;
}

export interface AdminReportSummaryMetrics {
  totalResponses: number;
  attendingCount: number;
  decliningCount: number;
  attendanceRatePct: number;
  withDietaryCount: number;
  noDietarySuppliedCount: number;
  withMessageCount: number;
  webCount: number;
  adminManualCount: number;
  anonymizedCount: number;
  generatedAtIso: string;
}

export interface AdminReportResponse {
  ok: true;
  reportType: AdminReportType;
  title: string;
  generatedAtIso: string;
  columns: AdminReportColumn[];
  rows: Record<string, string | number | null>[];
  summary: AdminReportSummaryMetrics;
  totalRows: number;
}
