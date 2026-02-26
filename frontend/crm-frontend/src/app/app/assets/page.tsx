"use client";

import { PermissionGuard } from "@/lib/permission-guard";

export default function AssetsPage() {
  return (
    <PermissionGuard permission="assets.menu">
      <div className="p-4 sm:p-6 lg:p-8">
        <h1 className="text-2xl font-bold text-zinc-900">Assets</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Assets are managed through building detail pages.
        </p>
      </div>
    </PermissionGuard>
  );
}
