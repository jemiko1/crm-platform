"use client";

import { useState, useEffect } from "react";
import { apiGet } from "./api";

type PermissionsResponse = {
  permissions: string[];
};

let permissionsCache: string[] | null = null;
let permissionsPromise: Promise<string[]> | null = null;

/**
 * Hook to get current user's effective permissions
 * Caches permissions to avoid repeated API calls
 */
export function usePermissions() {
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If already cached, use cache
    if (permissionsCache !== null) {
      setPermissions(permissionsCache);
      setLoading(false);
      return;
    }

    // If already fetching, wait for that promise
    if (permissionsPromise) {
      permissionsPromise
        .then((perms) => {
          setPermissions(perms);
          setLoading(false);
        })
        .catch((err) => {
          setError(err.message);
          setLoading(false);
        });
      return;
    }

    // Fetch permissions
    setLoading(true);
    permissionsPromise = apiGet<string[]>("/v1/permissions/my-effective-permissions")
      .then((data) => {
        permissionsCache = Array.isArray(data) ? data : [];
        setPermissions(permissionsCache);
        setLoading(false);
        console.log("Loaded permissions:", permissionsCache.length, "permissions");
        return permissionsCache;
      })
      .catch((err) => {
        console.error("Failed to fetch permissions:", err);
        setError(err.message || "Failed to load permissions");
        setLoading(false);
        // Default to empty permissions (no access) on error
        permissionsCache = [];
        setPermissions([]);
        return [];
      })
      .finally(() => {
        permissionsPromise = null;
      });
  }, []);

  /**
   * Check if user has a specific permission
   */
  const hasPermission = (permission: string): boolean => {
    return permissions.includes(permission);
  };

  /**
   * Check if user has any of the given permissions
   */
  const hasAnyPermission = (permissionList: string[]): boolean => {
    return permissionList.some((perm) => permissions.includes(perm));
  };

  /**
   * Check if user has all of the given permissions
   */
  const hasAllPermissions = (permissionList: string[]): boolean => {
    return permissionList.every((perm) => permissions.includes(perm));
  };

  /**
   * Clear permissions cache (useful after login/logout)
   */
  const clearCache = () => {
    permissionsCache = null;
    permissionsPromise = null;
    setPermissions([]);
  };

  return {
    permissions,
    loading,
    error,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    clearCache,
  };
}

/**
 * Clear permissions cache (call this on logout)
 */
export function clearPermissionsCache() {
  permissionsCache = null;
  permissionsPromise = null;
}
