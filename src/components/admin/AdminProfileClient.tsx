"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { formatEatDateTime } from "@/lib/admin/format";
import type {
  AdminFieldErrors,
  AdminProfileUpdateResponse,
  AuthenticatedAdmin,
} from "@/types/admin";

interface AdminProfileClientProps {
  initialAdmin: AuthenticatedAdmin;
}

export function AdminProfileClient({ initialAdmin }: AdminProfileClientProps) {
  const router = useRouter();
  const [admin, setAdmin] = useState<AuthenticatedAdmin>(initialAdmin);
  const [displayName, setDisplayName] = useState(initialAdmin.displayName);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [savingName, setSavingName] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<AdminFieldErrors>({});

  async function handleUpdateName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingName) return;
    setSavingName(true);
    setSuccess(null);
    setError(null);
    setFieldErrors({});

    try {
      const res = await fetch("/api/admin/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName }),
      });
      const json = (await res.json().catch(() => null)) as
        | AdminProfileUpdateResponse
        | { ok: false; message?: string; fieldErrors?: AdminFieldErrors }
        | null;

      if (!res.ok || !json || !json.ok) {
        setError(
          (json && "message" in json && json.message) ||
            "Unable to update display name.",
        );
        if (json && "fieldErrors" in json && json.fieldErrors) {
          setFieldErrors(json.fieldErrors);
        }
        return;
      }

      setAdmin(json.admin);
      setSuccess("Display name updated.");
      router.refresh();
    } catch {
      setError("Network error while updating profile.");
    } finally {
      setSavingName(false);
    }
  }

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingPassword) return;
    setSavingPassword(true);
    setSuccess(null);
    setError(null);
    setFieldErrors({});

    try {
      const res = await fetch("/api/admin/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | AdminProfileUpdateResponse
        | { ok: false; message?: string; fieldErrors?: AdminFieldErrors }
        | null;

      if (!res.ok || !json || !json.ok) {
        setError(
          (json && "message" in json && json.message) ||
            "Unable to change password.",
        );
        if (json && "fieldErrors" in json && json.fieldErrors) {
          setFieldErrors(json.fieldErrors);
        }
        return;
      }

      setAdmin(json.admin);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess(
        `Password updated securely. ${json.otherSessionsRevoked} other active session${json.otherSessionsRevoked === 1 ? "" : "s"} revoked.`,
      );
      router.refresh();
    } catch {
      setError("Network error while changing password.");
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-warm-sand pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-forest-green/75">
          Account &amp; Security
        </p>
        <h1 className="mt-1 font-serif text-2xl font-semibold text-forest-green sm:text-3xl">
          Admin Profile
        </h1>
        <p className="mt-1 text-sm text-forest-green/80">
          Manage your organizer display name and password credentials.
        </p>
      </div>

      {success && (
        <div
          role="status"
          className="border border-forest-green/35 bg-soft-sage/25 px-4 py-3 text-sm text-forest-green"
        >
          {success}
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

      {/* Account Overview */}
      <section className="border border-warm-sand bg-[#FCFBF7] p-5">
        <h2 className="border-b border-warm-sand pb-3 font-serif text-xl font-semibold text-forest-green">
          Account Summary
        </h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-forest-green/75">
              Email Address
            </dt>
            <dd className="mt-1 font-medium text-forest-green">{admin.email}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-forest-green/75">
              Role
            </dt>
            <dd className="mt-1 font-medium capitalize text-forest-green">
              Administrator
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-forest-green/75">
              Last Login (EAT)
            </dt>
            <dd className="mt-1 text-forest-green">
              {formatEatDateTime(admin.lastLoginAt)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-forest-green/75">
              Session Expires (EAT)
            </dt>
            <dd className="mt-1 text-forest-green">
              {formatEatDateTime(admin.sessionExpiresAt)}
            </dd>
          </div>
        </dl>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Display Name Form */}
        <form
          onSubmit={handleUpdateName}
          className="space-y-4 border border-warm-sand bg-[#FCFBF7] p-5"
          noValidate
        >
          <h2 className="border-b border-warm-sand pb-3 font-serif text-lg font-semibold text-forest-green">
            Update Display Name
          </h2>
          <div>
            <label
              htmlFor="profile-display-name"
              className="block text-sm font-medium text-forest-green"
            >
              Display Name
            </label>
            <input
              id="profile-display-name"
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 min-h-[44px] w-full border border-forest-green/25 bg-warm-ivory px-3 py-2 text-sm text-forest-green"
            />
            {fieldErrors.displayName && (
              <p className="mt-1 text-xs text-[#7A271A]">
                {fieldErrors.displayName}
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={savingName}
            className="min-h-[44px] bg-forest-green px-5 py-2 text-sm font-medium text-warm-ivory hover:bg-forest-green/90 disabled:opacity-60"
          >
            {savingName ? "Saving..." : "Save Display Name"}
          </button>
        </form>

        {/* Password Change Form */}
        <form
          onSubmit={handleChangePassword}
          className="space-y-4 border border-warm-sand bg-[#FCFBF7] p-5"
          noValidate
        >
          <h2 className="border-b border-warm-sand pb-3 font-serif text-lg font-semibold text-forest-green">
            Change Password
          </h2>
          <div>
            <label
              htmlFor="profile-current-password"
              className="block text-sm font-medium text-forest-green"
            >
              Current Password
            </label>
            <input
              id="profile-current-password"
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mt-1 min-h-[44px] w-full border border-forest-green/25 bg-warm-ivory px-3 py-2 text-sm text-forest-green"
            />
            {fieldErrors.currentPassword && (
              <p className="mt-1 text-xs text-[#7A271A]">
                {fieldErrors.currentPassword}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="profile-new-password"
              className="block text-sm font-medium text-forest-green"
            >
              New Password
            </label>
            <input
              id="profile-new-password"
              type="password"
              autoComplete="new-password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1 min-h-[44px] w-full border border-forest-green/25 bg-warm-ivory px-3 py-2 text-sm text-forest-green"
            />
            {fieldErrors.newPassword && (
              <p className="mt-1 text-xs text-[#7A271A]">
                {fieldErrors.newPassword}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="profile-confirm-password"
              className="block text-sm font-medium text-forest-green"
            >
              Confirm New Password
            </label>
            <input
              id="profile-confirm-password"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1 min-h-[44px] w-full border border-forest-green/25 bg-warm-ivory px-3 py-2 text-sm text-forest-green"
            />
            {fieldErrors.confirmPassword && (
              <p className="mt-1 text-xs text-[#7A271A]">
                {fieldErrors.confirmPassword}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={savingPassword}
            className="min-h-[44px] bg-forest-green px-5 py-2 text-sm font-medium text-warm-ivory hover:bg-forest-green/90 disabled:opacity-60"
          >
            {savingPassword ? "Updating..." : "Update Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
