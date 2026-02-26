"use client";

import { PermissionGuard } from "@/lib/permission-guard";

export default function AdminUsersPage() {
  return (
    <PermissionGuard permission="admin.access">
      <div className="p-4 sm:p-6 lg:p-8">
      <h1 className="text-2xl font-bold mb-6">Users Management</h1>
      <p className="text-gray-600">User management interface coming soon...</p>
    </div>
    </PermissionGuard>
  );
}
