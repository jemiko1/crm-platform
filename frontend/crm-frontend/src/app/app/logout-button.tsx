"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onLogout() {
    setLoading(true);
    try {
      await fetch("http://localhost:3000/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } finally {
      setLoading(false);
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <button
      onClick={onLogout}
      disabled={loading}
      className="w-full rounded-xl bg-zinc-900 text-white py-2 text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
    >
      {loading ? "Signing out..." : "Logout"}
    </button>
  );
}
