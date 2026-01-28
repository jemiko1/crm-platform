"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function EmployeeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const employeeId = params?.employeeId as string;

  useEffect(() => {
    if (employeeId) {
      // Redirect to popup style using query parameter
      router.replace(`/app/employees?employee=${employeeId}`);
    }
  }, [employeeId, router]);

  // Show loading while redirecting
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-zinc-600">Redirecting...</div>
    </div>
  );
}
