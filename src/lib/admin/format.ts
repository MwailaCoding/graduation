import type { DuplicateReviewStatus, RsvpSubmissionSource } from "@/types/admin";

export function formatEatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatEatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatSourceLabel(source: RsvpSubmissionSource): string {
  return source === "admin_manual" ? "Admin Manual" : "Website";
}

export function formatDuplicateStatusLabel(
  status: DuplicateReviewStatus,
): string {
  switch (status) {
    case "flagged":
      return "Flagged for Review";
    case "resolved_distinct":
      return "Resolved (Distinct Guests)";
    case "merged_archived":
      return "Archived Duplicate";
    default:
      return "None";
  }
}

export function formatDietaryLabel(raw: string | null | undefined): string {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return "No dietary supplied";
  }
  return raw.trim();
}

export function calculateDaysUntilEvent(now: Date = new Date()): number {
  const eventMs = new Date("2026-12-12T12:00:00+03:00").getTime();
  const diffMs = eventMs - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}
