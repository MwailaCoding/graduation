"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatEatDateTime, formatSourceLabel } from "@/lib/admin/format";
import type { AdminMessagesResponse } from "@/types/admin";

interface MessagesInboxClientProps {
  initialData: AdminMessagesResponse;
}

export function MessagesInboxClient({ initialData }: MessagesInboxClientProps) {
  const [data, setData] = useState<AdminMessagesResponse>(initialData);
  const [search, setSearch] = useState("");
  const [attendance, setAttendance] = useState("all");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [page, setPage] = useState(initialData.page);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isFirstRender = useRef(true);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams();
      if (search.trim()) sp.set("q", search.trim());
      if (attendance !== "all") sp.set("attendance", attendance);
      sp.set("sort", sort);
      sp.set("page", String(page));
      sp.set("pageSize", String(data.pageSize));

      const res = await fetch(`/api/admin/messages?${sp.toString()}`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as
        | AdminMessagesResponse
        | { ok: false; message?: string }
        | null;

      if (!res.ok || !json || !json.ok) {
        setError(
          (json && "message" in json && json.message) ||
            "Unable to load messages.",
        );
        return;
      }
      setData(json);
    } catch {
      setError("Network error while loading messages.");
    } finally {
      setLoading(false);
    }
  }, [search, attendance, sort, page, data.pageSize]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const timer = setTimeout(() => {
      void fetchMessages();
    }, 200);
    return () => clearTimeout(timer);
  }, [fetchMessages]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b border-warm-sand pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-forest-green/75">
            Private Organizer Inbox
          </p>
          <h1 className="mt-1 font-serif text-2xl font-semibold text-forest-green sm:text-3xl">
            Congratulatory Messages
          </h1>
          <p className="mt-1 text-sm text-forest-green/80">
            {data.total} private message{data.total === 1 ? "" : "s"} shared by
            guests (never publicly displayed).
          </p>
        </div>

        <a
          href="/api/admin/reports/export?type=messages"
          className="inline-flex min-h-[44px] items-center border border-forest-green/35 bg-warm-ivory px-4 py-2 text-sm font-medium text-forest-green hover:bg-warm-sand/60"
        >
          Export Messages CSV
        </a>
      </div>

      {/* Controls */}
      <section
        aria-label="Filter congratulatory messages"
        className="grid gap-3 border border-warm-sand bg-[#FCFBF7] p-4 sm:grid-cols-3"
      >
        <div>
          <label
            htmlFor="messages-search"
            className="block text-xs font-semibold uppercase tracking-wider text-forest-green/80"
          >
            Search Name or Message
          </label>
          <input
            id="messages-search"
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search guest name or text..."
            className="mt-1 min-h-[44px] w-full border border-forest-green/25 bg-warm-ivory px-3 py-2 text-sm text-forest-green"
          />
        </div>

        <div>
          <label
            htmlFor="messages-attendance"
            className="block text-xs font-semibold uppercase tracking-wider text-forest-green/80"
          >
            Attendance
          </label>
          <select
            id="messages-attendance"
            value={attendance}
            onChange={(e) => {
              setAttendance(e.target.value);
              setPage(1);
            }}
            className="mt-1 min-h-[44px] w-full border border-forest-green/25 bg-warm-ivory px-3 py-2 text-sm text-forest-green"
          >
            <option value="all">All Guests</option>
            <option value="attending">Attending</option>
            <option value="declining">Declining</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="messages-sort"
            className="block text-xs font-semibold uppercase tracking-wider text-forest-green/80"
          >
            Sort Order
          </label>
          <select
            id="messages-sort"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as "newest" | "oldest");
              setPage(1);
            }}
            className="mt-1 min-h-[44px] w-full border border-forest-green/25 bg-warm-ivory px-3 py-2 text-sm text-forest-green"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
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
            No congratulatory messages found
          </h2>
          <p className="mt-2 text-sm text-forest-green/80">
            Messages left by guests will appear here in full for the organizers.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {data.items.map((msg) => (
            <article
              key={msg.id}
              className="border border-warm-sand bg-[#FCFBF7] p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-warm-sand pb-3">
                <div className="min-w-0">
                  <h2 className="font-serif text-lg font-semibold text-forest-green">
                    {msg.fullName}
                  </h2>
                  <p className="mt-0.5 text-xs text-forest-green/75">
                    Received {formatEatDateTime(msg.createdAt)} ·{" "}
                    {formatSourceLabel(msg.submissionSource)}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center border px-2.5 py-0.5 text-xs font-medium ${
                      msg.attendance === "attending"
                        ? "border-forest-green/35 bg-soft-sage/25 text-forest-green"
                        : "border-champagne-gold/70 bg-warm-sand/55 text-forest-green"
                    }`}
                  >
                    {msg.attendance === "attending" ? "Attending" : "Declining"}
                  </span>
                  <Link
                    href={`/admin/guests/${msg.id}`}
                    className="inline-flex min-h-[44px] items-center border border-forest-green/30 bg-warm-ivory px-3 py-1.5 text-xs font-semibold text-forest-green hover:bg-warm-sand/60"
                  >
                    View Guest
                  </Link>
                </div>
              </div>

              <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-forest-green">
                {msg.congratulatoryMessage}
              </p>
            </article>
          ))}

          {data.totalPages > 1 && (
            <nav
              aria-label="Messages pagination"
              className="flex items-center justify-between border border-warm-sand bg-[#FCFBF7] px-4 py-3 text-xs"
            >
              <span>
                Page {data.page} of {data.totalPages}
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
        </div>
      )}
    </div>
  );
}
