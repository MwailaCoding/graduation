"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function AdminLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
        retryAfterSeconds?: number;
      } | null;

      if (!response.ok || !payload?.ok) {
        if (response.status === 429 && payload?.retryAfterSeconds) {
          setError(
            `${payload.message ?? "Too many sign-in attempts."} Please wait ${payload.retryAfterSeconds} seconds.`,
          );
        } else {
          setError(
            payload?.message ??
              "Invalid email or password. Please verify your credentials.",
          );
        }
        return;
      }

      router.replace("/admin");
      router.refresh();
    } catch {
      setError("Unable to reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {error && (
        <div
          role="alert"
          className="border border-[#7A271A]/35 bg-[#FDF3F2] px-4 py-3 text-sm text-[#7A271A]"
        >
          {error}
        </div>
      )}

      <div>
        <label
          htmlFor="admin-login-email"
          className="block text-sm font-medium text-forest-green"
        >
          Email Address
        </label>
        <input
          id="admin-login-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="organizer@example.com"
          className="mt-1.5 min-h-[44px] w-full border border-forest-green/25 bg-warm-ivory px-3.5 py-2.5 text-sm text-forest-green placeholder:text-forest-green/45 focus:border-forest-green focus:outline-none focus:ring-1 focus:ring-forest-green"
        />
      </div>

      <div>
        <label
          htmlFor="admin-login-password"
          className="block text-sm font-medium text-forest-green"
        >
          Password
        </label>
        <input
          id="admin-login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter your password"
          className="mt-1.5 min-h-[44px] w-full border border-forest-green/25 bg-warm-ivory px-3.5 py-2.5 text-sm text-forest-green placeholder:text-forest-green/45 focus:border-forest-green focus:outline-none focus:ring-1 focus:ring-forest-green"
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="min-h-[44px] w-full bg-forest-green px-4 py-2.5 text-sm font-medium text-warm-ivory transition-colors hover:bg-forest-green/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-green disabled:opacity-60"
      >
        {submitting ? "Signing in..." : "Sign In"}
      </button>
    </form>
  );
}
