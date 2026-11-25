"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  formatDietaryLabel,
  formatEatDateTime,
  formatSourceLabel,
} from "@/lib/admin/format";
import type { AdminRsvpListResponse, AdminRsvpRecord } from "@/types/admin";

interface RsvpTableWorkspaceProps {
  mode: "management" | "directory";
  initialData: AdminRsvpListResponse;
  initialAttendance?: string;
  initialSort?: string;
  initialOrder?: string;
}

export function RsvpTableWorkspace({
  mode,
  initialData,
  initialAttendance = "all",
  initialSort = mode === "directory" ? "full_name" : "created_at",
  initialOrder = mode === "directory" ? "asc" : "desc",
}: RsvpTableWorkspaceProps) {
  const [data, setData] = useState<AdminRsvpListResponse>(initialData);
  const [search, setSearch] = useState("");
  const [attendance, setAttendance] = useState(initialAttendance);
  const [dietary, setDietary] = useState("all");
  const [message, setMessage] = useState("all");
  const [source, setSource] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sort, setSort] = useState(initialSort);
  const [order, setOrder] = useState(initialOrder);
  const [page, setPage] = useState(initialData.page);
  const [pageSize, setPageSize] = useState(initialData.pageSize);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isFirstRender = useRef(true);

  const buildQueryString = useCallback(
    (overrides?: { page?: number }) => {
      const sp = new URLSearchParams();
      if (search.trim()) sp.set("q", search.trim());
      if (attendance !== "all") sp.set("attendance", attendance);
      if (dietary !== "all") sp.set("dietary", dietary);
      if (message !== "all") sp.set("message", message);
      if (source !== "all") sp.set("source", source);
      if (fromDate) sp.set("from", fromDate);
      if (toDate) sp.set("to", toDate);
      sp.set("sort", sort);
      sp.set("order", order);
      sp.set("page", String(overrides?.page ?? page));
      sp.set("pageSize", String(pageSize));
      return sp.toString();
    },
    [
      search,
      attendance,
      dietary,
      message,
      source,
      fromDate,
      toDate,
      sort,
      order,
      page,
      pageSize,
    ],
  );

  const fetchRecords = useCallback(
    async (targetPage?: number) => {
      setLoading(true);
      setError(null);
      try {
        const qs = buildQueryString(
          targetPage !== undefined ? { page: targetPage } : undefined,
        );
        const res = await fetch(`/api/admin/rsvps?${qs}`, {
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as
          | AdminRsvpListResponse
          | { ok: false; message?: string }
          | null;

        if (!res.ok || !json || !json.ok) {
          setError(
            (json && "message" in json && json.message) ||
              "Unable to load RSVP records.",
          );
          return;
        }
        setData(json);
        setSelectedIds(new Set());
      } catch {
        setError("Network error while loading RSVP records.");
      } finally {
        setLoading(false);
      }
    },
    [buildQueryString],
  );

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const timer = setTimeout(() => {
      void fetchRecords();
    }, 200);
    return () => clearTimeout(timer);
  }, [fetchRecords]);

  function handleClearFilters() {
    setSearch("");
    setAttendance("all");
    setDietary("all");
    setMessage("all");
    setSource("all");
    setFromDate("");
    setToDate("");
    setSort(mode === "directory" ? "full_name" : "created_at");
    setOrder(mode === "directory" ? "asc" : "desc");
    setPage(1);
  }

  function toggleRowSelection(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === data.items.length && data.items.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.items.map((r) => r.id)));
    }
  }

  const exportUrl = `/api/admin/reports/export?type=full_rsvp&${buildQueryString({ page: 1 })}`;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-warm-sand pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-forest-green/75">
            {mode === "management" ? "Administrative Workspace" : "Guest Lookup"}
          </p>
          <h1 className="mt-1 font-serif text-2xl font-semibold text-forest-green sm:text-3xl">
            {mode === "management" ? "RSVP Management" : "Guest Directory"}
          </h1>
          <p className="mt-1 text-sm text-forest-green/80">
            Showing {data.items.length} of {data.total} matching record
            {data.total === 1 ? "" : "s"} ({data.counts.attending} attending,{" "}
            {data.counts.declining} declining overall)
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {mode === "management" && (
            <>
              <Link
                href="/admin/rsvps/duplicates"
                className="inline-flex min-h-[44px] items-center border border-forest-green/35 bg-warm-ivory px-3.5 py-2 text-sm font-medium text-forest-green hover:bg-warm-sand/60"
              >
                Duplicate Review
                {data.counts.flaggedDuplicates > 0
                  ? ` (${data.counts.flaggedDuplicates})`
                  : ""}
              </Link>
              <a
                href={exportUrl}
                className="inline-flex min-h-[44px] items-center border border-forest-green/35 bg-warm-ivory px-3.5 py-2 text-sm font-medium text-forest-green hover:bg-warm-sand/60"
              >
                Export Filtered CSV
              </a>
              <Link
                href="/admin/rsvps/new"
                className="inline-flex min-h-[44px] items-center border border-forest-green bg-forest-green px-4 py-2 text-sm font-medium text-warm-ivory hover:bg-forest-green/90"
              >
                + Manual RSVP
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Filters & Search Panel */}
      <section
        aria-label="Search and filter guests"
        className="border border-warm-sand bg-[#FCFBF7] p-4"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <label
              htmlFor="rsvp-search-input"
              className="block text-xs font-semibold uppercase tracking-wider text-forest-green/80"
            >
              Search by Guest Name or Phone
            </label>
            <input
              id="rsvp-search-input"
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="e.g. Grace Wanjiku or +2547..."
              className="mt-1 min-h-[44px] w-full border border-forest-green/25 bg-warm-ivory px-3 py-2 text-sm text-forest-green placeholder:text-forest-green/45 focus:border-forest-green focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="rsvp-filter-attendance"
              className="block text-xs font-semibold uppercase tracking-wider text-forest-green/80"
            >
              Attendance
            </label>
            <select
              id="rsvp-filter-attendance"
              value={attendance}
              onChange={(e) => {
                setAttendance(e.target.value);
                setPage(1);
              }}
              className="mt-1 min-h-[44px] w-full border border-forest-green/25 bg-warm-ivory px-3 py-2 text-sm text-forest-green focus:border-forest-green focus:outline-none"
            >
              <option value="all">All</option>
              <option value="attending">Attending</option>
              <option value="declining">Declining</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="rsvp-sort-select"
              className="block text-xs font-semibold uppercase tracking-wider text-forest-green/80"
            >
              Sort By
            </label>
            <select
              id="rsvp-sort-select"
              value={`${sort}:${order}`}
              onChange={(e) => {
                const [nextSort, nextOrder] = e.target.value.split(":");
                setSort(nextSort);
                setOrder(nextOrder);
                setPage(1);
              }}
              className="mt-1 min-h-[44px] w-full border border-forest-green/25 bg-warm-ivory px-3 py-2 text-sm text-forest-green focus:border-forest-green focus:outline-none"
            >
              <option value="created_at:desc">Newest Submitted</option>
              <option value="created_at:asc">Oldest Submitted</option>
              <option value="updated_at:desc">Recently Updated</option>
              <option value="full_name:asc">Name (A–Z)</option>
              <option value="full_name:desc">Name (Z–A)</option>
            </select>
          </div>

          {mode === "management" && (
            <>
              <div>
                <label
                  htmlFor="rsvp-filter-dietary"
                  className="block text-xs font-semibold uppercase tracking-wider text-forest-green/80"
                >
                  Dietary Info
                </label>
                <select
                  id="rsvp-filter-dietary"
                  value={dietary}
                  onChange={(e) => {
                    setDietary(e.target.value);
                    setPage(1);
                  }}
                  className="mt-1 min-h-[44px] w-full border border-forest-green/25 bg-warm-ivory px-3 py-2 text-sm text-forest-green focus:border-forest-green focus:outline-none"
                >
                  <option value="all">All</option>
                  <option value="has_dietary">Dietary Supplied</option>
                  <option value="no_dietary">No Dietary Supplied</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="rsvp-filter-message"
                  className="block text-xs font-semibold uppercase tracking-wider text-forest-green/80"
                >
                  Message
                </label>
                <select
                  id="rsvp-filter-message"
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value);
                    setPage(1);
                  }}
                  className="mt-1 min-h-[44px] w-full border border-forest-green/25 bg-warm-ivory px-3 py-2 text-sm text-forest-green focus:border-forest-green focus:outline-none"
                >
                  <option value="all">All</option>
                  <option value="has_message">Has Message</option>
                  <option value="no_message">No Message</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="rsvp-filter-source"
                  className="block text-xs font-semibold uppercase tracking-wider text-forest-green/80"
                >
                  Source
                </label>
                <select
                  id="rsvp-filter-source"
                  value={source}
                  onChange={(e) => {
                    setSource(e.target.value);
                    setPage(1);
                  }}
                  className="mt-1 min-h-[44px] w-full border border-forest-green/25 bg-warm-ivory px-3 py-2 text-sm text-forest-green focus:border-forest-green focus:outline-none"
                >
                  <option value="all">All Sources</option>
                  <option value="web">Website</option>
                  <option value="admin_manual">Admin Manual</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label
                    htmlFor="rsvp-filter-from"
                    className="block text-xs font-semibold uppercase tracking-wider text-forest-green/80"
                  >
                    From
                  </label>
                  <input
                    id="rsvp-filter-from"
                    type="date"
                    value={fromDate}
                    onChange={(e) => {
                      setFromDate(e.target.value);
                      setPage(1);
                    }}
                    className="mt-1 min-h-[44px] w-full border border-forest-green/25 bg-warm-ivory px-2 py-2 text-xs text-forest-green focus:border-forest-green focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="rsvp-filter-to"
                    className="block text-xs font-semibold uppercase tracking-wider text-forest-green/80"
                  >
                    To
                  </label>
                  <input
                    id="rsvp-filter-to"
                    type="date"
                    value={toDate}
                    onChange={(e) => {
                      setToDate(e.target.value);
                      setPage(1);
                    }}
                    className="mt-1 min-h-[44px] w-full border border-forest-green/25 bg-warm-ivory px-2 py-2 text-xs text-forest-green focus:border-forest-green focus:outline-none"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-warm-sand pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleClearFilters}
              className="min-h-[44px] border border-forest-green/30 bg-warm-ivory px-3.5 py-2 text-xs font-medium text-forest-green hover:bg-warm-sand/60"
            >
              Clear Filters
            </button>
            <button
              type="button"
              onClick={() => void fetchRecords()}
              disabled={loading}
              className="min-h-[44px] border border-forest-green/30 bg-warm-ivory px-3.5 py-2 text-xs font-medium text-forest-green hover:bg-warm-sand/60 disabled:opacity-60"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
            {selectedIds.size > 0 && (
              <span className="text-xs font-semibold text-forest-green">
                {selectedIds.size} selected
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <label
              htmlFor="rsvp-page-size"
              className="text-xs font-medium text-forest-green/80"
            >
              Rows per page
            </label>
            <select
              id="rsvp-page-size"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="min-h-[44px] border border-forest-green/25 bg-warm-ivory px-2.5 py-1.5 text-xs text-forest-green"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
      </section>

      {/* Error State */}
      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 border border-[#7A271A]/35 bg-[#FDF3F2] px-4 py-3 text-sm text-[#7A271A]"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void fetchRecords()}
            className="min-h-[44px] border border-[#7A271A]/40 px-3 py-1.5 text-xs font-semibold text-[#7A271A]"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && data.items.length === 0 ? (
        <div className="border border-warm-sand bg-[#FCFBF7] px-6 py-12 text-center">
          <h2 className="font-serif text-lg font-semibold text-forest-green">
            No matching guests found
          </h2>
          <p className="mt-2 text-sm text-forest-green/80">
            Adjust your search query or filters, or add a manual RSVP entry.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={handleClearFilters}
              className="min-h-[44px] border border-forest-green/35 bg-warm-ivory px-4 py-2 text-sm font-medium text-forest-green"
            >
              Reset Filters
            </button>
            <Link
              href="/admin/rsvps/new"
              className="inline-flex min-h-[44px] items-center bg-forest-green px-4 py-2 text-sm font-medium text-warm-ivory"
            >
              Add RSVP Manually
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden overflow-x-auto border border-warm-sand bg-[#FCFBF7] md:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-warm-sand bg-warm-sand/35 text-xs font-semibold uppercase tracking-wider text-forest-green">
                  {mode === "management" && (
                    <th className="w-12 px-3 py-3">
                      <input
                        type="checkbox"
                        aria-label="Select all visible rows"
                        checked={
                          data.items.length > 0 &&
                          selectedIds.size === data.items.length
                        }
                        onChange={toggleSelectAll}
                        className="h-4 w-4 accent-forest-green"
                      />
                    </th>
                  )}
                  <th className="px-4 py-3">Guest Name</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Attendance</th>
                  <th className="px-4 py-3">Dietary</th>
                  <th className="px-4 py-3">Message</th>
                  <th className="px-4 py-3">Submitted</th>
                  <th className="px-4 py-3">Last Updated</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-sand">
                {data.items.map((rsvp: AdminRsvpRecord) => (
                  <tr
                    key={rsvp.id}
                    className="transition-colors hover:bg-warm-ivory/75"
                  >
                    {mode === "management" && (
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          aria-label={`Select ${rsvp.fullName}`}
                          checked={selectedIds.has(rsvp.id)}
                          onChange={() => toggleRowSelection(rsvp.id)}
                          className="h-4 w-4 accent-forest-green"
                        />
                      </td>
                    )}
                    <td className="px-4 py-3 font-medium text-forest-green">
                      <Link
                        href={`/admin/guests/${rsvp.id}`}
                        className="inline-flex min-h-[44px] items-center hover:underline"
                      >
                        {rsvp.fullName}
                      </Link>
                      <span className="block text-xs font-normal text-forest-green/70">
                        {formatSourceLabel(rsvp.submissionSource)}
                        {rsvp.duplicateReviewStatus === "flagged"
                          ? " · Flagged duplicate"
                          : ""}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-forest-green">
                      {rsvp.phoneE164}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`inline-flex items-center border px-2.5 py-0.5 text-xs font-medium ${
                          rsvp.attendance === "attending"
                            ? "border-forest-green/35 bg-soft-sage/25 text-forest-green"
                            : "border-champagne-gold/70 bg-warm-sand/55 text-forest-green"
                        }`}
                      >
                        {rsvp.attendance === "attending"
                          ? "Attending"
                          : "Declining"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-forest-green/85">
                      {rsvp.attendance === "declining"
                        ? "N/A"
                        : rsvp.dietaryRequirements
                          ? "Supplied"
                          : "No dietary supplied"}
                    </td>
                    <td className="px-4 py-3 text-xs text-forest-green/85">
                      {rsvp.congratulatoryMessage ? "Yes" : "None"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-forest-green/80">
                      {formatEatDateTime(rsvp.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-forest-green/80">
                      {formatEatDateTime(rsvp.updatedAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <Link
                        href={`/admin/guests/${rsvp.id}`}
                        className="inline-flex min-h-[44px] items-center border border-forest-green/30 bg-warm-ivory px-3 py-1.5 text-xs font-semibold text-forest-green hover:bg-warm-sand/60"
                      >
                        View Details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Responsive Cards */}
          <div className="space-y-3 md:hidden">
            {data.items.map((rsvp) => (
              <article
                key={rsvp.id}
                className="border border-warm-sand bg-[#FCFBF7] p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="break-words font-serif text-base font-semibold text-forest-green">
                      {rsvp.fullName}
                    </h2>
                    <p className="mt-0.5 font-mono text-xs text-forest-green/80">
                      {rsvp.phoneE164}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 border px-2.5 py-0.5 text-xs font-medium ${
                      rsvp.attendance === "attending"
                        ? "border-forest-green/35 bg-soft-sage/25 text-forest-green"
                        : "border-champagne-gold/70 bg-warm-sand/55 text-forest-green"
                    }`}
                  >
                    {rsvp.attendance === "attending" ? "Attending" : "Declining"}
                  </span>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-warm-sand pt-3 text-xs">
                  <div>
                    <dt className="text-forest-green/70">Dietary</dt>
                    <dd className="mt-0.5 font-medium text-forest-green">
                      {rsvp.attendance === "declining"
                        ? "N/A"
                        : formatDietaryLabel(rsvp.dietaryRequirements)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-forest-green/70">Message</dt>
                    <dd className="mt-0.5 font-medium text-forest-green">
                      {rsvp.congratulatoryMessage ? "Included" : "None"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-forest-green/70">Submitted</dt>
                    <dd className="mt-0.5 text-forest-green">
                      {formatEatDateTime(rsvp.createdAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-forest-green/70">Source</dt>
                    <dd className="mt-0.5 text-forest-green">
                      {formatSourceLabel(rsvp.submissionSource)}
                    </dd>
                  </div>
                </dl>

                <div className="mt-3 border-t border-warm-sand pt-3">
                  <Link
                    href={`/admin/guests/${rsvp.id}`}
                    className="inline-flex min-h-[44px] w-full items-center justify-center border border-forest-green bg-forest-green px-4 py-2 text-sm font-medium text-warm-ivory"
                  >
                    View &amp; Manage Guest
                  </Link>
                </div>
              </article>
            ))}
          </div>

          {/* Pagination */}
          <nav
            aria-label="Pagination"
            className="flex flex-wrap items-center justify-between gap-3 border border-warm-sand bg-[#FCFBF7] px-4 py-3 text-sm"
          >
            <p className="text-xs text-forest-green/80">
              Page {data.page} of {data.totalPages} ({data.total} total)
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={data.page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="min-h-[44px] border border-forest-green/30 bg-warm-ivory px-4 py-2 text-xs font-medium text-forest-green hover:bg-warm-sand/60 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={data.page >= data.totalPages || loading}
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                className="min-h-[44px] border border-forest-green/30 bg-warm-ivory px-4 py-2 text-xs font-medium text-forest-green hover:bg-warm-sand/60 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </nav>
        </>
      )}
    </div>
  );
}
