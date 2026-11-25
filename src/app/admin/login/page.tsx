import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";
import { verifyAdminSession } from "@/lib/admin/session";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  const existing = await verifyAdminSession();
  if (existing) {
    redirect("/admin");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-warm-ivory px-4 py-10 text-forest-green">
      <div className="w-full max-w-md border border-warm-sand bg-[#FCFBF7] p-6 sm:p-8">
        <div className="mb-6 border-b border-warm-sand pb-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-forest-green/75">
            Private Administration
          </p>
          <h1 className="mt-2 font-serif text-2xl font-semibold text-forest-green sm:text-3xl">
            Admin Sign In
          </h1>
          <p className="mt-2 text-sm text-forest-green/80">
            Majala &amp; Florence Graduation &amp; Thanksgiving RSVP Workspace
          </p>
        </div>

        <AdminLoginForm />

        <div className="mt-6 border-t border-warm-sand pt-4 text-center text-xs text-forest-green/75">
          Authorized organizers only. Access attempts are recorded for security.
        </div>
      </div>
    </main>
  );
}
