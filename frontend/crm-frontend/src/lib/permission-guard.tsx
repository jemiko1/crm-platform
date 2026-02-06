"use client";

import { ReactNode, useMemo } from "react";
import Link from "next/link";
import { usePermissions } from "./use-permissions";

type PermissionGuardProps = {
  /** Single permission required */
  permission?: string;
  /** If provided, user needs ANY one of these permissions */
  anyPermission?: string[];
  children: ReactNode;
  fallback?: ReactNode;
};

/**
 * Component that protects routes/pages based on permissions.
 * Supports single permission or any-of-many check.
 * If user doesn't have permission, shows an access denied message.
 */
export function PermissionGuard({
  permission,
  anyPermission,
  children,
  fallback,
}: PermissionGuardProps) {
  const { hasPermission, hasAnyPermission, loading } = usePermissions();

  const isAllowed = useMemo(() => {
    if (loading) return false;
    if (permission) return hasPermission(permission);
    if (anyPermission && anyPermission.length > 0) return hasAnyPermission(anyPermission);
    // No permission specified = always allowed
    return true;
  }, [loading, permission, anyPermission, hasPermission, hasAnyPermission]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-zinc-600">Loading...</div>
      </div>
    );
  }

  if (!isAllowed) {
    if (fallback) {
      return <>{fallback}</>;
    }
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="max-w-sm rounded-2xl bg-rose-50 p-8 ring-1 ring-rose-200 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-100 ring-1 ring-rose-200">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-rose-600">
              <circle cx="12" cy="12" r="10" />
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
            </svg>
          </div>
          <div className="mt-4 text-base font-semibold text-rose-900">Insufficient Permissions</div>
          <div className="mt-2 text-sm text-rose-700">
            You do not have the required permissions to access this page. Please contact your administrator if you believe this is an error.
          </div>
          <Link
            href="/app/dashboard"
            className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 transition"
          >
            &larr; Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
