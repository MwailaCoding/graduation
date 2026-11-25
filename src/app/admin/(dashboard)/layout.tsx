import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { requireAdminSessionPage } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export default async function AdminDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const admin = await requireAdminSessionPage();
  return <AdminShell admin={admin}>{children}</AdminShell>;
}
