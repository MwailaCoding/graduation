"use client";

import Link from "next/link";
import { useState } from "react";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import {
  formatDietaryLabel,
  formatDuplicateStatusLabel,
  formatEatDateTime,
  formatSourceLabel,
} from "@/lib/admin/format";
import type {
  AdminDuplicatesResponse,
  DuplicateCandidateGroup,
} from "@/types/admin";

interface DuplicateReviewWorkspaceProps {
  initialData: AdminDuplicatesResponse;
}

export function DuplicateReviewWorkspace({
  initialData,
}: DuplicateReviewWorkspaceProps) {
  const [data, setData] = useState<AdminDuplicatesResponse>(initialData);
  const [selectedPrimaryByGroup, setSelectedPrimaryByGroup] = useState<
    Record<string, string>
  >(() => {
    const map: Record<string, string> = {};
    for (const group of initialData.candidates) {
      if (group.records[0]) {
        map[group.groupKey] = group.records[0].id;
      }
    }
    return map;
  });
  const [noteByGroup, setNoteByGroup] = useState<Record<string, string>>({});
  const [busyGroup, setBusyGroup] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingArchiveGroup, setPendingArchiveGroup] =
    useState<DuplicateCandidateGroup | null>(null);

  async function refreshCandidates() {
    const res = await fetch("/api/admin/rsvps/duplicates", {
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as
      | AdminDuplicatesResponse
      | null;
    if (res.ok && json?.ok) {
      setData(json);
      setSelectedPrimaryByGroup((prev) => {
        const next = { ...prev };
        for (const group of json.candidates) {
          if (!next[group.groupKey] && group.records[0]) {
            next[group.groupKey] = group.records[0].id;
          }
        }
        return next;
      });
    }
  }

  async function handleResolve(
    group: DuplicateCandidateGroup,
    resolution: "resolved_distinct" | "merged_archived",
  ) {
    const primaryRsvpId =
      selectedPrimaryByGroup[group.groupKey] ?? group.records[0]?.id;
    if (!primaryRsvpId) return;
    const targetRsvpIds = group.records
      .map((r) => r.id)
      .filter((id) => id !== primaryRsvpId);
    if (targetRsvpIds.length === 0) return;

    setBusyGroup(group.groupKey);
    setError(null);
    setFeedback(null);

    try {
      const res = await fetch("/api/admin/rsvps/duplicates/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resolution,
          primaryRsvpId,
          targetRsvpIds,
          note: noteByGroup[group.groupKey] ?? "",
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
      } | null;

      if (!res.ok || !json?.ok) {
        setError(json?.message ?? "Unable to resolve duplicate group.");
        return;
      }

      setFeedback(
        resolution === "resolved_distinct"
          ? "Records marked as distinct guests sharing a phone number. Both remain active."
          : "Confirmed duplicate archived and excluded from attendance totals.",
      );
      await refreshCandidates();
    } catch {
      setError("Network error while resolving duplicate group.");
    } finally {
      setBusyGroup(null);
      setPendingArchiveGroup(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-warm-sand pb-4">
        <Link
          href="/admin/rsvps"
          className="inline-flex min-h-[44px] items-center text-xs font-semibold uppercase tracking-[0.14em] text-forest-green/80 hover:underline"
        >
          ← Back to RSVP Management
        </Link>
        <h1 className="mt-1 font-serif text-2xl font-semibold text-forest-green sm:text-3xl">
          Duplicate Review
        </h1>
        <p className="mt-1 text-sm text-forest-green/80">
          Inspect suspected duplicate RSVPs side-by-side. Records are never
          automatically merged — shared household phone numbers are valid and
          can be retained as distinct guests.
        </p>
      </div>

      {feedback && (
        <div
          role="status"
          className="border border-forest-green/35 bg-soft-sage/25 px-4 py-3 text-sm text-forest-green"
        >
          {feedback}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="border border-[#7A271A]/35 bg-[#FDF3F2] px-4 py-3 text-sm text-[#7A271A]"
        >
          {error}
        </div>
      )}

      {data.candidates.length === 0 ? (
        <div className="border border-warm-sand bg-[#FCFBF7] px-6 py-12 text-center">
          <h2 className="font-serif text-lg font-semibold text-forest-green">
            No suspected duplicates to review
          </h2>
          <p className="mt-2 text-sm text-forest-green/80">
            All active RSVP records currently have no unresolved phone or name
            conflicts.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {data.candidates.map((group) => {
            const primaryId =
              selectedPrimaryByGroup[group.groupKey] ?? group.records[0]?.id;
            const isBusy = busyGroup === group.groupKey;

            return (
              <section
                key={group.groupKey}
                className="border border-warm-sand bg-[#FCFBF7] p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-warm-sand pb-3">
                  <div>
                    <h2 className="font-serif text-lg font-semibold text-forest-green">
                      {group.matchReason === "same_phone"
                        ? "Shared Phone Number"
                        : "Matching Guest Name"}
                    </h2>
                    <p className="text-xs text-forest-green/75">
                      {group.records.length} records to compare side-by-side
                    </p>
                  </div>
                </div>

                {/* Side-by-side comparison cards */}
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {group.records.map((rec) => {
                    const isPrimary = primaryId === rec.id;
                    return (
                      <div
                        key={rec.id}
                        className={`border p-4 ${
                          isPrimary
                            ? "border-forest-green bg-warm-ivory"
                            : "border-warm-sand bg-warm-ivory/40"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm font-semibold text-forest-green">
                            <input
                              type="radio"
                              name={`primary-${group.groupKey}`}
                              checked={isPrimary}
                              onChange={() =>
                                setSelectedPrimaryByGroup((prev) => ({
                                  ...prev,
                                  [group.groupKey]: rec.id,
                                }))
                              }
                              className="h-4 w-4 accent-forest-green"
                            />
                            <span>{rec.fullName}</span>
                          </label>
                          <span className="shrink-0 border border-forest-green/30 px-2 py-0.5 text-xs font-medium text-forest-green">
                            {isPrimary ? "Primary" : "Candidate"}
                          </span>
                        </div>

                        <dl className="mt-2 space-y-1.5 text-xs text-forest-green/85">
                          <div>
                            <dt className="inline font-semibold">Phone: </dt>
                            <dd className="inline font-mono">
                              {rec.phoneE164}
                            </dd>
                          </div>
                          <div>
                            <dt className="inline font-semibold">
                              Attendance:{" "}
                            </dt>
                            <dd className="inline">
                              {rec.attendance === "attending"
                                ? "Attending"
                                : "Declining"}
                            </dd>
                          </div>
                          <div>
                            <dt className="inline font-semibold">Dietary: </dt>
                            <dd className="inline">
                              {rec.attendance === "declining"
                                ? "N/A"
                                : formatDietaryLabel(rec.dietaryRequirements)}
                            </dd>
                          </div>
                          <div>
                            <dt className="inline font-semibold">Message: </dt>
                            <dd className="inline">
                              {rec.congratulatoryMessage ? "Included" : "None"}
                            </dd>
                          </div>
                          <div>
                            <dt className="inline font-semibold">Source: </dt>
                            <dd className="inline">
                              {formatSourceLabel(rec.submissionSource)} ·{" "}
                              {formatDuplicateStatusLabel(
                                rec.duplicateReviewStatus,
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt className="inline font-semibold">
                              Submitted:{" "}
                            </dt>
                            <dd className="inline">
                              {formatEatDateTime(rec.createdAt)}
                            </dd>
                          </div>
                        </dl>

                        <div className="mt-3">
                          <Link
                            href={`/admin/guests/${rec.id}`}
                            className="inline-flex min-h-[44px] items-center text-xs font-semibold text-forest-green underline underline-offset-4"
                          >
                            Open Guest Detail to Edit / Delete
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Review Note & Resolution Actions */}
                <div className="mt-4 space-y-3 border-t border-warm-sand pt-4">
                  <div>
                    <label
                      htmlFor={`note-${group.groupKey}`}
                      className="block text-xs font-semibold uppercase tracking-wider text-forest-green/75"
                    >
                      Resolution Note (Optional)
                    </label>
                    <input
                      id={`note-${group.groupKey}`}
                      type="text"
                      maxLength={500}
                      value={noteByGroup[group.groupKey] ?? ""}
                      onChange={(e) =>
                        setNoteByGroup((prev) => ({
                          ...prev,
                          [group.groupKey]: e.target.value,
                        }))
                      }
                      placeholder="e.g. Spouses sharing one mobile phone"
                      className="mt-1 min-h-[44px] w-full border border-forest-green/25 bg-warm-ivory px-3 py-2 text-sm text-forest-green"
                    />
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() =>
                        void handleResolve(group, "resolved_distinct")
                      }
                      className="min-h-[44px] border border-forest-green bg-forest-green px-4 py-2 text-sm font-medium text-warm-ivory hover:bg-forest-green/90 disabled:opacity-60"
                    >
                      Keep Both as Distinct Guests
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => setPendingArchiveGroup(group)}
                      className="min-h-[44px] border border-[#7A271A]/45 bg-[#FDF3F2] px-4 py-2 text-sm font-medium text-[#7A271A] hover:bg-[#7A271A] hover:text-warm-ivory disabled:opacity-60"
                    >
                      Archive Duplicate (Keep Primary)
                    </button>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={pendingArchiveGroup !== null}
        title="Archive Confirmed Duplicate?"
        description="The selected primary record will remain active. Other record(s) in this group will be archived as merged duplicates, excluded from attendance totals, and their guest management links invalidated."
        confirmLabel="Confirm Archive"
        cancelLabel="Cancel"
        destructive
        busy={busyGroup !== null}
        onConfirm={() => {
          if (pendingArchiveGroup) {
            void handleResolve(pendingArchiveGroup, "merged_archived");
          }
        }}
        onCancel={() => setPendingArchiveGroup(null)}
      />
    </div>
  );
}
