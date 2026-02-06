"use client";

import { useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { PermissionGuard } from "@/lib/permission-guard";

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientId = params?.clientId as string;

  useEffect(() => {
    if (clientId) {
      // Redirect to popup style using query parameter
      router.replace(`/app/clients?client=${clientId}`);
    }
  }, [clientId, router]);

  // Show loading while redirecting
  return (
    <PermissionGuard permission="clients.read">
      <div className="w-full">
      <div className="mx-auto w-full px-4 py-6 md:px-6 md:py-8">
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
          <div className="py-12 text-center text-sm text-zinc-600">
            Redirecting...
          </div>
        </div>
      </div>
    </div>
    </PermissionGuard>
  );
}
