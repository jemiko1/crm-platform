"use client";

import { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePermissions } from "./use-permissions";

type PermissionGuardProps = {
  permission: string;
  children: ReactNode;
  fallback?: ReactNode;
  redirectTo?: string;
};

/**
 * Component that protects routes/pages based on permissions
 * If user doesn't have permission, shows fallback or redirects
 */
export function PermissionGuard({
  permission,
  children,
  fallback,
  redirectTo = "/app/dashboard",
}: PermissionGuardProps) {
  const { hasPermission, loading } = usePermissions();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !hasPermission(permission)) {
      if (redirectTo) {
        router.push(redirectTo);
      }
    }
  }, [loading, hasPermission, permission, redirectTo, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-zinc-600">Loading...</div>
      </div>
    );
  }

  if (!hasPermission(permission)) {
    if (fallback) {
      return <>{fallback}</>;
    }
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="rounded-2xl bg-rose-50 p-6 ring-1 ring-rose-200">
          <div className="text-sm font-semibold text-rose-900">Access Denied</div>
          <div className="mt-1 text-sm text-rose-700">
            You don't have permission to access this page.
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
