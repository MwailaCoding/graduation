"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatEatDateTime } from "@/lib/admin/format";
import type { AdminAuditLogListResponse } from "@/types/admin";

interface ActivityLogClientProps {
  initialData: AdminAuditLogListResponse;
}

export function ActivityLogClient({ initialData }: ActivityLogClientProps) {
  const [data, setData] = useState<AdminAuditLogListResponse>(initialData);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [page, setPage] = useState(initialData.page);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isFirstRender = useRef(true);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams();
      if (search.trim()) sp.set("q", search.trim());
      if (action) sp.set("action", action);
      sp.set("page", String(page));
      sp.set("pageSize", String(data.pageSize));

      const res = await fetch(`/api/admin/audit-logs?${sp.toString()}`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as
        | AdminAuditLogListResponse
        | { ok: false; message?: string }
        | null;

      if (!res.ok || !json || !json.ok) {
        setError(
          (json && "message" in json && json.message) ||
            "Unable to load activity log.",
        );
        return;
      }
      setData(json);
    } catch {
      setError("Network error while loading activity log.");
    } finally {
      setLoading(false);
    }
  }, [search, action, page, data.pageSize]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const timer = setTimeout(() => {
      void fetchLogs();
    }, 200);
    return () => clearTimeout(timer);
  }, [fetchLogs]);

  return (
    <div className="space-y-6">
      <div className="border-b border-warm-sand pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-forest-green/75">
          Security &amp; Audit Trail
        </p>
        <h1 className="mt-1 font-serif text-2xl font-semibold text-forest-green sm:text-3xl">
          Activity Log
        </h1>
        <p className="mt-1 text-sm text-forest-green/80">
          Administrative actions and authentication events recorded without raw
          passwords, tokens, or sensitive credentials ({data.total} entries).
        </p>
      </div>

      {/* Filters */}
      <section
        aria-label="Filter activity log"
        className="grid gap-3 border border-warm-sand bg-[#FCFBF7] p-4 sm:grid-cols-3"
      >
        <div className="sm:col-span-2">
          <label
            htmlFor="audit-search"
            className="block text-xs font-semibold uppercase tracking-wider text-forest-green/80"
          >
            Search Summary or Actor
          </label>
          <input
            id="audit-search"
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Filter by action, admin email, or summary..."
            className="mt-1 min-h-[44px] w-full border border-forest-green/25 bg-warm-ivory px-3 py-2 text-sm text-forest-green"
          />
        </div>

        <div>
          <label
            htmlFor="audit-action-filter"
            className="block text-xs font-semibold uppercase tracking-wider text-forest-green/80"
          >
            Action Type
          </label>
          <select
            id="audit-action-filter"
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
            className="mt-1 min-h-[44px] w-full border border-forest-green/25 bg-warm-ivory px-3 py-2 text-sm text-forest-green"
          >
            <option value="">All Actions</option>
            {data.availableActions.map((act) => (
              <option key={act} value={act}>
                {act}
              </option>
            ))}
          </select>
        </div>
      </section>

      {error && (
        <div
          role="alert"
          className="border border-[#7A271A]/35 bg-[#FDF3F2] px-4 py-3 text-sm text-[#7A271A]"
        >
          {error}
        </div>
      )}

      {!loading && !error && data.items.length === 0 ? (
        <div className="border border-warm-sand bg-[#FCFBF7] px-6 py-12 text-center">
          <h2 className="font-serif text-lg font-semibold text-forest-green">
            No matching audit events
          </h2>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto border border-warm-sand bg-[#FCFBF7] md:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-warm-sand bg-warm-sand/35 text-xs font-semibold uppercase tracking-wider text-forest-green">
                  <th className="px-4 py-3">Timestamp (EAT)</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Administrator</th>
                  <th className="px-4 py-3">Summary</th>
                  <th className="px-4 py-3">Target</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-sand">
                {data.items.map((entry) => (
                  <tr key={entry.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-forest-green/80">
                      {formatEatDateTime(entry.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="inline-flex border border-forest-green/25 bg-warm-ivory px-2 py-0.5 font-mono text-xs text-forest-green">
                        {entry.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-forest-green">
                      {entry.actorIdentifier ?? "System"}
                    </td>
                    <td className="max-w-md break-words px-4 py-3 text-xs text-forest-green sm:text-sm">
                      {entry.summary}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs">
                      {entry.targetType === "rsvp" && entry.targetId ? (
                        <Link
                          href={`/admin/guests/${entry.targetId}`}
                          className="inline-flex min-h-[44px] items-center font-medium text-forest-green underline underline-offset-4"
                        >
                          View RSVP
                        </Link>
                      ) : (
                        <span className="text-forest-green/70">
                          {entry.targetType ?? "—"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {data.items.map((entry) => (
              <article
                key={entry.id}
                className="border border-warm-sand bg-[#FCFBF7] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="border border-forest-green/25 bg-warm-ivory px-2 py-0.5 font-mono text-xs text-forest-green">
                    {entry.action}
                  </span>
                  <span className="text-xs text-forest-green/75">
                    {formatEatDateTime(entry.createdAt)}
                  </span>
                </div>
                <p className="mt-2 break-words text-sm text-forest-green">
                  {entry.summary}
                </p>
                <p className="mt-1 text-xs text-forest-green/75">
                  Actor: {entry.actorIdentifier ?? "System"}
                </p>
              </article>
            ))}
          </div>

          {data.totalPages > 1 && (
            <nav
              aria-label="Activity log pagination"
              className="flex items-center justify-between border border-warm-sand bg-[#FCFBF7] px-4 py-3 text-xs"
            >
              <span>
                Page {data.page} of {data.totalPages} ({data.total} entries)
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={data.page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="min-h-[44px] border border-forest-green/30 bg-warm-ivory px-4 py-2 font-medium text-forest-green disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={data.page >= data.totalPages || loading}
                  onClick={() =>
                    setPage((p) => Math.min(data.totalPages, p + 1))
                  }
                  className="min-h-[44px] border border-forest-green/30 bg-warm-ivory px-4 py-2 font-medium text-forest-green disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
