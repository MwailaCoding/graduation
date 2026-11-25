"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatDietaryLabel } from "@/lib/admin/format";
import type { AdminCateringResponse } from "@/types/admin";

interface CateringWorkspaceClientProps {
  initialData: AdminCateringResponse;
}

export function CateringWorkspaceClient({
  initialData,
}: CateringWorkspaceClientProps) {
  const [data, setData] = useState<AdminCateringResponse>(initialData);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "with_dietary" | "no_dietary">(
    "all",
  );
  const [page, setPage] = useState(initialData.page);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isFirstRender = useRef(true);

  const fetchCatering = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams();
      if (search.trim()) sp.set("q", search.trim());
      if (filter !== "all") sp.set("filter", filter);
      sp.set("page", String(page));
      sp.set("pageSize", String(data.pageSize));

      const res = await fetch(`/api/admin/catering?${sp.toString()}`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as
        | AdminCateringResponse
        | { ok: false; message?: string }
        | null;

      if (!res.ok || !json || !json.ok) {
        setError(
          (json && "message" in json && json.message) ||
            "Unable to load catering data.",
        );
        return;
      }
      setData(json);
    } catch {
      setError("Network error while loading catering data.");
    } finally {
      setLoading(false);
    }
  }, [search, filter, page, data.pageSize]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const timer = setTimeout(() => {
      void fetchCatering();
    }, 200);
    return () => clearTimeout(timer);
  }, [fetchCatering]);

  const exportQuery = new URLSearchParams({ type: "catering" });
  if (filter === "with_dietary") exportQuery.set("dietary", "has_dietary");
  if (filter === "no_dietary") exportQuery.set("dietary", "no_dietary");
  if (search.trim()) exportQuery.set("q", search.trim());

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b border-warm-sand pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-forest-green/75">
            Hospitality Planning
          </p>
          <h1 className="mt-1 font-serif text-2xl font-semibold text-forest-green sm:text-3xl">
            Dietary Requirements &amp; Catering
          </h1>
          <p className="mt-1 text-sm text-forest-green/80">
            Attending guests only. Blank dietary fields are recorded as{" "}
            <strong>No dietary supplied</strong> and are not interpreted as
            proof of zero dietary restrictions.
          </p>
        </div>

        <div className="admin-no-print flex flex-wrap gap-2">
          <a
            href={`/api/admin/reports/export?${exportQuery.toString()}`}
            className="inline-flex min-h-[44px] items-center border border-forest-green bg-forest-green px-4 py-2 text-sm font-medium text-warm-ivory hover:bg-forest-green/90"
          >
            Export Catering CSV
          </a>
          <button
            type="button"
            onClick={() => window.print()}
            className="min-h-[44px] border border-forest-green/35 bg-warm-ivory px-4 py-2 text-sm font-medium text-forest-green hover:bg-warm-sand/60"
          >
            Print Catering List
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <section aria-label="Catering summary" className="grid gap-4 sm:grid-cols-3">
        <div className="border border-warm-sand bg-[#FCFBF7] p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-forest-green/75">
            Total Attending
          </p>
          <p className="mt-2 font-serif text-3xl font-semibold text-forest-green">
            {data.summary.attendingCount}
          </p>
        </div>

        <div className="border border-warm-sand bg-[#FCFBF7] p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-forest-green/75">
            Dietary Info Supplied
          </p>
          <p className="mt-2 font-serif text-3xl font-semibold text-forest-green">
            {data.summary.withDietaryCount}
          </p>
        </div>

        <div className="border border-warm-sand bg-[#FCFBF7] p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-forest-green/75">
            No Dietary Supplied
          </p>
          <p className="mt-2 font-serif text-3xl font-semibold text-forest-green">
            {data.summary.noDietarySuppliedCount}
          </p>
        </div>
      </section>

      {/* Filters */}
      <section
        aria-label="Filter catering guests"
        className="admin-no-print grid gap-3 border border-warm-sand bg-[#FCFBF7] p-4 sm:grid-cols-2"
      >
        <div>
          <label
            htmlFor="catering-search"
            className="block text-xs font-semibold uppercase tracking-wider text-forest-green/80"
          >
            Search Guest or Dietary Note
          </label>
          <input
            id="catering-search"
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by name, phone, or requirement..."
            className="mt-1 min-h-[44px] w-full border border-forest-green/25 bg-warm-ivory px-3 py-2 text-sm text-forest-green"
          />
        </div>

        <div>
          <label
            htmlFor="catering-filter"
            className="block text-xs font-semibold uppercase tracking-wider text-forest-green/80"
          >
            Dietary Filter
          </label>
          <select
            id="catering-filter"
            value={filter}
            onChange={(e) => {
              setFilter(
                e.target.value as "all" | "with_dietary" | "no_dietary",
              );
              setPage(1);
            }}
            className="mt-1 min-h-[44px] w-full border border-forest-green/25 bg-warm-ivory px-3 py-2 text-sm text-forest-green"
          >
            <option value="all">All Attending Guests</option>
            <option value="with_dietary">With Dietary Requirements</option>
            <option value="no_dietary">No Dietary Supplied</option>
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
            No matching attending guests
          </h2>
          <p className="mt-2 text-sm text-forest-green/80">
            No attending guests match the current catering filter.
          </p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto border border-warm-sand bg-[#FCFBF7] md:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-warm-sand bg-warm-sand/35 text-xs font-semibold uppercase tracking-wider text-forest-green">
                  <th className="px-4 py-3">Guest Name</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Attendance</th>
                  <th className="px-4 py-3">Dietary Requirements</th>
                  <th className="admin-no-print px-4 py-3 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-sand">
                {data.items.map((guest) => {
                  const hasDietary = Boolean(
                    guest.dietaryRequirements &&
                      guest.dietaryRequirements.trim().length > 0,
                  );
                  return (
                    <tr key={guest.id} className="hover:bg-warm-ivory/75">
                      <td className="px-4 py-3 font-medium text-forest-green">
                        {guest.fullName}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-forest-green">
                        {guest.phoneE164}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs font-medium text-forest-green">
                        Attending
                      </td>
                      <td className="px-4 py-3 text-sm text-forest-green">
                        {hasDietary ? (
                          <span className="font-medium">
                            {guest.dietaryRequirements}
                          </span>
                        ) : (
                          <span className="italic text-forest-green/75">
                            No dietary supplied
                          </span>
                        )}
                      </td>
                      <td className="admin-no-print whitespace-nowrap px-4 py-3 text-right">
                        <Link
                          href={`/admin/guests/${guest.id}`}
                          className="inline-flex min-h-[44px] items-center border border-forest-green/30 bg-warm-ivory px-3 py-1.5 text-xs font-semibold text-forest-green hover:bg-warm-sand/60"
                        >
                          View Guest
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {data.items.map((guest) => (
              <article
                key={guest.id}
                className="border border-warm-sand bg-[#FCFBF7] p-4"
              >
                <h2 className="font-serif text-base font-semibold text-forest-green">
                  {guest.fullName}
                </h2>
                <p className="mt-0.5 font-mono text-xs text-forest-green/80">
                  {guest.phoneE164} · Attending
                </p>
                <p className="mt-2 break-words text-sm text-forest-green">
                  <strong>Dietary: </strong>
                  {formatDietaryLabel(guest.dietaryRequirements)}
                </p>
                <div className="mt-3">
                  <Link
                    href={`/admin/guests/${guest.id}`}
                    className="inline-flex min-h-[44px] items-center border border-forest-green/30 bg-warm-ivory px-3 py-1.5 text-xs font-semibold text-forest-green"
                  >
                    View Guest
                  </Link>
                </div>
              </article>
            ))}
          </div>

          {data.totalPages > 1 && (
            <nav
              aria-label="Catering pagination"
              className="admin-no-print flex items-center justify-between border border-warm-sand bg-[#FCFBF7] px-4 py-3 text-xs"
            >
              <span>
                Page {data.page} of {data.totalPages} ({data.total} guests)
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
